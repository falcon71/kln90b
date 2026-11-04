import {FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {NO_CHILDREN, UiElement} from "../../pages/Page";
import {TickController} from "../../TickController";
import {Celsius} from "../../data/Units";
import {padInt} from "../../data/NumberFormat";


export class TemperatureDisplay implements UiElement {
    readonly children = NO_CHILDREN;
    private readonly ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    constructor(public temperature: Celsius | null) {
    }

    render(): VNode {
        return (<span ref={this.ref}>{this.formatTemperature()}</span>);
    }

    public tick(blnk: boolean): void {
        if (!TickController.checkRef(this.ref)) {
            return;
        }

        this.ref.instance.innerText = this.formatTemperature();
    }

    private formatTemperature(): string {
        if (this.temperature === null) {
            return "---°C"; //#458: a failed input leaves it missing. The cells of the digits and the sign
        }
        return `${padInt(this.temperature, 2).padStart(3, " ")}°C`;
    }
}