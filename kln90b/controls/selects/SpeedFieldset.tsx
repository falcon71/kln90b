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
    /** null while the field shows dashes: it holds no value, and an edit starts from 000 (#257) */
    private speed: Knots | null = null;

    constructor(speed: Knots | null, private readonly callback: (Speed: Knots) => void) {
        this.children = new UIElementChildren<SpeedFieldsetTypes>({
            Speed100: new SelectField(SPEED_SET, 0, this.saveSpeed100.bind(this)),
            Speed10: new SelectField(SPEED_SET, 0, this.saveSpeed10.bind(this)),
            Speed1: new SelectField(SPEED_SET, 0, this.saveSpeed1.bind(this)),
        });
        this.setSpeed(speed);
    }

    render(): VNode {
        return (
            <span>{this.children.get("Speed100").render()}{this.children.get("Speed10").render()}{this.children.get("Speed1").render()}</span>);
    }

    tick(blink: boolean): void {
    }

    /**
     * #257: a speed that does not fit the three cells (or none, or NaN) shows dashes
     */
    public setSpeed(speed: Knots | null): void {
        const rounded = speed === null ? NaN : Math.round(speed);
        if (!(rounded >= 0 && rounded <= 999)) {
            this.speed = null;
            this.showDigits(null);
            return;
        }
        this.speed = speed;
        this.showDigits(format(rounded, "000"));
    }

    private showDigits(digits: string | null): void {
        const fields = [this.children.get("Speed100"), this.children.get("Speed10"), this.children.get("Speed1")];
        fields.forEach((field, i) => {
            field.value = digits === null ? 0 : Number(digits.substring(i, i + 1));
            field.displayOverride = digits === null ? "-" : null;
        });
    }

    private saveSpeed100(newSpeed100: number): void {
        const oldSpeed = format(this.speed ?? 0, "000");
        this.save(Number(newSpeed100 + oldSpeed.substring(1)));
    }

    private saveSpeed10(newSpeed10: number): void {
        const oldSpeed = format(this.speed ?? 0, "000");
        this.save(Number(oldSpeed.substring(0, 1) + newSpeed10 + oldSpeed.substring(2)));
    }

    private saveSpeed1(newSpeed1: number): void {
        const oldSpeed = format(this.speed ?? 0, "000");
        this.save(Number(oldSpeed.substring(0, 2) + newSpeed1));
    }

    private save(speed: Knots): void {
        this.speed = speed;
        this.showDigits(format(speed, "000"));
        this.callback(speed);
    }
}
