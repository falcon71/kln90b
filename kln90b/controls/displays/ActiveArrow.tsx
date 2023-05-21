import {NO_CHILDREN, UiElement} from "../../pages/Page";
import {FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {TickController} from "../../TickController";
import {NavPageState} from "../../data/VolatileMemory";

/**
 * 3-29, 3-42, 4-8
 */
export class ActiveArrow implements UiElement {
    readonly children = NO_CHILDREN;
    private ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();


    constructor(public icao: string | null, private navPageState: NavPageState) {
    }

    render(): VNode {
        return (<span ref={this.ref}> </span>);
    }

    public tick(blink: boolean): void {
        if (!TickController.checkRef(this.ref)) {
            return;
        }
        const activeWpt = this.navPageState.activeWaypoint.getActiveWpt();
        if (activeWpt === null) {
            this.ref.instance.innerText = " ";
            this.ref.instance.classList.remove("blink");
        } else {
            if (this.icao == activeWpt.icao) {
                this.ref.instance.innerText = "›";
                //3-29 Waypoint alerting
                if (this.navPageState.waypointAlert && blink) {
                    this.ref.instance.classList.add("blink");
                } else {
                    this.ref.instance.classList.remove("blink");
                }
            } else {
                this.ref.instance.innerText = " ";
                this.ref.instance.classList.remove("blink");
            }

        }

    }
}