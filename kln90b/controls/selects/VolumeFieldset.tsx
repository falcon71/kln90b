import {SelectField} from "./SelectField";
import {FSComponent, VNode} from "@microsoft/msfs-sdk";
import {UiElement, UIElementChildren} from "../../pages/Page";
import {format} from "numerable";


type VolumeFieldsetTypes = {
    Volume10: SelectField;
    Volume1: SelectField;
}

const CHAR_SET = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

export class VolumeFieldset implements UiElement {


    readonly children: UIElementChildren<VolumeFieldsetTypes>;

    constructor(private volume: number, private readonly callback: (volume: number) => void) {
        const VolumeString = format(volume, "00");
        this.children = new UIElementChildren<VolumeFieldsetTypes>({
            Volume10: new SelectField(CHAR_SET, Number(VolumeString.substring(0, 1)), this.saveVolume10.bind(this)),
            Volume1: new SelectField(CHAR_SET, Number(VolumeString.substring(1, 2)), this.saveVolume1.bind(this)),
        });
    }

    render(): VNode {
        return (
            <span>{this.children.get("Volume10").render()}{this.children.get("Volume1").render()}</span>);
    }

    tick(blink: boolean): void {
    }


    private saveVolume10(newVolume10: number): void {
        const oldVolume = format(this.volume, "00");
        this.volume = Number(newVolume10 + oldVolume.substring(1));
        this.callback(this.volume);
    }

    private saveVolume1(newVolume1: number): void {
        const oldVolume = format(this.volume, "00");
        this.volume = Number(oldVolume.substring(0, 1) + newVolume1);
        this.callback(this.volume);

    }


}