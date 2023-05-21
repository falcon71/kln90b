import {Editor, Rawvalue} from "./Editor";
import {EventBus, FSComponent, VNode} from "@microsoft/msfs-sdk";
import {MonthEditorField, NumberEditorField} from "./EditorField";
import {shortYearToLongYear, TimeStamp} from "../../data/Time";

export class DateEditor extends Editor<TimeStamp> {

    constructor(bus: EventBus, value: TimeStamp, enterCallback: (text: TimeStamp) => void) {
        super(bus, [
            NumberEditorField.createWithMinMax(1, 31),
            new MonthEditorField(),
            new NumberEditorField(),
            new NumberEditorField(),
        ], value, enterCallback);
    }

    public render(): VNode {
        return (<span ref={this.containerRef}>
            {this.editorFields[0].render()} {this.editorFields[1].render()} {this.editorFields[2].render()}{this.editorFields[3].render()}
        </span>);
    }

    protected convertFromValue(value: TimeStamp): Rawvalue {
        return [
            value.getDate() - 1,
            value.getMonth(),
            Number(String(value.getYear()).substring(2, 3)),
            Number(String(value.getYear()).substring(3, 4)),
        ];
    }

    protected convertToValue(rawValue: Rawvalue): Promise<TimeStamp | null> {
        const year = shortYearToLongYear(Number(String(rawValue[2]) + String(rawValue[3])));
        const month = rawValue[1];
        const date = rawValue[0] + 1;

        const newDate = this.value!.withDate(year, month, date);
        if (newDate.getYear() != year || newDate.getMonth() != month || newDate.getDate() != date) { //The entered date was invalid, like Nov 31.
            return Promise.resolve(null);
        }
        return Promise.resolve(newDate);
    }
}