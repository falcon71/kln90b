import {Editor, Rawvalue} from "./Editor";
import {EventBus, FSComponent, VNode} from "@microsoft/msfs-sdk";
import {AlphabetEditorField, EditorField} from "./EditorField";

export class FreetextEditor extends Editor<string> {

    /**
     * @param firstClickGivesA true on the remark lines of APT 5 (#311, checked in the KLN 89 trainer, 2026-10-08, T12):
     * the click that starts an entry puts an A in the first cell. The Turn-On page keeps the blank: there is no evidence
     * for an A on that page (neither the 90B guide nor the trainer record covers it)
     */
    constructor(bus: EventBus, value: string, maxLength: number, enterCallback: (text: string) => void,
                createField: () => EditorField = () => new AlphabetEditorField(), private readonly firstClickGivesA = false) {
        super(bus, Array(maxLength).fill(null).map(createField), value, enterCallback);
    }

    /**
     * #311: with firstClickGivesA the click that starts an entry puts an A in the first cell and leaves the others empty
     * (checked in the KLN 89 trainer, 2026-10-08, T12). A line that held text is cleared to that A the same way (the
     * evening block of 2026-10-15). The click is clockwise in both records; the other direction gives the A too, which no
     * record shows. The numeric editors keep the blank of Editor.setEntered
     */
    innerLeft(): boolean {
        return this.startEntryWithA(super.innerLeft.bind(this));
    }

    innerRight(): boolean {
        return this.startEntryWithA(super.innerRight.bind(this));
    }

    private startEntryWithA(turn: () => boolean): boolean {
        const startsEntry = !this.isEntered;
        const handled = turn();
        if (startsEntry && this.firstClickGivesA) {
            this.editorFields[0].setDisplayValue("A");
        }
        return handled;
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