import {
    AirportFacility,
    AirportUtils,
    BitFlags,
    Facility,
    FacilityLoader,
    FacilitySearchType,
    FacilitySearchTypeLatLon,
    FacilityType,
    FacilityTypeMap,
    GeoKdTreeSearchFilter,
    GeoPoint,
    ICAO,
    IntersectionFacility,
    NdbFacility,
    NearestAirportSearchSession,
    NearestBoundarySearchSession,
    NearestIntersectionSearchSession,
    NearestSearchResults,
    NearestSearchSession,
    NearestVorSearchSession,
    RunwaySurfaceCategory,
    RunwaySurfaceType,
    SearchTypeMap,
    UnitType,
    VorFacility,
} from "@microsoft/msfs-sdk";
import {KLNFacilityRepository, KLNRepoSearchableFacilityTypes} from "./KLNFacilityRepository";

import {SURFACE_HRD, SURFACE_HRD_SFT} from "../../settings/KLN90BUserSettings";

export declare type KLNSessionTypeMap = {
    /** Plain search session. */
    [FacilitySearchType.All]: void,
    /** Airport search session. */
    [FacilitySearchType.Airport]: KLNNearestAirportFacilitySearchSession;
    /** Intersection search session. */
    [FacilitySearchType.Intersection]: void;
    /** VOR search session. */
    [FacilitySearchType.Vor]: KLNNearestVorSearchSession;
    /** NDB search session. */
    [FacilitySearchType.Ndb]: KLNCoherentNearestSearchSession<NdbFacility, NearestSearchSession<string, string>>;
    /** Nearest user facility search session. */
    [FacilitySearchType.User]: void;

    /** Boundary search session. */
    [FacilitySearchType.Boundary]: NearestBoundarySearchSession,

    /** Visual facilities. */
    [FacilitySearchType.Visual]: void;

    /** All facilities except visual facilities. */
    [FacilitySearchType.AllExceptVisual]: void;
};

/**

 /**
 * A nearest facilities search request for the request queue.
 */
type SearchRequest<TAdded, TRemoved> = {
    /** The promise for the request. */
    promise: Promise<NearestSearchResults<TAdded, TRemoved>>;

    /** The promise resolution. */
    resolve: (results: NearestSearchResults<TAdded, TRemoved>) => void;
}


/**
 * This is an adaption the class NearestUserFacilitySearchSession from the SDK. That class can unfortunately only
 * search for USR waypoints, but we need to search for all waypoint types.
 */
class KLNNearestRepoFacilitySearchSession<T extends Facility> implements NearestSearchSession<string, string> {
    protected filter: GeoKdTreeSearchFilter<T> | undefined = undefined;

    private readonly cachedResults = new Set<string>();

    private searchId = 0;

    /**
     * Creates an instance of a NearestUserSearchSession.
     * @param repo The facility repository in which to search.
     * @param sessionId The ID of the session.
     * @param facilityType
     */
    constructor(private readonly repo: KLNFacilityRepository, private readonly sessionId: number, private readonly facilityType: KLNRepoSearchableFacilityTypes) {
    }

    /** @inheritdoc */
    public searchNearest(lat: number, lon: number, radius: number, maxItems: number): Promise<NearestSearchResults<string, string>> {
        const radiusGAR = UnitType.METER.convertTo(radius, UnitType.GA_RADIAN);

        const results = this.repo.search(this.facilityType, lat, lon, radiusGAR, maxItems, [], this.filter as GeoKdTreeSearchFilter<Facility> | undefined);

        const added = [];

        for (let i = 0; i < results.length; i++) {
            const icao = results[i].icao;
            if (this.cachedResults.has(icao)) {
                this.cachedResults.delete(icao);
            } else {
                added.push(icao);
            }
        }

        const removed = Array.from(this.cachedResults);
        this.cachedResults.clear();

        for (let i = 0; i < results.length; i++) {
            this.cachedResults.add(results[i].icao);
        }

        return Promise.resolve({
            sessionId: this.sessionId,
            searchId: this.searchId++,
            added,
            removed,
        });
    }

    /**
     * Sets the filter for this search session.
     * @param filter A function to filter the search results.
     */
    public seFacilityFilter(filter?: GeoKdTreeSearchFilter<T>): void {
        this.filter = filter;
    }
}


