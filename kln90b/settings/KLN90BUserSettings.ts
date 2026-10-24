import {DefaultUserSettingManager, EventBus} from '@microsoft/msfs-sdk';
import {Celsius, Degrees, Fahrenheit, Feet, Inhg, Knots, Mph} from "../data/Units";


export const BARO_UNIT_INHG = true;
export const BARO_UNIT_HPA = false;

export const SURFACE_HRD_SFT = true;
export const SURFACE_HRD = false;

export const FLT_TIMER_GS30 = false;
export const FLT_TIMER_POWER = true;

export const GPS_ACQUISITION_REAL = false;
export const GPS_ACQUISITION_FAST = true;


export const enum Nav5Orientation {
    NORTH_UP = 0,
    DTK_UP = 1,
    TK_UP = 2,
    HDG_UP = 3,
}

/**
 * #368: HDG up needs a heading input. Without one the map is drawn north up; the stored setting is the pilot's and is kept
 * for when the input returns (an aircraft may switch it on after loading)
 */
export function effectiveMapOrientation(orientation: Nav5Orientation, headingInput: boolean): Nav5Orientation {
    return orientation === Nav5Orientation.HDG_UP && !headingInput ? Nav5Orientation.NORTH_UP : orientation;
}

export const enum SuperNav5Field1 {
    ETE = 0,
    XTK = 1,
    VNAV = 2,
}

export const enum SuperNav5Field2 {
    DTK = 0,
    BRG = 1,
    RAD = 2,
}

export const enum SuperNav5Field3 {
    TK = 0,
    BRG = 1,
    RAD = 2,
    ARC,
}

export const enum SuperNav5VOR {
    OFF = 0,
    H = 1,
    LH = 2,
    TLH = 3,
}

export type KLN90BUserSettingsTypes = {
    welcome1: string;
    welcome2: string;
    welcome3: string;
    welcome4: string;
    powercycles: number;
    totalTime: number;
    timezone: number;
    barounit: boolean;
    barosetting: number;
    lastLatitude: number;
    lastLongitude: number;
    lastAlmanacDownload: number;
    lastEphemeris: string;
    nearestAptSurface: boolean;
    nearestAptMinRunwayLength: number;
    activeWaypoint: string;
    airspaceAlertEnabled: boolean;
    airspaceAlertBuffer: number;
    altAlertVolume: number;
    altAlertEnabled: boolean;
    altAlertWarn: number;
    htAboveAptEnabled: boolean;
    htAboveAptOffset: number;
    turnAnticipation: boolean;
    nav5MapOrientation: Nav5Orientation;
    nav5MapRange: number;
    superNav5MapOrientation: Nav5Orientation;
    superNav5MapRange: number;
    superNav5Field1: SuperNav5Field1;
    superNav5Field2: SuperNav5Field2;
    superNav5Field3: SuperNav5Field3;
    superNav5Vor: SuperNav5VOR,
    superNav5Ndb: boolean,
    superNav5Apt: boolean,
    flightTimer: boolean,

    cal12IndicatedAltitude: Feet;
    cal12Barometer: Inhg;
    cal1SAT: Celsius;

    cal2Cas: Knots,
    cal2TAT: Celsius;

    cal3Tas: Knots,
    cal3HeadingMag: Degrees,

    cal4GS: Knots,
    cal4Fpm: number,
    cal4Angle: number,

    cal5TempC: Celsius,
    cal5TempF: Fahrenheit,
    cal5SpeedKt: Knots,
    cal5SpeedMph: Mph,

    fastGpsAcquisition: boolean,

    triTas: Knots,
    triWindDirTrue: Degrees,
    triWindSpeed: Knots,
    triFuelFlow: number,
    triReserve: number,
    tri5Fpl: number,
    othReserve: number,

    aptPageWpt: string,
    vorPageWpt: string,
    ndbPageWpt: string,
    intPageWpt: string,
    supPageWpt: string,
    tri1To: string,
    tri3From: string,
    tri3To: string,

    userDataFormat: number,
}

export class KLN90BUserSettings extends DefaultUserSettingManager<KLN90BUserSettingsTypes> {


