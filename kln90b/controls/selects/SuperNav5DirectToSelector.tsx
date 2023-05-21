import {EventBus, Facility, FSComponent, ICAO, NodeReference, VNode} from "@microsoft/msfs-sdk";
import {NO_CHILDREN, UiElement} from "../../pages/Page";
import {Hardware} from "../../Hardware";
import {Flightplan, KLNFlightplanLeg} from "../../data/flightplan/Flightplan";
import {ActiveWaypoint} from "../../data/flightplan/ActiveWaypoint";
import {SidStar} from "../../data/navdata/SidStar";
import {Sensors} from "../../Sensors";
import {StatusLineMessageEvents} from "../StatusLine";

export class SuperNav5DirectToSelector implements UiElement {

    public readonly children = NO_CHILDREN;
    protected readonly ref: NodeReference<HTMLSpanElement> = FSComponent.createRef<HTMLSpanElement>();
    private legs: KLNFlightplanLeg[];
    private isInitialized: boolean = false;
    private idx: number = 0;

    private isMovingArc = false;


    constructor(private readonly bus: EventBus, private readonly hardware: Hardware, private readonly flightplan: Flightplan, private readonly activeWpt: ActiveWaypoint, private readonly sensors: Sensors) {
        this.legs = flightplan.getLegs();
    }

    public render(): VNode | null {
        return (
            <span ref={this.ref} class="super-nav5-directto-window d-none inverted">    </span>);
    }

    public tick(blink: boolean): void {
        if (this.hardware.isScanPulled) {
            if (!this.isInitialized) {
                this.ref.instance.classList.remove("d-none");
                this.legs = this.flightplan.getLegs();
                this.idx = this.activeWpt.getActiveFplIdx();
                if (this.idx === -1 && this.legs.length > 0) {
                    this.idx = 0;
                }
                this.isInitialized = true;
            }
            if (this.legs.length === 0) {
                this.ref.instance.textContent = "      ";
            } else if (this.isMovingArc) {
                this.ref.instance.textContent = "MOVE ?";
            } else {
                const leg = this.legs[this.idx];
                this.ref.instance.textContent = (ICAO.getIdent(leg.wpt.icao) + SidStar.getWptSuffix(leg.fixType)).padEnd(6, " ");
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
        if (this.hardware.isScanPulled && this.legs.length > 0) {
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

        const leg = this.legs[this.idx];
        const newData = SidStar.recalculateArcEntryData(leg, this.sensors);
        if (newData === null) {
            this.bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "NO INTRCEPT"); //How does this work? On the Super NAV 5 page, there is no statusline??
        } else {
            //A bit ugly modifying this directly...
            leg.arcData = newData;
            leg.wpt = newData.entryFacility;
            if(this.idx === this.activeWpt.getActiveFplIdx()){
                this.activeWpt.recalculatePath();
            }
        }

        return true;
    }

}