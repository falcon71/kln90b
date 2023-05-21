import {SelectField} from "./SelectField";
import {FSComponent, VNode} from "@microsoft/msfs-sdk";
import {UiElement, UIElementChildren} from "../../pages/Page";
import {format} from "numerable";
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

    constructor(private temp: Celsius, private readonly callback: (temp: Celsius) => void) {
        const tempString = format(Math.abs(temp), "00");
        this.children = new UIElementChildren<TempFieldsetTypes>({
            TempSign: new SelectField(SIGN_SET, temp >= 0 ? 1 : 0, this.saveSign.bind(this)),
            Temp10: new SelectField(TEMP_SET, Number(tempString.substring(0, 1)), this.saveTemp10.bind(this)),
            Temp1: new SelectField(TEMP_SET, Number(tempString.substring(1, 2)), this.saveTemp1.bind(this)),
        });
    }

    render(): VNode {
        return (
            <span>{this.children.get("TempSign").render()}{this.children.get("Temp10").render()}{this.children.get("Temp1").render()}</span>);
    }

    tick(blink: boolean): void {
    }

    public setTemp(temp: Celsius): void {
        this.temp = temp;
        const tempString = format(Math.abs(temp), "00");
        this.children.get("TempSign").value = temp >= 0 ? 1 : 0;
        this.children.get("Temp10").value = Number(tempString.substring(0, 1));
        this.children.get("Temp1").value = Number(tempString.substring(1, 2));

    }

    private saveSign(newSign: number): void {
        const oldTemp = Math.abs(this.temp);
        this.temp = oldTemp * (newSign === 0 ? -1 : 1);
        this.callback(this.temp);
    }

    private saveTemp10(newTemp10: number): void {
        const oldTemp = format(this.temp, "+00", {zeroFormat: "+00"});
        this.temp = Number(oldTemp.substring(0, 1) + newTemp10 + oldTemp.substring(2));
        this.callback(this.temp);
    }

    private saveTemp1(newTemp1: number): void {
        const oldTemp = format(this.temp, "+00", {zeroFormat: "+00"});
        this.temp = Number(oldTemp.substring(0, 2) + newTemp1);
        this.callback(this.temp);
    }

}