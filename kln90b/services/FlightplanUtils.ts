import {NauticalMiles} from "../data/Units";
import {EventBus, Facility, GeoPoint, ICAO, UnitType} from "@microsoft/msfs-sdk";
import {NavPageState} from "../data/VolatileMemory";
import {Flightplan, KLNFlightplanLeg, KLNLegType, legsFit} from "../data/flightplan/Flightplan";
import {ActiveWaypoint} from "../data/flightplan/ActiveWaypoint";
import {SidStar} from "../data/navdata/SidStar";
import {Sensors} from "../Sensors";
import {StatusLineMessageEvents} from "../controls/StatusLine";

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
 * #148: the index of the first leg of `legs` that must stay: legs before it may be deleted to make room. During a
 * Direct To every leg before the target may go, otherwise every leg before the from leg (C-1). With nothing active
 * every leg may go. When the active leg is not in `legs` (it goes with a procedure that is replaced) none may go.
 */
function firstLegThatMustStay(legs: KLNFlightplanLeg[], navState: NavPageState): number {
    const aw = navState.activeWaypoint;
    if (aw.getActiveFplIdx() === -1) {
        return legs.length;
    }
    const at = legs.indexOf(aw.getActiveLeg()!);
    if (at === -1) {
        return 0;
    }
    return aw.isDctNavigation() ? at : at - 1;
}

/**
 * #148: the legs that go from the front of FPL 0 so that `legs` take `enRoute` more en-route and `procedure` more
 * procedure legs (#221), as the number of legs per step: one step per waypoint, and an airport takes the SID legs that
 * follow it. [] when they fit; null when room cannot be made: a leg to delete is part of the active leg (C-1), or `keep`
 * (the airport of the procedure being loaded) would go. Changes nothing.
 */
export function roomSteps(legs: KLNFlightplanLeg[], navState: NavPageState, enRoute: number, procedure: number, keep: Facility | null = null): number[] | null {
    const mustStay = firstLegThatMustStay(legs, navState);
    const steps: number[] = [];
    let start = 0;
    while (!legsFit(0, legs.slice(start), enRoute, procedure)) {
        if (start >= legs.length) {
            return null;
        }
        const first = legs[start];
        if (keep !== null && ICAO.valueEquals(first.wpt.icaoStruct, keep.icaoStruct)) {
            return null;
        }
        let size = 1;
        if (first.type === KLNLegType.USER) {
            while (start + size < legs.length && legs[start + size].type === KLNLegType.SID
            && legs[start + size].parentFacility !== undefined
            && ICAO.valueEquals(legs[start + size].parentFacility!.icaoStruct, first.wpt.icaoStruct)) {
                size++;
            }
        }
        if (start + size > mustStay) {
            return null;
        }
        steps.push(size);
        start += size;
    }
    return steps;
}

/**
 * #349, #377 6-7: whether a waypoint may be added on the leg to the plan index `toIdx`: not between two approach
 * waypoints. The leg into the IAF and the leg from the approach to the airport may take one
 */
export function mayAddWaypointBefore(legs: KLNFlightplanLeg[], toIdx: number): boolean {
    return !(legs[toIdx - 1]?.type === KLNLegType.APP && legs[toIdx]?.type === KLNLegType.APP);
}

/** #148: deletes `count` legs from the front of the plan */
export function deleteFrontLegs(fpl: Flightplan, count: number): void {
    for (let i = 0; i < count; i++) {
        fpl.deleteLeg(0);
    }
}

/**
 * Inserts a new waypoint into the flightplan. If the fpl is 0 and the flightplan is full, then it deletes legs from the
 * front to make space, as `roomSteps` says (C-1), and the insert index follows the deleted legs (#148). Throws when the
 * first waypoint is part of the active leg; nothing is deleted then.
 * @param fpl
 * @param navstate
 * @param idx
 * @param leg
 */
export function insertLegIntoFpl(fpl: Flightplan, navstate: NavPageState, idx: number, leg: KLNFlightplanLeg): void {
    const enRoute = leg.type === KLNLegType.USER ? 1 : 0;
    if (fpl.idx !== 0 || fpl.fits(enRoute, 1 - enRoute)) { //#221
        fpl.insertLeg(idx, leg);
        return;
    }

    const steps = roomSteps(fpl.getLegs(), navstate, enRoute, 1 - enRoute);
    if (steps === null) {
        throw new Error("First waypoint is part of the active leg");
    }
    const count = steps.reduce((sum, size) => sum + size, 0);
    deleteFrontLegs(fpl, count);
    fpl.insertLeg(Math.max(0, idx - count), leg); //#148: the index follows the deleted legs; in front of the first is 0
}

/**
 * 6-17: MOVE ? moves the entry waypoint of a DME arc to the intercept of the present track with the arc. Super NAV 5 and
 * the FPL 0 page ask it the same way. 6-18: a track that does not meet the arc gives NO INTRCEPT and changes nothing.
 * @param idx the index of the leg in `fpl`; the leg has `arcData`
 * @return true when the entry was moved
 */
export function moveArcEntry(bus: EventBus, fpl: Flightplan, idx: number, activeWpt: ActiveWaypoint, sensors: Sensors): boolean {
    const leg = fpl.getLegs()[idx];
    //FPL 0 can be replaced while MOVE ? is pending (an EFB route load), and the leg at idx is read live here
    if (leg === undefined || leg.arcData === undefined) {
        return false;
    }
    const newData = SidStar.recalculateArcEntryData(leg, sensors);
    if (newData === null) {
        bus.getPublisher<StatusLineMessageEvents>().pub("statusLineMessage", "NO INTRCEPT");
        return false;
    }
    fpl.setArcEntry(idx, newData);
    if (idx === activeWpt.getActiveFplIdx()) {
        activeWpt.recalculatePath();
    }
    return true;
}
