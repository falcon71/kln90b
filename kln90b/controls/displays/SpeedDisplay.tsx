import {FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {NO_CHILDREN, UiElement} from "../../pages/Page";
import {TickController} from "../../TickController";
import {Knots} from "../../data/Units";
import {padFixed} from "../../data/NumberFormat";

/**
 * Displays a formatted speed
 */
export class SpeedDisplay implements UiElement {
    readonly children = NO_CHILDREN;
    private readonly ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    constructor(public speed: Knots | null = null) {
    }

    render(): VNode {
        return (<span ref={this.ref}>{this.formatSpeed()}</span>);
    }

    public tick(blnk: boolean): void {
        if (!TickController.checkRef(this.ref)) {
            return;
        }
        this.ref.instance.innerText = this.formatSpeed();
    }

    private formatSpeed(): string {
        if (this.speed === null) {
            return "---";
        }
        const rounded = Math.round(this.speed);
        if (!(rounded >= 0 && rounded <= 999)) {
            return "---"; //#257: a speed that does not fit shows dashes, it was clamped to 999
        }
        return String(rounded).padStart(3, " ");
    }
}


export class MachDisplay implements UiElement {
    readonly children = NO_CHILDREN;
    private readonly ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    constructor(public mach: number) {
    }

    render(): VNode {
        return (<span ref={this.ref}>{this.formatMach()}</span>);
    }

    public tick(blnk: boolean): void {
        if (!TickController.checkRef(this.ref)) {
            return;
        }
        this.ref.instance.innerText = this.formatMach();
    }

    private formatMach(): string {
        const clamped = Utils.Clamp(this.mach, 0, 0.99);
        return padFixed(clamped, 1, 2).substring(1);
    }
}