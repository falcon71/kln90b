import {EventBus, Facility, FSComponent, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {NO_CHILDREN, UiElement} from "../../pages/Page";
import {Hardware} from "../../Hardware";
import {Flightplan, KLNFlightplanLeg} from "../../data/flightplan/Flightplan";
import {ActiveWaypoint} from "../../data/flightplan/ActiveWaypoint";
import {SidStar} from "../../data/navdata/SidStar";
import {Sensors} from "../../Sensors";
import {moveArcEntry} from "../../services/FlightplanUtils";

export class SuperNav5DirectToSelector implements UiElement {

    public readonly children = NO_CHILDREN;
    protected readonly ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();
    private legs: KLNFlightplanLeg[];
    private isInitialized: boolean = false;
    private idx: number = 0;

    private isMovingArc = false;


    /**
     * @param isWindowShown #394: the knob is pulled and the page's menu is closed (SuperNav5Page.isScanWindowShown)
     */
    constructor(private readonly bus: EventBus, private readonly hardware: Hardware, private readonly flightplan: Flightplan, private readonly activeWpt: ActiveWaypoint, private readonly sensors: Sensors, private readonly isWindowShown: () => boolean) {
        this.legs = flightplan.getLegs();
    }

    public render(): VNode | null {
        return (
            <span ref={this.ref} class="super-nav5-directto-window d-none inverted">    </span>);
    }

    public tick(blink: boolean): void {
        if (this.hardware.isScanPulled) {
            if (!this.isInitialized) {
                this.legs = this.flightplan.getLegs();
                this.idx = this.activeWpt.getActiveFplIdx();
                if (this.idx === -1 && this.legs.length > 0) {
                    this.idx = 0;
                }
                this.isInitialized = true;
            }
            //#394: the open menu takes the place of the scan window; the window keeps its waypoint
            if (this.isWindowShown()) {
                this.ref.instance.classList.remove("d-none");
            } else {
                this.ref.instance.classList.add("d-none");
            }
            if (this.legs.length === 0) {
                this.ref.instance.textContent = "      ";
            } else if (this.isMovingArc) {
                this.ref.instance.textContent = "MOVE ?";
            } else {
                const leg = this.legs[this.idx];
                this.ref.instance.textContent = (leg.wpt.icaoStruct.ident + SidStar.getWptSuffix(leg.fixType)).padEnd(6, " ");
            }

        } else {
            this.isInitialized = false;
            this.isMovingArc = false;
            this.ref.instance.classList.add("d-none");
        }
    }

    public scanRight(): boolean {
        this.isMovingArc = false;
        this.idx = Math.min(this.idx + 1, this.legs.length - 1);
        return true;
    }

    public scanLeft(): boolean {
        this.isMovingArc = false;
        this.idx = Math.max(this.idx - 1, 0);
        return true;
    }

    public getDirectToTarget(): Facility | null {
        //#394: a window hidden by the menu offers no waypoint
        if (this.isWindowShown() && this.legs.length > 0) {
            return this.legs[this.idx].wpt;
        } else {
            return null;
        }
    }

    public clear(): boolean {
        if (this.legs.length === 0) {
            return false;
        }
        const leg = this.legs[this.idx];
        if (leg.arcData === undefined) {
            return false;
        }

        this.isMovingArc = !this.isMovingArc;
        return true;
    }

    public enter(): boolean {
        if (!this.isMovingArc) {
            return false;
        }

        moveArcEntry(this.bus, this.flightplan, this.idx, this.activeWpt, this.sensors);
        this.isMovingArc = false;

        return true;
    }

}