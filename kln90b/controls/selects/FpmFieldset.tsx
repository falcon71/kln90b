import {SelectField} from "./SelectField";
import {FSComponent, VNode} from "@microsoft/msfs-sdk";
import {UiElement, UIElementChildren} from "../../pages/Page";
import {format} from "numerable";
import {Knots} from "../../data/Units";


type FpmFieldsetTypes = {
    Fpm1000: SelectField;
    Fpm100: SelectField;
    Fpm10: SelectField;
    Fpm1: SelectField;
}

const FPM_SET = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export class FpmFieldset implements UiElement {


    readonly children: UIElementChildren<FpmFieldsetTypes>;

    constructor(private fpm: number, private readonly callback: (fpm: number) => void) {
        const FpmString = format(fpm, "0000");
        this.children = new UIElementChildren<FpmFieldsetTypes>({
            Fpm1000: new SelectField(FPM_SET, Number(FpmString.substring(0, 1)), this.saveFpm1000.bind(this)),
            Fpm100: new SelectField(FPM_SET, Number(FpmString.substring(1, 2)), this.saveFpm100.bind(this)),
            Fpm10: new SelectField(FPM_SET, Number(FpmString.substring(2, 3)), this.saveFpm10.bind(this)),
            Fpm1: new SelectField(FPM_SET, Number(FpmString.substring(3, 4)), this.saveFpm1.bind(this)),
        });

        this.children.get("Fpm10").isReadonly = true;
        this.children.get("Fpm1").isReadonly = true;
    }

    render(): VNode {
        return (
            <span>{this.children.get("Fpm1000").render()}{this.children.get("Fpm100").render()}{this.children.get("Fpm10").render()}{this.children.get("Fpm1").render()}</span>);
    }

    tick(blink: boolean): void {
    }

    public setFpm(Fpm: Knots): void {
        const FpmString = format(Fpm, "0000");
        this.children.get("Fpm1000").value = Number(FpmString.substring(0, 1));
        this.children.get("Fpm100").value = Number(FpmString.substring(1, 2));
        this.children.get("Fpm10").value = Number(FpmString.substring(2, 3));
        this.children.get("Fpm1").value = Number(FpmString.substring(3, 4));

    }

    private saveFpm1000(newFpm1000: number): void {
        const oldFpm = format(this.fpm, "0000");
        this.fpm = Number(newFpm1000 + oldFpm.substring(1));
        this.callback(this.fpm);
    }

    private saveFpm100(newFpm100: number): void {
        const oldFpm = format(this.fpm, "0000");
        this.fpm = Number(oldFpm.substring(0, 1) + newFpm100 + oldFpm.substring(2));
        this.callback(this.fpm);
    }

    private saveFpm10(newFpm10: number): void {
        const oldFpm = format(this.fpm, "0000");
        this.fpm = Number(oldFpm.substring(0, 2) + newFpm10 + oldFpm.substring(3));
        this.callback(this.fpm);
    }

    private saveFpm1(newFpm1: number): void {
        const oldFpm = format(this.fpm, "0000");
        this.fpm = Number(oldFpm.substring(0, 3) + newFpm1);
        this.callback(this.fpm);
    }


}