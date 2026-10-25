import {
    AirportFacility,
    EventBus,
    Facility,
    FacilityClient,
    FacilityType,
    GeoCircle,
    ICAO,
    IntersectionFacility,
    NdbFacility,
    RunwayFacility,
    UserFacility,
    VorFacility,
} from "@microsoft/msfs-sdk";
import {Scanlist, Scanlists} from "./navdata/Scanlist";
import {NearestWpt, unpackFacility} from "./navdata/NearestList";
import {SavedWaypoint} from "./SavedWaypoint";
import {KLN90BUserSettings} from "../settings/KLN90BUserSettings";
import {Degrees, Feet, NauticalMiles, Seconds} from "./Units";
import {Flightplan, KLNFlightplanLeg} from "./flightplan/Flightplan";
import {ActiveWaypoint} from "./flightplan/ActiveWaypoint";
import {TimeStamp} from "./Time";
import {CenterWaypoint} from "../pages/right/Ctr1Page";
import type {FplPage} from "../pages/left/FplPage";
import type {Message} from "./MessageHandler";
import {PowerEvent, PowerEventData} from "../PowerSupply";
import {Sensors} from "../Sensors";

/**
 * The state of a waypoint page type (APT, VOR, NDB, INT, SUP). The waypoint it shows is kept over a power cycle (KLN 89
 * trainer 2026-10-24) and so is a user setting (#192): every write of `facility` saves it, and a power-on resolves it
 * again. A waypoint shown at a nearest rank is saved as the plain waypoint, and only when it changes
 */
export class WaypointPageState<T extends Facility> {
    private _facility: T | NearestWpt<T> | null = null;
    /**
     * #202: the last waypoint the ident entry matched, while the typed ident matches none. A scan starts from it (3-21,
     * KLN 89 trainer 2026-10-07)
     */
    public lastMatch: T | null = null;

    constructor(public ident: string, private readonly saved: SavedWaypoint<T>) {
    }

    get facility(): T | NearestWpt<T> | null {
        return this._facility;
    }

    set facility(value: T | NearestWpt<T> | null) {
        this._facility = value;
        this.saved.save(unpackFacility(value));
    }

    /**
     * Shows the saved waypoint again, as the plain waypoint (KLN 89 trainer 2026-10-24); null if it does not resolve, and
     * the state is left as it was
     * @param loader The facility client
     * @param isCurrent Whether the power-on that restores is still the current one; an earlier one writes nothing (#416,
     * spec 4.3)
     */
    public async restore(loader: FacilityClient, isCurrent: () => boolean = () => true): Promise<T | null> {
        const facility = await this.saved.restore(loader, isCurrent);
        if (facility !== null && isCurrent()) {
            this.facility = facility;
            this.ident = facility.icaoStruct.ident;
        }
        return facility;
    }
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
    /**
     * 3-8: the waypoint whose page is shown first after the power-on, the one active at the power-off. Copied at the
     * power-on, because a leg activated before the first page is chosen overwrites the last active waypoint (#422)
     */
    public startPageWaypoint: Facility | null = null;
    public navmode: NavMode = NavMode.ENR_LEG;

    public xtkToActive: NauticalMiles | null = null;
    public distToActive: NauticalMiles | null = null;
    public eteToActive: Seconds | null = null;
    public distToDest: NauticalMiles | null = null;
    public eteToDest: Seconds | null = null;
    public bearingToActive: Degrees | null = null; //true, based on appendix A of the manual
    /**
     * The course at the active waypoint of the great circle from the aircraft, true (5-37, #371): the bearing the NAV 1
     * family of displays shows in OBS mode, in the frame of the waypoint. Null whenever bearingToActive is
     */
    public bearingAtActive: Degrees | null = null;
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
        this.startPageWaypoint = lastactiveWaypoint;
    }

}

