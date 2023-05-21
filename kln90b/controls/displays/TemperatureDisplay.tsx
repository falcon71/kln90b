import {FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {NO_CHILDREN, UiElement} from "../../pages/Page";
import {TickController} from "../../TickController";
import {Celsius} from "../../data/Units";
import {format} from "numerable";


export class TemperatureDisplay implements UiElement {
    readonly children = NO_CHILDREN;
    private readonly ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    constructor(public temperature: Celsius) {
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
        return `${format(this.temperature, "-00").padStart(3, " ")}°C`;
    }
}