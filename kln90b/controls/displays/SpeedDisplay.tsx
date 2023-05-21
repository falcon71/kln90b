import {FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {NO_CHILDREN, UiElement} from "../../pages/Page";
import {TickController} from "../../TickController";
import {Knots} from "../../data/Units";
import {format} from "numerable";

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
        const clamped = Utils.Clamp(this.speed, 0, 999);
        return format(clamped, "0").padStart(3, " ");
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
        return format(clamped, "0.00").substring(1);
    }
}