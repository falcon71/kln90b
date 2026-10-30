import {Editor, Rawvalue} from "./Editor";
import {EventBus, FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {NumberEditorField} from "./EditorField";
import {padFixed} from "../../data/NumberFormat";
import {TickController} from "../../TickController";

export class NdbFreqEditor extends Editor<number> {

    private dotRef: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    constructor(bus: EventBus, value: number | null, enterCallback: (text: number) => void) {
        super(bus, [
            NumberEditorField.createWithBlankMax(1),
            new NumberEditorField(),
            new NumberEditorField(),
            new NumberEditorField(),
            new NumberEditorField(),
        ], value, enterCallback);
    }

    public render(): VNode {
        return (<span ref={this.containerRef}><span ref={this.cellsRef}>
            {this.editorFields[0].render()}{this.editorFields[1].render()}{this.editorFields[2].render()}{this.editorFields[3].render()}<span
            ref={this.dotRef}>.</span>{this.editorFields[4].render()}
        </span><span ref={this.idleRef} class="d-none"></span></span>);
    }

    /** #287: figure 3-153, a database NDB (the read-only field) on a whole kHz shows the integer, right-aligned */
    protected idleText(): string | null {
        if (!this.isReadonly || this.value === null || Math.abs(this.value - Math.round(this.value)) > 0.001) {
            return null;
        }
        return String(Math.round(this.value)).padStart(6, " ");
    }

    protected convertFromValue(value: number): Rawvalue {
        const numberString = padFixed(value, 4, 1);

        return [
            Number(numberString.substring(0, 1)),
            Number(numberString.substring(1, 2)),
            Number(numberString.substring(2, 3)),
            Number(numberString.substring(3, 4)),
            Number(numberString.substring(5, 6)),
        ];
    }

    protected convertToValue(rawValue: Rawvalue): Promise<number | null> {
        const newValue = Number(`${rawValue[0]}${rawValue[1]}${rawValue[2]}${rawValue[3]}.${rawValue[4]}`);
        if (newValue < 190 || newValue > 1750) {
            return Promise.resolve(null);
        }
        return Promise.resolve(newValue);
    }

    tick(blink: boolean): void {
        super.tick(blink);
        this.tickIdleText();
        if (!TickController.checkRef(this.dotRef)) {
            return;
        }
        if (this.isFocused) { //#302: figures 5-72 to 5-74 show the cursor over the point of RAD and DIS; extended to this field
            this.dotRef!.instance.classList.add("inverted");
        } else {
            this.dotRef!.instance.classList.remove("inverted");
        }
    }
}