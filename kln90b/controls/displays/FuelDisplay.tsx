import {FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {NO_CHILDREN, UiElement} from "../../pages/Page";
import {TickController} from "../../TickController";
import {format} from "numerable";

/**
 * Displays fuel on the TRIP page
 */
export class TripFuelDisplay implements UiElement {
    readonly children = NO_CHILDREN;
    private readonly ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    constructor(public fuel: number | null = null) {
    }

    render(): VNode {
        return (<span ref={this.ref}>{this.formatFuel()}</span>);
    }

    public tick(blink: boolean): void {
        if (!TickController.checkRef(this.ref)) {
            return;
        }

        this.ref.instance.innerText = this.formatFuel();
    }

    private formatFuel(): string {
        if (this.fuel === null) {
            return "---.-";
        }

        const actFuel = Math.min(this.fuel, 99999);

        if (actFuel >= 100) { //Number is too large for decimals
            return format(actFuel, "00").padStart(5, " ");
        } else {
            return format(actFuel, "0.0").padStart(5, " ");
        }
    }
}

/**
 * Displays fuel on the OTH page
 */
export class OthFuelDisplay implements UiElement {
    readonly children = NO_CHILDREN;
    private readonly ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    constructor(public fuel: number | null = null) {
    }

    render(): VNode {
        return (<span ref={this.ref}>{this.formatFuel()}</span>);
    }

    public tick(blink: boolean): void {
        if (!TickController.checkRef(this.ref)) {
            return;
        }
        this.ref.instance.innerText = this.formatFuel();
    }

    private formatFuel(): string {
        if (this.fuel === null) {
            return "-----";
        }

        const actFuel = Math.max(Math.min(this.fuel, 99999), 0);

        return format(actFuel, "0").padStart(5, " ");

    }
}


/**
 * Displays fuel flow on the OTH 7 page. For some reason, this is left aligned?
 */
export class FuelFlowDisplay implements UiElement {
    readonly children = NO_CHILDREN;
    private readonly ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    constructor(public fuelFlow: number) {
    }

    render(): VNode {
        return (<span ref={this.ref}>{this.formatFuelFlow()}</span>);
    }

    public tick(blink: boolean): void {
        if (!TickController.checkRef(this.ref)) {
            return;
        }
        this.ref.instance.innerText = this.formatFuelFlow();
    }

    private formatFuelFlow(): string {
        const actFuel = Math.min(this.fuelFlow, 9999);

        return format(actFuel, "0").padEnd(4, " ");

    }
}