/**
 * The TRI waypoints. They and the TRI numbers (TAS, wind, fuel flow, reserve, plan number) are user settings since #192:
 * the trip waypoints were kept over a power cycle by the AVsoftech TRI 1 and the KLN 89 CAL 1, the fuel flow and reserve
 * by both trainers, and the TAS, wind and plan number only by the AVsoftech trainer, which is unreliable (2026-10-24,
 * docs/kln89-trainer-record.md); only user settings survive a sim restart. Every write saves the waypoint, and a power-on
 * resolves it again
 */
export class TriPageState {
    private _tri1To: Facility | null = null;
    private _tri3From: Facility | null = null;
    private _tri3To: Facility | null = null;

    constructor(private readonly savedTri1To: SavedWaypoint<Facility>,
                private readonly savedTri3From: SavedWaypoint<Facility>,
                private readonly savedTri3To: SavedWaypoint<Facility>) {
    }

    get tri1To(): Facility | null {
        return this._tri1To;
    }

    set tri1To(value: Facility | null) {
        this._tri1To = value;
        this.savedTri1To.save(value);
    }

    get tri3From(): Facility | null {
        return this._tri3From;
    }

    set tri3From(value: Facility | null) {
        this._tri3From = value;
        this.savedTri3From.save(value);
    }

    get tri3To(): Facility | null {
        return this._tri3To;
    }

    set tri3To(value: Facility | null) {
        this._tri3To = value;
        this.savedTri3To.save(value);
    }

    /**
     * Resolves the saved waypoints again; one that does not resolve becomes null. The settings are not written here: they
     * hold the resolved waypoints, and SavedWaypoint.restore cleared one that does not resolve
     * @param loader The facility client
     * @param isCurrent Whether the power-on that restores is still the current one; an earlier one writes neither the
     * waypoints nor the settings (#416, spec 4.3)
     */
    public async restore(loader: FacilityClient, isCurrent: () => boolean = () => true): Promise<void> {
        const [tri1To, tri3From, tri3To] = await Promise.all([
            this.savedTri1To.restore(loader, isCurrent),
            this.savedTri3From.restore(loader, isCurrent),
            this.savedTri3To.restore(loader, isCurrent),
        ]);
        if (!isCurrent()) {
            return;
        }
        this._tri1To = tri1To;
        this._tri3From = tri3From;
        this._tri3To = tri3To;
    }
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


const RESET_TIME = 5 * 60 * 1000; //6-5 Reset occurs after 5 minutes

/**
 * The state the unit forgets at a power-on (#192); what it keeps is a user setting. The state of every page is one object
 * of the fields `<name>Page` below (NavPageState, WaypointPageState, TriPageState and the interfaces above).
 * **Every field of a page state needs an initializer** (`= null`, `= 0`, ...), also one that is null at first: the guard
 * test in VolatileMemory.test.ts finds the fields as the own keys of the object, and a field without an initializer is
 * none of them, so a missing reset would go unnoticed.
 */
export class VolatileMemory {

    public readonly aptPage: WaypointPageState<AirportFacility>;
    public readonly vorPage: WaypointPageState<VorFacility>;
    public readonly ndbPage: WaypointPageState<NdbFacility>;
    public readonly intPage: WaypointPageState<IntersectionFacility | RunwayFacility>;
    public readonly supPage: WaypointPageState<UserFacility>;

    public readonly dtPage: DtPageState = {
        flightTimer: 0,
        departureTime: null,
    };

    public readonly fplPage: FplPageState;

    public readonly navPage: NavPageState;

    public readonly triPage: TriPageState;

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

    public isReady = false;

    /**
     * #416: the first failure of the current power-on that the reset does not recover from (a scan list that cannot be
     * built, spec 4.1a); null at every power-on
     */
    public selfTestFailure: Error | null = null;

    /** #416: the number of the current power-on. A step of the reset of an earlier one changes nothing (spec 4.3) */
    private powerOnCount = 0;