    constructor(bus: EventBus) {
        super(bus, [
            {
                name: "welcome1",
                defaultValue: "                       ",
            },
            {
                name: "welcome2",
                defaultValue: "                       ",
            },
            {
                name: "welcome3",
                defaultValue: "                       ",
            },
            {
                name: "welcome4",
                defaultValue: "                       ",
            },
            {
                name: "powercycles",
                defaultValue: 0,
            },
            {
                name: "totalTime",
                defaultValue: 0,
            },
            {
                name: "timezone",
                defaultValue: 0,
            },
            {
                name: "barounit",
                defaultValue: BARO_UNIT_INHG,
            },
            {
                name: "barosetting",
                defaultValue: 29.92,
            },
            {
                name: "lastLatitude",
                defaultValue: 0,
            },
            {
                name: "lastLongitude",
                defaultValue: 0,
            },
            {
                name: "lastAlmanacDownload",
                defaultValue: 0,
            },
            {
                name: "lastEphemeris", //"prn:time,prn:time": the ephemeris in the receiver's memory, by satellite (#62)
                defaultValue: "",
            },
            {
                name: "nearestAptSurface",
                defaultValue: SURFACE_HRD_SFT,
            },
            {
                name: "nearestAptMinRunwayLength",
                defaultValue: 1000,
            },
            {
                name: "activeWaypoint",
                defaultValue: "",
            },
            {
                name: "airspaceAlertEnabled",
                defaultValue: true,
            },
            {
                name: "airspaceAlertBuffer",
                defaultValue: 500,
            },
            {
                name: "altAlertVolume",
                defaultValue: 99,
            },
            {
                //ALT page ALERT ON/OFF, kept over a power cycle (the maintainer's ruling, #259)
                name: "altAlertEnabled",
                defaultValue: false,
            },
            {
                //ALT page WARN in ft; 3-55: entered only the first time altitude alerting is used, so it is kept (#259)
                name: "altAlertWarn",
                defaultValue: 300,
            },
            {
                name: "htAboveAptEnabled",
                defaultValue: false,
            },
            {
                name: "htAboveAptOffset",
                defaultValue: 800,
            },
            {
                name: "turnAnticipation",
                defaultValue: true,
            },
            {
                name: "nav5MapOrientation",
                defaultValue: Nav5Orientation.NORTH_UP,
            },
            {
                name: "nav5MapRange",
                defaultValue: 40,
            },
            {
                name: "superNav5MapOrientation",
                defaultValue: Nav5Orientation.NORTH_UP,
            },
            {
                name: "superNav5MapRange",
                defaultValue: 40,
            },
            {
                name: "superNav5Field1",
                defaultValue: SuperNav5Field1.ETE,
            },
            {
                name: "superNav5Field2",
                defaultValue: SuperNav5Field2.DTK,
            },
            {
                name: "superNav5Field3",
                defaultValue: SuperNav5Field3.TK,
            },
            {
                name: "superNav5Vor",
                defaultValue: SuperNav5VOR.OFF,
            },
            {
                name: "superNav5Ndb",
                defaultValue: false,
            },
            {
                name: "superNav5Apt",
                defaultValue: false,
            },
            {
                name: "flightTimer",
                defaultValue: FLT_TIMER_GS30,
            },
            {
                name: "fastGpsAcquisition",
                defaultValue: GPS_ACQUISITION_FAST,
            },
            {
                name: "cal12IndicatedAltitude",
                defaultValue: 0,
            },
            {
                name: "cal12Barometer",
                defaultValue: 0,  //https://youtu.be/gjmVrkHTdP0?t=27
            },
            {
                name: "cal1SAT",
                defaultValue: 0,
            },
            {
                name: "cal2Cas",
                defaultValue: 0,
            },
            {
                name: "cal2TAT",
                defaultValue: 0,
            },
            {
                name: "cal3Tas",
                defaultValue: 0,
            },
            {
                name: "cal3HeadingMag",
                defaultValue: 0,
            },
            {
                name: "cal4GS",
                defaultValue: 0,
            },
            {
                name: "cal4Fpm",
                defaultValue: 0,
            },
            {
                name: "cal4Angle",
                defaultValue: 0,
            },
            {
                name: "cal5TempC",
                defaultValue: 0,
            },
            {
                name: "cal5TempF",
                defaultValue: 32,
            },
            {
                name: "cal5SpeedKt",
                defaultValue: 0,
            },
            {
                name: "cal5SpeedMph",
                defaultValue: 0,
            },
            {
                //TRI 0 TAS in kt, kept over a power cycle (AVsoftech trainer 2026-10-24, unreliable; the KLN 89 CAL 7 TAS came back 0, docs/kln89-trainer-record.md, #192)
                name: "triTas",
                defaultValue: 150,
            },
            {
                //TRI 0 wind direction, true, kept over a power cycle (AVsoftech trainer 2026-10-24, unreliable, docs/kln89-trainer-record.md, #192)
                name: "triWindDirTrue",
                defaultValue: 0,
            },
            {
                //TRI 0 wind speed in kt, kept over a power cycle (AVsoftech trainer 2026-10-24, unreliable, docs/kln89-trainer-record.md, #192)
                name: "triWindSpeed",
                defaultValue: 0,
            },
            {
                //TRI 1/3/5 fuel flow, kept over a power cycle (both trainers 2026-10-24, docs/kln89-trainer-record.md, #192)
                name: "triFuelFlow",
                defaultValue: 0,
            },
            {
                //TRI 1/3/5 fuel reserve, kept over a power cycle (both trainers 2026-10-24, docs/kln89-trainer-record.md, #192)
                name: "triReserve",
                defaultValue: 0,
            },
            {
                //TRI 5/6 flight plan number, kept over a power cycle (AVsoftech trainer 2026-10-24, unreliable, docs/kln89-trainer-record.md, #192)
                name: "tri5Fpl",
                defaultValue: 0,
            },
            {
                //OTH 5/6 reserve, kept like the TRI reserve (no trainer has OTH; #192)
                name: "othReserve",
                defaultValue: 0,
            },
            {
                //The APT page waypoint, an ICAO string (V2), kept over a power cycle (KLN 89 trainer 2026-10-24, #192)
                name: "aptPageWpt",
                defaultValue: "",
            },
            {
                //The VOR page waypoint, an ICAO string (V2), kept over a power cycle (KLN 89 trainer 2026-10-24, #192)
                name: "vorPageWpt",
                defaultValue: "",
            },
            {
                //The NDB page waypoint, an ICAO string (V2), kept over a power cycle (KLN 89 trainer 2026-10-24, #192)
                name: "ndbPageWpt",
                defaultValue: "",
            },
            {
                //The INT page waypoint, an ICAO string (V2), kept over a power cycle (KLN 89 trainer 2026-10-24, #192)
                name: "intPageWpt",
                defaultValue: "",
            },
            {
                //The SUP page waypoint, an ICAO string (V2), kept over a power cycle (KLN 89 trainer 2026-10-24, #192)
                name: "supPageWpt",
                defaultValue: "",
            },
            {
                //The TRI 1 and TRI 2 TO waypoint, an ICAO string (V2), kept over a power cycle (AVsoftech TRI 1 and KLN 89 CAL 1 trip waypoints, 2026-10-24, docs/kln89-trainer-record.md, #192)
                name: "tri1To",
                defaultValue: "",
            },
            {
                //The TRI 3 and TRI 4 FROM waypoint, an ICAO string (V2), kept over a power cycle (KLN 89 CAL 1 trip waypoints; the AVsoftech TRI 3 came back inconsistent, 2026-10-24, docs/kln89-trainer-record.md, #192)
                name: "tri3From",
                defaultValue: "",
            },
            {
                //The TRI 3 and TRI 4 TO waypoint, an ICAO string (V2), kept over a power cycle (KLN 89 CAL 1 trip waypoints; the AVsoftech TRI 3 came back inconsistent, 2026-10-24, docs/kln89-trainer-record.md, #192)
                name: "tri3To",
                defaultValue: "",
            },
            {
                name: "userDataFormat",
                defaultValue: 0,
            },
        ]);
    }

}