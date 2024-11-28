import {
    AirportFacility,
    AirportUtils,
    AirwayData,
    BitFlags,
    Facility,
    FacilityClient,
    FacilityLoader,
    FacilitySearchType,
    FacilitySearchTypeLatLon,
    FacilityType,
    FacilityTypeMap,
    GeoKdTreeSearchFilter,
    GeoPoint,
    ICAO,
    IcaoValue,
    Metar,
    NdbFacility,
    NearestAirportFilteredSearchSession,
    NearestAirportSearchSession,
    NearestIcaoSearchSession,
    NearestIcaoSearchSessionDataType,
    NearestSearchResults,
    NearestSearchSession,
    NearestSearchSessionTypeMap,
    NearestVorFilteredSearchSession,
    NearestVorSearchSession,
    RunwaySurfaceCategory,
    RunwaySurfaceType,
    SearchTypeMap,
    Taf,
    UnitType,
    VorFacility,
} from "@microsoft/msfs-sdk";
import {KLNFacilityRepository, KLNRepoSearchableFacilityTypes} from "./KLNFacilityRepository";

/**
 * This is an adaption the class NearestUserFacilitySearchSession from the SDK. That class can unfortunately only
 * search for USR waypoints, but we need to search for all waypoint types.
 */
class KLNNearestRepoFacilitySearchSession<T extends Facility> implements NearestSearchSession<IcaoValue, IcaoValue> {
    protected filter: GeoKdTreeSearchFilter<T> | undefined = undefined;

