import {Editor, Rawvalue} from "./Editor";
import {EventBus, FSComponent, VNode} from "@microsoft/msfs-sdk";
import {NumberEditorField} from "./EditorField";
import {padInt} from "../../data/NumberFormat";

export class SpeedEditor extends Editor<number> {

    constructor(bus: EventBus, value: number | null, enterCallback: (text: number) => void) {
        super(bus, [
            new NumberEditorField(), //#245: the open field shows its zeros (005), checked in the KLN 89 trainer, 2026-10-08
            new NumberEditorField(),
            new NumberEditorField(),
        ], value, enterCallback);
        this.setLeadingZeroCells([0, 1]); //#245: 3-18, an entered speed has no leading zeros (  5, 0 KT as   0)
    }

    public render(): VNode {
        return (<span ref={this.containerRef}>
            {this.editorFields[0].render()}{this.editorFields[1].render()}{this.editorFields[2].render()}
        </span>);
    }

    protected convertFromValue(radial: number): Rawvalue {
        const numberString = padInt(radial, 3);
        return [
            Number(numberString.substring(0, 1)),
            Number(numberString.substring(1, 2)),
            Number(numberString.substring(2, 3)),
        ];
    }

    protected convertToValue(rawValue: Rawvalue): Promise<number | null> {
        const newValue = Number(String(rawValue[0]) + String(rawValue[1]) + String(rawValue[2]));
        return Promise.resolve(newValue);
    }
}