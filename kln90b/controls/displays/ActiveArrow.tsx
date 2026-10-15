import {NO_CHILDREN, UiElement} from "../../pages/Page";
import {FSComponent, ICAO, IcaoValue, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {TickController} from "../../TickController";
import {NavPageState} from "../../data/VolatileMemory";

/**
 * 3-29, 3-42, 4-8
 */
export class ActiveArrow implements UiElement {
    readonly children = NO_CHILDREN;
    private ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();


    /**
     * #294 fplIdx: on the ACT pages the index in FPL 0 of the shown waypoint, null elsewhere. A page may change it
     * between ticks; the next tick uses the new value. When it is not null, the arrow marks only the copy whose plan
     * index is the active one (4-10).
     */
    constructor(public icao: IcaoValue | null, private navPageState: NavPageState, public fplIdx: number | null = null) {
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
            let isActive: boolean;
            if (this.fplIdx !== null) {
                isActive = this.fplIdx === this.navPageState.activeWaypoint.getActiveFplIdx(); //#294
            } else {
                isActive = this.icao !== null && ICAO.valueEquals(this.icao, activeWpt.icaoStruct);
            }
            if (isActive) {
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