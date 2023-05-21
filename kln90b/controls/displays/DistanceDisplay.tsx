import {FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {NO_CHILDREN, UiElement} from "../../pages/Page";
import {TickController} from "../../TickController";
import {NauticalMiles} from "../../data/Units";
import {format} from "numerable";

/**
 * Displays a formatted distance
 */
export class DistanceDisplay implements UiElement {
    readonly children = NO_CHILDREN;
    public isVisible = true;
    private readonly ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    /**
     * Examples for length:
     * 3: 3-32 XTK nav 3 page
     * 4: 3-31 nav 1 page
     * 6: 3-8 NAV 2 page
     * @param length
     * @param distance
     */
    constructor(public length: number, public distance: NauticalMiles | null = null) {
    }

    render(): VNode {
        return (<span ref={this.ref}>{this.formatDistance()}</span>);
    }

    public tick(blink: boolean): void {
        if (!TickController.checkRef(this.ref)) {
            return;
        }

        if (this.isVisible) {
            this.ref!.instance.classList.remove("d-none");
        } else {
            this.ref!.instance.classList.add("d-none");
        }
        this.ref.instance.innerText = this.formatDistance();
    }

    private formatDistance(): string {
        if (this.distance === null) {
            return ".-".padStart(this.length, "-");
        }

        const cutoff = 10 ** (this.length - 2);
        if (this.distance >= cutoff) { //Number is too large for decimals
            return format(this.distance, "00").padStart(this.length, " ");
        } else {
            return format(this.distance, "0.0").padStart(this.length, " ");
        }
    }
}