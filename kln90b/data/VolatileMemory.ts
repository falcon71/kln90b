import {
    AirportFacility,
    EventBus,
    Facility,
    FacilityType,
    ICAO,
    IntersectionFacility,
    NdbFacility,
    RunwayFacility,
    UserFacility,
    VorFacility,
} from "@microsoft/msfs-sdk";
import {KLNFacilityLoader} from "./navdata/KLNFacilityLoader";
import {Scanlists} from "./navdata/Scanlist";
import {NearestWpt} from "./navdata/NearestList";
import {KLN90BUserSettings} from "../settings/KLN90BUserSettings";
import {Degrees, Feet, Knots, NauticalMiles, Seconds} from "./Units";
import {Flightplan} from "./flightplan/Flightplan";
import {ActiveWaypoint} from "./flightplan/ActiveWaypoint";
import {TimeStamp} from "./Time";
import {CenterWaypoint} from "../pages/right/Ctr1Page";
import {PowerEvent, PowerEventData} from "../PowerButton";
import {Sensors} from "../Sensors";

export interface WaypointPageState<T extends Facility> {
    facility: T | NearestWpt<T> | null,
    ident: string,
}

export interface AltPageState {
    alertEnabled: boolean;
    alertWarn: number;
}

export interface FplPageState {
    flightplans: Flightplan[];
}

export interface DtPageState {
    flightTimer: number;
    departureTime: TimeStamp | null;
}

export const TO = true;
export const FROM = false;
export type ToFrom = boolean;

export const enum NavMode {
    ENR_LEG,
    ENR_OBS,
    ARM_LEG,
    ARM_OBS,
    APR_LEG

}

export class NavPageState {

    public isSelfTestActive: boolean = false;
    public activeWaypoint: ActiveWaypoint;
    public navmode: NavMode = NavMode.ENR_LEG;

    public xtkToActive: NauticalMiles | null = null;
    public distToActive: NauticalMiles | null = null;
    public eteToActive: Seconds | null = null;
    public distToDest: NauticalMiles | null = null;
    public eteToDest: Seconds | null = null;
    public bearingToActive: Degrees | null = null; //true, based on appendix A of the manual
    public bearingForAP: Degrees | null = null; //true. Will be set to desiredTrack in DME arcs to improve autopilot tracking
    public desiredTrack: Degrees | null = null;  //true
    public obsMag: Degrees = 0; //Magnetic!!
    public toFrom: ToFrom | null = null;
    public xtkScale: number = 5;

    public waypointAlert = false;

    public nav4SelectedAltitude: Feet = 0;
    public nav4FromAlt: Feet = 0;
    public nav4VnavWpt: Facility | null = null;
    public nav4VnavDist: NauticalMiles = 0;
    public nav4VnavAngle: Degrees | null = null;
    public superNav5ActualRange = 40;

    //When operating outside the database coverage
    public userMagvar: Degrees = 0;

    constructor(userSettings: KLN90BUserSettings, sensors: Sensors, fpl0: Flightplan, lastactiveWaypoint: Facility | null) {
        this.activeWaypoint = new ActiveWaypoint(userSettings, sensors, fpl0, lastactiveWaypoint);
    }

}

export interface TriPageState {
    tas: Knots;
    windDirTrue: Degrees;
    windSpeed: Knots;
    ff: number;
    reserve: number;
    tri1To: Facility | null;
    tri3From: Facility | null;
    tri3To: Facility | null;
    tri5Fpl: number,
}

export interface CalPageState {


    cal6TimeZ: TimeStamp | null,
    cal6FromTimezone: number | null,
    cal6ToTimezone: number | null,

    cal7Wpt: Facility | null,
    cal7DateZ: TimeStamp | null,
    cal7Timezone: number | null,


}

export const enum CtrState {
    NO_FPL,
    FPL,
    CALCULATED,
    DONE,
    FULL,
}

export interface CtrPageState {
    state: CtrState,
    lastFpl: Flightplan | null;
    waypoints: CenterWaypoint[];
}


export interface OthPageState {
    reserve: number;
}

const RESET_TIME = 5 * 60 * 1000; //6-5 Reset occurs after 5 minutes

export class VolatileMemory {

    public readonly aptPage: WaypointPageState<AirportFacility> = {
        facility: null,
        ident: "0   ",
    };
    public readonly vorPage: WaypointPageState<VorFacility> = {
        facility: null,
        ident: "0  ",
    };
    public readonly ndbPage: WaypointPageState<NdbFacility> = {
        facility: null,
        ident: "0  ",
    };
    public readonly intPage: WaypointPageState<IntersectionFacility | RunwayFacility> = {
        facility: null,
        ident: "0    ",
    };
    public readonly supPage: WaypointPageState<UserFacility> = {
        facility: null,
        ident: "0    ",
    };

    public readonly altPage: AltPageState = {
        alertEnabled: false,
        alertWarn: 300,
    };

    public readonly dtPage: DtPageState = {
        flightTimer: 0,
        departureTime: null,
    };

    public readonly fplPage: FplPageState;

    public readonly navPage: NavPageState;

