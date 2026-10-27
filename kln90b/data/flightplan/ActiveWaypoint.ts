import {
    EventBus,
    Facility,
    GeoCircle,
    GeoPoint,
    ICAO,
    LatLonInterface,
    Publisher,
    UserSetting,
} from "@microsoft/msfs-sdk";
import {Flightplan, KLNFixType, KLNFlightplanLeg, KLNLegType} from "./Flightplan";
import {KLN90BUserSettings} from "../../settings/KLN90BUserSettings";
import {Sensors} from "../../Sensors";
import {segmentDistance} from "../navdata/SequencingGeometry";
import {Degrees} from "../Units";


export interface FromLeg {
    wpt: Facility,
    path: GeoCircle,
}

const CACHED_CIRCLE = new GeoCircle(new Float64Array(3), 0);

export class TurnStackEntry {
    /**
     * Roll steering steers on pathForDtk instead of the turn circle: set once the aircraft was farther from the circle
     * than its radius, and kept until the entry pops (NavCalculator, the roll steering design,
     * docs/superpowers/specs/2026-10-19-roll-steering-design.md, section 4A)
     */
    public steerOnPathForDtk = false;

    constructor(public path: GeoCircle, //The path of the turn itself
                public switchPoint: GeoPoint, //The part when to switch to the next TurnStackEntry or the next leg if the stack is empty
                public pathForDtk: GeoCircle, //The DTK calculation does not follow a curved path, so we save the great circle of the normal legs for the DTK calculation
                /**
                 * Set on the turn circle itself, which ends once the aircraft is past the bisector of the turn and past
                 * switchPoint along pathForDtk (#404). Absent on the stretch of the inbound leg before it, the roll-in,
                 * which ends at switchPoint, and on the abeam turn
                 */
                public readonly turnBisector?: TurnBisector,
                /**
                 * Non-null marks the abeam turn, a turn of no size at the waypoint (the design,
                 * docs/superpowers/specs/2026-10-20-waypoint-sequencing-design.md, section 3.3): XTK is abeamTurnSign times
                 * the distance to the waypoint, -1 for a right turn and +1 for a left turn. No end-of-turn test pops it;
                 * ActiveWaypoint drops it when the active waypoint changes
                 */
                public readonly abeamTurnSign: number | null = null) {
    }

    /**
     * The abeam turn at the waypoint: a circle of no size there, whose XTK is the distance to the waypoint with the sign
     * of the side the turn goes to and whose DTK is the next leg's (abeamTurnSign)
     * @param wpt the waypoint
     * @param nextPath the path of the next leg
     * @param turnDirection the direction of the turn at the waypoint
     */
    public static abeamTurn(wpt: LatLonInterface, nextPath: GeoCircle, turnDirection: "left" | "right"): TurnStackEntry {
        const point = new GeoPoint(wpt.lat, wpt.lon);
        return new TurnStackEntry(GeoCircle.createFromPoint(point, 0), point, nextPath, undefined, turnDirection === "left" ? 1 : -1);
    }
}

/**
 * The bisector of a turn at a waypoint: the line through the waypoint between the inbound and the next course
 * (SequencingGeometry.bisectorSide)
 */
export interface TurnBisector {
    readonly wpt: GeoPoint,
    readonly inboundDtk: Degrees,
    readonly nextDtk: Degrees,
}

/**
 * Where the anticipated turn of the active waypoint starts, decided once per waypoint (the design,
 * docs/superpowers/specs/2026-10-20-waypoint-sequencing-design.md, section 3.3)
 */
export enum TurnPlan {
    /** At the lead plus the roll-in before the waypoint */
    AT_LEAD,
    /** Where the aircraft crosses the abeam line of the waypoint */
    AT_ABEAM,
}

export interface ActiveWaypointChangedEvents {
    activeWaypointChanged: number;
}


export class ActiveWaypoint {

    private setting: UserSetting<string>;

    private from: FromLeg | null = null;
    private to: KLNFlightplanLeg | null = null;
    private isDirectTo: boolean = false;

