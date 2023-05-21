import {FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {NO_CHILDREN, UiElement} from "../../pages/Page";
import {TickController} from "../../TickController";
import {Latitude} from "../../data/Units";
import {format} from "numerable";

/**
 * Displays a formatted bearing/course/radial
 */
export class LatitudeDisplay implements UiElement {
    readonly children = NO_CHILDREN;
    private ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    constructor(public latitude: Latitude | null = null) {
    }

    render(): VNode {
        return (<span ref={this.ref}>{this.formatLatitude()}</span>);
    }

    public tick(blink: boolean): void {
        if (!TickController.checkRef(this.ref)) {
            return;
        }
        this.ref.instance.innerText = this.formatLatitude();
    }

    private formatLatitude(): string {
        if (this.latitude === null) {
            return "- --°--.--'";
        }

        const northSount = this.latitude > 0 ? "N" : "S";
        const latitude = Math.abs(this.latitude);
        const degreesString = format(latitude, "00", {rounding: "floor"});

        const minutes = (latitude % 1) * 60;
        const minutesString = format(minutes, "00.00");

        return `${northSount} ${degreesString}°${minutesString}'`;
    }
}