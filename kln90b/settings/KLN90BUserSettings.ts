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
    nearestAptSurface: boolean;
    nearestAptMinRunwayLength: number;
    activeWaypoint: string;
    airspaceAlertEnabled: boolean;
    airspaceAlertBuffer: number;
    altAlertVolume: number;
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
    fastGpsAcquisition: boolean,
    enableGlow: boolean,

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
                name: "enableGlow",
                defaultValue: true,
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
                name: "userDataFormat",
                defaultValue: 0,
            },
        ]);
    }

}