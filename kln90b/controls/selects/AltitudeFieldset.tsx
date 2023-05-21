import {SelectField} from "./SelectField";
import {FSComponent, VNode} from "@microsoft/msfs-sdk";
import {UiElement, UIElementChildren} from "../../pages/Page";
import {format} from "numerable";
import {Feet} from "../../data/Units";


type AltitudeFieldsetTypes = {
    Neg: SelectField;
    Alt10000: SelectField;
    Alt1000: SelectField;
    Alt100: SelectField;
    Alt10: SelectField;
    Alt1: SelectField;
}

const CHARSET = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export class AltitudeFieldset implements UiElement {


    readonly children: UIElementChildren<AltitudeFieldsetTypes>;

    constructor(private alt: Feet, private readonly callback: (alt: Feet) => void) {
        const altString = format(Math.max(alt, 0), "00000");
        this.children = new UIElementChildren<AltitudeFieldsetTypes>({
            Alt10000: new SelectField(CHARSET, Number(altString.substring(0, 1)), this.saveAlt10000.bind(this)),
            Alt1000: new SelectField(CHARSET, Number(altString.substring(1, 2)), this.saveAlt1000.bind(this)),
            Alt100: new SelectField(CHARSET, Number(altString.substring(2, 3)), this.saveAlt100.bind(this)),
            Alt10: new SelectField(CHARSET, Number(altString.substring(3, 4)), this.saveAlt10.bind(this)),
            Alt1: new SelectField(CHARSET, Number(altString.substring(4, 5)), this.saveAlt1.bind(this)),
        });
        this.children.get("Alt10").isReadonly = true;
        this.children.get("Alt1").isReadonly = true;
    }

    render(): VNode {
        return (
            <span>{this.children.get("Alt10000").render()}{this.children.get("Alt1000").render()}{this.children.get("Alt100").render()}{this.children.get("Alt10").render()}{this.children.get("Alt1").render()}</span>);
    }

    tick(blink: boolean): void {
    }

    public setReadonly(readOnly: boolean): void {
        this.children.get("Alt10000").isReadonly = readOnly;
        this.children.get("Alt1000").isReadonly = readOnly;
        this.children.get("Alt100").isReadonly = readOnly;
    }

    public setValue(alt: Feet): void {
        this.alt = alt;
        const altString = format(Math.max(alt, 0), "00000");

        this.children.get("Alt10000").value = Number(altString.substring(0, 1));
        this.children.get("Alt1000").value = Number(altString.substring(1, 2));
        this.children.get("Alt100").value = Number(altString.substring(2, 3));
        this.children.get("Alt10").value = Number(altString.substring(3, 4));
        this.children.get("Alt1").value = Number(altString.substring(4, 5));
    }

    private saveAlt10000(newAlt10000: number): void {
        const oldAlt = format(this.alt, "00000");
        this.alt = Number(newAlt10000 + oldAlt.substring(1));
        this.callback(this.alt);
    }

    private saveAlt1000(newAlt1000: number): void {
        const oldAlt = format(this.alt, "00000");
        this.alt = Number(oldAlt.substring(0, 1) + newAlt1000 + oldAlt.substring(2));
        this.callback(this.alt);
    }

    private saveAlt100(newAlt100: number): void {
        const oldAlt = format(this.alt, "00000");
        this.alt = Number(oldAlt.substring(1, 2) + newAlt100 + oldAlt.substring(3));
        this.callback(this.alt);
    }

    private saveAlt10(newAlt10: number): void {
        const oldAlt = format(this.alt, "00000");
        this.alt = Number(oldAlt.substring(2, 3) + newAlt10 + oldAlt.substring(4));
        this.callback(this.alt);
    }

    private saveAlt1(newAlt1: number): void {
        const oldAlt = format(this.alt, "00000");
        this.alt = Number(oldAlt.substring(0, 4) + newAlt1);
        this.callback(this.alt);
    }

}