    public constructor(bus: EventBus, userSettings: KLN90BUserSettings, private facilityLoader: FacilityClient, sensors: Sensors, private scanlists: Scanlists, flightplans: Flightplan[], lastactiveWaypoint: Facility | null) {
        this.aptPage = new WaypointPageState("0   ", new SavedWaypoint(userSettings.getSetting("aptPageWpt"), [FacilityType.Airport]));
        this.vorPage = new WaypointPageState("0  ", new SavedWaypoint(userSettings.getSetting("vorPageWpt"), [FacilityType.VOR]));
        this.ndbPage = new WaypointPageState("0  ", new SavedWaypoint(userSettings.getSetting("ndbPageWpt"), [FacilityType.NDB]));
        this.intPage = new WaypointPageState("0    ", new SavedWaypoint(userSettings.getSetting("intPageWpt"), [FacilityType.Intersection, FacilityType.RWY]));
        this.supPage = new WaypointPageState("0    ", new SavedWaypoint(userSettings.getSetting("supPageWpt"), [FacilityType.USR]));
        this.triPage = new TriPageState(
            new SavedWaypoint(userSettings.getSetting("tri1To")),
            new SavedWaypoint(userSettings.getSetting("tri3From")),
            new SavedWaypoint(userSettings.getSetting("tri3To")),
        );
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

        //#416: the reset of an earlier power-on may still be waiting for an answer; what it gets changes nothing (spec 4.3)
        const powerOn = ++this.powerOnCount;
        const isCurrent = () => powerOn === this.powerOnCount;
        this.isReady = false;
        this.selfTestFailure = null;
        this.navPage.startPageWaypoint = this.navPage.activeWaypoint.lastactiveWaypoint; //#422: before a leg can be activated
        //#202: a power cycle forgets the last match of the ident entry
        this.aptPage.lastMatch = null;
        this.vorPage.lastMatch = null;
        this.ndbPage.lastMatch = null;
        this.intPage.lastMatch = null;
        this.supPage.lastMatch = null;

        if (evt.timeSincePowerChange > RESET_TIME) {
            this.fplPage.flightplans[0].removeProcedures();
            //#422: a Direct To is dropped as well (the KLN 89 trainer always, the AVsoftech KLN 90B trainer after a restart of
            //the program but not after a quick off and on, 2026-10-25). NavCalculator activates the closest FPL 0 leg, as
            //after a sim restart
            this.navPage.activeWaypoint.dropDirectTo();
        }

        this.dtPage.departureTime = null;
        this.dtPage.flightTimer = 0;

        this.navPage.nav4VnavWpt = null;
        this.navPage.nav4VnavAngle = null;
        this.navPage.nav4FromAlt = 0;
        this.navPage.nav4VnavDist = 0;
        this.navPage.navmode = NavMode.ENR_LEG;
        this.navPage.xtkScale = 5; //A power-up starts at 5 NM, a NAV flag keeps the scale (#159)
        this.navPage.approachDisarmedLeg = null; //The legs of a short power-off stay in FPL 0, the disarm does not (#139)
        this.navPage.aprActivationDist = 2;
        this.navPage.aprActivationScale = 1;
        //The entered variation outside the database coverage is kept over a short power-off. The KLN 89 Pilot's Guide says
        //so (4-46, 4-47); the 90B guide is silent (5-44)
        if (evt.timeSincePowerChange > RESET_TIME) {
            this.navPage.userMagvar = 0;
        }
        //#192: what a power-on forgets (spec 2026-10-24-power-cycle-design.md, 4.4). The KLN 89 trainer forgot the selected
        //altitude (2026-10-24). The OBS course is not offered again: the unit powers up in LEG (3-3). The Super NAV 5 range is
        //a cache of the automatic range (SuperNav5Page), not pilot state
        this.navPage.nav4SelectedAltitude = 0;
        this.navPage.obsMag = 0;
        this.navPage.superNav5ActualRange = 40;
        //The derived values are recomputed by the first calculation tick
        this.navPage.xtkToActive = null;
        this.navPage.distToActive = null;
        this.navPage.eteToActive = null;
        this.navPage.distToDest = null;
        this.navPage.eteToDest = null;
        this.navPage.bearingToActive = null;
        this.navPage.bearingAtActive = null;
        this.navPage.bearingForAP = null;
        this.navPage.desiredTrack = null;
        this.navPage.steeringPath = null;
        this.navPage.toFrom = null;
        this.navPage.waypointAlert = false;
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

        //#192: each waypoint page shows its saved waypoint again (KLN 89 trainer 2026-10-24), else the first of its scan
        //list; the TRI waypoints come back or become null
        Promise.all([
            this.restoreOr(this.aptPage, this.scanlists.aptScanlist, FacilityType.Airport, "0   ", isCurrent),
            this.restoreOr(this.vorPage, this.scanlists.vorScanlist, FacilityType.VOR, "0  ", isCurrent),
            this.restoreOr(this.ndbPage, this.scanlists.ndbScanlist, FacilityType.NDB, "0   ", isCurrent),
            this.restoreOr(this.intPage, this.scanlists.intScanlist, FacilityType.Intersection, "0   ", isCurrent),
            this.restoreOr(this.supPage, this.scanlists.supScanlist, FacilityType.USR, "0   ", isCurrent),
            this.afterPowerEvent().then(() => this.triPage.restore(this.facilityLoader, isCurrent)),
        ]).then(_ => {
            if (isCurrent()) {
                this.isReady = true;
            }
        }).catch(reason => {
            //#416: no rejection is expected here; one that comes fails the self-test instead of leaving the unit on the
            //Turn-On page (spec 4.1a)
            this.failSelfTest(reason, isCurrent);
        });
    }

