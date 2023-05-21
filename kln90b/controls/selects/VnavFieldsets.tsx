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

    constructor(private angle: Degrees, private readonly callback: (angle: Degrees) => void) {
        const angleString = format(Math.abs(angle), "0.0");
        this.children = new UIElementChildren<VnavAngleFieldsetTypes>({
            sign: new TextDisplay(angle >= 0 ? " " : "-"),
            angle1: new SelectField(CHAR_SET, Number(angleString.substring(0, 1)), this.saveAngle1.bind(this)),
            angle01: new SelectField(CHAR_SET, Number(angleString.substring(2, 3)), this.saveAngle01.bind(this)),
        });
    }

    render(): VNode {
        return (
            <span>{this.children.get("sign").render()}{this.children.get("angle1").render()}.{this.children.get("angle01").render()}</span>);
    }

    tick(blink: boolean): void {
    }

    public setValue(angle: Degrees) {
        this.angle = angle;
        const angleString = format(Math.abs(angle), "0.0");
        this.children.get("sign").text = angle >= 0 ? " " : "-";
        this.children.get("angle1").value = Number(angleString.substring(0, 1));
        this.children.get("angle01").value = Number(angleString.substring(2, 3));
    }

    public isFocused(): boolean {
        return this.children.get("angle1").isFocused || this.children.get("angle01").isFocused;
    }

    private saveAngle1(newAngle1: number): void {
        const oldAngle = format(this.angle, "+0.0", {zeroFormat: "+0.0"});
        this.angle = Number(oldAngle.substring(0, 1) + newAngle1 + oldAngle.substring(2));
        this.callback(this.angle);
    }

    private saveAngle01(newAngle01: number): void {
        const oldAngle = format(this.angle, "+0.0", {zeroFormat: "+0.0"});
        this.angle = Number(oldAngle.substring(0, 3) + newAngle01);
        this.callback(this.angle);
    }
}