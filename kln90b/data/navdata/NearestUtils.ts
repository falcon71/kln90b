import {
    BitFlags,
    DefaultLodBoundaryCache,
    FacilityClient,
    FacilitySearchType,
    FacilityType,
    LodBoundary,
    NearestBoundarySearchSession,
    NearestIcaoSearchSessionDataType,
    NearestLodBoundarySearchSession,
    NearestSearchSessionTypeMap,
    UnitType,
    VorClass,
    VorFacility,
    VorType,
} from "@microsoft/msfs-sdk";
import {Latitude, Longitude} from "../Units";
import {BoundaryUtils} from "./BoundaryUtils";
import {NearestVorSearch} from "./NearestVorSearch";

//#207: the KLN 89 trainer shows the closest VOR as the reference up to 1000 NM (2026-10-16)
export const REFERENCE_VOR_RADIUS_NM = 1000;
//#204: the 90B guide gives no radius for NAV 2. The KLN 89 trainer found a VOR 190 NM away and none at 196 NM
//(2026-10-16); maintainer ruling, #204: 200 NM
const LOW_HIGH_VOR_RADIUS_NM = 200;

export class NearestUtils {
    private vorSession: NearestSearchSessionTypeMap<NearestIcaoSearchSessionDataType.Struct>[FacilitySearchType.Vor] | undefined;

    private nearestVor: VorFacility | null = null;

    private lowHighVorSearch: NearestVorSearch | undefined;

    private readonly nearestAirspaces = new Map<number, LodBoundary>(); //All airspaces, that are near the plane


    private airspaceSession: NearestLodBoundarySearchSession | undefined;

    public constructor(private readonly facilityLoader: FacilityClient) {
    }

    public async init() {
        this.vorSession = await this.facilityLoader.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Vor);
        this.vorSession!.setVorFilter(
            BitFlags.union(BitFlags.createFlag(VorClass.HighAlt), BitFlags.createFlag(VorClass.LowAlt), BitFlags.createFlag(VorClass.Terminal)),
            BitFlags.union(BitFlags.createFlag(VorType.VOR), BitFlags.createFlag(VorType.VORDME), BitFlags.createFlag(VorType.VORTAC)),
        );

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
     * Returns the nearest VOR to the given location.
     *
     * @param lat
     * @param lon
     */
    public async getNearestVor(lat: Latitude, lon: Longitude): Promise<VorFacility | null> {
        const distanceMeters = UnitType.NMILE.convertTo(REFERENCE_VOR_RADIUS_NM, UnitType.METER);
        const diff = await this.vorSession!.searchNearest(lat, lon, distanceMeters, 1);
        for (const icao of diff.removed) {
            this.nearestVor = null;
        }

        for (const icao of diff.added) {
            this.nearestVor = await this.facilityLoader.getFacility(FacilityType.VOR, icao);
        }

        return this.nearestVor;
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
     * Returns the airspaces at the given location.
     * The result is always the complete list.
     * @param lat
     * @param lon
     * @param radius
     * @param maxItems
     * @param filter
     */
    public async getAirspaces(lat: number, lon: number, radius: number, maxItems: number, filter: number): Promise<LodBoundary[]> {
        this.airspaceSession!.setFilter(filter);
        const result = await this.airspaceSession!.searchNearest(lat, lon, radius, maxItems);
        for (const airspace of result.added) {
            if (BoundaryUtils.isInside(airspace, lat, lon)) { //We need to check this. searchNearest seems to only check the bounding box, which can be huge like CANADA RVSM
                this.nearestAirspaces.set(airspace.facility.id, airspace);
            }
        }
        for (const id of result.removed) {
            this.nearestAirspaces.delete(id);
        }
        return [...this.nearestAirspaces.values()];
    }
}