    private fplIdx: number = -1; //The index of the active waypoint (to) in the flightplan

    public turnStack: TurnStackEntry[] = []; //This is a stack, because for each turn, we keep two entries: One before the start of the turn (to account for the bank angle change) and the turn itself up to the end of the turn
    /**
     * #375: the active waypoint's own anticipated turn has been pushed onto the turn stack. It arms the sequencing at the
     * bisector, and the turn is not started again once it has ended while the waypoint is still active
     */
    public ownTurnStarted: boolean = false;
    /** The decided turn plan of the active waypoint, null while undecided */
    public turnPlan: TurnPlan | null = null;
    private publisher: Publisher<ActiveWaypointChangedEvents>;

    constructor(bus: EventBus, userSettings: KLN90BUserSettings, private readonly sensors: Sensors, public readonly fpl0: Flightplan, public lastactiveWaypoint: Facility | null) {
        this.setting = userSettings.getSetting("activeWaypoint");
        this.publisher = bus.getPublisher<ActiveWaypointChangedEvents>();
    }

    public directToFlightplanIndex(from: Facility, fplIdx: number) {
        this.from = {
            wpt: from,
            path: CACHED_CIRCLE,
        };
        const legs = this.fpl0.getLegs();
        this.to = legs[fplIdx]; //We need to keep the meta information like the suffix
        CACHED_CIRCLE.setAsGreatCircle(from, this.to.wpt);

        this.isDirectTo = true;
        this.setActiveIdx(fplIdx);
        this.saveLastActiveWaypoint();
        this.clearTurnStack();
        this.publisher.pub("activeWaypointChanged", this.fplIdx);
    }

    public directTo(from: Facility, to: Facility) {
        CACHED_CIRCLE.setAsGreatCircle(from, to);
        this.from = {
            wpt: from,
            path: CACHED_CIRCLE,
        };
        const legs = this.fpl0.getLegs();
        const fplIdx = legs.findIndex(leg => ICAO.valueEquals(leg.wpt.icaoStruct, to.icaoStruct));
        if (fplIdx > -1) {
            this.to = legs[fplIdx]; //We need to keep the meta information like the suffix
        } else {
            this.to = {wpt: to, type: KLNLegType.USER};
        }
        this.isDirectTo = true;
        this.setActiveIdx(fplIdx);
        this.saveLastActiveWaypoint();
        this.clearTurnStack();
        this.publisher.pub("activeWaypointChanged", this.fplIdx);
    }

    public cancelDirectTo() {
        //Yes, it does not keep the last waypoint, but always recalculates the closest leg
        this.isDirectTo = false;
        this.activateFpl0();
        this.saveLastActiveWaypoint();
    }

    /**
     * #422: a power-on after more than 5 minutes off (6-5) drops a Direct To and leaves no active leg; the first calculation
     * tick then activates the closest FPL 0 leg, as after a sim restart. The last active waypoint is not touched
     */
    public dropDirectTo() {
        if (this.isDirectTo) {
            this.flag();
        }
    }

    /**
     * If FPL 0 is valid, then this activates the closest leg
     */
    public activateFpl0(): KLNFlightplanLeg | null {
        this.clearTurnStack();
        const legs = this.fpl0.getLegs();
        if (legs.length >= 2) {
            this.setActiveIdx(this.findClosestLegIdx(legs));
            if (this.fplIdx === -1) {
                //Two legs, but both are the same waypoint...
                return this.flag();
            }
            const to = this.setFplData(this.fplIdx);
            this.publisher.pub("activeWaypointChanged", this.fplIdx);
            return to;
        } else {
            return this.flag();
        }
    }

    public sequenceToNextWaypoint() {
        if (this.fplIdx === -1) {
            return;
        }
        const legs = this.fpl0.getLegs();
        if (this.fplIdx + 1 < legs.length) {
            this.setActiveIdx(this.fplIdx + 1);
            this.setFplData(this.fplIdx);
            this.publisher.pub("activeWaypointChanged", this.fplIdx);
        }
    }

