import {Editor, Rawvalue} from "./Editor";
import {EventBus, FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {EastWestEditorField, NumberEditorField} from "./EditorField";
import {Longitude} from "../../data/Units";
import {format} from "numerable";
import {splitDegreesMinutes} from "../../data/Coordinates";
import {TickController} from "../../TickController";


export class LongitudeEditor extends Editor<Longitude> {


    private degreeRef: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();
    private dotRef: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    constructor(bus: EventBus, value: Longitude | null, enterCallback: (text: Longitude) => void = () => {
    }) {
        super(bus, [
            new EastWestEditorField(),
            NumberEditorField.createWithMinMax(0, 1), //#304: the open edit shows the hundreds 0 (E008°); helper A blanks it once entered
            new NumberEditorField(),
            new NumberEditorField(),
            NumberEditorField.createWithMinMax(0, 5),
            new NumberEditorField(),
            new NumberEditorField(),
            new NumberEditorField(),
        ], value, enterCallback);
        this.setLeadingZeroCells([1, 2]); //#230
    }

    public render(): VNode {
        return (<span ref={this.containerRef}>
            {this.editorFields[0].render()}{this.editorFields[1].render()}{this.editorFields[2].render()}{this.editorFields[3].render()}<span
            ref={this.degreeRef}>°</span>{this.editorFields[4].render()}{this.editorFields[5].render()}<span
            ref={this.dotRef}>.</span>{this.editorFields[6].render()}{this.editorFields[7].render()}
        </span>);
    }

    protected convertFromValue(value: Longitude): Rawvalue {
        const eastWestIndex = value >= 0 ? 0 : 1;
        const {degrees, minutes} = splitDegreesMinutes(value);
        const degreesString = format(degrees, "000");
        const minutesString = format(minutes, "00.00");

        return [
            eastWestIndex,
            Number(String(degreesString).substring(0, 1)),
            Number(String(degreesString).substring(1, 2)),
            Number(String(degreesString).substring(2, 3)),
            Number(String(minutesString).substring(0, 1)),
            Number(String(minutesString).substring(1, 2)),
            Number(String(minutesString).substring(3, 4)),
            Number(String(minutesString).substring(4, 5)),
        ];
    }

    protected convertToValue(rawValue: Rawvalue): Promise<Longitude | null> {
        const eastWest = rawValue[0] === 0 ? 1 : -1;
        const degrees = Number(String(rawValue[1]) + String(rawValue[2]) + String(rawValue[3]));
        const minutes = Number(String(rawValue[4]) + String(rawValue[5]) + "." + String(rawValue[6]) + String(rawValue[7]));
        if (degrees + minutes / 60 > 180) { //C-1: a value outside the allowed range is INVALID ENT, and no longitude is beyond 180°
            return Promise.resolve(null);
        }

        return Promise.resolve(eastWest * (degrees + minutes / 60));
    }

    tick(blink: boolean): void {
        super.tick(blink);
        if (!TickController.checkRef(this.degreeRef, this.dotRef)) {
            return;
        }
        if (this.isFocused) {
            this.degreeRef!.instance.classList.add("inverted");
            this.dotRef!.instance.classList.add("inverted");
        } else {
            this.degreeRef!.instance.classList.remove("inverted");
            this.dotRef!.instance.classList.remove("inverted");
        }
    }

}