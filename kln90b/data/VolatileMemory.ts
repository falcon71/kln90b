import {
    AirportFacility,
    EventBus,
    Facility,
    FacilityClient,
    FacilityType,
    GeoCircle,
    IntersectionFacility,
    NdbFacility,
    RunwayFacility,
    UserFacility,
    VorFacility,
} from "@microsoft/msfs-sdk";
import {Scanlists} from "./navdata/Scanlist";
import {NearestWpt} from "./navdata/NearestList";
import {KLN90BUserSettings} from "../settings/KLN90BUserSettings";
import {Degrees, Feet, Knots, NauticalMiles, Seconds} from "./Units";
import {Flightplan, KLNFlightplanLeg} from "./flightplan/Flightplan";
import {ActiveWaypoint} from "./flightplan/ActiveWaypoint";
import {TimeStamp} from "./Time";
import {CenterWaypoint} from "../pages/right/Ctr1Page";
import type {FplPage} from "../pages/left/FplPage";
import type {Message} from "./MessageHandler";
import {PowerEvent, PowerEventData} from "../PowerSupply";
import {Sensors} from "../Sensors";

export interface WaypointPageState<T extends Facility> {
    facility: T | NearestWpt<T> | null,
    ident: string,
    /**
     * #202: the last waypoint the ident entry matched, while the typed ident matches none. A scan starts from it (3-21,
     * KLN 89 trainer 2026-10-07)
     */
    lastMatch: T | null,
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

/**
 * The OBS modes (ENR-OBS and ARM-OBS), in which the unit flies a course to the active waypoint and not the plan
 */
export function isObsMode(mode: NavMode): boolean {
    return mode === NavMode.ENR_OBS || mode === NavMode.ARM_OBS;
}

export class NavPageState {

    public isSelfTestActive: boolean = false;
    /**
     * False from the power-on until the self-test is approved. The start-ups that skip the self-test (the
     * engine-running boot, debugMode) count as approved. ADJ NAV IND CRS is not evaluated before (#330)
     */
    public isSelfTestApproved: boolean = false;
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
    /**
     * The path roll steering follows (#373); null when there is nothing to steer on. Without a turn it is the leg path of
     * NavCalculator, so a final leg without length gives the path of the leg before it (#120). During a turn it is the
     * turn circle, or the next leg once the aircraft was farther from the circle than its radius (#100, the roll steering
     * design, docs/superpowers/specs/2026-10-19-roll-steering-design.md, section 4A).
     */
    public steeringPath: GeoCircle | null = null;
    /**
     * The turn direction roll steering keeps while the course to steer is far behind the track, with a copy of the path
     * it was chosen on: it applies only while the steering path still has that geometry (RollSteeringLaw.ts, #100). The
     * latch is keyed by a copy of the geometry, not by the object, because ActiveWaypoint reuses one GeoCircle for every
     * great-circle leg and rewrites it in place (the roll steering design, section 4B (amended 2026-10-19))
     */
    public rollSteeringLatch: { turn: 'left' | 'right', path: GeoCircle } | null = null;
    public obsMag: Degrees = 0; //Magnetic!!
    public toFrom: ToFrom | null = null;
    public xtkScale: number = 5;
    public approachDisarmedLeg: KLNFlightplanLeg | null = null; //6-1: the first APP leg of FPL 0 when the pilot disarmed the approach (#139)
    //6-3, 6-11: the distance to the FAF and the scale when the unit went ACTV; the ramp to 0.3 runs from there (#163)
    public aprActivationDist: NauticalMiles = 2;
    public aprActivationScale: number = 1;

    public waypointAlert = false;

    public nav4SelectedAltitude: Feet = 0;
    public nav4FromAlt: Feet = 0;
    public nav4VnavWpt: Facility | null = null;
    public nav4VnavDist: NauticalMiles = 0;
    public nav4VnavAngle: Degrees | null = null;
    public superNav5ActualRange = 40;

    //When operating outside the database coverage
    public userMagvar: Degrees = 0;

    /**
     * The areas (AirspaceAreas keys) AIRSPACE ALERT warns of and the areas the aircraft is inside of, each with the message
     * posted for it. An airspace message is valid while its key maps to it, so the maps are the condition; both are reset
     * at power-on (#412)
     */
    public readonly airspaceWarned = new Map<string, Message>();
    public readonly airspaceEntered = new Map<string, Message>();

    constructor(bus: EventBus, userSettings: KLN90BUserSettings, sensors: Sensors, fpl0: Flightplan, lastactiveWaypoint: Facility | null) {
        this.activeWaypoint = new ActiveWaypoint(bus, userSettings, sensors, fpl0, lastactiveWaypoint);
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
    /** The calendar date shown on CAL 7: a UTC midnight stamp used only for its year, month and day (#390) */
    cal7Date: TimeStamp | null,
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
    /** #301: the plan page on the left that the computation was made on; another instance means the page was left */
    lastFplPage: FplPage | null;
    waypoints: CenterWaypoint[];
    /** #348: a copy of the plan's legs from the computation; the state goes back to the start when the plan differs */
    computedLegs: KLNFlightplanLeg[] | null;
}


export interface OthPageState {
    reserve: number;
}

const RESET_TIME = 5 * 60 * 1000; //6-5 Reset occurs after 5 minutes

export class VolatileMemory {

