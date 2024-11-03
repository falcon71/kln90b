import {
    AirportFacility,
    BitFlags,
    Facility,
    FacilitySearchType,
    FacilityType,
    GeoPoint,
    NdbFacility,
    UnitType,
    VorClass,
    VorFacility,
    VorType,
} from "@microsoft/msfs-sdk";
import {Sensors} from "../../Sensors";
import {KLNFacilityLoader, KLNSessionTypeMap} from "./KLNFacilityLoader";
import {KLN90BUserSettings} from "../../settings/KLN90BUserSettings";
import {CalcTickable, TICK_TIME_CALC} from "../../TickController";

const NEAREST_TICK_TIME = 10000;
const MAX_ITEMS = 9;

type NearestSearchType = FacilitySearchType.Airport | FacilitySearchType.Vor | FacilitySearchType.Ndb;

export class Nearestlists {
    public readonly aptNearestList: AirportNearestList;
    public readonly vorNearestList: VorNearestList;
    public readonly ndbNearestList: NdbNearestList;


    constructor(facilityLoader: KLNFacilityLoader, sensors: Sensors, userSettings: KLN90BUserSettings) {
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
    protected session: KLNSessionTypeMap[SearchType] | undefined;

    private nearestList: NearestWpt<FacType>[] = [];

    private tickTimer: number = 0;
    private isCalculating: boolean = false;

    public constructor(private readonly facilityLoader: KLNFacilityLoader, private readonly sensors: Sensors, private readonly searchType: SearchType, private readonly facilityType: FacilityType, protected userSettings: KLN90BUserSettings) {
    }

    public async init() {
        this.session = await this.facilityLoader.startNearestSearchSession(this.searchType) as KLNSessionTypeMap[SearchType];
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
                if (this.nearestList[i].facility.icao === removedIcao) {
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

    protected abstract initFilters(session: KLNSessionTypeMap[SearchType]): void;

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
        this.session!.setAirportFilters(
            this.userSettings.getSetting("nearestAptSurface").get(),
            this.userSettings.getSetting("nearestAptMinRunwayLength").get(),
        );
    }

    protected initFilters(session: KLNSessionTypeMap[FacilitySearchType.Airport]): void {
        this.updateFilters();
    }

}

export class VorNearestList extends NearestList<FacilitySearchType.Vor, VorFacility> {
    protected initFilters(session: KLNSessionTypeMap[FacilitySearchType.Vor]): void {
        session.setVorFilter(
            BitFlags.union(BitFlags.createFlag(VorClass.HighAlt), BitFlags.createFlag(VorClass.LowAlt)),
            BitFlags.union(BitFlags.createFlag(VorType.VOR), BitFlags.createFlag(VorType.VORDME), BitFlags.createFlag(VorType.VORTAC)),
        );
    }
}


export class NdbNearestList extends NearestList<FacilitySearchType.Ndb, NdbFacility> {
    protected initFilters(session: KLNSessionTypeMap[FacilitySearchType.Ndb]): void {
    }
}