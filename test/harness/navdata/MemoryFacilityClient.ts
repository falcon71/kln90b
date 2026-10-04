import {
    AirportFacility, Facility, FacilitySearchType, FacilityType, GeoKdTree, GeoPoint, ICAO, IcaoValue, LegType, NearestSearchResults,
    UnitType,
} from '@microsoft/msfs-sdk';

const SEARCH_TYPES: Partial<Record<FacilitySearchType, FacilityType[]>> = {
    [FacilitySearchType.Airport]: [FacilityType.Airport],
    [FacilitySearchType.Vor]: [FacilityType.VOR],
    [FacilitySearchType.Ndb]: [FacilityType.NDB],
    [FacilitySearchType.Intersection]: [FacilityType.Intersection],
    [FacilitySearchType.User]: [FacilityType.USR],
};

const treeKey = (fac: Facility, out: Float64Array) => GeoPoint.sphericalToCartesian(fac, out);

/** "MAHAA (W K1)": the ident, then the facility type letter and the region if there is one */
const describeIcao = (icao: IcaoValue) => `${icao.ident.trim()} (${[icao.type, icao.region.trim()].filter(s => s !== '').join(' ')})`;

/**
 * Nearest search with the same added/removed bookkeeping as KLNNearestRepoFacilitySearchSession. Filters are accepted
 * and ignored: every facility of the type is a candidate.
 */
class MemoryNearestSession {
    private readonly cachedResults = new Set<IcaoValue>();
    private searchId = 0;

    constructor(private readonly tree: GeoKdTree<Facility>, public readonly sessionId: number) {
    }

    public searchNearest(lat: number, lon: number, radiusMeters: number, maxItems: number): Promise<NearestSearchResults<IcaoValue, IcaoValue>> {
        const results = this.tree.search(lat, lon, UnitType.METER.convertTo(radiusMeters, UnitType.GA_RADIAN), maxItems, []);
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

    public setAirportFilter(): void {
    }

    public setExtendedAirportFilters(): void {
    }

    public setVorFilter(): void {
    }

    public setFilter(): void {
    }
}

/** Airspace searches find nothing: the fake world has no boundaries yet. */
class EmptyBoundarySession {
    private searchId = 0;

    constructor(public readonly sessionId: number) {
    }

    public searchNearest(): Promise<NearestSearchResults<never, number>> {
        return Promise.resolve({sessionId: this.sessionId, searchId: this.searchId++, added: [], removed: []});
    }

    public setBoundaryFilter(): void {
    }

    public setFilter(): void {
    }
}

/**
 * In-memory replacement for the SDK FacilityLoader methods that KLNFacilityLoader uses (see ActualFacilityClient).
 */
export class MemoryFacilityClient {
    private readonly byUid = new Map<string, Facility>();
    private readonly trees = new Map<FacilityType, GeoKdTree<Facility>>();
    private nextSessionId = 1;

    constructor(facilities: Facility[] = []) {
        facilities.forEach(f => this.add(f));
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

    /** The procedure fixes and arc navaids that are not in the navdata, as "IDENT (type region)", e.g. "MAHAA (W K1)". SidStar loads each with getFacility. */
    public missingProcedureFixes(): string[] {
        const missing = new Set<string>();
        const check = (icao: IcaoValue) => {
            if (icao.ident.trim() !== '' && !this.byUid.has(ICAO.getUid(icao))) missing.add(describeIcao(icao));
        };
        for (const fac of this.all()) {
            if (ICAO.getFacilityTypeFromValue(fac.icaoStruct) !== FacilityType.Airport) continue;
            const apt = fac as AirportFacility;
            const procs = [...apt.departures, ...apt.arrivals];
            const legs = [
                ...procs.flatMap(p => [...p.commonLegs, ...p.enRouteTransitions.flatMap(t => t.legs), ...p.runwayTransitions.flatMap(t => t.legs)]),
                ...apt.approaches.flatMap(a => [...a.finalLegs, ...a.missedLegs, ...a.transitions.flatMap(t => t.legs)]),
            ];
            for (const leg of legs) {
                check(leg.fixIcaoStruct);
                if (leg.type === LegType.AF) check(leg.originIcaoStruct);
            }
        }
        return [...missing];
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
            return Promise.resolve(new EmptyBoundarySession(id));
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