    public readonly aptPage: WaypointPageState<AirportFacility> = {
        facility: null,
        ident: "0   ",
        lastMatch: null,
    };
    public readonly vorPage: WaypointPageState<VorFacility> = {
        facility: null,
        ident: "0  ",
        lastMatch: null,
    };
    public readonly ndbPage: WaypointPageState<NdbFacility> = {
        facility: null,
        ident: "0  ",
        lastMatch: null,
    };
    public readonly intPage: WaypointPageState<IntersectionFacility | RunwayFacility> = {
        facility: null,
        ident: "0    ",
        lastMatch: null,
    };
    public readonly supPage: WaypointPageState<UserFacility> = {
        facility: null,
        ident: "0    ",
        lastMatch: null,
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
        cal7Date: null,

    };

    public readonly ctrPage: CtrPageState = {
        state: CtrState.NO_FPL,
        lastFpl: null,
        lastFplPage: null,
        waypoints: [],
        computedLegs: null,
    };


    public readonly othPage: OthPageState = {
        reserve: 0,
    };

    public isReady = false;

    public constructor(bus: EventBus, userSettings: KLN90BUserSettings, private facilityLoader: FacilityClient, sensors: Sensors, private scanlists: Scanlists, flightplans: Flightplan[], lastactiveWaypoint: Facility | null) {
        this.navPage = new NavPageState(bus, userSettings, sensors, flightplans[0], lastactiveWaypoint);
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
        //#202: a power cycle forgets the last match of the ident entry
        this.aptPage.lastMatch = null;
        this.vorPage.lastMatch = null;
        this.ndbPage.lastMatch = null;
        this.intPage.lastMatch = null;
        this.supPage.lastMatch = null;

        if (evt.timeSincePowerChange > RESET_TIME) {
            this.fplPage.flightplans[0].removeProcedures();
        }

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
        this.navPage.xtkScale = 5; //A power-up starts at 5 NM, a NAV flag keeps the scale (#159)
        this.navPage.approachDisarmedLeg = null; //The legs of a short power-off stay in FPL 0, the disarm does not (#139)
        this.navPage.aprActivationDist = 2;
        this.navPage.aprActivationScale = 1;
        this.navPage.userMagvar = 0;
        this.navPage.isSelfTestApproved = false; //Every power-on runs the self-test again (#330)
        this.navPage.isSelfTestActive = false; //A power-off during the self-test ends it (#400)
        this.navPage.rollSteeringLatch = null; //A turn chosen before the power-off is not kept (#100)
        this.navPage.activeWaypoint.clearTurnStack(); //Nor a turn started before it, its plan or its own-turn flag (#375)
        //#412: the power-off dropped the airspace messages, so the areas they stood for are forgotten too and the first check
        //of the power-on posts them again when their condition still holds
        this.navPage.airspaceWarned.clear();
        this.navPage.airspaceEntered.clear();

        this.calPage.cal6TimeZ = null;
        this.calPage.cal6FromTimezone = null;
        this.calPage.cal6ToTimezone = null;

        this.calPage.cal7Wpt = null;
        this.calPage.cal7Date = null;
        this.calPage.cal7Timezone = null;

        this.ctrPage.state = CtrState.NO_FPL;
        this.ctrPage.lastFpl = null;
        this.ctrPage.lastFplPage = null;
        this.ctrPage.waypoints = [];
        this.ctrPage.computedLegs = null;

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
                this.supPage.ident = icao.ident;
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
            this.intPage.ident = icao.ident;
        }
    }

    private async setFirstNdb() {
        const icao = await this.scanlists.ndbScanlist.init();
        if (icao === null) {
            this.ndbPage.ident = "0   ";
            this.ndbPage.facility = null;
        } else {
            this.ndbPage.facility = await this.facilityLoader.getFacility(FacilityType.NDB, icao);
            this.ndbPage.ident = icao.ident;
        }
    }

    private async setFirstVor() {
        const icao = await this.scanlists.vorScanlist.init();
        if (icao === null) {
            this.vorPage.ident = "0  ";
            this.vorPage.facility = null;
        } else {
            this.vorPage.facility = await this.facilityLoader.getFacility(FacilityType.VOR, icao);
            this.vorPage.ident = icao.ident;
        }
    }

    private async setFirstApt() {
        const icao = await this.scanlists.aptScanlist.init();
        if (icao === null) {
            this.aptPage.ident = "0   ";
            this.aptPage.facility = null;
        } else {
            this.aptPage.facility = await this.facilityLoader.getFacility(FacilityType.Airport, icao);
            this.aptPage.ident = icao.ident;
        }
    }
}