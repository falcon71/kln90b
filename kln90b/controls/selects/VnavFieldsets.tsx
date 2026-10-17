import {SelectField} from "./SelectField";
import {FSComponent, VNode} from "@microsoft/msfs-sdk";
import {UiElement, UIElementChildren} from "../../pages/Page";
import {format} from "numerable";
import {Degrees, NauticalMiles} from "../../data/Units";
import {TextDisplay} from "../displays/TextDisplay";


type VnavDistanceFieldsetTypes = {
    dist10: SelectField;
    dist1: SelectField;
}

const CHAR_SET = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export class VnavDistanceFieldset implements UiElement {


    readonly children: UIElementChildren<VnavDistanceFieldsetTypes>;

    constructor(private distance: NauticalMiles, private readonly callback: (distance: NauticalMiles) => void) {
        const distanceString = format(distance, "00");
        this.children = new UIElementChildren<VnavDistanceFieldsetTypes>({
            dist10: new SelectField(CHAR_SET, Number(distanceString.substring(0, 1)), this.saveDist10.bind(this)),
            dist1: new SelectField(CHAR_SET, Number(distanceString.substring(1, 2)), this.saveDist1.bind(this)),
        });
    }

    render(): VNode {
        return (
            <span>{this.children.get("dist10").render()}{this.children.get("dist1").render()}</span>);
    }

    tick(blink: boolean): void {
    }

    public setValue(distance: NauticalMiles) {
        this.distance = distance;
        const distanceString = format(distance, "00");
        this.children.get("dist10").value = Number(distanceString.substring(0, 1));
        this.children.get("dist1").value = Number(distanceString.substring(1, 2));
    }

    private saveDist10(newDist10: number): void {
        const oldDist = format(this.distance, "00");
        this.distance = Number(newDist10 + oldDist.substring(1));
        this.callback(this.distance);
    }

    private saveDist1(newDist1: number): void {
        const oldDist = format(this.distance, "00");
        this.distance = Number(oldDist.substring(0, 1) + newDist1);
        this.callback(this.distance);
    }
}


type VnavAngleFieldsetTypes = {
    sign: TextDisplay,
    angle1: SelectField;
    angle01: SelectField;
}

export class VnavAngleFieldset implements UiElement {


    readonly children: UIElementChildren<VnavAngleFieldsetTypes>;
    /** null while the field shows dashes: it holds no angle, and an edit starts from 0.0 (#314) */
    private angle: Degrees | null = null;

    constructor(angle: Degrees | null, private readonly callback: (angle: Degrees) => void) {
        this.children = new UIElementChildren<VnavAngleFieldsetTypes>({
            sign: new TextDisplay(" "),
            angle1: new SelectField(CHAR_SET, 0, this.saveAngle1.bind(this)),
            angle01: new SelectField(CHAR_SET, 0, this.saveAngle01.bind(this)),
        });
        this.setValue(angle);
    }

    render(): VNode {
        return (
            <span>{this.children.get("sign").render()}{this.children.get("angle1").render()}.{this.children.get("angle01").render()}</span>);
    }

    tick(blink: boolean): void {
    }

    /**
     * #314: an angle that does not fit the cells (or none, or NaN) shows dashes
     */
    public setValue(angle: Degrees | null): void {
        const tenths = angle === null ? NaN : Math.round(Math.abs(angle) * 10);
        if (!(tenths <= 99)) {
            this.angle = null;
            this.children.get("sign").text = " ";
            this.showDigits(null);
            return;
        }
        this.angle = angle;
        const angleString = format(tenths / 10, "0.0");
        this.children.get("sign").text = angle! >= 0 ? " " : "-";
        this.showDigits(angleString);
    }

    public isFocused(): boolean {
        return this.children.get("angle1").isFocused || this.children.get("angle01").isFocused;
    }

    private showDigits(angleString: string | null): void {
        const angle1 = this.children.get("angle1");
        const angle01 = this.children.get("angle01");
        angle1.value = angleString === null ? 0 : Number(angleString.substring(0, 1));
        angle01.value = angleString === null ? 0 : Number(angleString.substring(2, 3));
        angle1.displayOverride = angleString === null ? "-" : null;
        angle01.displayOverride = angleString === null ? "-" : null;
    }

    private saveAngle1(newAngle1: number): void {
        const oldAngle = format(this.angle ?? 0, "+0.0", {zeroFormat: "+0.0"});
        this.save(Number(oldAngle.substring(0, 1) + newAngle1 + oldAngle.substring(2)));
    }

    private saveAngle01(newAngle01: number): void {
        const oldAngle = format(this.angle ?? 0, "+0.0", {zeroFormat: "+0.0"});
        this.save(Number(oldAngle.substring(0, 3) + newAngle01));
    }

    private save(angle: Degrees): void {
        this.setValue(angle);
        this.callback(angle);
    }
}
