import {
    AirportClassMask,
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
//#207: the 90B guide gives no radius; the KLN 89's is 200 NM, and the maintainer ruled the same
const NEAREST_SEARCH_RADIUS_NM = 200;

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
        try {
            await this.search();
        } finally {
            //#95: a failed search must not stop every later search
            this.isCalculating = false;
        }
    }

    /**
     * Internally, we concate the coherent result and the results from our local repository. This means, our nearestlist
     * will often be longer than 9 entries. Since it is always sorted by distance, we can simply return the first 9 entries
     */
    public getNearestList(): NearestWpt<FacType>[] {
        return this.nearestList.slice(0, 9);
    }

    private async search(): Promise<void> {
        const distanceMeters = UnitType.NMILE.convertTo(NEAREST_SEARCH_RADIUS_NM, UnitType.METER);
        const diff = await this.session!.searchNearest(this.sensors.in.gps.coords.lat, this.sensors.in.gps.coords.lon, distanceMeters, MAX_ITEMS);

        for (const removedIcao of diff.removed) {
            for (let i = this.nearestList.length - 1; i >= 0; i--) {
                if (ICAO.valueEquals(this.nearestList[i].facility.icaoStruct, removedIcao)) {
                    this.nearestList[i].index = -1;
                    this.nearestList.splice(i, 1);
                }
            }
        }

        //#95: a facility that cannot be loaded is left out; the others of the same search are listed
        const addedFacilities = await Promise.all(diff.added.map(addedIcao => this.facilityLoader.tryGetFacility(this.facilityType, addedIcao)));
        for (const addedFacility of addedFacilities) {
            if (addedFacility === null) {
                continue;
            }
            this.nearestList.push({
                facility: addedFacility as any,
                //Those values will be calculated in updateBearingDistance
                bearingToTrue: 0,
                distance: 0,
                index: 0,
            });
        }
        this.updateBearingDistance();
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
        const surfaceTypeSetting = this.userSettings.getSetting("nearestAptSurface").get();
        this.session?.setAirportFilter(false, this.getAirportClassMask(surfaceTypeSetting)); //This filters out helipads
        this.session!.setExtendedAirportFilters(
            this.getSurfaceMask(surfaceTypeSetting),
            NearestAirportSearchSession.Defaults.ApproachTypeMask,
            NearestAirportSearchSession.Defaults.ToweredMask,
            UnitType.FOOT.convertTo(this.userSettings.getSetting("nearestAptMinRunwayLength").get(), UnitType.METER),
        );
    }

    protected initFilters(session: NearestSearchSessionTypeMap<NearestIcaoSearchSessionDataType.Struct>[FacilitySearchType.Airport]): void {
        this.updateFilters();
    }

    private getAirportClassMask(surfaceType: boolean): number {
        switch (surfaceType) {
            case SURFACE_HRD_SFT:
                return AirportClassMask.HardSurface | AirportClassMask.SoftSurface;
            case SURFACE_HRD:
                return AirportClassMask.HardSurface;
        }
    }


    private getSurfaceMask(surfaceType: boolean): number {
        switch (surfaceType) {
            case SURFACE_HRD_SFT:
                return BitFlags.union(
                    //hard
                    BitFlags.createFlag(RunwaySurfaceType.Concrete),
                    BitFlags.createFlag(RunwaySurfaceType.Asphalt),
                    BitFlags.createFlag(RunwaySurfaceType.Tarmac),
                    BitFlags.createFlag(RunwaySurfaceType.Brick),
                    BitFlags.createFlag(RunwaySurfaceType.Bituminous),
                    BitFlags.createFlag(RunwaySurfaceType.Macadam), //#270: the maintainer ruled macadam a hard surface, as the SDK classes it
                    //soft
                    BitFlags.createFlag(RunwaySurfaceType.HardTurf),
                    BitFlags.createFlag(RunwaySurfaceType.Gravel),
                    BitFlags.createFlag(RunwaySurfaceType.Sand),
                    BitFlags.createFlag(RunwaySurfaceType.Dirt),
                    BitFlags.createFlag(RunwaySurfaceType.Ice),
                    BitFlags.createFlag(RunwaySurfaceType.SteelMats),
                    BitFlags.createFlag(RunwaySurfaceType.Shale),
                    BitFlags.createFlag(RunwaySurfaceType.Snow),

                    BitFlags.createFlag(RunwaySurfaceType.Grass),
                    BitFlags.createFlag(RunwaySurfaceType.GrassBumpy),
                    BitFlags.createFlag(RunwaySurfaceType.ShortGrass),
                    BitFlags.createFlag(RunwaySurfaceType.LongGrass),
                );
            case SURFACE_HRD:
                return BitFlags.union(
                    BitFlags.createFlag(RunwaySurfaceType.Concrete),
                    BitFlags.createFlag(RunwaySurfaceType.Asphalt),
                    BitFlags.createFlag(RunwaySurfaceType.Tarmac),
                    BitFlags.createFlag(RunwaySurfaceType.Brick),
                    BitFlags.createFlag(RunwaySurfaceType.Bituminous),
                    BitFlags.createFlag(RunwaySurfaceType.Macadam), //#270: the maintainer ruled macadam a hard surface, as the SDK classes it
                );
        }
    }

}

export class VorNearestList extends NearestList<FacilitySearchType.Vor, VorFacility> {
    protected initFilters(session: NearestSearchSessionTypeMap<NearestIcaoSearchSessionDataType.Struct>[FacilitySearchType.Vor]): void {
        //#204: the list holds VORs of every class (3-22, 3-49; Super NAV 5 TLH, 3-37). NAV 2 searches its own
        //(NearestUtils.getNearestLowHighVor)
        session.setVorFilter(
            BitFlags.union(BitFlags.createFlag(VorClass.HighAlt), BitFlags.createFlag(VorClass.LowAlt), BitFlags.createFlag(VorClass.Terminal), BitFlags.createFlag(VorClass.Unknown)),
            BitFlags.union(BitFlags.createFlag(VorType.VOR), BitFlags.createFlag(VorType.VORDME), BitFlags.createFlag(VorType.VORTAC)),
        );
    }
}


export class NdbNearestList extends NearestList<FacilitySearchType.Ndb, NdbFacility> {
    protected initFilters(session: NearestSearchSessionTypeMap<NearestIcaoSearchSessionDataType.Struct>[FacilitySearchType.Ndb]): void {
    }
}

/**
 * If facility is a NearestFacility, then this return the internal facility
 * @protected
 */
export function unpackFacility<T extends Facility>(facility: T | NearestWpt<T>): T;
export function unpackFacility<T extends Facility>(facility: T | NearestWpt<T> | null): T | null;
export function unpackFacility<T extends Facility>(facility: T | NearestWpt<T> | null): T | null {
    if (isNearestWpt(facility)) {
        return facility.facility;
    } else {
        return facility;
    }
}

export function isNearestWpt<T extends Facility>(wpt: NearestWpt<T> | T | null): wpt is NearestWpt<T> {
    return wpt !== null && "facility" in wpt;
}