/**
 * This session merges the result between our repository and the coherent results
 */
class KLNCoherentNearestSearchSession<TFacility extends Facility, TCoherent extends NearestSearchSession<string, string>> implements NearestSearchSession<string, string> {

    /**
     * Creates an instance of a CoherentNearestSearchSession.
     * @param repoSearchSession
     * @param coherentSearchSession
     */
    constructor(protected readonly repoSearchSession: KLNNearestRepoFacilitySearchSession<TFacility>,
                protected coherentSearchSession: TCoherent) {
    }

    /** @inheritdoc */
    public async searchNearest(lat: number, lon: number, radius: number, maxItems: number): Promise<NearestSearchResults<string, string>> {
        const repoResult = await this.repoSearchSession.searchNearest(lat, lon, radius, maxItems);
        const coherentResult = await this.coherentSearchSession.searchNearest(lat, lon, radius, maxItems);

        return Promise.resolve({
            sessionId: coherentResult.sessionId,
            searchId: coherentResult.searchId,
            added: repoResult.added.concat(coherentResult.added), //yes, we may return more than maxItems. Since there are only few repo waypoints, this should not be problem
            removed: repoResult.removed.concat(coherentResult.removed),
        });
    }

}

/**
 * A session for searching for nearest user facilities.
 */
export class KLNNearestAirportFacilitySearchSession extends KLNCoherentNearestSearchSession<AirportFacility, NearestAirportSearchSession> {

    public setAirportFilters(surfaceType: boolean, minRunwayLengthFeet: number): void {
        let surfaceTypeMask;
        let surfaceCategory: number;
        switch (surfaceType) {
            case SURFACE_HRD_SFT:
                surfaceTypeMask = BitFlags.union(
                    //hard
                    BitFlags.createFlag(RunwaySurfaceType.Concrete),
                    BitFlags.createFlag(RunwaySurfaceType.Asphalt),
                    BitFlags.createFlag(RunwaySurfaceType.Tarmac),
                    BitFlags.createFlag(RunwaySurfaceType.Brick),
                    BitFlags.createFlag(RunwaySurfaceType.Bituminous),
                    //soft
                    BitFlags.createFlag(RunwaySurfaceType.HardTurf),
                    BitFlags.createFlag(RunwaySurfaceType.Gravel),
                    BitFlags.createFlag(RunwaySurfaceType.Sand),
                    BitFlags.createFlag(RunwaySurfaceType.Dirt),
                    BitFlags.createFlag(RunwaySurfaceType.Ice),
                    BitFlags.createFlag(RunwaySurfaceType.SteelMats),
                    BitFlags.createFlag(RunwaySurfaceType.Shale),

                    BitFlags.createFlag(RunwaySurfaceType.Grass),
                    BitFlags.createFlag(RunwaySurfaceType.GrassBumpy),
                    BitFlags.createFlag(RunwaySurfaceType.ShortGrass),
                    BitFlags.createFlag(RunwaySurfaceType.LongGrass),
                );
                surfaceCategory = BitFlags.union(
                    RunwaySurfaceCategory.Hard,
                    RunwaySurfaceCategory.Soft,
                );
                break;
            case SURFACE_HRD:
                surfaceTypeMask = BitFlags.union(
                    BitFlags.createFlag(RunwaySurfaceType.Concrete),
                    BitFlags.createFlag(RunwaySurfaceType.Asphalt),
                    BitFlags.createFlag(RunwaySurfaceType.Tarmac),
                    BitFlags.createFlag(RunwaySurfaceType.Brick),
                    BitFlags.createFlag(RunwaySurfaceType.Bituminous),
                );
                surfaceCategory = RunwaySurfaceCategory.Hard;
                break;
        }

        this.repoSearchSession.seFacilityFilter(f => AirportUtils.hasMatchingRunway(f, minRunwayLengthFeet, surfaceCategory));
        this.coherentSearchSession.setExtendedAirportFilters(surfaceTypeMask,
            NearestAirportSearchSession.Defaults.ApproachTypeMask,
            NearestAirportSearchSession.Defaults.ToweredMask,
            UnitType.FOOT.convertTo(minRunwayLengthFeet, UnitType.METER));
    }
}

/**
 * A session for searching for nearest intersections.
 */
