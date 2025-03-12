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
import {KLN90BUserWaypointsSettings, KLN90BUserWaypointsTypes, MAX_USER_WAYPOINTS} from "./KLN90BUserWaypoints";
import {KLNFacilityRepository} from "../data/navdata/KLNFacilityRepository";
import {UserWaypointLoader} from "./UserWaypointPersistor";

export class UserWaypointLoaderV1 implements UserWaypointLoader {
    private manager: DefaultUserSettingManager<KLN90BUserWaypointsTypes>;

    private ignoreSync = false;


    constructor(bus: EventBus, private repo: KLNFacilityRepository) {
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
        const icao = this.deserializeIcao(str);
        const icaoStruct = ICAO.stringV1ToValue(icao);
        return {
            icao: ICAO.valueToStringV2(icaoStruct),
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
            altitude: Number(str.substring(29, 35)),
            loadedDataFlags: 0,
            holdingPatterns: [],
            transitionAlt: 0,
            transitionLevel: 0,
            iata: "",
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
        const icaoStruct = ICAO.stringV1ToValue(icao);
        return {
            icao: ICAO.valueToStringV2(icaoStruct),
            icaoStruct: icaoStruct,
            name: "",
            lat: this.deserializeLat(str),
            lon: this.deserializeLon(str),
            region: icaoStruct.region,
            city: "",
            magvar: 0,
            freqMHz: this.deserializeFrequency(str),
            freqBCD16: 0,
            magneticVariation: Number(str.substring(36, 39)),
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
        const icaoStruct = ICAO.stringV1ToValue(icao);
        return {
            icao: ICAO.valueToStringV2(icaoStruct),
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
        const icaoStruct = ICAO.stringV1ToValue(icao);
        return {
            icao: ICAO.valueToStringV2(icaoStruct),
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
        const icaoStruct = ICAO.stringV1ToValue(icao);
        return {
            icao: ICAO.valueToStringV2(icaoStruct),
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
        return str.substring(0, 12);
    }

    private deserializeLat(str: string): number {
        const sign = str.substring(12, 13) == '-' ? -1 : 1;
        const degrees = Number(str.substring(13, 15));
        const minutes = Number(str.substring(15, 20)) / 60;

        return sign * (degrees + (degrees >= 0 ? minutes : -minutes));
    }

    private deserializeLon(str: string): number {
        const sign = str.substring(20, 21) == '-' ? -1 : 1;
        const degrees = Number(str.substring(21, 24));
        const minutes = Number(str.substring(24, 29)) / 60;

        return sign * (degrees + (degrees >= 0 ? minutes : -minutes));
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