    public getFromWpt(): Facility | null {
        return this.from?.wpt ?? null;
    }

    public getFromLeg(): FromLeg | null {
        return this.from;
    }

    public getActiveWpt(): Facility | null {
        this.assertToMatchesFplIdx();
        if (this.to === null) {
            return null;
        }

        return this.to.wpt;
    }

    /**
     * 6-20, returns all future legs including the current active waypoint up to the MAP or the destination
     */
    public getFutureLegs(): KLNFlightplanLeg[] {
        if (this.fplIdx === -1) {
            const active = this.getActiveLeg();
            return active === null ? [] : [active];
        }
        const wpts: KLNFlightplanLeg[] = [];

        const futureLegs = this.fpl0.getLegs().slice(this.fplIdx);
        for (const leg of futureLegs) {
            wpts.push(leg);
            if (leg.fixType === KLNFixType.MAP) {
                return wpts;
            }
        }
        return wpts;
    }

    /**
     * 6-20, either MAP or the last waypoint
     */
    public getDestination(): Facility | null {
        const futureWpts = this.getFutureLegs();
        if (futureWpts.length === 0) {
            return null
        }
        return futureWpts[futureWpts.length - 1].wpt;
    }

    private setActiveIdx(activeIdx: number) {
        if (this.fplIdx !== activeIdx) {
            this.fplIdx = activeIdx;
            this.clearTurnState();
            //The abeam turn ends with its waypoint, unlike a turn circle, which is still flown onto the next leg
            this.turnStack = this.turnStack.filter(entry => entry.abeamTurnSign === null);
        }
    }

    /**
     * Gets the leg after the active waypoint
     */
    public getFollowingLeg(): KLNFlightplanLeg | null {
        const legs = this.fpl0.getLegs();
        if (this.fplIdx === -1) {
            return null;
        }
        if (this.fplIdx + 1 < legs.length) {
            return legs[this.fplIdx + 1];
        } else {
            return null;
        }
    }

    /**
     * Are we performing a direct to, either to a random WPT or an FPL leg?
     */
    public isDctNavigation(): boolean {
        return this.isDirectTo;
    }

    public getActiveLeg(): KLNFlightplanLeg | null {
        this.assertToMatchesFplIdx();
        return this.to;
    }

    /**
     * 6-3, 6-10: the FAF leg while the FAF is the active waypoint, also when the active leg is the IAF copy of a fix that
     * is IAF and FAF at once (the next leg is the same fix typed FAF, #129). Null otherwise
     */
    public getActiveFafLeg(): KLNFlightplanLeg | null {
        const active = this.getActiveLeg();
        if (active === null) {
            return null;
        }
        if (active.fixType === KLNFixType.FAF) {
            return active;
        }
        const next = this.getFollowingLeg();
        if (active.fixType === KLNFixType.IAF && next?.fixType === KLNFixType.FAF && ICAO.valueEquals(next.wpt.icaoStruct, active.wpt.icaoStruct)) {
            return next;
        }
        return null;
    }

    /**
     * Gets the index of the current active waypoint in the fpl
     * -1 if there is no active waypoint or a direct to outside of the flp is occuring.
     */
    public getActiveFplIdx(): number {
        this.assertToMatchesFplIdx();
        return this.fplIdx;
    }

    /**
     * When moving the intercept point of an arc, the pilot may change the current leg. In this case, the path must
     * be recalculated
     */
    public recalculatePath() {
        //A new object, as for every other change of the active leg: NavCalculator tells a leg change from such a change by
        //the identity of the FROM leg (NavPageState.legChangeFrom, #434)
        this.from = {
            wpt: this.from!.wpt,
            path: CACHED_CIRCLE.setAsGreatCircle(this.from!.wpt, this.to!.wpt),
        };
    }

    /**
     * Deativates (flags) navigation
     * @private
     */
    private flag(): null {
        this.setActiveIdx(-1);
        this.from = null;
        this.to = null;
        this.isDirectTo = false;
        this.saveLastActiveWaypoint();
        this.publisher.pub("activeWaypointChanged", this.fplIdx);
        return null;
    }

