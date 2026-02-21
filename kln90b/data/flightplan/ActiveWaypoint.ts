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


export interface FromLeg {
    wpt: Facility,
    path: GeoCircle,
}

const CACHED_CIRCLE = new GeoCircle(new Float64Array(3), 0);

export class TurnStackEntry {

    constructor(public path: GeoCircle, public switchPoint: GeoPoint, public pathForDtk: GeoCircle) {
    }
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

    public turnStack: TurnStackEntry[] = [];
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
    }

    public cancelDirectTo() {
        //Yes, it does not keep the last waypoint, but always recalculates the closest leg
        this.isDirectTo = false;
        this.activateFpl0();
        this.saveLastActiveWaypoint();
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
            return this.setFplData(this.fplIdx);
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
            this.publisher.pub("activeWaypointChanged", this.fplIdx);
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
        this.from!.path = CACHED_CIRCLE.setAsGreatCircle(this.from!.wpt, this.to!.wpt);
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
            this.setting.set(ICAO.valueToStringV1(active.icaoStruct));
        }
    }

    /**
     * Returns the leg, that is closest to the current plane location.
     * If the flightplan contains at least two waypoints, then a solution will always be found (checked in the KLN 89 trainer)
     * @param legs
     * @private
     */
    private findClosestLegIdx(legs: KLNFlightplanLeg[]): number {
        const CACHED_CIRCLE = new GeoCircle(new Float64Array(3), 0);
        const tempFromGeoPoint = new GeoPoint(0, 0);
        const tempClosestGeoPoint = new GeoPoint(0, 0);
        let distMin = 99999; //This is GA Radians!
        let closestIdx = -1;
        for (let i = 1; i < legs.length; i++) {
            const from = legs[i - 1];
            const to = legs[i].wpt;
            tempFromGeoPoint.set(from.wpt);
            let circle: GeoCircle;
            if (from.arcData === undefined) {
                CACHED_CIRCLE.setAsGreatCircle(from.wpt, to);
                circle = CACHED_CIRCLE;
            } else {
                circle = from.arcData.circle;
            }
            circle.closest(this.sensors.in.gps.coords, tempClosestGeoPoint);

            let distGPSClosestWpt: number;
            if (this.isPointOnCircleBetween(tempFromGeoPoint, to, tempClosestGeoPoint)) {
                distGPSClosestWpt = tempClosestGeoPoint.distance(this.sensors.in.gps.coords)
            } else {
                //The closest point is not between from and to, so lets use the distance between GPS and from instead
                distGPSClosestWpt = tempFromGeoPoint.distance(this.sensors.in.gps.coords);
            }

            if (distGPSClosestWpt < distMin) {
                distMin = distGPSClosestWpt;
                closestIdx = i;
            }
        }

        return closestIdx;
    }

    /**
     * Checks if the point is located between from and to. All points must be located on the same great circle
     * @param from
     * @param to
     * @param pointToCheck
     * @private
     */
    private isPointOnCircleBetween(from: GeoPoint, to: LatLonInterface, pointToCheck: GeoPoint): boolean {
        const distFromTo = from.distance(to);
        const distPointFrom = pointToCheck.distance(from);
        const distPointTo = pointToCheck.distance(to);
        //If the distance between A & C and B & C is the same as A & B, then C lies between A & B, otherwise it is outside
        return distPointFrom + distPointTo <= distFromTo + GeoCircle.ANGULAR_TOLERANCE;
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
            //Becomes a random DTO when the waypoint is deleted from the plan
            this.fplIdx = -1;
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
    }

}