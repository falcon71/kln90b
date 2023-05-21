import {FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {NO_CHILDREN, UiElement} from "../../pages/Page";
import {TickController} from "../../TickController";
import {Feet} from "../../data/Units";

/**
 * Displays a formatted speed
 */
export class AltitudeDisplay implements UiElement {
    readonly children = NO_CHILDREN;
    private readonly ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    constructor(public altitude: Feet | null = null) {
    }

    render(): VNode {
        return (<span ref={this.ref}>{this.formatAltitude()}</span>);
    }

    public tick(blink: boolean): void {
        if (!TickController.checkRef(this.ref)) {
            return;
        }
        this.ref.instance.innerText = this.formatAltitude();
    }

    private formatAltitude(): string {
        if (this.altitude === null) {
            return "-----";
        }

        const rounded = Utils.Clamp(Math.round(this.altitude / 100) * 100, 0, 65600); //https://youtu.be/gjmVrkHTdP0?t=27
        return rounded.toString().padStart(5, " ");
    }
}