    private setFplData(idx: number): KLNFlightplanLeg {
        const legs = this.fpl0.getLegs();
        const from = legs[idx - 1];
        const to = legs[idx];
        if (from.arcData === undefined) {
            CACHED_CIRCLE.setAsGreatCircle(from.wpt, to.wpt);
            this.from = {
                wpt: from.wpt,
                path: CACHED_CIRCLE,
            };
        } else {
            this.from = {
                wpt: from.wpt,
                path: from.arcData.circle,
            }
        }
        this.to = legs[idx];
        this.isDirectTo = false;
        this.saveLastActiveWaypoint();
        return this.to;
    }

    private saveLastActiveWaypoint() {
        const active = this.getActiveWpt();
        if (active !== null) {
            this.lastactiveWaypoint = active;
            //V2: V1 cannot hold an airport field of more than four characters (#415)
            this.setting.set(ICAO.valueToStringV2(active.icaoStruct));
        }
    }

    /**
     * Returns the leg, that is closest to the current plane location.
     * If the flightplan contains at least two waypoints, then a solution will always be found (checked in the KLN 89 trainer)
     * @param legs
     * @private
     */
    private findClosestLegIdx(legs: KLNFlightplanLeg[]): number {
        let distMin = Infinity;
        let closestIdx = -1;
        for (let i = 1; i < legs.length; i++) {
            const from = legs[i - 1];
            const to = legs[i].wpt;
            const dist = segmentDistance(from.wpt, to, from.arcData?.circle, this.sensors.in.gps.coords);

            if (dist < distMin) {
                distMin = dist;
                closestIdx = i;
            }
        }

        return closestIdx;
    }

    private assertToMatchesFplIdx(): void {
        if (this.fplIdx === -1 || this.to === null) {
            return;
        }


        const legs = this.fpl0.getLegs();
        if (this.fplIdx < legs.length && this.to === legs[this.fplIdx]) { //Yes, we really need to check the instance here. For example the user may remove the enroute waypoint with the same icao as the IAF
            return;
        }
        if (this.isDirectTo) {
            //The target moved when a leg was inserted or deleted in front of it, and becomes a random DTO when it is deleted from the plan
            this.fplIdx = legs.indexOf(this.to);
            return;
        }

        //The user must have modified the flightplan if to does not match the index anymore
        this.activateFpl0();
    }

    /**
     * Whenever we perform a direct to or modify the flight plan in a way that affects the active waypoint,
     * then the saved turn information is no longer relevant
     */
    public clearTurnStack(): void {
        this.turnStack = [];
        this.clearTurnState();
    }

    /**
     * Starts the active waypoint's own anticipated turn: the entries, bottom first, replace the stack and ownTurnStarted
     * is set. The stack is empty here, or holds what is left of the previous waypoint's turn, which the own turn
     * supersedes (NavCalculator)
     */
    public startOwnTurn(...entries: TurnStackEntry[]): void {
        this.turnStack = entries;
        this.ownTurnStarted = true;
    }

    /**
     * #157: off the leg (more than 4.0 NM from it) the active waypoint has no anticipated turn, so a turn of its own that
     * has started is dropped (the design, docs/superpowers/specs/2026-10-20-waypoint-sequencing-design.md, section 3.2).
     * While ownTurnStarted the stack holds only that turn, because startOwnTurn replaces the stack. The decided turnPlan
     * is kept and applies again when the aircraft comes back on the leg
     */
    public dropOwnTurn(): void {
        //A circle on top of the stack was normally popped earlier in the same calculation by its 4.0 NM end
        //(NavCalculator.isPastEndOfTurn); this clears what is left, such as the roll-in before the circle
        this.turnStack = [];
        this.ownTurnStarted = false;
    }

    /**
     * The turn state that belongs to the active waypoint. The turn stack is kept when the waypoint is sequenced, because
     * the turn onto the next leg is still being flown
     */
    private clearTurnState(): void {
        this.ownTurnStarted = false;
        this.turnPlan = null;
    }

}