import {
    AirportFacility,
    AirportRunway,
    DefaultUserSettingManager,
    EventBus,
    Facility,
    FacilityType,
    ICAO,
    IntersectionFacility,
    NdbFacility,
    RunwaySurfaceType,
    UnitType,
    UserFacility,
    VorFacility,
} from "@microsoft/msfs-sdk";
import {
    FacilityRepositorySyncData,
    FacilityRepositorySyncType,
    KLNFacilityRepository,
} from "../data/navdata/KLNFacilityRepository";
import {KLN90BUserWaypointsSettings, KLN90BUserWaypointsTypes, MAX_USER_WAYPOINTS} from "./KLN90BUserWaypoints";
import {padFixed, padInt, withSign} from "../data/NumberFormat";
import {UserWaypointLoaderV2} from "./UserWaypointLoaderV2";
import {KLN90BUserSettings} from "./KLN90BUserSettings";
import {UserWaypointLoaderV1} from "./UserWaypointLoaderV1";

export interface UserWaypointLoader {
    restoreWaypoints(): void;
}


export class UserWaypointPersistor {
    private manager: DefaultUserSettingManager<KLN90BUserWaypointsTypes>;

    private v1Loader: UserWaypointLoader;
    private v2Loader: UserWaypointLoader;

    private ignoreSync = false;


    constructor(bus: EventBus, private repo: KLNFacilityRepository, private readonly userSettings: KLN90BUserSettings) {
        bus.getSubscriber<any>().on(KLNFacilityRepository.SYNC_TOPIC).handle(this.persistWaypoints.bind(this));
        this.manager = KLN90BUserWaypointsSettings.getManager(bus);
        this.v1Loader = new UserWaypointLoaderV1(bus, repo);
        this.v2Loader = new UserWaypointLoaderV2(bus, repo);
    }

    public restoreWaypoints() {
        //Adding the restored waypoints to the repository fires the sync, which would rewrite the slots again and again
        this.ignoreSync = true;
        try {
            if (this.userSettings.getSetting("userDataFormat").get() === 2) {
                this.v2Loader.restoreWaypoints();
            } else {
                this.v1Loader.restoreWaypoints();
            }
        } finally {
            this.ignoreSync = false;
        }
    }

    public persistAllWaypoints() {
        const wpts = this.getWptList();
        for (let i = 0; i < MAX_USER_WAYPOINTS; i++) {
            const setting = this.manager.getSetting(`wpt${i}`);
            if (i < wpts.length) {
                const serialized = this.serializeWpt(wpts[i]);
                console.log("serialized", i, serialized);
                setting.set(serialized);
            } else {
                setting.set("");
            }
        }
    }

    private persistWaypoints(data: FacilityRepositorySyncData) {
        if (this.ignoreSync) {
            return;
        }
        if (data.type !== FacilityRepositorySyncType.Add && data.type !== FacilityRepositorySyncType.Remove && data.type !== FacilityRepositorySyncType.Update) {
            return;
        }
        this.persistAllWaypoints();
    }

    private getWptList(): Facility[] {
        const wpts: Facility[] = [];
        this.repo.forEach(w => wpts.push(w));
        return wpts;
    }

    private serializeWpt(wpt: Facility): string {
        switch (ICAO.getFacilityTypeFromValue(wpt.icaoStruct)) {
            case FacilityType.Airport:
                return this.serializeApt(wpt as AirportFacility);
            case FacilityType.VOR:
                return this.serializeVor(wpt as VorFacility);
            case FacilityType.NDB:
                return this.serializeNdb(wpt as NdbFacility);
            case FacilityType.Intersection:
                return this.serializeIntersection(wpt as IntersectionFacility);
            case FacilityType.USR:
                return this.serializeSupplementary(wpt as UserFacility);
            default:
                throw new Error(`Unsupported facility type: ${wpt}`);
        }
    }

    private serializeApt(wpt: AirportFacility): string {
        return ICAO.valueToStringV2(wpt.icaoStruct) + this.serializetLat(wpt.lat) + this.serializetLon(wpt.lon)
            // @ts-ignore
            + withSign(wpt.altitude, padInt(Math.abs(wpt.altitude), 5))
            + this.serializeRunway(wpt.runways[0]);
    }

    private serializeRunway(rwy: AirportRunway): string {
        const lengthFeet = UnitType.METER.convertTo(rwy.length, UnitType.FOOT);
        return withSign(lengthFeet, padInt(Math.abs(lengthFeet), 5)) + this.serializeRunwaySurface(rwy.surface);
    }

    private serializeRunwaySurface(surface: RunwaySurfaceType): string {
        switch (surface) {
            case RunwaySurfaceType.WrightFlyerTrack:
                return "-";
            case RunwaySurfaceType.Asphalt:
                return "H";
            case RunwaySurfaceType.Grass:
                return "S";
            default:
                throw new Error(`Unexpected runway surface: ${surface}`);
        }
    }

    private serializeVor(wpt: VorFacility): string {
        return ICAO.valueToStringV2(wpt.icaoStruct) + this.serializetLat(wpt.lat) + this.serializetLon(wpt.lon) + withSign(wpt.freqMHz, padFixed(wpt.freqMHz, 3, 2)) + withSign(wpt.magneticVariation, padInt(Math.abs(wpt.magneticVariation), 2));
    }

    private serializeNdb(wpt: NdbFacility): string {
        return ICAO.valueToStringV2(wpt.icaoStruct) + this.serializetLat(wpt.lat) + this.serializetLon(wpt.lon) + withSign(wpt.freqMHz, padFixed(wpt.freqMHz, 4, 1));
    }

    private serializeIntersection(wpt: IntersectionFacility): string {
        return ICAO.valueToStringV2(wpt.icaoStruct) + this.serializetLat(wpt.lat) + this.serializetLon(wpt.lon);
    }

    private serializeSupplementary(wpt: UserFacility): string {
        return ICAO.valueToStringV2(wpt.icaoStruct) + this.serializetLat(wpt.lat) + this.serializetLon(wpt.lon);
    }

    /**
     * Our coordinates are in degress, but we store them in degress and decimalminutes
     * @param lat
     * @private
     */
    private serializetLat(lat: number): string {
        const degreesString = withSign(lat, padInt(Math.trunc(Math.abs(lat)), 2));

        const minutes = (Math.abs(lat) % 1) * 60;
        const minutesString = padFixed(minutes, 2, 2);
        return degreesString + minutesString;
    }

    /**
     * Our coordinates are in degress, but we store them in degress and decimalminutes
     * @param lon
     * @private
     */
    private serializetLon(lon: number): string {
        const degreesString = withSign(lon, padInt(Math.trunc(Math.abs(lon)), 3));

        const minutes = (Math.abs(lon) % 1) * 60;
        const minutesString = padFixed(minutes, 2, 2);
        return degreesString + minutesString;
    }

}