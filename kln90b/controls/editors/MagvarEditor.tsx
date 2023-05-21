import {Editor, Rawvalue} from "./Editor";
import {EventBus, FSComponent, VNode} from "@microsoft/msfs-sdk";
import {EastWestEditorField, NumberEditorField} from "./EditorField";
import {format} from "numerable";

export class MagvarEditor extends Editor<number> {

    constructor(bus: EventBus, value: number | null, enterCallback: (text: number) => void) {
        super(bus, [
            NumberEditorField.createWithBlankMax(9),
            new NumberEditorField(),
            new EastWestEditorField(),
        ], value, enterCallback);
    }

    public render(): VNode {
        return (<span ref={this.containerRef}>
            {this.editorFields[0].render()}{this.editorFields[1].render()}°{this.editorFields[2].render()}
        </span>);
    }

    protected convertFromValue(magvar: number): Rawvalue {
        let numberString;
        let eastWestIndex;

        if (magvar >= 180) {
            numberString = format(360 - magvar, "00");
            eastWestIndex = 1;
        } else if (magvar < 0) {
            numberString = format(Math.abs(magvar), "00");
            eastWestIndex = 1;
        } else {
            numberString = format(magvar, "00");
            eastWestIndex = 0;
        }

        return [
            Number(numberString.substring(0, 1)),
            Number(numberString.substring(1, 2)),
            eastWestIndex,
        ];
    }

    protected convertToValue(rawValue: Rawvalue): Promise<number | null> {
        const eastWestFactor = rawValue[2] == 0 ? 1 : -1;
        const newValue = Number(String(rawValue[0]) + String(rawValue[1])) * eastWestFactor;

        return Promise.resolve(newValue);
    }
}