    private readonly cachedResults = new Set<IcaoValue>();

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
    public searchNearest(lat: number, lon: number, radius: number, maxItems: number): Promise<NearestSearchResults<IcaoValue, IcaoValue>> {
        const radiusGAR = UnitType.METER.convertTo(radius, UnitType.GA_RADIAN);

        const results = this.repo.search(this.facilityType, lat, lon, radiusGAR, maxItems, [], this.filter as GeoKdTreeSearchFilter<Facility> | undefined);

        const added = [];

        for (let i = 0; i < results.length; i++) {
            const icao = results[i].icaoStruct;
            if (this.cachedResults.has(icao)) {
                this.cachedResults.delete(icao);
            } else {
                added.push(icao);
            }
        }

        const removed = Array.from(this.cachedResults);
        this.cachedResults.clear();

        for (let i = 0; i < results.length; i++) {
            this.cachedResults.add(results[i].icaoStruct);
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
class KLNCoherentNearestSearchSession<TFacility extends Facility, TCoherent extends NearestSearchSession<IcaoValue, IcaoValue>> implements NearestIcaoSearchSession<NearestIcaoSearchSessionDataType.Struct> {

    public readonly icaoDataType = NearestIcaoSearchSessionDataType.Struct;

    /**
     * Creates an instance of a CoherentNearestSearchSession.
     * @param repoSearchSession
     * @param coherentSearchSession
     */
    constructor(protected readonly repoSearchSession: KLNNearestRepoFacilitySearchSession<TFacility>,
                protected coherentSearchSession: TCoherent) {
    }

    /** @inheritdoc */
    public async searchNearest(lat: number, lon: number, radius: number, maxItems: number): Promise<NearestSearchResults<IcaoValue, IcaoValue>> {
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
export class KLNNearestAirportFacilitySearchSession extends KLNCoherentNearestSearchSession<AirportFacility, NearestAirportSearchSession<NearestIcaoSearchSessionDataType.Struct>> implements NearestAirportFilteredSearchSession<NearestIcaoSearchSessionDataType.Struct> {

    public setAirportFilter(showClosed: boolean, classMask: number): void {
        this.coherentSearchSession.setAirportFilter(showClosed, classMask);
    }

    public setExtendedAirportFilters(surfaceTypeMask: number, approachTypeMask: number, toweredMask: number, minRunwayLength: number): void {
        let surfaceCategory: number;
        if (BitFlags.isAny(surfaceTypeMask, BitFlags.createFlag(RunwaySurfaceType.Grass))) {
            surfaceCategory = BitFlags.union(
                RunwaySurfaceCategory.Hard,
                RunwaySurfaceCategory.Soft,
            );
        } else {
            surfaceCategory = RunwaySurfaceCategory.Hard;
        }

        this.repoSearchSession.seFacilityFilter(f => AirportUtils.hasMatchingRunway(f, UnitType.METER.convertTo(minRunwayLength, UnitType.FOOT), surfaceCategory));

        this.coherentSearchSession.setExtendedAirportFilters(surfaceTypeMask,
            approachTypeMask,
            toweredMask,
            minRunwayLength);
    }
}


/**
 * A session for searching for nearest VORs.
 */
export class KLNNearestVorSearchSession extends KLNCoherentNearestSearchSession<VorFacility, NearestVorSearchSession<NearestIcaoSearchSessionDataType.Struct>> implements NearestVorFilteredSearchSession<NearestIcaoSearchSessionDataType.Struct> {

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
export class KLNFacilityLoader implements FacilityClient {

    private static repoSearchSessionId = -1;

    constructor(private readonly actualFacilityLoader: FacilityLoader,
                private readonly facilityRepo: KLNFacilityRepository) {
    }


    /** @inheritDoc */
    public tryGetFacility<T extends FacilityType>(type: T, icao: IcaoValue, airportDataFlags?: number): Promise<FacilityTypeMap[T] | null> {
        return this._tryGetFacility(type, icao, airportDataFlags);
    }

    /** @inheritDoc */
    public async getFacility<T extends FacilityType>(type: T, icao: IcaoValue, airportDataFlags?: number): Promise<FacilityTypeMap[T]>;
    /** @inheritDoc */
    public async getFacility<T extends FacilityType>(type: T, icao: string): Promise<FacilityTypeMap[T]>;
    // eslint-disable-next-line jsdoc/require-jsdoc
    public async getFacility<T extends FacilityType>(type: T, icao: IcaoValue | string, airportDataFlags?: number): Promise<FacilityTypeMap[T]> {
        if (typeof icao === 'string') {
            icao = ICAO.stringV1ToValue(icao);
        }

        const result = await this._tryGetFacility(type, icao, airportDataFlags);
        if (result === null) {
            throw new Error(`FacilityLoader: facility could not be retrieved for ICAO ${ICAO.tryValueToStringV2(icao)}`);
        } else {
            return result;
        }
    }

    /** @inheritDoc */
    public getFacilities(icaos: readonly IcaoValue[], airportDataFlags?: number): Promise<(Facility | null)[]> {
        return Promise.all(
            icaos.map((icao) => {
                    if (!ICAO.isValueFacility(icao)) {
                        return null;
                    }

                    return this._tryGetFacility(ICAO.getFacilityTypeFromValue(icao), icao, airportDataFlags);
                },
            ),
        );
    }

    /** @inheritDoc */
    public getFacilitiesOfType<T extends FacilityType>(type: T, icaos: readonly IcaoValue[]): Promise<(FacilityTypeMap[T] | null)[]>;
    /** @inheritDoc */
    public getFacilitiesOfType(type: FacilityType.Airport, icaos: readonly IcaoValue[], airportDataFlags?: number): Promise<(AirportFacility | null)[]>;
    // eslint-disable-next-line jsdoc/require-jsdoc
    public getFacilitiesOfType<T extends FacilityType>(type: T, icaos: readonly IcaoValue[], airportDataFlags?: number): Promise<(FacilityTypeMap[T] | null)[]> {
        return Promise.all(
            icaos.map((icao) => {
                    if (!ICAO.isValueFacility(icao)) {
                        return null;
                    }

                    return this._tryGetFacility(type, icao, airportDataFlags);
                },
            ),
        );
    }

    /** @inheritDoc */
    public startNearestSearchSessionWithIcaoStructs<T extends FacilitySearchType>(type: T): Promise<NearestSearchSessionTypeMap<NearestIcaoSearchSessionDataType.Struct>[T]> {
        if (type === FacilitySearchType.Boundary) {
            return this.actualFacilityLoader.startNearestSearchSessionWithIcaoStructs(type);
        }

        return this.startRepoNearestSearchSession(type);

    }

    /** @inheritDoc */
    public async searchByIdentWithIcaoStructs(filter: FacilitySearchType, ident: string, maxItems = 40): Promise<IcaoValue[]> {
        const results = await this.actualFacilityLoader.searchByIdentWithIcaoStructs(filter, ident, maxItems);

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
            const facIdent = fac.icaoStruct.ident;

            if (facIdent === ident) {
                results.unshift(fac.icaoStruct);
            } else if (facIdent.startsWith(ident)) {
                results.push(fac.icaoStruct);
            }
        }, repoType);

        return results;
    }

    /** @inheritDoc */
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
        return results;
    }

    /** @inheritDoc */
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

    public awaitInitialization(): Promise<void> {
        return this.actualFacilityLoader.awaitInitialization();
    }

    public getAirway(airwayName: string, airwayType: number, icao: IcaoValue): Promise<AirwayData>

    public getAirway(airwayName: string, airwayType: number, icao: string): Promise<AirwayData>;

    public getAirway(airwayName: string, airwayType: number, icao: IcaoValue | string): Promise<AirwayData> {
        throw new Error("getAirway is not implemented");
    }

    public getMetar(airport: AirportFacility): Promise<Metar | undefined>;

    public getMetar(ident: string): Promise<Metar | undefined>;

    public getMetar(airport: AirportFacility | string): Promise<Metar | undefined> {
        throw new Error("getAirway is not implemented");
    }

    public getTaf(airport: AirportFacility): Promise<Taf | undefined>;

    public getTaf(ident: string): Promise<Taf | undefined>;

    public getTaf(airport: AirportFacility | string): Promise<Taf | undefined> {
        throw new Error("getAirway is not implemented");
    }

    public searchMetar(lat: number, lon: number): Promise<Metar | undefined> {
        throw new Error("getAirway is not implemented");
    }

    public searchTaf(lat: number, lon: number): Promise<Taf | undefined> {
        throw new Error("getAirway is not implemented");
    }

    public startNearestSearchSession<T extends FacilitySearchType>(type: T): Promise<NearestSearchSessionTypeMap<NearestIcaoSearchSessionDataType.StringV1>[T]> {
        throw new Error("getAirway is not implemented");
    }

    public tryGetAirway(airwayName: string, airwayType: number, icao: IcaoValue): Promise<AirwayData | null> {
        throw new Error("getAirway is not implemented");
    }

    /**
     * Attempts to retrieve a facility.
     * @param type The type of facility to retrieve.
     * @param icao The ICAO of the facility to retrieve.
     * @param airportDataFlags Bitflags describing the requested data to be loaded in the airport facility to retrieve.
     * The retrieved facility (if any) is guaranteed to have *at least* as much data loaded as requested. Ignored if the
     * type of facility to retrieve is not `FacilityType.Airport`. Defaults to `AirportFacilityDataFlags.All`.
     * @returns A Promise which will be fulfilled with the requested facility, or `null` if the facility could not be
     * retrieved.
     */
    private async _tryGetFacility<T extends FacilityType>(type: T, icao: IcaoValue, airportDataFlags?: number): Promise<FacilityTypeMap[T] | null> {
        const repo = this.getFacilityFromRepo(type, icao);
        if (repo) {
            return Promise.resolve(repo);
        }
        return this.actualFacilityLoader.getFacility(type, icao);
    }

    /** @inheritDoc */
    private getFacilityFromRepo<T extends FacilityType>(type: T, icao: IcaoValue): FacilityTypeMap[T] | null {
        return this.facilityRepo.get(icao) as FacilityTypeMap[T];
    }

    /**
     * Starts a repository facilities search session.
     * @param type The type of facilities for which to search.
     * @returns A Promise which will be fulfilled with the new nearest search session.
     * @throws Error if the search type is not supported.
     */
    private async startRepoNearestSearchSession<T extends FacilitySearchType>(type: T): Promise<NearestSearchSessionTypeMap<NearestIcaoSearchSessionDataType.Struct>[T]> {
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
                throw new Error(`Unsupported searchtype: ${type}`);
        }

        const repoSession = new KLNNearestRepoFacilitySearchSession<any>(this.facilityRepo, repoSessionId, typ);
        const coherentSession: any = await this.actualFacilityLoader.startNearestSearchSessionWithIcaoStructs(type);


        switch (type) {
            case FacilitySearchType.Airport:
                return new KLNNearestAirportFacilitySearchSession(repoSession, coherentSession) as any as NearestSearchSessionTypeMap<NearestIcaoSearchSessionDataType.Struct>[T];
            case FacilitySearchType.Vor:
                return new KLNNearestVorSearchSession(repoSession, coherentSession) as any as NearestSearchSessionTypeMap<NearestIcaoSearchSessionDataType.Struct>[T];
            case FacilitySearchType.Ndb:
                return new KLNCoherentNearestSearchSession<NdbFacility, NearestSearchSession<IcaoValue, IcaoValue>>(repoSession, coherentSession) as any as NearestSearchSessionTypeMap<NearestIcaoSearchSessionDataType.Struct>[T];
            default:
                throw new Error(`Unsupported searchtype: ${type}`);
        }
    }

}
