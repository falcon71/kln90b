import {Editor, Rawvalue} from "./Editor";
import {EventBus, FSComponent, VNode} from "@microsoft/msfs-sdk";
import {NumberEditorField} from "./EditorField";
import {format} from "numerable";

export class BearingEditor extends Editor<number> {

    constructor(bus: EventBus, value: number | null, enterCallback: (text: number) => void) {
        super(bus, [
            NumberEditorField.createWithMinMax(0, 3),
            new NumberEditorField(),
            new NumberEditorField(),
        ], value, enterCallback);
    }

    public render(): VNode {
        return (<span ref={this.containerRef}>
            {this.editorFields[0].render()}{this.editorFields[1].render()}{this.editorFields[2].render()}
        </span>);
    }

    protected convertFromValue(radial: number): Rawvalue {
        const numberString = format(radial, "000");
        return [
            Number(numberString.substring(0, 1)),
            Number(numberString.substring(1, 2)),
            Number(numberString.substring(2, 3)),
        ];
    }

    protected convertToValue(rawValue: Rawvalue): Promise<number | null> {
        const newValue = Number(String(rawValue[0]) + String(rawValue[1]) + String(rawValue[2]));
        if (newValue >= 360) {
            return Promise.resolve(null);
        }

        return Promise.resolve(newValue);
    }
}