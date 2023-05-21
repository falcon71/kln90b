import {SelectField} from "./SelectField";
import {FSComponent, VNode} from "@microsoft/msfs-sdk";
import {UiElement, UIElementChildren} from "../../pages/Page";
import {format} from "numerable";
import {Knots} from "../../data/Units";


type SpeedFieldsetTypes = {
    Speed100: SelectField;
    Speed10: SelectField;
    Speed1: SelectField;
}

const SPEED_SET = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export class SpeedFieldset implements UiElement {


    readonly children: UIElementChildren<SpeedFieldsetTypes>;

    constructor(private speed: Knots, private readonly callback: (Speed: Knots) => void) {
        const SpeedString = format(speed, "000");
        this.children = new UIElementChildren<SpeedFieldsetTypes>({
            Speed100: new SelectField(SPEED_SET, Number(SpeedString.substring(0, 1)), this.saveSpeed100.bind(this)),
            Speed10: new SelectField(SPEED_SET, Number(SpeedString.substring(1, 2)), this.saveSpeed10.bind(this)),
            Speed1: new SelectField(SPEED_SET, Number(SpeedString.substring(2, 3)), this.saveSpeed1.bind(this)),
        });
    }

    render(): VNode {
        return (
            <span>{this.children.get("Speed100").render()}{this.children.get("Speed10").render()}{this.children.get("Speed1").render()}</span>);
    }

    tick(blink: boolean): void {
    }

    public setSpeed(speed: Knots): void {
        this.speed = speed;
        const SpeedString = format(speed, "000");
        this.children.get("Speed100").value = Number(SpeedString.substring(0, 1));
        this.children.get("Speed10").value = Number(SpeedString.substring(1, 2));
        this.children.get("Speed1").value = Number(SpeedString.substring(2, 3));
    }

    private saveSpeed100(newSpeed100: number): void {
        const oldSpeed = format(this.speed, "000");
        this.speed = Number(newSpeed100 + oldSpeed.substring(1));
        this.callback(this.speed);
    }

    private saveSpeed10(newSpeed10: number): void {
        const oldSpeed = format(this.speed, "000");
        this.speed = Number(oldSpeed.substring(0, 1) + newSpeed10 + oldSpeed.substring(2));
        this.callback(this.speed);
    }

    private saveSpeed1(newSpeed1: number): void {
        const oldSpeed = format(this.speed, "000");
        this.speed = Number(oldSpeed.substring(0, 2) + newSpeed1);
        this.callback(this.speed);
    }


}