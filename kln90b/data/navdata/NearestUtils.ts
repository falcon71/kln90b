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

export class NearestUtils {
    private vorSession: NearestSearchSessionTypeMap<NearestIcaoSearchSessionDataType.Struct>[FacilitySearchType.Vor] | undefined;

    private nearestVor: VorFacility | null = null;


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
        const distanceMeters = UnitType.NMILE.convertTo(100, UnitType.METER);
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