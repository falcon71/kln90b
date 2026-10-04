import {
    AirportFacility, BoundaryFacility, Facility, FacilitySearchType, FacilityType, GeoKdTree, GeoPoint, ICAO, IcaoValue,
    NearestSearchResults, UnitType, VorFacility,
} from '@microsoft/msfs-sdk';
import {distanceToBoxNm} from './airspaces';

const SEARCH_TYPES: Partial<Record<FacilitySearchType, FacilityType[]>> = {
    [FacilitySearchType.Airport]: [FacilityType.Airport],
    [FacilitySearchType.Vor]: [FacilityType.VOR],
    [FacilitySearchType.Ndb]: [FacilityType.NDB],
    [FacilitySearchType.Intersection]: [FacilityType.Intersection],
    [FacilitySearchType.User]: [FacilityType.USR],
};

const treeKey = (fac: Facility, out: Float64Array) => GeoPoint.sphericalToCartesian(fac, out);

/**
 * Nearest search with the same added/removed bookkeeping as KLNNearestRepoFacilitySearchSession. The airport and VOR
 * filters are kept per session and applied inside the search, before maxItems, as the sim does: a nearer facility that
 * the filter hides never takes one of the maxItems slots. A facility hidden by a new filter is reported as removed at
 * the next search by the bookkeeping itself.
 *
 * The masks are `1 << enum value` (BitFlags.createFlag). The towered mask has bit 1 for untowered and bit 2 for towered
 * (msfssdk.d.ts, setExtendedAirportFilters). The approach type mask and showClosed are accepted and ignored.
 *
 * Source for "an airport without runways passes the extended filter": the sim developers' code, quoted to the
 * maintainer: "If there are no runways, the minimum runway size and surface types filters should not apply". Such an
 * airport (a heliport) is dropped only by the class mask of setAirportFilter, which is how the instrument hides it.
 */
class MemoryNearestSession {
    private readonly cachedResults = new Set<IcaoValue>();
    private searchId = 0;

    private airportClassMask = ~0;
    private surfaceMask = ~0;
    private toweredMask = 3;
    private minRunwayLengthM = 0;
    private vorClassMask = ~0;
    private vorTypeMask = ~0;

    constructor(private readonly tree: GeoKdTree<Facility>, public readonly sessionId: number) {
    }

    public searchNearest(lat: number, lon: number, radiusMeters: number, maxItems: number): Promise<NearestSearchResults<IcaoValue, IcaoValue>> {
        const results = this.tree.search(lat, lon, UnitType.METER.convertTo(radiusMeters, UnitType.GA_RADIAN), maxItems, [], f => this.passes(f));
        const added: IcaoValue[] = [];
        for (const fac of results) {
            if (!this.cachedResults.delete(fac.icaoStruct)) {
                added.push(fac.icaoStruct);
            }
        }
        const removed = Array.from(this.cachedResults);
        this.cachedResults.clear();
        results.forEach(f => this.cachedResults.add(f.icaoStruct));
        return Promise.resolve({sessionId: this.sessionId, searchId: this.searchId++, added, removed});
    }

    public setAirportFilter(_showClosed: boolean, classMask: number): void {
        this.airportClassMask = classMask;
    }

    public setExtendedAirportFilters(surfaceTypeMask: number, _approachTypeMask: number, toweredMask: number, minRunwayLength: number): void {
        this.surfaceMask = surfaceTypeMask;
        this.toweredMask = toweredMask;
        this.minRunwayLengthM = minRunwayLength;
    }

    public setVorFilter(classMask: number, typeMask: number): void {
        this.vorClassMask = classMask;
        this.vorTypeMask = typeMask;
    }

    public setFilter(): void {
    }

    private passes(fac: Facility): boolean {
        const flag = (v: number) => 1 << v;
        switch (ICAO.getFacilityTypeFromValue(fac.icaoStruct)) {
            case FacilityType.Airport: {
                const apt = fac as AirportFacility;
                if ((this.airportClassMask & flag(apt.airportClass)) === 0) {
                    return false;
                }
                if ((this.toweredMask & (apt.towered ? 2 : 1)) === 0) {
                    return false;
                }
                return apt.runways.length === 0
                    || apt.runways.some(r => r.length >= this.minRunwayLengthM && (this.surfaceMask & flag(r.surface)) !== 0);
            }
            case FacilityType.VOR: {
                const vor = fac as VorFacility;
                return (this.vorClassMask & flag(vor.vorClass)) !== 0 && (this.vorTypeMask & flag(vor.type)) !== 0;
            }
            default:
                return true;
        }
    }
}

/**
 * The raw sim boundary session (NearestBoundarySearchSession): it returns BoundaryFacility objects and reports removed
 * ones by id. The candidates are the airspaces of the type mask whose bounding box meets the search circle; they are
 * sorted by the distance to the box and cut at maxItems. This is inferred from the comment in
 * NearestUtils.getAirspaces ("searchNearest seems to only check the bounding box"), not observed in the sim. The SDK's
 * NearestLodBoundarySearchSession wraps it and builds the LodBoundary objects in a throttled queue on
 * requestAnimationFrame, so a test advances the clock for a search to finish.
 */
