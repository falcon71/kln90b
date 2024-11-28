import {
    AirportFacility,
    BitFlags,
    Facility,
    FacilityClient,
    FacilitySearchType,
    FacilityType,
    GeoPoint,
    ICAO,
    NdbFacility,
    NearestAirportSearchSession,
    NearestIcaoSearchSessionDataType,
    NearestSearchSessionTypeMap,
    RunwaySurfaceCategory,
    RunwaySurfaceType,
    UnitType,
    VorClass,
    VorFacility,
    VorType,
} from "@microsoft/msfs-sdk";
import {Sensors} from "../../Sensors";
import {KLN90BUserSettings, SURFACE_HRD, SURFACE_HRD_SFT} from "../../settings/KLN90BUserSettings";
import {CalcTickable, TICK_TIME_CALC} from "../../TickController";

const NEAREST_TICK_TIME = 10000;
const MAX_ITEMS = 9;

type NearestSearchType = FacilitySearchType.Airport | FacilitySearchType.Vor | FacilitySearchType.Ndb;

export class Nearestlists {
    public readonly aptNearestList: AirportNearestList;
    public readonly vorNearestList: VorNearestList;
    public readonly ndbNearestList: NdbNearestList;


    constructor(facilityLoader: FacilityClient, sensors: Sensors, userSettings: KLN90BUserSettings) {
        this.aptNearestList = new AirportNearestList(facilityLoader, sensors, FacilitySearchType.Airport, FacilityType.Airport, userSettings);
        this.vorNearestList = new VorNearestList(facilityLoader, sensors, FacilitySearchType.Vor, FacilityType.VOR, userSettings);
        this.ndbNearestList = new NdbNearestList(facilityLoader, sensors, FacilitySearchType.Ndb, FacilityType.NDB, userSettings);
    }

    public init() {
        return Promise.all([this.aptNearestList.init(), this.vorNearestList.init(), this.ndbNearestList.init()]);
    }
}

export interface NearestWpt<T extends Facility> {
    facility: T,
    bearingToTrue: number,
    distance: number,
    index: number,
}


abstract class NearestList<SearchType extends NearestSearchType, FacType extends Facility> implements CalcTickable {
    protected session: NearestSearchSessionTypeMap<NearestIcaoSearchSessionDataType.Struct>[SearchType] | undefined;

    private nearestList: NearestWpt<FacType>[] = [];

    private tickTimer: number = 0;
    private isCalculating: boolean = false;

    public constructor(private readonly facilityLoader: FacilityClient, private readonly sensors: Sensors, private readonly searchType: SearchType, private readonly facilityType: FacilityType, protected userSettings: KLN90BUserSettings) {
    }

    public async init() {
        this.session = await this.facilityLoader.startNearestSearchSessionWithIcaoStructs(this.searchType);
        this.initFilters(this.session);
    }

    public async tick() {
        this.tickTimer += TICK_TIME_CALC;
        if (this.isCalculating) {
            return;
        } else if (this.tickTimer < NEAREST_TICK_TIME) {
            this.updateBearingDistance();
            return;
        }

        //This stuff is very expensive, and is only run every 10 seconds
        this.isCalculating = true;
        this.tickTimer = 0;

        const distanceMeters = UnitType.NMILE.convertTo(500, UnitType.METER);
        const diff = await this.session!.searchNearest(this.sensors.in.gps.coords.lat, this.sensors.in.gps.coords.lon, distanceMeters, MAX_ITEMS);

        for (const removedIcao of diff.removed) {
            for (let i = 0; i < this.nearestList.length; i++) {
                if (ICAO.valueEquals(this.nearestList[i].facility.icaoStruct, removedIcao)) {
                    this.nearestList[i].index = -1;
                    this.nearestList.splice(i, 1);
                }
            }
        }

        const addedFacilities = await Promise.all(diff.added.map(addedIcao => this.facilityLoader.getFacility(this.facilityType, addedIcao)));

        for (const addedFacility of addedFacilities) {
            this.nearestList.push({
                facility: addedFacility as any,
                //Those values will be calculated in updateBearingDistance
                bearingToTrue: 0,
                distance: 0,
                index: 0,
            });

        }
        this.updateBearingDistance();
        this.isCalculating = false;
    }

    /**
     * Internally, we concate the coherent result and the results from our local repository. This means, our nearestlist
     * will often be longer than 9 entries. Since it is always sorted by distance, we can simply return the first 9 entries
     */
    public getNearestList(): NearestWpt<FacType>[] {
        return this.nearestList.slice(0, 9);
    }

    protected abstract initFilters(session: NearestSearchSessionTypeMap<NearestIcaoSearchSessionDataType.Struct>[SearchType]): void;

    private updateBearingDistance() {
        for (const wpt of this.nearestList) {
            const wptCoords = new GeoPoint(wpt.facility.lat, wpt.facility.lon);
            wpt.distance = UnitType.GA_RADIAN.convertTo(this.sensors.in.gps.coords.distance(wptCoords), UnitType.NMILE);
            wpt.bearingToTrue = this.sensors.in.gps.coords.bearingTo(wptCoords);
        }
        this.nearestList.sort(this.sortByDistanceFunction.bind(this));

        for (let i = 0; i < this.nearestList.length; i++) {
            this.nearestList[i].index = i;
        }
    }

    private sortByDistanceFunction(a: NearestWpt<FacType>, b: NearestWpt<FacType>): number {
        return a.distance - b.distance;
    }

}

export class AirportNearestList extends NearestList<FacilitySearchType.Airport, AirportFacility> {

    public updateFilters(): void {
        this.session!.setExtendedAirportFilters(
            this.getSurfaceMask(this.userSettings.getSetting("nearestAptSurface").get()),
            NearestAirportSearchSession.Defaults.ApproachTypeMask,
            NearestAirportSearchSession.Defaults.ToweredMask,
            UnitType.FOOT.convertTo(this.userSettings.getSetting("nearestAptMinRunwayLength").get(), UnitType.METER),
        );
    }

    protected initFilters(session: NearestSearchSessionTypeMap<NearestIcaoSearchSessionDataType.Struct>[FacilitySearchType.Airport]): void {
        this.updateFilters();
    }

    private getSurfaceMask(surfaceType: boolean): number {
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
        return surfaceTypeMask;
    }

}

export class VorNearestList extends NearestList<FacilitySearchType.Vor, VorFacility> {
    protected initFilters(session: NearestSearchSessionTypeMap<NearestIcaoSearchSessionDataType.Struct>[FacilitySearchType.Vor]): void {
        session.setVorFilter(
            BitFlags.union(BitFlags.createFlag(VorClass.HighAlt), BitFlags.createFlag(VorClass.LowAlt)),
            BitFlags.union(BitFlags.createFlag(VorType.VOR), BitFlags.createFlag(VorType.VORDME), BitFlags.createFlag(VorType.VORTAC)),
        );
    }
}


export class NdbNearestList extends NearestList<FacilitySearchType.Ndb, NdbFacility> {
    protected initFilters(session: NearestSearchSessionTypeMap<NearestIcaoSearchSessionDataType.Struct>[FacilitySearchType.Ndb]): void {
    }
}