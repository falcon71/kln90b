import {FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {NO_CHILDREN, UiElement} from "../../pages/Page";
import {TickController} from "../../TickController";
import {Degrees} from "../../data/Units";
import {format} from "numerable";

/**
 * Displays a formatted bearing/course/radial
 */
export class BearingDisplay implements UiElement {
    readonly children = NO_CHILDREN;
    public flash: boolean = false;
    public isVisible = true;
    private ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    constructor(public bearing: Degrees | null = null) {
    }

    render(): VNode {
        return (<span ref={this.ref}>{this.formatBearing()}</span>);
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

        this.ref.instance.innerText = this.formatBearing();
        if (this.flash && blink) {
            this.ref.instance.classList.add("blink");
        } else {
            this.ref.instance.classList.remove("blink");
        }
    }

    private formatBearing(): string {
        if (this.bearing === null) {
            return "---°";
        }
        return `${format(this.bearing, "000")}°`;
    }
}