class MemoryBoundarySession {
    private readonly cached = new Set<number>();
    private searchId = 0;
    private mask = ~0;

    constructor(private readonly airspaces: BoundaryFacility[], public readonly sessionId: number) {
    }

    public setBoundaryFilter(mask: number): void {
        this.mask = mask;
    }

    public setFilter(mask: number): void {
        this.mask = mask;
    }

    public searchNearest(lat: number, lon: number, radiusMeters: number, maxItems: number): Promise<NearestSearchResults<BoundaryFacility, number>> {
        const radiusNm = UnitType.METER.convertTo(radiusMeters, UnitType.NMILE);
        const found = this.airspaces
            .filter(a => (this.mask & (1 << a.type)) !== 0)
            .map(a => ({a, d: distanceToBoxNm(lat, lon, a)}))
            .filter(x => x.d <= radiusNm)
            .sort((x, y) => x.d - y.d)
            .slice(0, maxItems)
            .map(x => x.a);
        const added = found.filter(a => !this.cached.delete(a.id));
        const removed = [...this.cached];
        this.cached.clear();
        found.forEach(a => this.cached.add(a.id));
        return Promise.resolve({sessionId: this.sessionId, searchId: this.searchId++, added, removed});
    }
}

/**
 * In-memory replacement for the SDK FacilityLoader methods that KLNFacilityLoader uses (see ActualFacilityClient).
 */
export class MemoryFacilityClient {
    private readonly byUid = new Map<string, Facility>();
    private readonly trees = new Map<FacilityType, GeoKdTree<Facility>>();
    private readonly airspaces: BoundaryFacility[] = [];
    private nextSessionId = 1;

    constructor(facilities: Facility[] = [], airspaces: BoundaryFacility[] = []) {
        facilities.forEach(f => this.add(f));
        airspaces.forEach(a => this.addAirspace(a));
    }

    public add(fac: Facility): void {
        const type = ICAO.getFacilityTypeFromValue(fac.icaoStruct);
        this.byUid.set(ICAO.getUid(fac.icaoStruct), fac);
        let tree = this.trees.get(type);
        if (tree === undefined) {
            tree = new GeoKdTree(treeKey);
            this.trees.set(type, tree);
        }
        tree.insert(fac);
    }

    /** Adds an airspace (see airspaces.ts). Boundary sessions serve it, also those started before. */
    public addAirspace(airspace: BoundaryFacility): void {
        this.airspaces.push(airspace);
    }

    /**
     * Adds facilities from plain JSON (an array of facility objects). icaoStruct may be given as a V2 ICAO string.
     * @param json
     */
    public addJson(json: string | object[]): void {
        const list = (typeof json === 'string' ? JSON.parse(json) : json) as any[];
        for (const raw of list) {
            const icaoStruct = typeof raw.icaoStruct === 'string' ? ICAO.stringV2ToValue(raw.icaoStruct) : raw.icaoStruct;
            this.add({...raw, icaoStruct} as Facility);
        }
    }

    public all(): Facility[] {
        return Array.from(this.byUid.values());
    }

    public awaitInitialization(): Promise<void> {
        return Promise.resolve();
    }

    public getFacility(_type: FacilityType, icao: IcaoValue | string): Promise<Facility> {
        const value = typeof icao === 'string' ? (icao.length === 19 ? ICAO.stringV2ToValue(icao) : ICAO.stringV1ToValue(icao)) : icao;
        const fac = this.byUid.get(ICAO.getUid(value));
        return fac ? Promise.resolve(fac) : Promise.reject(new Error(`MemoryFacilityClient: no facility ${ICAO.tryValueToStringV2(value)}`));
    }

    public searchByIdentWithIcaoStructs(filter: FacilitySearchType, ident: string, maxItems = 40): Promise<IcaoValue[]> {
        const types = SEARCH_TYPES[filter];
        return Promise.resolve(this.all()
            .filter(f => f.icaoStruct.ident.startsWith(ident))
            .filter(f => types === undefined || types.includes(ICAO.getFacilityTypeFromValue(f.icaoStruct)))
            .map(f => f.icaoStruct)
            .sort((a, b) => a.ident.localeCompare(b.ident))
            .slice(0, maxItems));
    }

    public startNearestSearchSessionWithIcaoStructs(type: FacilitySearchType): Promise<any> {
        const id = this.nextSessionId++;
        if (type === FacilitySearchType.Boundary) {
            return Promise.resolve(new MemoryBoundarySession(this.airspaces, id));
        }
        const facType = SEARCH_TYPES[type]?.[0];
        if (facType === undefined) {
            return Promise.reject(new Error(`MemoryFacilityClient: unsupported nearest search ${type}`));
        }
        let tree = this.trees.get(facType);
        if (tree === undefined) {
            tree = new GeoKdTree(treeKey);
            this.trees.set(facType, tree);
        }
        return Promise.resolve(new MemoryNearestSession(tree, id));
    }
}
