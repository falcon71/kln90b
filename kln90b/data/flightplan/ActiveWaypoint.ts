import {
    BitFlags,
    Facility,
    FixTypeFlags,
    FlightPlan,
    FlightPlanner,
    FlightPlanSegmentType,
    GeoCircle,
    GeoPoint,
    LatLonInterface,
    LegDefinition,
    LegType,
    UserSetting,
} from "@microsoft/msfs-sdk";
import {KLN90BUserSettings} from "../../settings/KLN90BUserSettings";
import {AccessUserData} from "./AccesUserData";
import {Sensors} from "../../Sensors";


export interface FromLeg {
    wpt: Facility,
    path: GeoCircle,
}

const CACHED_CIRCLE = new GeoCircle(new Float64Array(3), 0);

export const DIRECT_TO_FPL_IDX = 99;

export class ActiveWaypoint {

    private setting: UserSetting<string>;

    private from: FromLeg | null = null;
    private to: LegDefinition | null = null;
    private isDirectTo: boolean = false;

    private fplIdx: number = -1; //The index of the active waypoint (to) in the flightplan

    constructor(userSettings: KLN90BUserSettings, private readonly sensors: Sensors, public readonly flightPlanner: FlightPlanner, public lastactiveWaypoint: Facility | null) {
        this.setting = userSettings.getSetting("activeWaypoint");
    }

    public directTo(from: Facility, to: Facility) {
        CACHED_CIRCLE.setAsGreatCircle(from, to);
        this.from = {
            wpt: from,
            path: CACHED_CIRCLE,
        };
        const leg = this.fpl0.findLeg((leg) => leg.leg.fixIcao == to.icao);

        if (leg == null) {
            this.setFplIdx(-1);
            const randomDtoFpl = this.flightPlanner.createFlightPlan(DIRECT_TO_FPL_IDX);

            const segment = randomDtoFpl.insertSegment(0, FlightPlanSegmentType.RandomDirectTo, undefined, true);

            this.to = randomDtoFpl.addLeg(segment.segmentIndex, FlightPlan.createLeg({
                type: LegType.DF,
                fixIcao: to.icao,
                lat: to.lat,
                lon: to.lon,
            }));
            this.to.userData['facility'] = to;
        } else {
            this.setFplIdx(this.fpl0.getLegIndexFromLeg(leg));
            this.to = this.fpl0.getLeg(this.fplIdx); //We need to keep the meta information like the suffix
        }

        this.isDirectTo = true;
        this.saveLastActiveWaypoint();
    }

    /**
     * If FPL 0 is valid, then this activates the closest leg
     */
    public activateFpl0(): LegDefinition | null {
        const legs = this.fpl0.legs();
        if (this.fpl0.length >= 2) {
            const closestLeg = this.findClosestLeg(legs);
            if (closestLeg == null) {
                //Two legs, but both are the same waypoint...
                return this.flag();
            }
            this.setFplIdx(this.fpl0.getLegIndexFromLeg(closestLeg));
            return this.setFplData(this.fplIdx);
        } else {
            return this.flag();
        }
    }

    public cancelDirectTo() {
        //Yes, it does not keep the last waypoint, but always recalculates the closest leg
        this.activateFpl0();
        this.isDirectTo = false;
        this.saveLastActiveWaypoint();
    }

    public getActiveWpt(): Facility | null {
        this.assertToMatchesFplIdx();
        if (this.to === null) {
            return null;
        }

        return this.to.userData['facility'];
    }

    public getFromWpt(): Facility | null {
        return this.from?.wpt ?? null;
    }

    public getFromLeg(): FromLeg | null {
        return this.from;
    }

