import {FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {NO_CHILDREN, UiElement} from "../../pages/Page";
import {TickController} from "../../TickController";
import {NauticalMiles} from "../../data/Units";
import {format} from "numerable";

export const enum Alignment {
    left,
    right,
}

/**
 * 4-45
 * The distance display on the D/T page seems somewhat special. It shows four dashes when empty, but then only display
 * three unroundet digits when filled.
 */
export class RoundedDistanceDisplay implements UiElement {
    readonly children = NO_CHILDREN;
    public isVisible = true;
    private readonly ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    constructor(private alignment: Alignment, public distance: NauticalMiles | null = null) {
    }

    render(): VNode {
        return (<span ref={this.ref}>{this.formatDistance()}</span>);
    }

    public tick(blnk: boolean): void {
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
            return "----";
        }
        const rounded = Math.round(this.distance);

        return this.align(format(rounded, "0").padStart(3, " "));
    }

    private align(value: string): string {
        return this.alignment === Alignment.right ? value.padStart(4, " ") : value.padEnd(4, " ");
    }
}