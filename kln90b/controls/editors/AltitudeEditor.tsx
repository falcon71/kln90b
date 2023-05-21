import {Editor, Rawvalue} from "./Editor";
import {EventBus, FSComponent, VNode} from "@microsoft/msfs-sdk";
import {NumberEditorField} from "./EditorField";
import {format} from "numerable";

export class AltitudeEditor extends Editor<number> {

    constructor(bus: EventBus, value: number | null, enterCallback: (text: number) => void) {
        super(bus, [
            new NumberEditorField(),
            new NumberEditorField(),
            new NumberEditorField(),
            new NumberEditorField(),
            new NumberEditorField(),
        ], value, enterCallback);
    }

    public render(): VNode {
        return (<span ref={this.containerRef}>
            {this.editorFields[0].render()}{this.editorFields[1].render()}{this.editorFields[2].render()}{this.editorFields[3].render()}{this.editorFields[4].render()}
        </span>);
    }

    protected convertFromValue(altitude: number): Rawvalue {
        const numberString = format(altitude, "00000");
        return [
            Number(numberString.substring(0, 1)),
            Number(numberString.substring(1, 2)),
            Number(numberString.substring(2, 3)),
            Number(numberString.substring(3, 4)),
            Number(numberString.substring(4, 5)),
        ];
    }

    protected convertToValue(rawValue: Rawvalue): Promise<number | null> {
        const newValue = Number(String(rawValue[0]) + String(rawValue[1]) + String(rawValue[2]) + String(rawValue[3]) + String(rawValue[4]));
        return Promise.resolve(newValue);
    }
}

export class RunwayLengthEditor extends AltitudeEditor { //They are both the same

}
