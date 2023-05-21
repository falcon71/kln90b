import {Editor, Rawvalue} from "./Editor";
import {EventBus, FSComponent, VNode} from "@microsoft/msfs-sdk";
import {NumberEditorField} from "./EditorField";
import {TimeStamp} from "../../data/Time";
import {format} from "numerable";

export class TimeEditor extends Editor<TimeStamp> {

    constructor(bus: EventBus, value: TimeStamp | null, enterCallback: (text: TimeStamp) => void) {
        super(bus, [
            NumberEditorField.createWithMinMax(0, 23),
            NumberEditorField.createWithMinMax(0, 5),
            new NumberEditorField(),
        ], value, enterCallback);
    }

    public render(): VNode {
        return (<span ref={this.containerRef}>
            {this.editorFields[0].render()}:{this.editorFields[1].render()}{this.editorFields[2].render()}
        </span>);
    }

    protected convertFromValue(value: TimeStamp): Rawvalue {
        const stringMinutes = format(value.getMinutes(), "00");

        return [
            value.getHours(),
            Number(stringMinutes.substring(0, 1)),
            Number(stringMinutes.substring(1, 2)),
        ];
    }


    protected convertToValue(rawValue: Rawvalue): Promise<TimeStamp> {
        if (this.value === null) {
            return Promise.resolve(TimeStamp.createTime(rawValue[0], rawValue[1] * 10 + rawValue[2]));
        } else {
            return Promise.resolve(this.value!.withTime(rawValue[0], rawValue[1] * 10 + rawValue[2]));
        }

    }

}