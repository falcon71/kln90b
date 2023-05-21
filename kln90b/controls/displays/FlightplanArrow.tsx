import {NO_CHILDREN, UiElement} from "../../pages/Page";
import {FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {TickController} from "../../TickController";
import {NavPageState} from "../../data/VolatileMemory";
import {CursorController} from "../../pages/CursorController";

/**
 * 4-7, 4-8
 */
export class FlightplanArrow implements UiElement {
    readonly children = NO_CHILDREN;
    public isVisible: boolean = true;
    private ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();

    constructor(public readonly idx: number, private readonly navPageState: NavPageState, private readonly cursorController: CursorController) {
    }

    render(): VNode {
        return (<span ref={this.ref}> </span>);
    }

    public tick(blink: boolean): void {
        if (!TickController.checkRef(this.ref)) {
            return;
        }
        if (this.isVisible) {
            this.ref.instance.classList.remove("d-none");
        } else {
            this.ref.instance.classList.add("d-none");
            return;
        }

        //remove all arrows when editing: https://youtu.be/-7xleA3Hz3Y?t=435
        if (this.cursorController.getCurrentFocusedField()?.isEntered) {
            this.ref.instance.innerText = " ";
            this.ref.instance.classList.remove("blink");
            return;
        }

        const activeIdx = this.navPageState.activeWaypoint.getActiveFplIdx();
        if (activeIdx === null) {
            this.ref.instance.innerText = " ";
            this.ref.instance.classList.remove("blink");
        } else {
            if (activeIdx === this.idx && this.idx !== -1) { //The active waypoint
                if (this.navPageState.activeWaypoint.isDctNavigation()) {
                    this.ref.instance.innerText = "›";
                } else {
                    this.ref.instance.innerText = "À";
                }

                //3-29 Waypoint alerting
                if (this.navPageState.waypointAlert && blink) {
                    this.ref.instance.classList.add("blink");
                } else {
                    this.ref.instance.classList.remove("blink");
                }
            } else if (activeIdx - 1 === this.idx && this.idx !== -1) { //The from waypoint
                if (this.navPageState.activeWaypoint.isDctNavigation()) {
                    this.ref.instance.innerText = " ";
                } else {
                    this.ref.instance.innerText = "Á";
                }
                this.ref.instance.classList.remove("blink");
            } else if (activeIdx === this.idx + 0.5 && this.idx !== -1) { //Procedure between two waypoints
                if (this.navPageState.activeWaypoint.isDctNavigation()) {
                    this.ref.instance.innerText = " ";
                } else {
                    this.ref.instance.innerText = "Â";
                }
                this.ref.instance.classList.remove("blink");
            } else { //Something else
                this.ref.instance.innerText = " ";
                this.ref.instance.classList.remove("blink");
            }

        }
    }
}