import {Editor, Rawvalue} from "./Editor";
import {EventBus, FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {MonthEditorField, NumberEditorField} from "./EditorField";
import {shortYearToLongYear, TimeStamp} from "../../data/Time";
import {TickController} from "../../TickController";

export class DateEditor extends Editor<TimeStamp> {

    private space1Ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();
    private space2Ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    constructor(bus: EventBus, value: TimeStamp, enterCallback: (text: TimeStamp) => void) {
        super(bus, [
            NumberEditorField.createWithMinMax(1, 31),
            new MonthEditorField(),
            new NumberEditorField(),
            new NumberEditorField(),
        ], value, enterCallback);

        //The default date in the -89 is 2000, but it's 1988 in the -90B
        //When entering a 0 in the third place and leaving the fourth place blank, it becomes 2008
        this.editorFields[2].defaultValue = 8;
        this.editorFields[3].defaultValue = 8;
    }

    public render(): VNode {
        return (<span ref={this.containerRef}>
            {this.editorFields[0].render()}<span ref={this.space1Ref}> </span>{this.editorFields[1].render()}<span
            ref={this.space2Ref}> </span>{this.editorFields[2].render()}{this.editorFields[3].render()}
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

    tick(blink: boolean): void {
        super.tick(blink);
        if (!TickController.checkRef(this.space1Ref, this.space2Ref)) {
            return;
        }
        if (this.isFocused) {
            this.space1Ref!.instance.classList.add("inverted");
            this.space2Ref!.instance.classList.add("inverted");
        } else {
            this.space1Ref!.instance.classList.remove("inverted");
            this.space2Ref!.instance.classList.remove("inverted");
        }
    }
}