    /**
     * The scan list is built at every power-on, also when the page restores its saved waypoint: the scan past the last
     * nearest rank (3-24) and the fast scan need its index. Without a restored waypoint the page shows the first of the
     * scan list, and starts empty when there is none or it does not load
     * @param page The page state
     * @param scanlist The page's scan list
     * @param type The facility type of the scan list's waypoints
     * @param emptyIdent The ident of the page without a waypoint
     * @param isCurrent Whether the power-on is still the current one; an earlier one writes nothing (#416, spec 4.3)
     */
    private async restoreOr<T extends Facility>(page: WaypointPageState<T>, scanlist: Scanlist, type: FacilityType, emptyIdent: string, isCurrent: () => boolean): Promise<void> {
        await this.afterPowerEvent();
        const [restored, first] = await Promise.all([
            page.restore(this.facilityLoader, isCurrent),
            scanlist.init().catch(reason => {
                //#416: the list stays empty for this power-on, which fails its self-test (spec 4.1a)
                this.failSelfTest(reason, isCurrent);
                return null;
            }),
        ]);
        if (restored !== null) {
            return;
        }
        let facility: T | null = null;
        if (first !== null) {
            try {
                facility = await this.facilityLoader.getFacility(type, first) as Facility as T;
            } catch (e) {
                //#416: the page starts empty for this power-on, and the next one tries again (spec 4.1). A user waypoint
                //may also have been deleted by TemporaryWaypointDeleter while it was looked up
                console.warn(`The first waypoint ${ICAO.tryValueToStringV2(first)} of the scan list does not load`, e);
            }
        }
        if (isCurrent()) {
            page.facility = facility;
            page.ident = facility === null ? emptyIdent : facility.icaoStruct.ident;
        }
    }

    /**
     * #416: records the first failure of the current power-on as the failure of its self-test (spec 4.1a)
     */
    private failSelfTest(reason: unknown, isCurrent: () => boolean): void {
        if (isCurrent() && this.selfTestFailure === null) {
            this.selfTestFailure = reason instanceof Error ? reason : new Error(String(reason));
        }
    }

    /**
     * Resolves once the other handlers of the power event have run. TemporaryWaypointDeleter deletes the unused
     * temporary waypoints in the same event (5-22), and the repository lookup of a restore runs at once, so without the
     * wait a saved temporary waypoint would be restored while it is being deleted
     */
    private afterPowerEvent(): Promise<void> {
        return Promise.resolve();
    }
}