    public readonly triPage: TriPageState = {
        tas: 150,
        windDirTrue: 0,
        windSpeed: 0,
        ff: 0,
        reserve: 0,
        tri1To: null,
        tri3From: null,
        tri3To: null,
        tri5Fpl: 0,
    };

    public readonly calPage: CalPageState = {
        cal6TimeZ: null,
        cal6FromTimezone: null,
        cal6ToTimezone: null,

        cal7Wpt: null,
        cal7Timezone: null,
        cal7DateZ: null,

    };

    public readonly ctrPage: CtrPageState = {
        state: CtrState.NO_FPL,
        lastFpl: null,
        waypoints: [],
    };


    public readonly othPage: OthPageState = {
        reserve: 0,
    };

    public isReady = false;

    public constructor(bus: EventBus, userSettings: KLN90BUserSettings, private facilityLoader: KLNFacilityLoader, sensors: Sensors, private scanlists: Scanlists, flightplans: Flightplan[], lastactiveWaypoint: Facility | null) {
        this.navPage = new NavPageState(userSettings, sensors, flightplans[0], lastactiveWaypoint);
        this.fplPage = {
            flightplans,
        };

        bus.getSubscriber<PowerEvent>().on("powerEvent").handle(this.reset.bind(this));
    }

    public reset(evt: PowerEventData): void {
        if (!evt.isPowered) {
            return;
        }

        this.isReady = false;
        this.altPage.alertEnabled = false;
        this.altPage.alertWarn = 300;

        this.fplPage.flightplans[0].removeProcedures();

        this.dtPage.departureTime = null;
        this.dtPage.flightTimer = 0;

        this.triPage.tas = 150;
        this.triPage.windSpeed = 0;
        this.triPage.windDirTrue = 0;
        this.triPage.tri1To = null;
        this.triPage.tri3From = null;
        this.triPage.tri3To = null;
        this.triPage.tri5Fpl = 0;

        this.navPage.nav4VnavWpt = null;
        this.navPage.nav4VnavAngle = null;
        this.navPage.nav4FromAlt = 0;
        this.navPage.nav4VnavDist = 0;
        this.navPage.navmode = NavMode.ENR_LEG;
        this.navPage.userMagvar = 0;

        this.calPage.cal6TimeZ = null;
        this.calPage.cal6FromTimezone = null;
        this.calPage.cal6ToTimezone = null;

        this.calPage.cal7Wpt = null;
        this.calPage.cal7DateZ = null;
        this.calPage.cal7Timezone = null;

        this.ctrPage.state = CtrState.NO_FPL;
        this.ctrPage.lastFpl = null;
        this.ctrPage.waypoints = [];

        this.othPage.reserve = 0;

        Promise.all([
            this.setFirstApt(),
            this.setFirstVor(),
            this.setFirstNdb(),
            this.setFirstIntersection(),
            this.setFirstSupplementary(),
        ]).then(_ => {
            this.isReady = true;
        });
    }

    private async setFirstSupplementary() {
        const icao = await this.scanlists.supScanlist.init();
        if (icao === null) {
            this.supPage.ident = "0   ";
            this.supPage.facility = null;
        } else {
            try {
                this.supPage.facility = await this.facilityLoader.getFacility(FacilityType.USR, icao);
                this.supPage.ident = ICAO.getIdent(icao);
            } catch (e) {
                console.warn(`Waypoint was deleted while accessing it: ${icao}`, e);
                //There is an await above. Inbetween, TemporaryWaypointDeleter might run and delete this waypoint
                this.supPage.ident = "0   ";
                this.supPage.facility = null;
            }
        }
    }

    private async setFirstIntersection() {
        const icao = await this.scanlists.intScanlist.init();
        if (icao === null) {
            this.intPage.ident = "0   ";
            this.intPage.facility = null;
        } else {
            this.intPage.facility = await this.facilityLoader.getFacility(FacilityType.Intersection, icao);
            this.intPage.ident = ICAO.getIdent(icao);
        }
    }

    private async setFirstNdb() {
        const icao = await this.scanlists.ndbScanlist.init();
        if (icao === null) {
            this.ndbPage.ident = "0   ";
            this.ndbPage.facility = null;
        } else {
            this.ndbPage.facility = await this.facilityLoader.getFacility(FacilityType.NDB, icao);
            this.ndbPage.ident = ICAO.getIdent(icao);
        }
    }

    private async setFirstVor() {
        const icao = await this.scanlists.vorScanlist.init();
        if (icao === null) {
            this.vorPage.ident = "0  ";
            this.vorPage.facility = null;
        } else {
            this.vorPage.facility = await this.facilityLoader.getFacility(FacilityType.VOR, icao);
            this.vorPage.ident = ICAO.getIdent(icao);
        }
    }

    private async setFirstApt() {
        const icao = await this.scanlists.aptScanlist.init();
        if (icao === null) {
            this.aptPage.ident = "0   ";
            this.aptPage.facility = null;
        } else {
            this.aptPage.facility = await this.facilityLoader.getFacility(FacilityType.Airport, icao);
            this.aptPage.ident = ICAO.getIdent(icao);
        }
    }
}