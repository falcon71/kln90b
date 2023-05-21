import {Editor, Rawvalue} from "./Editor";
import {EventBus, FSComponent, VNode} from "@microsoft/msfs-sdk";
import {AlphabetEditorField} from "./EditorField";

export class FreetextEditor extends Editor<string> {

    constructor(bus: EventBus, value: string, maxLength: number, enterCallback: (text: string) => void) {
        super(bus, Array(maxLength).fill(null).map(() => new AlphabetEditorField()), value, enterCallback);
    }

    public render(): VNode {
        return (<span ref={this.containerRef}>{this.editorFields.map(f => f.render())}</span>);
    }

    protected convertFromValue(value: string): Rawvalue {
        let strIdx = 0;
        const numberVal = Array(this.editorFields.length);
        for (let i = 0; i < this.editorFields.length; i++) {
            const field = this.editorFields[i];
            const fieldLength = field.charset[0].length;
            const fieldVal = value.substring(strIdx, strIdx + fieldLength);
            numberVal[i] = field.charset.indexOf(fieldVal);
            strIdx += fieldLength;
        }
        return numberVal;
    }


    protected convertToValue(rawValue: Rawvalue): Promise<string> {
        const val = Array(rawValue.length);
        for (let i = 0; i < rawValue.length; i++) {
            val[i] = this.editorFields[i].charset[rawValue[i]];
        }

        return Promise.resolve(val.join(""));
    }
}