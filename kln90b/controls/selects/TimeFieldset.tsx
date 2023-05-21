import {SelectField} from "./SelectField";
import {FSComponent, VNode} from "@microsoft/msfs-sdk";
import {UiElement, UIElementChildren} from "../../pages/Page";
import {format} from "numerable";
import {TimeStamp} from "../../data/Time";


type TimeFieldsetTypes = {
    hour: SelectField;
    minute10: SelectField;
    minute1: SelectField;
}

const HOUR_SET = Array(24).fill(null).map((_, idx) => format(idx, "00"));
const MINUTE10_SET = ["0", "1", "2", "3", "4", "5"];
const MINUTE1_SET = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export class TimeFieldset implements UiElement {


    readonly children: UIElementChildren<TimeFieldsetTypes>;

    constructor(private time: TimeStamp, private readonly callback: (time: TimeStamp) => void) {
        const minuteString = format(time.getMinutes(), "00");
        this.children = new UIElementChildren<TimeFieldsetTypes>({
            hour: new SelectField(HOUR_SET, time.getHours(), this.saveHours.bind(this)),
            minute10: new SelectField(MINUTE10_SET, Number(minuteString.substring(0, 1)), this.saveMinute10.bind(this)),
            minute1: new SelectField(MINUTE1_SET, Number(minuteString.substring(1, 2)), this.saveMinute1.bind(this)),
        });
    }

    render(): VNode {
        return (
            <span>{this.children.get("hour").render()}:{this.children.get("minute10").render()}{this.children.get("minute1").render()}</span>);
    }

    tick(blink: boolean): void {
    }

    public setTime(time: TimeStamp): void {
        this.time = time;
        const minuteString = format(time.getMinutes(), "00");
        this.children.get("hour").value = time.getHours();
        this.children.get("minute10").value = Number(minuteString.substring(0, 1));
        this.children.get("minute1").value = Number(minuteString.substring(1, 2));

    }

    private saveHours(newHours: number): void {
        this.time = this.time.withTime(newHours, this.time.getMinutes());
        this.callback(this.time);
    }

    private saveMinute10(newMinutes10: number): void {
        const oldTime = format(this.time.getMinutes(), "00");
        this.time = this.time.withTime(this.time.getHours(), Number(newMinutes10 + oldTime.substring(1)));
        this.callback(this.time);
    }

    private saveMinute1(newMinutes1: number): void {
        const oldTime = format(this.time.getMinutes(), "00");
        this.time = this.time.withTime(this.time.getHours(), Number(oldTime.substring(0, 1) + newMinutes1));
        this.callback(this.time);
    }

}