import {
    BitFlags,
    DefaultLodBoundaryCache,
    FacilitySearchType,
    FacilityType,
    LodBoundary,
    NearestLodBoundarySearchSession,
    UnitType,
    VorClass,
    VorFacility,
    VorType,
} from "@microsoft/msfs-sdk";
import {Latitude, Longitude} from "../Units";
import {KLNFacilityLoader, KLNNearestVorSearchSession} from "./KLNFacilityLoader";

export class NearestUtils {
    private vorSession: KLNNearestVorSearchSession | undefined;

    private nearestVor: VorFacility | null = null;


    private readonly nearestAirspaces = new Map<number, LodBoundary>(); //All airspaces, that are near the plane


    private airspaceSession: NearestLodBoundarySearchSession | undefined;

    public constructor(private readonly facilityLoader: KLNFacilityLoader) {
    }

    public async init() {
        this.vorSession = await this.facilityLoader.startNearestSearchSession(FacilitySearchType.Vor);
        await this.vorSession!.setVorFilter(
            BitFlags.union(BitFlags.createFlag(VorClass.HighAlt), BitFlags.createFlag(VorClass.LowAlt), BitFlags.createFlag(VorClass.Terminal)),
            BitFlags.union(BitFlags.createFlag(VorType.VOR), BitFlags.createFlag(VorType.VORDME), BitFlags.createFlag(VorType.VORTAC)),
        );

        const settion = await this.facilityLoader.startNearestSearchSession(FacilitySearchType.Boundary);
        this.airspaceSession = new NearestLodBoundarySearchSession(DefaultLodBoundaryCache.getCache(), settion, 0.5);

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
            this.nearestAirspaces.set(airspace.facility.id, airspace);
        }
        for (const id of result.removed) {
            this.nearestAirspaces.delete(id);
        }
        return [...this.nearestAirspaces.values()];
    }
}