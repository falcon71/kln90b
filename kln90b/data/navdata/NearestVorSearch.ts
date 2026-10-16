import {
    FacilityClient,
    FacilitySearchType,
    FacilityType,
    GeoPoint,
    ICAO,
    NearestIcaoSearchSessionDataType,
    NearestSearchSessionTypeMap,
    UnitType,
    VorFacility,
} from "@microsoft/msfs-sdk";
import {Latitude, Longitude} from "../Units";

export type VorSearchSession = NearestSearchSessionTypeMap<NearestIcaoSearchSessionDataType.Struct>[FacilitySearchType.Vor];

/**
 * The nearest VOR of one nearest search session, whose filter the owner has set, within a radius. One search runs at a
 * time: the session reports only what was added to and removed from its result, so its diffs must apply in order.
 */
export class NearestVorSearch {
    //The results of the session by ICAO uid, rebuilt from its diffs (a cache of the session)
    private readonly results = new Map<string, VorFacility>();
    //The search that runs last; it never rejects, so that a failed search does not stop the ones queued behind it
    private lastSearch: Promise<unknown> = Promise.resolve();

    public constructor(private readonly facilityLoader: FacilityClient, private readonly session: VorSearchSession, private readonly radiusNM: number) {
    }

    /**
     * Returns the nearest VOR to the given location, or null without one within the radius. A failed search rejects the
     * call that made it, and the next call searches again.
     */
    public search(lat: Latitude, lon: Longitude): Promise<VorFacility | null> {
        const search = this.lastSearch.then(() => this.searchNow(lat, lon));
        this.lastSearch = search.catch(() => undefined);
        return search;
    }

    private async searchNow(lat: Latitude, lon: Longitude): Promise<VorFacility | null> {
        const distanceMeters = UnitType.NMILE.convertTo(this.radiusNM, UnitType.METER);
        const diff = await this.session.searchNearest(lat, lon, distanceMeters, 1);
        for (const icao of diff.removed) {
            this.results.delete(ICAO.getUid(icao));
        }
        //A VOR the database cannot load is left out (#95)
        const added = await Promise.all(diff.added.map(icao => this.facilityLoader.tryGetFacility(FacilityType.VOR, icao)));
        for (const vor of added) {
            if (vor !== null) {
                this.results.set(ICAO.getUid(vor.icaoStruct), vor);
            }
        }

        //The session merges the nearest VOR of the database and the nearest user VOR: the nearer one is the answer
        let nearest: VorFacility | null = null;
        let nearestDistance = Number.POSITIVE_INFINITY;
        for (const vor of this.results.values()) {
            const distance = GeoPoint.distance(lat, lon, vor.lat, vor.lon);
            if (distance < nearestDistance) {
                nearest = vor;
                nearestDistance = distance;
            }
        }
        return nearest;
    }
}
