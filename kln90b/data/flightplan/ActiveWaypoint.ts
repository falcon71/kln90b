import {Facility, GeoCircle, GeoPoint, UserSetting} from "@microsoft/msfs-sdk";
import {Flightplan, KLNFixType, KLNFlightplanLeg, KLNLegType} from "./Flightplan";
import {KLN90BUserSettings} from "../../settings/KLN90BUserSettings";
import {Sensors} from "../../Sensors";


export interface FromLeg {
    wpt: Facility,
    path: GeoCircle,
}

const CACHED_CIRCLE = new GeoCircle(new Float64Array(3), 0);

export class ActiveWaypoint {

    private setting: UserSetting<string>;

    private from: FromLeg | null = null;
    private to: KLNFlightplanLeg | null = null;
    private isDirectTo: boolean = false;

    private fplIdx: number = -1; //The index of the active waypoint (to) in the flightplan

    constructor(userSettings: KLN90BUserSettings, private readonly sensors: Sensors, public readonly fpl0: Flightplan, public lastactiveWaypoint: Facility | null) {
        this.setting = userSettings.getSetting("activeWaypoint");
    }

    public directTo(from: Facility, to: Facility) {
        CACHED_CIRCLE.setAsGreatCircle(from, to);
        this.from = {
            wpt: from,
            path: CACHED_CIRCLE,
        };
        const legs = this.fpl0.getLegs();
        this.fplIdx = legs.findIndex(leg => leg.wpt.icao === to.icao);
        if (this.fplIdx > -1) {
            this.to = legs[this.fplIdx]; //We need to keep the meta information like the suffix
        } else {
            this.to = {wpt: to, type: KLNLegType.USER};
        }

        this.isDirectTo = true;
        this.saveLastActiveWaypoint();
    }

    public cancelDirectTo() {
        //Yes, it does not keep the last waypoint, but always recalculates the closest leg
        this.activateFpl0();
        this.isDirectTo = false;
        this.saveLastActiveWaypoint();
    }

    /**
     * If FPL 0 is valid, then this activates the closest leg
     */
    public activateFpl0(): KLNFlightplanLeg | null {
        const legs = this.fpl0.getLegs();
        if (legs.length >= 2) {
            this.fplIdx = this.findClosestLegIdx(legs);
            if (this.fplIdx === -1) {
                //Two legs, but both are the same waypoint...
                return null;
            }
            this.setFplData(this.fplIdx);
            return this.to;
        } else {
            return null;
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

    public sequenceToNextWaypoint() {
        if (this.fplIdx === -1) {
            return;
        }
        const legs = this.fpl0.getLegs();
        if (this.fplIdx + 1 < legs.length) {
            this.fplIdx++;
            this.setFplData(this.fplIdx);
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
    public recalculatePath(){
        this.from!.path = CACHED_CIRCLE.setAsGreatCircle(this.from!.wpt, this.to!.wpt);
    }

    private setFplData(idx: number) {
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
    }

    private saveLastActiveWaypoint() {
        const active = this.getActiveWpt();
        if (active !== null) {
            this.lastactiveWaypoint = active;
            this.setting.set(active.icao);
        }
    }

    /**
     * Returns the leg, that is closest to the current plane location
     * @param legs
     * @private
     */
    private findClosestLegIdx(legs: KLNFlightplanLeg[]): number {
        const CACHED_CIRCLE = new GeoCircle(new Float64Array(3), 0);
        const tempGeoPoint = new GeoPoint(0, 0);
        let distMin = 99999; //This is GA Radians!
        const closestWpt = new GeoPoint(0, 0);
        let closestIdx = -1;
        for (let i = 1; i < legs.length; i++) {
            const from = legs[i - 1];
            const to = legs[i].wpt;
            tempGeoPoint.set(from.wpt);
            const distFromTo = tempGeoPoint.distance(to);
            let circle: GeoCircle;
            if (from.arcData === undefined) {
                CACHED_CIRCLE.setAsGreatCircle(from.wpt, to);
                circle = CACHED_CIRCLE;
            } else {
                circle = from.arcData.circle;
            }
            circle.closest(this.sensors.in.gps.coords, tempGeoPoint);
            const distFromClosest = tempGeoPoint.distance(from.wpt); //We use this to check, if closest is between from and to
            const distClosestWpt = tempGeoPoint.distance(this.sensors.in.gps.coords);
            if (distFromClosest <= distFromTo && distClosestWpt < distMin) {
                closestWpt.set(tempGeoPoint);
                distMin = distClosestWpt;
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
        //The user must have modified the flightplan if to does not match the index anymore
        this.activateFpl0();
    }

}