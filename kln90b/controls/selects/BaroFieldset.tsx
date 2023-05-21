import {SelectField} from "./SelectField";
import {FSComponent, UnitType, VNode} from "@microsoft/msfs-sdk";
import {UiElement, UIElementChildren} from "../../pages/Page";
import {format} from "numerable";
import {BARO_UNIT_INHG, KLN90BUserSettings} from "../../settings/KLN90BUserSettings";
import {Feet, Inhg} from "../../data/Units";


type BaroFieldsetTypes = {
    baro100: SelectField;
    baro10: SelectField;
    baro1: SelectField;
}

const INHG_BARO_100_SET = Array(31).fill(null).map((_, idx) => format(idx, "00"));
const BARO_SET = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export interface BaroFieldset extends UiElement {
    setBaro(baro: Inhg): void;

    setReadonly(readonly: boolean): void;
}


class InhgBaroFieldset implements BaroFieldset {


    readonly children: UIElementChildren<BaroFieldsetTypes>;

    constructor(private baro: Inhg, private readonly callback: (alt: Feet) => void) {
        const baroString = format(Utils.Clamp(baro, 0, 30.99), "00.00");

        this.children = new UIElementChildren<BaroFieldsetTypes>({
            baro100: new SelectField(INHG_BARO_100_SET, INHG_BARO_100_SET.indexOf(baroString.substring(0, 2)), this.saveBaro100.bind(this)),
            baro10: new SelectField(BARO_SET, Number(baroString.substring(3, 4)), this.saveBaro10.bind(this)),
            baro1: new SelectField(BARO_SET, Number(baroString.substring(4, 5)), this.saveBaro1.bind(this)),
        });
    }

    render(): VNode {
        return (
            <span>{this.children.get("baro100").render()}.{this.children.get("baro10").render()}{this.children.get("baro1").render()}"</span>);
    }

    tick(blink: boolean): void {
    }

    public setBaro(baro: Inhg): void {
        this.baro = baro;
        const baroString = format(Utils.Clamp(baro, 22, 30.99), "00.00");

        this.children.get("baro100").value = INHG_BARO_100_SET.indexOf(baroString.substring(0, 2));
        this.children.get("baro10").value = Number(baroString.substring(3, 4));
        this.children.get("baro1").value = Number(baroString.substring(4, 5));
    }

    public setReadonly(readonly: boolean): void {
        this.children.get("baro100").isReadonly = readonly;
        this.children.get("baro10").isReadonly = readonly;
        this.children.get("baro1").isReadonly = readonly;
    }

    private saveBaro100(baro100Idx: number): void {
        const newBaro100 = INHG_BARO_100_SET[baro100Idx];
        const oldBaro = format(this.baro, "00.00");
        this.baro = Number(newBaro100 + oldBaro.substring(2));
        this.callback(this.baro);
    }

    private saveBaro10(newBaro10: number): void {
        const oldBaro = format(this.baro, "00.00");
        this.baro = Number(oldBaro.substring(0, 3) + newBaro10 + oldBaro.substring(4));
        this.callback(this.baro);
    }

    private saveBaro1(newBaro1: number): void {
        const oldBaro = format(this.baro, "00.00");
        this.baro = Number(oldBaro.substring(0, 4) + newBaro1);
        this.callback(this.baro);
    }
}


const HPA_BARO_100_SET = ["07", "08", "09", "10"];


class HpaBaroFieldset implements BaroFieldset {


    readonly children: UIElementChildren<BaroFieldsetTypes>;

    constructor(private baro: Inhg, private readonly callback: (alt: Feet) => void) {
        const baroString = format(Utils.Clamp(UnitType.IN_HG.convertTo(baro, UnitType.HPA), 700, 1099), "0000");

        this.children = new UIElementChildren<BaroFieldsetTypes>({
            baro100: new SelectField(HPA_BARO_100_SET, HPA_BARO_100_SET.indexOf(baroString.substring(0, 2)), this.saveBaro100.bind(this)),
            baro10: new SelectField(BARO_SET, Number(baroString.substring(2, 3)), this.saveBaro10.bind(this)),
            baro1: new SelectField(BARO_SET, Number(baroString.substring(3, 4)), this.saveBaro1.bind(this)),
        });
    }

    render(): VNode {
        return (
            <span>{this.children.get("baro100").render()}{this.children.get("baro10").render()}{this.children.get("baro1").render()}MB</span>);
    }

    tick(blink: boolean): void {
    }

    public setBaro(baro: Inhg): void {
        this.baro = baro;
        const baroString = format(Utils.Clamp(UnitType.IN_HG.convertTo(baro, UnitType.HPA), 700, 1099), "0000");

        this.children.get("baro100").value = HPA_BARO_100_SET.indexOf(baroString.substring(0, 2));
        this.children.get("baro10").value = Number(baroString.substring(2, 3));
        this.children.get("baro1").value = Number(baroString.substring(3, 4));
    }

    public setReadonly(readonly: boolean): void {
        this.children.get("baro100").isReadonly = readonly;
        this.children.get("baro10").isReadonly = readonly;
        this.children.get("baro1").isReadonly = readonly;
    }

    private saveBaro100(baro100Idx: number): void {
        const newBaro100 = HPA_BARO_100_SET[baro100Idx];
        const oldBaro = format(UnitType.IN_HG.convertTo(this.baro, UnitType.HPA), "0000");
        this.baro = UnitType.HPA.convertTo(Number(newBaro100 + oldBaro.substring(2)), UnitType.IN_HG);
        this.callback(this.baro);
    }

    private saveBaro10(newBaro10: number): void {
        const oldBaro = format(UnitType.IN_HG.convertTo(this.baro, UnitType.HPA), "0000");
        this.baro = UnitType.HPA.convertTo(Number(oldBaro.substring(0, 2) + newBaro10 + oldBaro.substring(3)), UnitType.IN_HG);
        this.callback(this.baro);
        this.callback(this.baro);
    }

    private saveBaro1(newBaro1: number): void {
        const oldBaro = format(UnitType.IN_HG.convertTo(this.baro, UnitType.HPA), "0000");
        this.baro = UnitType.HPA.convertTo(Number(oldBaro.substring(0, 3) + newBaro1), UnitType.IN_HG);
        this.callback(this.baro);
    }

}


export class BaroFieldsetFactory {


    private constructor() {
    }

    public static createBaroFieldSet(baro: Inhg, userSettings: KLN90BUserSettings, callback: (alt: Feet) => void): BaroFieldset {
        const baroUnit = userSettings.getSetting("barounit").get();
        if (baroUnit === BARO_UNIT_INHG) {
            return new InhgBaroFieldset(baro, callback);
        } else {
            return new HpaBaroFieldset(baro, callback);
        }
    }
}