export class KLNNearestIntersectionSearchSession extends KLNCoherentNearestSearchSession<IntersectionFacility, NearestIntersectionSearchSession> {

    /**
     * Sets the filter for the intersection nearest search.
     * @param typeMask A bitmask to determine which JS intersection types to show.
     */
    public setIntersectionFilter(typeMask: number): void {
        //this.repoSearchSession.seFacilityFilter(f => f.) //that's a bummer, we don't have the type in the object
        this.coherentSearchSession.setIntersectionFilter(typeMask);
    }
}

/**
 * A session for searching for nearest VORs.
 */
export class KLNNearestVorSearchSession extends KLNCoherentNearestSearchSession<VorFacility, NearestVorSearchSession> {


    /**
     * Sets the filter for the VOR nearest search.
     * @param classMask A bitmask to determine which JS VOR classes to show.
     * @param typeMask A bitmask to determine which JS VOR types to show.
     */
    public setVorFilter(classMask: number, typeMask: number): void {
        this.repoSearchSession.seFacilityFilter(f => BitFlags.isAny(f.vorClass, classMask) && BitFlags.isAny(f.type, typeMask));
        this.coherentSearchSession.setVorFilter(classMask, typeMask);
    }
}

/**
 * We use our own FacilityLoader, because the one from the SDK only supports USR as user waypoints.
 * In addition to those (known as Supplementary Waypoints in the KLN), the KLN allows user to define any waypoint as a
 * user waypoint. This FacilityLoader searches in the local Repo for any type.
 */
export class KLNFacilityLoader {

    private static repoSearchSessionId = -1;

    constructor(private readonly actualFacilityLoader: FacilityLoader,
                public readonly facilityRepo: KLNFacilityRepository) {
    }


    /**
     * Retrieves a facility.
     * @param type The type of facility to retrieve.
     * @param icao The ICAO of the facility to retrieve.
     * @returns A Promise which will be fulfilled with the requested facility, or rejected if the facility could not be
     * retrieved.
     */
    public getFacility<T extends FacilityType>(type: T, icao: string): Promise<FacilityTypeMap[T]> {
        const repo = this.getFacilityFromRepo(type, icao);
        if (repo) {
            return Promise.resolve(repo);
        }
        return this.actualFacilityLoader.getFacility(type, icao);
    }

    /**
     * Starts a nearest facilities search session.
     * @param type The type of facilities for which to search.
     * @returns A Promise which will be fulfilled with the new nearest search session.
     */
    public async startNearestSearchSession<T extends FacilitySearchType>(type: T): Promise<KLNSessionTypeMap[T]> {
        if (type === FacilitySearchType.Boundary) {
            // noinspection ES6MissingAwait
            return this.actualFacilityLoader.startNearestSearchSession(type) as unknown as Promise<KLNSessionTypeMap[T]>;
        }

        // noinspection ES6MissingAwait
        return this.startRepoNearestSearchSession(type) as unknown as Promise<KLNSessionTypeMap[T]>;

    }

    /**
     * Searches for ICAOs by their ident portion only.
     * @param filter The type of facility to filter by. Selecting ALL will search all facility type ICAOs.
     * @param ident The partial or complete ident to search for.
     * @param maxItems The max number of matches to return.
     * @returns A collection of matched ICAOs.
     */
    public async searchByIdent(filter: FacilitySearchType, ident: string, maxItems = 40): Promise<string[]> {
        const results = await this.actualFacilityLoader.searchByIdent(filter, ident, maxItems);

        let repoType: FacilityType[] | undefined;
        switch (filter) {
            case FacilitySearchType.Airport:
                repoType = [FacilityType.Airport];
                break;
            case FacilitySearchType.User:
                repoType = [FacilityType.USR];
                break;
            case FacilitySearchType.Vor:
                repoType = [FacilityType.VOR];
                break;
            case FacilitySearchType.Intersection:
                repoType = [FacilityType.Intersection];
                break;
            case FacilitySearchType.Ndb:
                repoType = [FacilityType.NDB];
                break;
            case FacilitySearchType.All:
                repoType = undefined;
                break;
            default:
                throw new Error(`Unsupported SearchType:${filter}`);
        }

        this.facilityRepo.forEach(fac => {
            const facIdent = ICAO.getIdent(fac.icao);

            if (facIdent === ident) {
                results.unshift(fac.icao);
            } else if (facIdent.startsWith(ident)) {
                results.push(fac.icao);
            }
        }, repoType);
        results.sort((a, b) => ICAO.getIdent(a).localeCompare(ICAO.getIdent(b)));

        return results;
    }