    /**
     * 6-20, returns all future legs including the current active waypoint up to the MAP or the destination
     */
    public getFutureLegs(): LegDefinition[] {
        if (this.fplIdx === -1) {
            const active = this.getActiveLeg();
            return active === null ? [] : [active];
        }
        const wpts: LegDefinition[] = [];

        const futureLegs = this.fpl0.legs(false, this.fplIdx);

        for (const leg of futureLegs) {
            wpts.push(leg);
            if (BitFlags.isAll(leg.leg.fixTypeFlags, FixTypeFlags.MAP)) {
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
        return AccessUserData.getFacility(futureWpts[futureWpts.length - 1]);
    }

    public sequenceToNextWaypoint() {
        if (this.fplIdx === -1) {
            return;
        }

        if (this.fplIdx + 1 < this.fpl0.length) {
            this.setFplIdx(this.fplIdx + 1);
            this.setFplData(this.fplIdx);
        }
    }

    /**
     * Gets the leg after the active waypoint
     */
    public getFollowingLeg(): LegDefinition | null {
        if (this.fplIdx === -1) {
            return null;
        }
        if (this.fplIdx + 1 < this.fpl0.length) {
            return this.fpl0.getLeg(this.fplIdx + 1);
        } else {
            return null;
        }
    }

    public getActiveLeg(): LegDefinition | null {
        this.assertToMatchesFplIdx();
        return this.to;
    }

    /**
     * Are we performing a direct to, either to a random WPT or an FPL leg?
     */
    public isDctNavigation(): boolean {
        return this.isDirectTo;
    }

    /**
     * When moving the intercept point of an arc, the pilot may change the current leg. In this case, the path must
     * be recalculated
     */
    public recalculatePath() {
        this.from!.path = CACHED_CIRCLE.setAsGreatCircle(this.from!.wpt, AccessUserData.getFacility(this.to!));
    }

    /**
     * Gets the index of the current active waypoint in the fpl
     * -1 if there is no active waypoint or a direct to outside of the flp is occuring.
     */
    public getActiveFplIdx(): number {
        this.assertToMatchesFplIdx();
        return this.fplIdx;
    }

    private setFplIdx(fplIdx: number) {
        this.fplIdx = fplIdx;
        this.fpl0.setLateralLeg(fplIdx); //-1 will get clamped to 0
    }

    /**
     * Deativates (flags) navigation
     * @private
     */
    private flag(): null {
        this.setFplIdx(-1);
        this.from = null;
        this.to = null;
        this.isDirectTo = false;
        this.saveLastActiveWaypoint();
        return null;
    }

    private setFplData(idx: number): LegDefinition {
        const from = this.fpl0.getLeg(idx - 1);
        const to = this.fpl0.getLeg(idx);
        if (AccessUserData.getArcData(from) === undefined) {
            CACHED_CIRCLE.setAsGreatCircle(AccessUserData.getFacility(from), AccessUserData.getFacility(to));
            this.from = {
                wpt: AccessUserData.getFacility(from),
                path: CACHED_CIRCLE,
            };
        } else {
            this.from = {
                wpt: AccessUserData.getFacility(from),
                path: AccessUserData.getArcData(from).circle,
            }
        }
        this.to = this.fpl0.getLeg(idx);
        this.isDirectTo = false;
        this.saveLastActiveWaypoint();
        return this.to;
    }

    private saveLastActiveWaypoint() {
        const active = this.getActiveWpt();
        if (active !== null) {
            this.lastactiveWaypoint = active;
            this.setting.set(active.icao);
        }
    }

    /**
     * Returns the leg, that is closest to the current plane location.
     * If the flightplan contains at least two waypoints, then a solution will always be found (checked in the KLN 89 trainer)
     * @param legs
     * @private
     */
    private findClosestLeg(legs: Generator<LegDefinition, void>): LegDefinition | null {
        const CACHED_CIRCLE = new GeoCircle(new Float64Array(3), 0);
        const tempFromGeoPoint = new GeoPoint(0, 0);
        const tempClosestGeoPoint = new GeoPoint(0, 0);
        let distMin = 99999; //This is GA Radians!
        let closestLeg = null;

        let from = null;


        for (const to of legs) {
            if (from !== null) {
                tempFromGeoPoint.set(AccessUserData.getFacility(from));
                let circle: GeoCircle;
                if (AccessUserData.getArcData(from) === undefined) {
                    CACHED_CIRCLE.setAsGreatCircle(tempFromGeoPoint, AccessUserData.getFacility(to));
                    circle = CACHED_CIRCLE;
                } else {
                    circle = AccessUserData.getArcData(from).circle;
                }
                circle.closest(this.sensors.in.gps.coords, tempClosestGeoPoint);

                let distGPSClosestWpt: number;
                if (this.isPointOnCircleBetween(tempFromGeoPoint, AccessUserData.getFacility(to), tempClosestGeoPoint)) {
                    distGPSClosestWpt = tempClosestGeoPoint.distance(this.sensors.in.gps.coords)
                } else {
                    //The closest point is not between from and to, so lets use the distance between GPS and from instead
                    distGPSClosestWpt = tempFromGeoPoint.distance(this.sensors.in.gps.coords);
                }

                if (distGPSClosestWpt < distMin) {
                    distMin = distGPSClosestWpt;
                    closestLeg = to;
                }
            }
            from = to;
        }

        return closestLeg;
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

        try {
            const leg = this.fpl0.getLeg(this.fplIdx);
            if (this.to !== leg) { //Yes, we really need to check the instance here. For example the user may remove the enroute waypoint with the same icao as the IAF
                //The user must have modified the flightplan if to does not match the index anymore
                this.activateFpl0();
            }


        } catch (e) {

            //The user must have modified the flightplan if to does not match the index anymore
            this.activateFpl0();
        }
    }

}