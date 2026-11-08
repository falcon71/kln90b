import {
    AirportClassMask,
    FacilitySearchType,
    FacilityType,
    GeoPoint,
    NearestAirportSearchSession,
    UnitType,
} from "@microsoft/msfs-sdk";
import {AirportFinder} from "../../failures/Transmitters";
import {KLNFacilityLoader, KLNNearestAirportFacilitySearchSession} from "./KLNFacilityLoader";
import {HARD_SURFACE_MASK} from "./NearestList";
import {TEMPORARY_WAYPOINT, USER_WAYPOINT} from "./IcaoBuilder";

/** The shortest runway of a snapped airport in meters: the spoofer's false position is an airport an airliner could use (maintainer, 2026-11-07) */
export const MIN_RUNWAY_LENGTH_M = 1500;
/** The search returns this many candidates; user airports are searched apart from the database and never crowd it out */
const MAX_ITEMS = 5;

/**
 * Finds the airport a spoofer's false position snaps to (#465): the nearest one with a hard-surface runway of at least
 * MIN_RUNWAY_LENGTH_M within the radius. A user airport is left out, because it is no part of the sim's world.
 */
export class NearestAirportFinder implements AirportFinder {
    constructor(private readonly loader: KLNFacilityLoader) {
    }

    public async find(lat: number, lon: number, radiusNm: number): Promise<{ lat: number; lon: number; elevationFt: number } | null> {
        //One session per search: the searches are rare
        const session = await this.loader.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Airport) as KLNNearestAirportFacilitySearchSession;
        session.setAirportFilter(false, AirportClassMask.HardSurface);
        session.setExtendedAirportFilters(
            HARD_SURFACE_MASK,
            NearestAirportSearchSession.Defaults.ApproachTypeMask,
            NearestAirportSearchSession.Defaults.ToweredMask,
            MIN_RUNWAY_LENGTH_M,
        );
        const result = await session.searchNearest(lat, lon, UnitType.NMILE.convertTo(radiusNm, UnitType.METER), MAX_ITEMS);

        const from = new GeoPoint(lat, lon);
        let best: { lat: number; lon: number; elevationFt: number } | null = null;
        let bestDistance = Infinity;
        for (const icao of result.added) {
            if (icao.region === USER_WAYPOINT || icao.region === TEMPORARY_WAYPOINT) {
                continue;
            }
            const facility = await this.loader.tryGetFacility(FacilityType.Airport, icao);
            if (facility === null) {
                continue;
            }
            const distance = from.distance(facility.lat, facility.lon);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = {lat: facility.lat, lon: facility.lon, elevationFt: UnitType.METER.convertTo(facility.altitude, UnitType.FOOT)};
            }
        }
        return best;
    }
}
