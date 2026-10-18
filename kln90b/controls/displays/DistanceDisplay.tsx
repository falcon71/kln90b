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
     * 4: 3-31 nav 1 page, and 3-32 XTK NAV 3 page with hundredths below 1 NM (#231)
     * 5: 3-22 nearest APT, VOR and NDB pages, with a leading zero
     * 6: 3-8 NAV 2 page
     * @param length
     * @param distance
     * @param leadingZero 3-42, figure 3-134: the nearest pages pad a distance below 10 NM with a zero (03.1nm) where the
     * other pages pad it with a blank
     * @param hundredthsBelowOne #231, the NAV 3 cross track: the first of the length cells is the blank in front of the
     * three-cell form, and below 1 NM it holds the zero of the hundredths (0.09) instead
     */
    constructor(public length: number, public distance: NauticalMiles | null = null, private readonly leadingZero: boolean = false,
                private readonly hundredthsBelowOne: boolean = false) {
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
        //#231: the NAV 3 cross track uses the blank in front of its three cells for hundredths below 1 NM
        const cells = this.hundredthsBelowOne ? this.length - 1 : this.length;
        if (this.distance === null) {
            return ".-".padStart(cells, "-").padStart(this.length, " ");
        }
        if (this.hundredthsBelowOne && Math.round(this.distance * 100) / 100 < 1) {
            return format(this.distance, "0.00");
        }

        const cutoff = 10 ** (cells - 2);
        //Compare the rounded value, 99.97 is shown as 100.0 otherwise, one cell too long
        if (Math.round(this.distance * 10) / 10 >= cutoff) { //Number is too large for decimals
            return format(this.distance, "00").padStart(this.length, " ");
        } else {
            return format(this.distance, this.leadingZero ? "00.0" : "0.0").padStart(this.length, " ");
        }
    }
}