import {Facility, FacilityClient, FacilityType, FlightPlanLeg, ICAO, Procedure} from '@microsoft/msfs-sdk';

function legsOf(procedure: Procedure): FlightPlanLeg[] {
    const legs = [...procedure.commonLegs];
    for (const transition of procedure.enRouteTransitions) {
        legs.push(...transition.legs);
    }
    for (const transition of procedure.runwayTransitions) {
        legs.push(...transition.legs);
    }
    return legs;
}

/**
 * Tells whether a fix entered into a flight plan is a SID/STAR waypoint that is flown over. The unit asks for such a
 * waypoint whether it is meant as a plain en route waypoint or as the SID/STAR one (4-2..4-3), and the install manual's
 * AFMS (p. 104) states that the turn anticipation is off at SID/STAR fly-over waypoints.
 *
 * The selection is our own rule (#77): the fix is a terminal intersection or a terminal NDB, an intersection or NDB
 * with an airport in its ICAO, and some leg of the airport's departures or arrivals flies over that very fix (the same
 * ICAO, so the airport, ident and region). The NDBs are the maintainer's ruling after a sim check: terminal NDBs carry
 * their airport in the ICAO, VORs never do. Anything else, including an airport that cannot be loaded, is an ordinary
 * waypoint and gives false.
 */
export async function isSidStarFlyOver(fix: Facility, facilityLoader: FacilityClient): Promise<boolean> {
    const fixType = ICAO.getFacilityTypeFromValue(fix.icaoStruct);
    if (fixType !== FacilityType.Intersection && fixType !== FacilityType.NDB) {
        return false;
    }
    const airportIdent = fix.icaoStruct.airport.trim();
    if (airportIdent === '') {
        return false;
    }

    let airport;
    try {
        airport = await facilityLoader.getFacility(FacilityType.Airport, ICAO.value('A', '', '', airportIdent));
    } catch (e) {
        return false;
    }

    for (const procedure of [...airport.departures, ...airport.arrivals]) {
        for (const leg of legsOf(procedure)) {
            if (leg.flyOver && ICAO.valueEquals(leg.fixIcaoStruct, fix.icaoStruct)) {
                return true;
            }
        }
    }
    return false;
}
