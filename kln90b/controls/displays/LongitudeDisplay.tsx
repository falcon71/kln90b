import {FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {NO_CHILDREN, UiElement} from "../../pages/Page";
import {TickController} from "../../TickController";
import {Longitude} from "../../data/Units";
import {padFixed} from "../../data/NumberFormat";
import {splitDegreesMinutes} from "../../data/Coordinates";


/**
 * Displays a formatted bearing/course/radial
 */
export class LongitudeDisplay implements UiElement {
    readonly children = NO_CHILDREN;
    private ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    constructor(public longitude: Longitude | null = null) {
    }

    render(): VNode {
        return (<span ref={this.ref}>{this.formatLongitude()}</span>);
    }

    public tick(blink: boolean): void {
        if (!TickController.checkRef(this.ref)) {
            return;
        }
        this.ref.instance.innerText = this.formatLongitude();
    }

    private formatLongitude(): string {
        if (this.longitude === null) {
            return "----°--.--'";
        }

        const eastWest = this.longitude >= 0 ? "E" : "W";
        const {degrees, minutes} = splitDegreesMinutes(this.longitude);
        const degreesString = String(degrees).padStart(3, " "); //#230
        const minutesString = padFixed(minutes, 2, 2);

        return `${eastWest}${degreesString}°${minutesString}'`;
    }
}