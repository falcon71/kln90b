import {NauticalMiles} from "../data/Units";
import {FlightPlan, FlightPlanSegment, FlightPlanSegmentType, GeoPoint, UnitType} from "@microsoft/msfs-sdk";
import {NavPageState} from "../data/VolatileMemory";
import {FlightPlan, LegDefinition} from "../data/flightplan/FlightPlan";

export function calcDistToDestination(navState: NavPageState, futureLegs: LegDefinition[]): NauticalMiles | null {
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
 * @param globalIdx
 * @param leg
 */
export function insertLegIntoFpl(fpl: FlightPlan, type: FlightPlanSegmentType, navstate: NavPageState, globalIdx: number, leg: LegDefinition, userdata: Record<string, any>): void {
    if (fpl.planIndex == 0 || fpl.length >= 30) {
        //FPL is 0 and the FPL is full. Delete leg 0 to make space...
        const activeIdx = navstate.activeWaypoint.getActiveFplIdx();
        //...but only, if it is not the active leg
        if (activeIdx === -1 || activeIdx >= 2 || navstate.activeWaypoint.isDctNavigation() && activeIdx === 1) {
            fpl.removeLeg(fpl.getSegmentIndex(0), fpl.getSegmentLegIndex(0));
        }
    }

    if (fpl.length >= 30) {
        throw new Error("Cannot add more than 30 waypoints");
    }


    const segment = getOrAddSegment(fpl, type, globalIdx - 1);
    const legDef = fpl.addLeg(segment.segmentIndex, leg, fpl.getSegmentLegIndex(globalIdx - 1));
    fpl.setUserData()
    legDef.userData['facility'] = wpt;
}

export function getOrAddSegment(fpl: FlightPlan, type: FlightPlanSegmentType, globalIdx: number): FlightPlanSegment {
    const segment = getSegment(fpl, type);
    if (segment !== null) {
        return segment;
    }

    const oldSegment = fpl.getSegment(fpl.getSegmentIndex(globalIdx));
    const newSegmentIndex = oldSegment.segmentIndex + 1;
    //We may need to split the old segment
    const oldSegmentLegIndex = fpl.getSegmentLegIndex(globalIdx);
    if (oldSegmentLegIndex < oldSegment.legs.length) {
        const oldSegmentSplit = fpl.insertSegment(newSegmentIndex, type);
        for (const i = 1; i < newSegment.legs.length; i++) {
            const legToMove = fpl.removeLeg(oldSegment.segmentIndex, i)!;
            fpl.addLeg(oldSegmentSplit.segmentIndex, legToMove.leg);
        }

        newSegmentIndex++;
    }


    const newSegment = fpl.insertSegment(newSegmentIndex, type);

    return newSegment;
}

export function getSegment(fpl: FlightPlan, type: FlightPlanSegmentType): FlightPlanSegment | null {
    for (const segment of fpl.segments()) {
        if (segment.segmentType === type) {
            return segment;
        }
    }

    return null;

}