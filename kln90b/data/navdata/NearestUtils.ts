import {
    BitFlags,
    DefaultLodBoundaryCache,
    FacilityClient,
    FacilitySearchType,
    LodBoundary,
    NearestBoundarySearchSession,
    NearestIcaoSearchSessionDataType,
    NearestLodBoundarySearchSession,
    NearestSearchSessionTypeMap,
    VorClass,
    VorFacility,
    VorType,
} from "@microsoft/msfs-sdk";
import {Latitude, Longitude} from "../Units";
import {AirspaceAreas} from "./AirspaceAreas";
import {BoundaryUtils} from "./BoundaryUtils";
import {NearestVorSearch} from "./NearestVorSearch";

//#207: the KLN 89 trainer shows the closest VOR as the reference up to 1000 NM (2026-10-16)
const REFERENCE_VOR_RADIUS_NM = 1000;
//#204: the 90B guide gives no radius for NAV 2. The KLN 89 trainer found a VOR 190 NM away and none at 196 NM
//(2026-10-16); maintainer ruling, #204: 200 NM
const LOW_HIGH_VOR_RADIUS_NM = 200;

export class NearestUtils {
    private vorSession: NearestSearchSessionTypeMap<NearestIcaoSearchSessionDataType.Struct>[FacilitySearchType.Vor] | undefined;

    private vorSearch: NearestVorSearch | undefined;

    private lowHighVorSearch: NearestVorSearch | undefined;

    private airspaceSession: NearestLodBoundarySearchSession | undefined;

    //#102: the map mirrors the session's current result (every added airspace in, every removed one out), and the
    //searches run one at a time: the session reports each result as the difference from its previous search, and
    //NearestLodBoundarySearchSession builds the boundaries of a search in a throttled queue, so a large search can finish
    //after a later one
    //#410: it hands out one boundary per group of identical copies
    private readonly airspaceMap = new AirspaceAreas();
    private airspaceQueue: Promise<unknown> = Promise.resolve();

    public constructor(private readonly facilityLoader: FacilityClient) {
    }

    public async init() {
        this.vorSession = await this.facilityLoader.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Vor);
        //3-50: the closest VOR, of any class (a user VOR has the class Unknown, #206)
        this.vorSession!.setVorFilter(
            BitFlags.union(BitFlags.createFlag(VorClass.HighAlt), BitFlags.createFlag(VorClass.LowAlt), BitFlags.createFlag(VorClass.Terminal), BitFlags.createFlag(VorClass.Unknown)),
            BitFlags.union(BitFlags.createFlag(VorType.VOR), BitFlags.createFlag(VorType.VORDME), BitFlags.createFlag(VorType.VORTAC)),
        );
        this.vorSearch = new NearestVorSearch(this.facilityLoader, this.vorSession!, REFERENCE_VOR_RADIUS_NM);

        //3-8, 3-32: NAV 2 shows the nearest low or high altitude VOR, never a terminal one (#204)
        const lowHighVorSession = await this.facilityLoader.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Vor);
        lowHighVorSession.setVorFilter(
            BitFlags.union(BitFlags.createFlag(VorClass.HighAlt), BitFlags.createFlag(VorClass.LowAlt)),
            BitFlags.union(BitFlags.createFlag(VorType.VOR), BitFlags.createFlag(VorType.VORDME), BitFlags.createFlag(VorType.VORTAC)),
        );
        this.lowHighVorSearch = new NearestVorSearch(this.facilityLoader, lowHighVorSession, LOW_HIGH_VOR_RADIUS_NM);

        const session = await this.facilityLoader.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Boundary) as NearestBoundarySearchSession;
        this.airspaceSession = new NearestLodBoundarySearchSession(DefaultLodBoundaryCache.getCache(), session, 0.5);

    }

    /**
     * Returns the nearest VOR to the given location, a user VOR included.
     *
     * @param lat
     * @param lon
     */
    public getNearestVor(lat: Latitude, lon: Longitude): Promise<VorFacility | null> {
        //#206: one search at a time, and the nearer one of the database VOR and the user VOR is the reference
        return this.vorSearch!.search(lat, lon);
    }

    /**
     * Returns the nearest low or high altitude VOR to the given location, for NAV 2 (3-8, 3-32).
     *
     * @param lat
     * @param lon
     */
    public getNearestLowHighVor(lat: Latitude, lon: Longitude): Promise<VorFacility | null> {
        return this.lowHighVorSearch!.search(lat, lon);
    }

    /**
     * Returns the airspaces that contain the given point (OTH 2, the APT 1 airspace row)
     * @param lat
     * @param lon
     * @param maxItems
     * @param filter
     */
    public async getAirspacesAt(lat: number, lon: number, maxItems: number, filter: number): Promise<LodBoundary[]> {
        const found = await this.searchAirspaces(lat, lon, 0, maxItems, filter);
        //searchNearest seems to only check the bounding box, which can be huge like CANADA RVSM
        return found.filter(airspace => BoundaryUtils.isInside(airspace, lat, lon));
    }

    /**
     * Returns the airspaces whose bounding box seems to meet the search circle, for the route searches (TRI 2, 4 and 6,
     * CTR 1); the caller checks the geometry
     * @param lat
     * @param lon
     * @param radius in meters
     * @param maxItems
     * @param filter
     */
    public getAirspaces(lat: number, lon: number, radius: number, maxItems: number, filter: number): Promise<LodBoundary[]> {
        return this.searchAirspaces(lat, lon, radius, maxItems, filter);
    }

    private searchAirspaces(lat: number, lon: number, radius: number, maxItems: number, filter: number): Promise<LodBoundary[]> {
        const run = async () => {
            this.airspaceSession!.setFilter(filter);
            const result = await this.airspaceSession!.searchNearest(lat, lon, radius, maxItems);
            for (const id of result.removed) {
                this.airspaceMap.remove(id);
            }
            for (const airspace of result.added) {
                this.airspaceMap.add(airspace);
            }
            return this.airspaceMap.areas();
        };
        const search = this.airspaceQueue.then(run);
        this.airspaceQueue = search.catch(() => undefined);
        return search;
    }
}
