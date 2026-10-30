import {Editor, Rawvalue} from "./Editor";
import {EventBus, FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {NumberEditorField} from "./EditorField";
import {padFixed} from "../../data/NumberFormat";
import {TickController} from "../../TickController";

export class DistanceEditor extends Editor<number> {

    private dotRef: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    constructor(bus: EventBus, value: number | null, enterCallback: (text: number) => void) {
        super(bus, [
            NumberEditorField.createWithMinMax(0, 9),
            new NumberEditorField(),
            new NumberEditorField(),
            new NumberEditorField(),
        ], value, enterCallback);
        this.setLeadingZeroCells([0, 1]); //#282: figures 3-155, 5-75, 5-76: blanks once entered, zeros in the open field (5-74)
    }

    public render(): VNode {
        return (<span ref={this.containerRef}><span ref={this.cellsRef}>
            {this.editorFields[0].render()}{this.editorFields[1].render()}{this.editorFields[2].render()}<span
            ref={this.dotRef}>.</span>{this.editorFields[3].render()}
        </span><span ref={this.idleRef} class="d-none"></span></span>);
    }

    /**
     * #341: the KLN 89 trainer shows the distance as whole NM from 1000 NM on (checked 2026-10-12). 999.95 NM is the code's
     * rounding boundary (its tenth would round to 1000.0). The right alignment in the five cells is the code's own layout
     */
    protected idleText(): string | null {
        if (this.value === null || this.value < 999.95) {
            return null;
        }
        return String(Math.round(this.value)).padStart(5, " ");
    }

    protected convertFromValue(distance: number): Rawvalue {
        const numberString = padFixed(Math.min(distance, 999.9), 3, 1); //#341: the cells hold at most 999.9, idleText shows more
        return [
            Number(numberString.substring(0, 1)),
            Number(numberString.substring(1, 2)),
            Number(numberString.substring(2, 3)),
            Number(numberString.substring(4, 5)),
        ];
    }

    protected convertToValue(rawValue: Rawvalue): Promise<number | null> {
        return Promise.resolve(Number(String(rawValue[0]) + String(rawValue[1]) + String(rawValue[2]) + "." + String(rawValue[3])));
    }

    tick(blink: boolean): void {
        super.tick(blink);
        this.tickIdleText();
        if (!TickController.checkRef(this.dotRef)) {
            return;
        }
        if (this.isFocused) { //#302: figure 5-74, the cursor covers the point
            this.dotRef!.instance.classList.add("inverted");
        } else {
            this.dotRef!.instance.classList.remove("inverted");
        }
    }
}