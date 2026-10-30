import {FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {NO_CHILDREN, UiElement} from "../../pages/Page";
import {TickController} from "../../TickController";
import {padFixed, padInt} from "../../data/NumberFormat";

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
        if (this.fuel === null || !(this.fuel >= 0) || Math.round(this.fuel) > 99999) {
            return "---.-"; //#257: a fuel that does not fit shows dashes, it was capped at 99999
        }
        //Compare the rounded value, 99.97 is shown as 100.0 otherwise
        if (Math.round(this.fuel * 10) / 10 >= 100) { //Number is too large for decimals
            return padInt(this.fuel, 2).padStart(5, " ");
        } else {
            return padFixed(this.fuel, 1, 1).padStart(5, " ");
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

        return padInt(actFuel, 1).padStart(5, " ");

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

        return padInt(actFuel, 1).padEnd(4, " ");

    }
}