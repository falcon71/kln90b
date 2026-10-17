import {SelectField} from "./SelectField";
import {FSComponent, VNode} from "@microsoft/msfs-sdk";
import {UiElement, UIElementChildren} from "../../pages/Page";
import {format} from "numerable";


type FpmFieldsetTypes = {
    Fpm1000: SelectField;
    Fpm100: SelectField;
    Fpm10: SelectField;
    Fpm1: SelectField;
}

const FPM_SET = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export class FpmFieldset implements UiElement {


    readonly children: UIElementChildren<FpmFieldsetTypes>;
    /** null while the field shows dashes: it holds no rate, and an edit starts from 0000 (#346) */
    private fpm: number | null = null;

    constructor(fpm: number | null, private readonly callback: (fpm: number) => void) {
        this.children = new UIElementChildren<FpmFieldsetTypes>({
            Fpm1000: new SelectField(FPM_SET, 0, this.saveFpm1000.bind(this)),
            Fpm100: new SelectField(FPM_SET, 0, this.saveFpm100.bind(this)),
            Fpm10: new SelectField(FPM_SET, 0, this.saveFpm10.bind(this)),
            Fpm1: new SelectField(FPM_SET, 0, this.saveFpm1.bind(this)),
        });

        this.children.get("Fpm10").isReadonly = true;
        this.children.get("Fpm1").isReadonly = true;
        this.setFpm(fpm);
    }

    render(): VNode {
        return (
            <span>{this.children.get("Fpm1000").render()}{this.children.get("Fpm100").render()}{this.children.get("Fpm10").render()}{this.children.get("Fpm1").render()}</span>);
    }

    tick(blink: boolean): void {
    }

    /**
     * #346: a rate that does not fit the four cells (or none, or NaN) shows dashes in all four, the read-only tens and
     * units included
     */
    public setFpm(fpm: number | null): void {
        const rounded = fpm === null ? NaN : Math.round(fpm);
        //#346: a rate that does not fit the four cells shows dashes; an edit starts from 0000, not from a hidden fifth digit
        if (!(rounded >= 0 && rounded <= 9999)) {
            this.fpm = null;
            this.showDigits(null);
            return;
        }
        this.fpm = rounded;
        this.showDigits(format(rounded, "0000"));
    }

    private showDigits(digits: string | null): void {
        const fields = [this.children.get("Fpm1000"), this.children.get("Fpm100"), this.children.get("Fpm10"), this.children.get("Fpm1")];
        fields.forEach((field, i) => {
            field.value = digits === null ? 0 : Number(digits.substring(i, i + 1));
            field.displayOverride = digits === null ? "-" : null;
        });
    }

    private saveFpm1000(newFpm1000: number): void {
        const oldFpm = format(this.fpm ?? 0, "0000");
        this.save(Number(newFpm1000 + oldFpm.substring(1)));
    }

    private saveFpm100(newFpm100: number): void {
        const oldFpm = format(this.fpm ?? 0, "0000");
        this.save(Number(oldFpm.substring(0, 1) + newFpm100 + oldFpm.substring(2)));
    }

    private saveFpm10(newFpm10: number): void {
        const oldFpm = format(this.fpm ?? 0, "0000");
        this.save(Number(oldFpm.substring(0, 2) + newFpm10 + oldFpm.substring(3)));
    }

    private saveFpm1(newFpm1: number): void {
        const oldFpm = format(this.fpm ?? 0, "0000");
        this.save(Number(oldFpm.substring(0, 3) + newFpm1));
    }

    private save(fpm: number): void {
        this.setFpm(fpm);
        this.callback(fpm);
    }

}
