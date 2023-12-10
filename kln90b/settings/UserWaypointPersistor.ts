import {
    AirportFacility,
    AirportPrivateType,
    AirportRunway,
    DefaultUserSettingManager,
    EventBus,
    Facility,
    FacilityFrequencyType,
    FacilityType,
    GpsBoolean,
    ICAO,
    IntersectionFacility,
    NdbFacility,
    NdbType,
    RunwayLightingType,
    RunwaySurfaceType,
    UnitType,
    UserFacility,
    UserFacilityType,
    VorClass,
    VorFacility,
    VorType,
} from "@microsoft/msfs-sdk";
import {
    FacilityRepositorySyncData,
    FacilityRepositorySyncType,
    KLNFacilityRepository,
} from "../data/navdata/KLNFacilityRepository";
import {KLN90BUserWaypointsSettings, KLN90BUserWaypointsTypes, MAX_USER_WAYPOINTS} from "./KLN90BUserWaypoints";
import {format} from "numerable";

export class UserWaypointPersistor {
    private manager: DefaultUserSettingManager<KLN90BUserWaypointsTypes>;


    constructor(private bus: EventBus, private repo: KLNFacilityRepository) {
        bus.getSubscriber<any>().on(KLNFacilityRepository.SYNC_TOPIC).handle(this.persistWaypoints.bind(this));
        this.manager = KLN90BUserWaypointsSettings.getManager(bus);
    }

    public restoreWaypoints() {
        const wpts = this.deserializeAllWpts();
        for (const wpt of wpts) {
            this.repo.add(wpt);
        }
    }

