import {SelectField} from "./SelectField";
import {FSComponent, VNode} from "@microsoft/msfs-sdk";
import {UiElement, UIElementChildren} from "../../pages/Page";
import {format} from "numerable";
import {Degrees} from "../../data/Units";


type BearingFieldsetTypes = {
    bearing10: SelectField;
    bearing1: SelectField;
}

const BEARING_10_SET = ["00", "01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "35"];
const BEARING_1_SET = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export class BearingFieldset implements UiElement {


    readonly children: UIElementChildren<BearingFieldsetTypes>;

    constructor(private bearing: Degrees, private readonly callback: (bearing: Degrees) => void) {
        const bearingString = format(bearing, "000");
        this.children = new UIElementChildren<BearingFieldsetTypes>({
            bearing10: new SelectField(BEARING_10_SET, Number(bearingString.substring(0, 2)), this.saveBearing10.bind(this)),
            bearing1: new SelectField(BEARING_1_SET, Number(bearingString.substring(2, 3)), this.saveBearing1.bind(this)),
        });
    }

    render(): VNode {
        return (
            <span>{this.children.get("bearing10").render()}{this.children.get("bearing1").render()}</span>);
    }

    tick(blink: boolean): void {
    }

    public setReadonly(readonly: boolean): void {
        this.children.get("bearing10").isReadonly = readonly;
        this.children.get("bearing1").isReadonly = readonly;
    }

    private saveBearing10(newBearing10: number): void {
        const oldBearing = format(this.bearing, "000");
        this.bearing = Number(newBearing10 + oldBearing.substring(2));
        this.callback(this.bearing);
    }

    private saveBearing1(newBearing1: number): void {
        const oldBearing = format(this.bearing, "000");
        this.bearing = Number(oldBearing.substring(0, 2) + newBearing1);
        this.callback(this.bearing);
    }
}