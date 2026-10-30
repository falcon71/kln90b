import {FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {NO_CHILDREN, UiElement} from "../../pages/Page";
import {TickController} from "../../TickController";
import {Latitude} from "../../data/Units";
import {padFixed} from "../../data/NumberFormat";
import {splitDegreesMinutes} from "../../data/Coordinates";

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

        const northSount = this.latitude >= 0 ? "N" : "S";
        const {degrees, minutes} = splitDegreesMinutes(this.latitude);
        const degreesString = String(degrees).padStart(2, " "); //#230: a degree below 10 is padded with a blank
        const minutesString = padFixed(minutes, 2, 2);

        return `${northSount} ${degreesString}°${minutesString}'`;
    }
}