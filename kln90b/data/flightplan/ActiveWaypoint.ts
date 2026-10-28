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
                 * when the waypoint is sequenced, ActiveWaypoint replaces it by its run-out (runOut, #406)
                 */
                public readonly abeamTurnSign: number | null = null,
                /**
                 * #406: marks the run-out of an abeam turn, which keeps the waypoint alert on after the sequencing until
                 * the aircraft is past the abeam line of the old waypoint (switchPoint) on the new leg (runOut)
                 */
                public readonly isRunOut: boolean = false) {
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

    /**
     * #406: what is left of an abeam turn once its waypoint is sequenced. The alert of the abeam turn lasts until the
     * aircraft is past the abeam line of the waypoint on the new leg, the far end of a turn of no size, and not until the
     * sequencing (checked in the KLN 89 trainer, 2026-10-27: the 2026-10-20 runs R2 and R6 re-read, 53 s and 41 s after
     * the sequencing, and run a8). Until then XTK and DTK are those of the new leg (R6), so its path and its DTK path are
     * both the new leg; NavCalculator.isPastEndOfRunOut ends it. Any entry on the stack keeps the alert on (#156)
     * @param abeam the abeam turn: its switchPoint is the waypoint, its pathForDtk the next leg
     */
    public static runOut(abeam: TurnStackEntry): TurnStackEntry {
        return new TurnStackEntry(abeam.pathForDtk, abeam.switchPoint, abeam.pathForDtk, undefined, null, true);
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
    /**
     * #408: the leg after the active waypoint that the turn state was made for, compared by instance in
     * assertToMatchesFplIdx (onFollowingLegChanged). A reference only, which every setActiveIdx sets again, and not reset
     * at a power-on: VolatileMemory.reset clears the turn state, so a difference found after it changes nothing
     */
    private followingLeg: KLNFlightplanLeg | null = null;

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
     * #423: a power-on after more than 5 minutes off removes the procedures of FPL 0 (6-5). An active plan leg of a
     * procedure goes with them, and the unit would at once activate the leg closest to the position stored at the
     * power-off, before the GPS has a fix. Called before the removal, this leaves no active leg instead, and the first
     * calculation tick with a valid GPS activates the closest FPL 0 leg, as for a dropped Direct To (#422). A Direct To is
     * left to dropDirectTo. The last active waypoint is not touched
     */
    public dropProcedureLeg() {
        if (!this.isDirectTo && this.to !== null && this.to.type !== KLNLegType.USER) {
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
        //#408: on every call, also when the index stays: the turn state below is the one of this following leg
        this.followingLeg = activeIdx >= 0 ? this.fpl0.getLegs()[activeIdx + 1] ?? null : null;
        if (this.fplIdx !== activeIdx) {
            this.fplIdx = activeIdx;
            this.clearTurnState();
            //A turn circle is still flown onto the next leg. #406: the abeam turn becomes its run-out on the next leg,
            //which keeps the alert on until the abeam line of its waypoint on that leg (TurnStackEntry.runOut). A run-out
            //stands for the leg that was active when it was made, so it goes at the next change of the active index, also
            //at a sequencing without a turn of its own, where it would show the old leg's DTK and XTK (the design's
            //call, not flown in the trainer). A Direct To, an activation and a power-on clear the stack anyway
            //(clearTurnStack)
            this.turnStack = this.turnStack.filter(entry => !entry.isRunOut)
                .map(entry => entry.abeamTurnSign === null ? entry : TurnStackEntry.runOut(entry));
        }
    }

    /**
     * Gets the leg after the active waypoint. It does not run assertToMatchesFplIdx, which notices an edit of this leg
     * (#408): NavCalculator.tick reads getActiveLeg first in every calculation
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
        //A new object, as for every other change of the active leg
        this.from = {
            wpt: this.from!.wpt,
            path: CACHED_CIRCLE.setAsGreatCircle(this.from!.wpt, this.to!.wpt),
        };
    }

    /**
     * 6-17: MOVE ? has moved the entry of the DME arc at `idx` in FPL 0 (FlightplanUtils.moveArcEntry). The leg changed
     * in place (Flightplan.setArcEntry), so neither instance check of assertToMatchesFplIdx sees it, and what depends on
     * the entry is updated here (the design, docs/superpowers/specs/2026-10-28-arc-entry-move-design.md):
     * - the active waypoint (#442): its path is calculated again, and its turn by the same rule as below. That rule was
     *   checked in the KLN 89 trainer for an edit of the next leg; applying it to a moved active waypoint is the design's
     *   call, as the trainer offers no MOVE ? at all. Unlike there, a turn left over from the previous waypoint, such as
     *   the run-out of its abeam turn, goes too, because it was made onto the old active leg (the maintainer, 2026-10-28);
     * - the leg after the active waypoint (#441): the turn is computed again by the rule of an edit of the next leg
     *   (onFollowingLegChanged, #408);
     * - the leg before the active waypoint, the entry of the active arc (#420): the from waypoint, a copy made at the
     *   activation, is made again, so the pages, the map and the previous-waypoint outputs show the moved entry. The arc
     *   keeps its circle, so the path does not change. A Direct To flies from its own origin and keeps it.
     * A move of any other entry changes nothing here
     * @param idx the index of the moved leg in FPL 0
     */
    public onArcEntryMoved(idx: number): void {
        const activeIdx = this.getActiveFplIdx();
        if (activeIdx === -1) {
            return;
        }
        if (idx === activeIdx - 1) {
            if (!this.isDirectTo) {
                const legs = this.fpl0.getLegs();
                this.from = this.fromLegOf(legs[idx], legs[activeIdx]);
            }
        } else if (idx === activeIdx) {
            this.recalculatePath();
            this.onFollowingLegChanged();
            this.turnStack = [];
        } else if (idx === activeIdx + 1) {
            this.onFollowingLegChanged();
        }
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
        this.from = this.fromLegOf(legs[idx - 1], legs[idx]);
        this.to = legs[idx];
        this.isDirectTo = false;
        this.saveLastActiveWaypoint();
        return this.to;
    }

    /**
     * The from leg of the plan leg `from` to `to`: an arc is flown on its circle, any other leg on the great circle
     */
    private fromLegOf(from: KLNFlightplanLeg, to: KLNFlightplanLeg): FromLeg {
        if (from.arcData === undefined) {
            return {
                wpt: from.wpt,
                path: CACHED_CIRCLE.setAsGreatCircle(from.wpt, to.wpt),
            };
        } else {
            return {
                wpt: from.wpt,
                path: from.arcData.circle,
            };
        }
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
            this.assertFollowingLegUnchanged(legs);
            return;
        }
        if (this.isDirectTo) {
            //The target moved when a leg was inserted or deleted in front of it, and becomes a random DTO when it is deleted from the plan
            this.fplIdx = legs.indexOf(this.to);
            this.assertFollowingLegUnchanged(legs);
            return;
        }

        //The user must have modified the flightplan if to does not match the index anymore
        this.activateFpl0();
    }

    /**
     * #408: the leg after the active waypoint is compared by instance, as the active leg is: an insert after the active
     * waypoint, a delete of the next waypoint and a procedure load that replaces the next leg all change it, an edit
     * further down the plan does not (the design, docs/superpowers/specs/2026-10-27-sequencing-406-407-408-design.md,
     * section 3). A Direct To to a waypoint of FPL 0 is checked the same way, after its target index has followed the
     * edit (the design's call, not flown in the trainer)
     * @param legs the legs of FPL 0
     */
    private assertFollowingLegUnchanged(legs: KLNFlightplanLeg[]): void {
        const followingLeg = this.fplIdx >= 0 ? legs[this.fplIdx + 1] ?? null : null;
        if (followingLeg !== this.followingLeg) {
            this.followingLeg = followingLeg;
            this.onFollowingLegChanged();
        }
    }

    /**
     * #408: the leg after the active waypoint changed while the active leg stayed: the turn is computed again for the new
     * geometry, by the maintainer's rule (c) of 2026-10-27 (the design, section 2.3). Checked in the KLN 89 trainer,
     * 2026-10-27 (docs/kln89-trainer-record.md):
     * - the waypoint's own turn that has started is dropped, and the DTK goes back to the active leg (runs a2, a5). While
     *   ownTurnStarted the stack holds only that turn, because startOwnTurn replaced it. NavCalculator starts the new turn
     *   at its own lead, at once when the aircraft is already inside it, and sequences at its bisector (a2, a6, a11).
     *   When the active waypoint is now the last one there is no turn, and it gets the alert of a waypoint without one
     *   (a9);
     * - a plan to turn at the lead is decided again by the normal rule, at the decision point of the new turn or at once
     *   past it, so the old lead does nothing and the alert pauses when the new turn point is more than 20 s away (a3,
     *   a4);
     * - a plan to turn at the abeam line is kept (a8, a16): there was no turn at the new lead with the aircraft inside it
     *   and only 1.0 to 1.7 NM off. An abeam turn that had started is dropped with the rest of the own turn and starts
     *   again onto the new next leg, the plan being kept and the aircraft past the abeam line;
     * - what is left on the stack of the previous waypoint's turn, such as the run-out of its abeam turn (#406), is not
     *   the active waypoint's and stays (the design's call, not flown in the trainer)
     */
    private onFollowingLegChanged(): void {
        if (this.ownTurnStarted) {
            this.turnStack = [];
            this.ownTurnStarted = false;
        }
        if (this.turnPlan === TurnPlan.AT_LEAD) {
            this.turnPlan = null;
        }
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