    /**
     * Searches for facilities matching a given ident, and returns the matching facilities, with nearest at the beginning of the array.
     * @param filter The type of facility to filter by. Selecting ALL will search all facility type ICAOs, except for boundary facilities.
     * @param ident The exact ident to search for. (ex: DEN, KDEN, ITADO)
     * @param lat The latitude to find facilities nearest to.
     * @param lon The longitude to find facilities nearest to.
     * @param maxItems The max number of matches to return.
     * @returns An array of matching facilities, sorted by distance to the given lat/lon, with nearest at the beginning of the array.
     */
    public async findNearestFacilitiesByIdent<T extends FacilitySearchTypeLatLon>(filter: T, ident: string, lat: number, lon: number, maxItems = 40): Promise<SearchTypeMap[T][]> {
        const results = await this.searchByIdent(filter, ident, maxItems);

        if (!results) {
            return [];
        }

        const promises = [] as Promise<SearchTypeMap[T]>[];

        for (let i = 0; i < results.length; i++) {
            const icao = results[i];
            const facIdent = ICAO.getIdent(icao);
            if (facIdent === ident) {
                const facType = ICAO.getFacilityType(icao);
                // noinspection ES6MissingAwait
                promises.push(this.getFacility(facType, icao) as Promise<SearchTypeMap[T]>);
            }
        }

        const foundFacilities = await Promise.all(promises);

        if (foundFacilities.length > 1) {
            foundFacilities.sort((a, b) => GeoPoint.distance(lat, lon, a.lat, a.lon) - GeoPoint.distance(lat, lon, b.lat, b.lon));
            return foundFacilities;
        } else if (foundFacilities.length === 1) {
            return foundFacilities;
        } else {
            return [];
        }
    }

    /**
     * Retrieves a facility from the local facility repository.
     * @param type The type of facility to retrieve.
     * @param icao The ICAO of the facility to retrieve.
     * @returns A Promise which will be fulfilled with the requested facility, or rejected if the facility could not be
     * retrieved.
     */
    private getFacilityFromRepo<T extends FacilityType>(type: T, icao: string): FacilityTypeMap[T] {
        return this.facilityRepo.get(icao) as FacilityTypeMap[T];
    }

    /**
     * Starts a repository facilities search session.
     * @param type The type of facilities for which to search.
     * @returns A Promise which will be fulfilled with the new nearest search session.
     * @throws Error if the search type is not supported.
     */
    private async startRepoNearestSearchSession<T extends FacilitySearchType>(type: T): Promise<KLNSessionTypeMap[T]> {
        // Session ID doesn't really matter for these, so in order to not conflict with IDs from Coherent, we will set
        // them all to negative numbers
        const repoSessionId = KLNFacilityLoader.repoSearchSessionId--;

        let typ: KLNRepoSearchableFacilityTypes;
        switch (type) {
            case FacilitySearchType.Airport:
                typ = FacilityType.Airport;
                break;
            case FacilitySearchType.Ndb:
                typ = FacilityType.NDB;
                break;
            case FacilitySearchType.Vor:
                typ = FacilityType.VOR;
                break;
            default:
                throw Error(`Unsupported searchtype: ${type}`);
        }

        const repoSession = new KLNNearestRepoFacilitySearchSession<any>(this.facilityRepo, repoSessionId, typ);
        const coherentSession: any = await this.actualFacilityLoader.startNearestSearchSession(type);


        switch (type) {
            case FacilitySearchType.Airport:
                return new KLNNearestAirportFacilitySearchSession(repoSession, coherentSession) as KLNSessionTypeMap[T];
            case FacilitySearchType.Vor:
                return new KLNNearestVorSearchSession(repoSession, coherentSession) as KLNSessionTypeMap[T];
            case FacilitySearchType.Ndb:
                return new KLNCoherentNearestSearchSession<NdbFacility, NearestSearchSession<string, string>>(repoSession, coherentSession) as KLNSessionTypeMap[T];
            default:
                throw Error(`Unsupported searchtype: ${type}`);
        }
    }

}