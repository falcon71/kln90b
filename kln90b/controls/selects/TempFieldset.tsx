import {SelectField} from "./SelectField";
import {FSComponent, VNode} from "@microsoft/msfs-sdk";
import {UiElement, UIElementChildren} from "../../pages/Page";
import {padInt} from "../../data/NumberFormat";
import {Celsius} from "../../data/Units";


type TempFieldsetTypes = {
    TempSign: SelectField;
    Temp10: SelectField;
    Temp1: SelectField;
}

const SIGN_SET = ["-", "0"];
const TEMP_SET = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export class TempFieldset implements UiElement {

    readonly children: UIElementChildren<TempFieldsetTypes>;
    /**
     * null while the field shows dashes or a temperature of 100 or more: it holds no value, and an edit starts from 000
     * with the sign cell on 0 (#257)
     */
    private temp: Celsius | null = null;

    constructor(temp: Celsius | null, private readonly callback: (temp: Celsius) => void) {
        this.children = new UIElementChildren<TempFieldsetTypes>({
            TempSign: new SelectField(SIGN_SET, 1, this.saveSign.bind(this)),
            Temp10: new SelectField(TEMP_SET, 0, this.saveTemp10.bind(this)),
            Temp1: new SelectField(TEMP_SET, 0, this.saveTemp1.bind(this)),
        });
        this.setTemp(temp);
    }

    render(): VNode {
        return (
            <span>{this.children.get("TempSign").render()}{this.children.get("Temp10").render()}{this.children.get("Temp1").render()}</span>);
    }

    tick(blink: boolean): void {
    }

    /**
     * #257: -99 to 99 shows the sign cell and two digits. 100 to 999 shows its hundreds digit in the sign cell, but
     * the field holds no value, since the sign cell can only be - or 0. Anything else (none, NaN, -100 or less, 1000
     * or more) shows dashes and holds no value.
     */
    public setTemp(temp: Celsius | null): void {
        const rounded = temp === null ? NaN : Math.round(temp);
        if (rounded >= -99 && rounded <= 99) { //rounded is NaN without a temperature
            this.temp = temp;
            this.children.get("TempSign").value = temp! >= 0 ? 1 : 0;
            this.showDigits(padInt(Math.abs(temp!), 2));
            return;
        }

        this.temp = null;
        this.children.get("TempSign").value = 1;
        this.showDigits("00");
        const override = rounded >= 100 && rounded <= 999 ? padInt(rounded, 3) : "---";
        this.fields().forEach((field, i) => field.displayOverride = override.substring(i, i + 1));
    }

    private fields(): SelectField[] {
        return [this.children.get("TempSign"), this.children.get("Temp10"), this.children.get("Temp1")];
    }

    /**
     * Sets the two digit cells and clears every override. The sign cell keeps its value: it is the owner of the sign
     */
    private showDigits(digits: string): void {
        this.children.get("Temp10").value = Number(digits.substring(0, 1));
        this.children.get("Temp1").value = Number(digits.substring(1, 2));
        this.fields().forEach(field => field.displayOverride = null);
    }

    private saveSign(newSign: number): void {
        const oldTemp = Math.abs(this.temp ?? 0);
        this.save(oldTemp * (newSign === 0 ? -1 : 1));
    }

    private saveTemp10(newTemp10: number): void {
        const oldTemp = padInt(Math.abs(this.temp ?? 0), 2);
        this.save(this.sign() * Number(newTemp10 + oldTemp.substring(1)));
    }

    private saveTemp1(newTemp1: number): void {
        const oldTemp = padInt(Math.abs(this.temp ?? 0), 2);
        this.save(this.sign() * Number(oldTemp.substring(0, 1) + newTemp1));
    }

    private save(temp: Celsius): void {
        this.temp = temp;
        this.showDigits(padInt(Math.abs(temp), 2));
        this.callback(temp);
    }

    /**
     * The sign comes from the sign cell, not from the value: a minus on a value of zero (-0) would be lost by the
     * formatting of the digits (5-10)
     */
    private sign(): number {
        return this.children.get("TempSign").value === 0 ? -1 : 1;
    }

}
