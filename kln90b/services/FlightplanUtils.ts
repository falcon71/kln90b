import {NauticalMiles} from "../data/Units";
import {GeoPoint, UnitType} from "@microsoft/msfs-sdk";
import {NavPageState} from "../data/VolatileMemory";
import {Flightplan, KLNFlightplanLeg} from "../data/flightplan/Flightplan";

export function calcDistToDestination(navState: NavPageState, futureLegs: KLNFlightplanLeg[]): NauticalMiles | null {
    const fplIdx = navState.activeWaypoint.getActiveFplIdx();
    if (fplIdx === -1) {
        return navState.distToActive;
    }
    let dist = navState.distToActive!;
    for (let i = 1; i < futureLegs.length; i++) {
        const prev = futureLegs[i - 1];
        const next = futureLegs[i];
        dist += UnitType.GA_RADIAN.convertTo(new GeoPoint(prev.wpt.lat, prev.wpt.lon).distance(next.wpt), UnitType.NMILE);
    }
    return dist;
}

/**
 * Inserts a new waypoint into the flightplan. If the fpl is 0 and the flightplan is full, then it tries to delete the
 * first leg to make space (C-1)
 * @param fpl
 * @param navstate
 * @param idx
 * @param leg
 */
export function insertLegIntoFpl(fpl: Flightplan, navstate: NavPageState, idx: number, leg: KLNFlightplanLeg): void {
    if (fpl.idx !== 0 || fpl.getLegs().length < 30) {
        fpl.insertLeg(idx, leg);
        return;
    }

    const activeIdx = navstate.activeWaypoint.getActiveFplIdx();
    if (activeIdx === -1 || activeIdx >= 2 || navstate.activeWaypoint.isDctNavigation() && activeIdx === 1) {
        fpl.deleteLeg(0);
        fpl.insertLeg(idx - 1, leg);
    } else {
        throw new Error("First waypoint is part of the active leg");
    }
}
