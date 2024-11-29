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
    LandingSystemCategory,
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

    private ignoreSync = false;


    constructor(private bus: EventBus, private repo: KLNFacilityRepository) {
        bus.getSubscriber<any>().on(KLNFacilityRepository.SYNC_TOPIC).handle(this.persistWaypoints.bind(this));
        this.manager = KLN90BUserWaypointsSettings.getManager(bus);
    }

    public restoreWaypoints() {
        const wpts = this.deserializeAllWpts();
        this.ignoreSync = true;
        for (const wpt of wpts) {
            this.repo.add(wpt);
        }
        this.ignoreSync = false;
    }

    private persistWaypoints(data: FacilityRepositorySyncData) {
        if (this.ignoreSync) {
            return;
        }
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
        return ICAO.valueToStringV2(wpt.icaoStruct) + this.serializetLat(wpt.lat) + this.serializetLon(wpt.lon) + format(wpt.freqMHz, "+000.00") + format(wpt.magneticVariation, "+00");
    }

    private serializeNdb(wpt: NdbFacility): string {
        return ICAO.valueToStringV2(wpt.icaoStruct) + this.serializetLat(wpt.lat) + this.serializetLon(wpt.lon) + format(wpt.freqMHz, "+0000.0");
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
        const degreesString = format(lat, "+00", {rounding: "truncate", zeroFormat: "+00", signedZero: true});

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
        const degreesString = format(lon, "+000", {rounding: "truncate", zeroFormat: "+000", signedZero: true});

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
        switch (ICAO.getFacilityTypeFromStringV2(str)) {
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
        const icao = this.deserializeIcao(str);
        const icaoStruct = ICAO.stringV2ToValue(icao);
        // noinspection JSDeprecatedSymbols
        return {
            icao: icao,
            icaoStruct: icaoStruct,
            name: "",
            lat: this.deserializeLat(str),
            lon: this.deserializeLon(str),
            region: icaoStruct.region,
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
            altitude: Number(str.substring(36, 42)),
        };
    }

    private deserializeRunway(str: string): AirportRunway {
        // noinspection JSDeprecatedSymbols
        return {
            latitude: this.deserializeLat(str),
            longitude: this.deserializeLon(str),
            elevation: 0,
            direction: 0,
            designation: "18-36",
            length: UnitType.FOOT.convertTo(Number(str.substring(42, 48)), UnitType.METER),
            width: 0,
            surface: this.deserializeSurface(str),
            lighting: RunwayLightingType.Unknown,
            designatorCharPrimary: RunwayDesignator.RUNWAY_DESIGNATOR_NONE,
            designatorCharSecondary: RunwayDesignator.RUNWAY_DESIGNATOR_NONE,
            primaryBlastpadLength: 0,
            primaryOverrunLength: 0,
            secondaryOverrunLength: 0,
            secondaryBlastpadLength: 0,
            primaryILSFrequency: {
                icao: "",
                icaoStruct: ICAO.emptyValue(),
                name: "",
                freqMHz: 0,
                freqBCD16: 0,
                type: FacilityFrequencyType.None,
                hasGlideslope: false,
                glideslopeAngle: 0,
                localizerCourse: 0,
                magvar: 0,
                hasBackcourse: false,
                glideslopeAlt: 0,
                glideslopeLat: 0,
                glideslopeLon: 0,
                lsCategory: LandingSystemCategory.None,
                localizerWidth: 0,
            },
            secondaryILSFrequency: {
                icao: "",
                icaoStruct: ICAO.emptyValue(),
                name: "",
                freqMHz: 0,
                freqBCD16: 0,
                type: FacilityFrequencyType.None,
                hasGlideslope: false,
                glideslopeAngle: 0,
                localizerCourse: 0,
                magvar: 0,
                hasBackcourse: false,
                glideslopeAlt: 0,
                glideslopeLat: 0,
                glideslopeLon: 0,
                lsCategory: LandingSystemCategory.None,
                localizerWidth: 0,
            },
            primaryElevation: 0,
            primaryThresholdLength: 0,
            secondaryElevation: 0,
            secondaryThresholdLength: 0,
        }
    }

    private deserializeVor(str: string): VorFacility {
        const icao = this.deserializeIcao(str);
        const icaoStruct = ICAO.stringV2ToValue(icao);
        // noinspection JSDeprecatedSymbols
        return {
            icao: icao,
            icaoStruct: icaoStruct,
            name: "",
            lat: this.deserializeLat(str),
            lon: this.deserializeLon(str),
            region: icaoStruct.region,
            city: "",
            magvar: 0,
            freqMHz: this.deserializeFrequency(str),
            freqBCD16: 0,
            magneticVariation: Number(str.substring(43, 46)),
            type: VorType.Unknown,
            vorClass: VorClass.Unknown,
            navRange: 0,
            dme: null,
            ils: null,
            tacan: null,
            trueReferenced: false,
        };
    }

    private deserializeNdb(str: string): NdbFacility {
        const icao = this.deserializeIcao(str);
        const icaoStruct = ICAO.stringV2ToValue(icao);
        // noinspection JSDeprecatedSymbols
        return {
            icao: icao,
            icaoStruct: icaoStruct,
            name: "",
            lat: this.deserializeLat(str),
            lon: this.deserializeLon(str),
            region: icaoStruct.region,
            city: "",
            magvar: 0,
            freqMHz: this.deserializeFrequency(str),
            type: NdbType.H,
            range: 0,
            bfoRequired: false,
        };
    }

    private deserializeIntersection(str: string): IntersectionFacility {
        const icao = this.deserializeIcao(str);
        const icaoStruct = ICAO.stringV2ToValue(icao);
        // noinspection JSDeprecatedSymbols
        return {
            icao: icao,
            icaoStruct: icaoStruct,
            name: "",
            lat: this.deserializeLat(str),
            lon: this.deserializeLon(str),
            region: icaoStruct.region,
            city: "",
            routes: [],
            nearestVorICAO: "",
            nearestVorICAOStruct: ICAO.emptyValue(),
            nearestVorType: VorType.Unknown,
            nearestVorFrequencyBCD16: 0,
            nearestVorFrequencyMHz: 0,
            nearestVorTrueRadial: 0,
            nearestVorMagneticRadial: 0,
            nearestVorDistance: 0,
        };
    }

    private deserializeSupplementary(str: string): UserFacility {
        const icao = this.deserializeIcao(str);
        const icaoStruct = ICAO.stringV2ToValue(icao);
        // noinspection JSDeprecatedSymbols
        return {
            icao: icao,
            icaoStruct: icaoStruct,
            name: "",
            lat: this.deserializeLat(str),
            lon: this.deserializeLon(str),
            region: icaoStruct.region,
            city: "",
            isTemporary: false,
            userFacilityType: UserFacilityType.LAT_LONG,
        };
    }

    private deserializeIcao(str: string): string {
        return str.substring(0, 19);
    }

    private deserializeLat(str: string): number {
        const sign = str.substring(19, 20) == '-' ? -1 : 1;
        const degrees = Number(str.substring(19, 22));
        const minutes = Number(str.substring(22, 27)) / 60;

        return sign * (degrees + (degrees >= 0 ? minutes : -minutes));
    }

    private deserializeLon(str: string): number {
        const sign = str.substring(27, 28) == '-' ? -1 : 1;
        const degrees = Number(str.substring(27, 31));
        const minutes = Number(str.substring(31, 36)) / 60;

        return sign * (degrees + (degrees >= 0 ? minutes : -minutes));
    }

    private deserializeFrequency(str: string): number {
        return Number(str.substring(36, 43));
    }

    private deserializeSurface(str: string): RunwaySurfaceType {
        switch (str.substring(48, 49)) {
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