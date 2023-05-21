import {Editor, Rawvalue} from "./Editor";
import {EventBus, FSComponent, VNode} from "@microsoft/msfs-sdk";
import {NumberEditorField} from "./EditorField";
import {format} from "numerable";

export class VorFreqEditor extends Editor<number> {

    constructor(bus: EventBus, value: number | null, enterCallback: (text: number) => void) {
        super(bus, [
            NumberEditorField.createWithMinMax(1, 1),
            NumberEditorField.createWithMinMax(0, 1),
            new NumberEditorField(),
            new NumberEditorField(),
            new NumberEditorField(),
        ], value, enterCallback);
    }

    public render(): VNode {
        return (<span ref={this.containerRef}>
            {this.editorFields[0].render()}{this.editorFields[1].render()}{this.editorFields[2].render()}.{this.editorFields[3].render()}{this.editorFields[4].render()}
        </span>);
    }

    protected convertFromValue(value: number): Rawvalue {
        const numberString = format(value, "000.00");

        return [
            0,
            Number(numberString.substring(1, 2)),
            Number(numberString.substring(2, 3)),
            Number(numberString.substring(4, 5)),
            Number(numberString.substring(5, 6)),
        ];
    }

    protected convertToValue(rawValue: Rawvalue): Promise<number | null> {
        const newValue = Number("1" + rawValue[1] + rawValue[2] + "." + rawValue[3] + rawValue[4]);
        if (newValue < 108 || newValue > 117.95) {
            return Promise.resolve(null);
        }
        return Promise.resolve(newValue);
    }
}