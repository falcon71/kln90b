import {Editor, Rawvalue} from "./Editor";
import {EventBus, FSComponent, VNode} from "@microsoft/msfs-sdk";
import {NumberEditorField} from "./EditorField";
import {format} from "numerable";

export class NdbFreqEditor extends Editor<number> {

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
        return (<span ref={this.containerRef}>
            {this.editorFields[0].render()}{this.editorFields[1].render()}{this.editorFields[2].render()}{this.editorFields[3].render()}.{this.editorFields[4].render()}
        </span>);
    }

    protected convertFromValue(value: number): Rawvalue {
        const numberString = format(value, "0000.0");

        return [
            Number(numberString.substring(0, 1)),
            Number(numberString.substring(1, 2)),
            Number(numberString.substring(2, 3)),
            Number(numberString.substring(3, 4)),
            Number(numberString.substring(5, 6)),
        ];
    }

    protected convertToValue(rawValue: Rawvalue): Promise<number | null> {
        const newValue = Number(rawValue[0] + rawValue[1] + rawValue[2] + rawValue[3] + "." + rawValue[4]);
        if (newValue < 190 || newValue > 1750) {
            return Promise.resolve(null);
        }
        return Promise.resolve(newValue);
    }
}