    private persistWaypoints(data: FacilityRepositorySyncData) {
        if (data.type !== FacilityRepositorySyncType.Add && data.type !== FacilityRepositorySyncType.Remove && data.type !== FacilityRepositorySyncType.Update) {
            return;
        }
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

    private getWptList(): Facility[] {
        const wpts: Facility[] = [];
        this.repo.forEach(w => wpts.push(w));
        return wpts;
    }

    private serializeWpt(wpt: Facility): string {
        switch (ICAO.getFacilityType(wpt.icao)) {
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
        return wpt.icao + this.serializetLat(wpt.lat) + this.serializetLon(wpt.lon)
            // @ts-ignore
            + format(wpt.altitude, "+00000", {zeroFormat: "+00000"})
            + this.serializeRunway(wpt.runways[0]);
    }

    private serializeRunway(rwy: AirportRunway): string {
        return format(UnitType.METER.convertTo(rwy.length, UnitType.FOOT), "+00000", {zeroFormat: "+00000"}) + this.serializeRunwaySurface(rwy.surface);
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
        return wpt.icao + this.serializetLat(wpt.lat) + this.serializetLon(wpt.lon) + format(wpt.freqMHz, "+000.00") + format(wpt.magneticVariation, "+00");
    }

    private serializeNdb(wpt: NdbFacility): string {
        return wpt.icao + this.serializetLat(wpt.lat) + this.serializetLon(wpt.lon) + format(wpt.freqMHz, "+0000.0");
    }

    private serializeIntersection(wpt: IntersectionFacility): string {
        return wpt.icao + this.serializetLat(wpt.lat) + this.serializetLon(wpt.lon);
    }

    private serializeSupplementary(wpt: UserFacility): string {
        return wpt.icao + this.serializetLat(wpt.lat) + this.serializetLon(wpt.lon);
    }

    /**
     * Our coordinates are in degress, but we store them in degress and decimalminutes
     * @param lat
     * @private
     */
    private serializetLat(lat: number): string {
        const degreesString = format(lat, "+00", {rounding: "truncate", zeroFormat: "+00"});

        const minutes = (Math.abs(lat) % 1) * 60;
        const minutesString = format(minutes, "00.00");
        return degreesString + minutesString;
    }

    /**
     * Our coordinates are in degress, but we store them in degress and decimalminutes
     * @param lon
     * @private
     */
    private serializetLon(lon: number): string {
        const degreesString = format(lon, "+000", {rounding: "truncate", zeroFormat: "+000"});

        const minutes = (Math.abs(lon) % 1) * 60;
        const minutesString = format(minutes, "00.00");
        return degreesString + minutesString;
    }

    private deserializeAllWpts(): Facility[] {
        const wpts: Facility[] = [];
        for (let i = 0; i < MAX_USER_WAYPOINTS; i++) {
            const setting = this.manager.getSetting(`wpt${i}`);
            const serialized = setting.get();
            if (serialized !== "") {
                wpts.push(this.deserializeFacility(serialized));
            }
        }
        console.log("Restored user waypoints", wpts);

        return wpts;
    }

    private deserializeFacility(str: string): Facility {
        console.log("restoring", str);
        switch (ICAO.getFacilityType(str)) {
            case FacilityType.Airport:
                return this.deserializeAirport(str);
            case FacilityType.VOR:
                return this.deserializeVor(str);
            case FacilityType.NDB:
                return this.deserializeNdb(str);
            case FacilityType.Intersection:
                return this.deserializeIntersection(str);
            case FacilityType.USR:
                return this.deserializeSupplementary(str);
            default:
                throw new Error(`Unsupported facility type: ${str}`);
        }
    }


    private deserializeAirport(str: string): AirportFacility {
        return {
            icao: this.deserializeIceo(str),
            name: "",
            lat: this.deserializeLat(str),
            lon: this.deserializeLon(str),
            region: "XX",
            city: "",
            magvar: 0,
            airportPrivateType: AirportPrivateType.Uknown,
            fuel1: "",
            fuel2: "",
            bestApproach: "",
            radarCoverage: GpsBoolean.Unknown,
            airspaceType: 0,
            airportClass: 0,
            towered: false,
            frequencies: [],
            runways: [this.deserializeRunway(str)],
            departures: [],
            approaches: [],
            arrivals: [],
            // @ts-ignore
            altitude: Number(str.substring(29, 35)),
        };
    }

    private deserializeRunway(str: string): AirportRunway {
        return {
            latitude: this.deserializeLat(str),
            longitude: this.deserializeLon(str),
            elevation: 0,
            direction: 0,
            designation: "18-36",
            length: UnitType.FOOT.convertTo(Number(str.substring(35, 41)), UnitType.METER),
            width: 0,
            surface: this.deserializeSurface(str),
            lighting: RunwayLightingType.Unknown,
            designatorCharPrimary: RunwayDesignator.RUNWAY_DESIGNATOR_NONE,
            designatorCharSecondary: RunwayDesignator.RUNWAY_DESIGNATOR_NONE,
            primaryILSFrequency: {
                icao: "",
                name: "",
                freqMHz: 0,
                freqBCD16: 0,
                type: FacilityFrequencyType.None,
                hasGlideslope: false,
                glideslopeAngle: 0,
                localizerCourse: 0,
                magvar: 0,
            },
            secondaryILSFrequency: {
                icao: "",
                name: "",
                freqMHz: 0,
                freqBCD16: 0,
                type: FacilityFrequencyType.None,
                hasGlideslope: false,
                glideslopeAngle: 0,
                localizerCourse: 0,
                magvar: 0,
            },
            primaryElevation: 0,
            primaryThresholdLength: 0,
            secondaryElevation: 0,
            secondaryThresholdLength: 0,
        }
    }

    private deserializeVor(str: string): VorFacility {
        return {
            icao: this.deserializeIceo(str),
            name: "",
            lat: this.deserializeLat(str),
            lon: this.deserializeLon(str),
            region: "XX",
            city: "",
            magvar: 0,
            freqMHz: this.deserializeFrequency(str),
            freqBCD16: 0,
            magneticVariation: Number(str.substring(36, 39)),
            type: VorType.Unknown,
            vorClass: VorClass.Unknown,
        };
    }

    private deserializeNdb(str: string): NdbFacility {
        return {
            icao: this.deserializeIceo(str),
            name: "",
            lat: this.deserializeLat(str),
            lon: this.deserializeLon(str),
            region: "XX",
            city: "",
            magvar: 0,
            freqMHz: this.deserializeFrequency(str),
            type: NdbType.H,
        };
    }

    private deserializeIntersection(str: string): IntersectionFacility {
        return {
            icao: this.deserializeIceo(str),
            name: "",
            lat: this.deserializeLat(str),
            lon: this.deserializeLon(str),
            region: "XX",
            city: "",
            magvar: 0,
            routes: [],
            nearestVorICAO: "",
            nearestVorType: VorType.Unknown,
            nearestVorFrequencyBCD16: 0,
            nearestVorFrequencyMHz: 0,
            nearestVorTrueRadial: 0,
            nearestVorMagneticRadial: 0,
            nearestVorDistance: 0,
        };
    }

    private deserializeSupplementary(str: string): UserFacility {
        return {
            icao: this.deserializeIceo(str),
            name: "",
            lat: this.deserializeLat(str),
            lon: this.deserializeLon(str),
            region: "XX",
            city: "",
            magvar: 0,
            isTemporary: false,
            userFacilityType: UserFacilityType.LAT_LONG,
        };
    }

    private deserializeIceo(str: string): string {
        return str.substring(0, 12);
    }

    private deserializeLat(str: string): number {
        const degrees = Number(str.substring(12, 15));
        const minutes = Number(str.substring(15, 20)) / 60;

        return degrees + (degrees >= 0 ? minutes : -minutes);
    }

    private deserializeLon(str: string): number {
        const degrees = Number(str.substring(20, 24));
        const minutes = Number(str.substring(24, 29)) / 60;

        return degrees + (degrees >= 0 ? minutes : -minutes);
    }

    private deserializeFrequency(str: string): number {
        return Number(str.substring(29, 36));
    }

    private deserializeSurface(str: string): RunwaySurfaceType {
        switch (str.substring(41, 42)) {
            case "-":
                return RunwaySurfaceType.WrightFlyerTrack;
            case "H":
                return RunwaySurfaceType.Asphalt;
            case "S":
                return RunwaySurfaceType.Grass;
            default:
                throw Error(`Unexpoected runwaySurface:${str.substring(48, 49)}`);
        }

    }
}