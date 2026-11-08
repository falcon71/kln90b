import {
    EventBus,
    GeoPoint,
    GPSSatComputer,
    GPSPredictionContext,
    GPSSatComputerOptions,
    GPSSatellite,
    GPSSatelliteState,
    GPSSystemState,
    ReadonlyFloat64Array,
    SimVarValueType,
    SubscribableSet,
    UnitType,
} from "@microsoft/msfs-sdk";
import {Degrees, Feet, Knots} from "./data/Units";
import {TimeStamp} from "./data/Time";
import {KLN90BUserSettings} from "./settings/KLN90BUserSettings";
import {KLN90PlaneSettings} from "./settings/KLN90BPlaneSettings";
import {MessageHandler, OneTimeMessage} from "./data/MessageHandler";
import {PowerEvent, PowerEventData, UserMemoryLostEvent} from "./PowerSupply";
import {TICK_TIME_CALC} from "./TickController";
import {
    ACQUIRED_STATES,
    CLOCK_TOLERANCE,
    GPS_ERA_DURATION,
    GpsSearch,
    HOT_ACQUISITION,
    HOT_ACQUISITION_RANGE,
    IDLE_ACQUISITION,
    receiverTimeDifference,
    SDK_REACHABLE_STRENGTH,
    SearchMode,
    WARM_ACQUISITION_RANGE,
} from "./GpsSearch";
import {
    computeGeometry,
    createSolutionMatrices,
    GpsGeometry,
    hasFiniteAngles,
    MAX_ROWS,
    Raim,
    raimStatus,
    raimTestFails,
    raimThreshold,
    SIGMA_UERE_M,
} from "./GpsSolution";
import {GpsMeasurement, MeasurementInputs} from "./GpsMeasurement";
import {Failures} from "./failures/Failures";
import {GpsFailures, ReceiverView} from "./failures/GpsFailures";
import {FailingMeasurement} from "./failures/FailingMeasurement";
import {TransmitterInputs, Transmitters} from "./failures/Transmitters";
import {METERS_PER_MS, noiseRiseDb} from "./GpsTransmitter";
import {AntennaAttitude, LEVEL_ATTITUDE, SatelliteSignals} from "./GpsSignal";
import {AntennaAttitudeSource} from "./AntennaAttitude";
import {ChannelRow, FakeReceiver, FakeReceiverInputs} from "./failures/FakeReceiver";
import {falseReferenceOf, RangeErrors} from "./failures/RangeErrors";

const SAVE_INTERVALL = 60000;
const MIN_GROUND_SPEED_FOR_TRACK = 2; //3-35
const GPS_EPOCH = 315964800000; //Jan 6 1980
const TIME_UPDATE_LIMIT = 10 * 60 * 1000; //B-4: SYSTEM TIME UPDATED TO GPS TIME when the GPS moves the clock by more than 10 minutes
/** #465, design "Recovery": a believed position this far from the truth is beyond the SDK's own 100 NM rule (GpsSearch) */
const FAR_BELIEF_NM = 100;
const METERS_PER_FOOT = 0.3048;
const PRN_SLOTS = 256;
/**
 * #461: the clock after a wipe of the battery-backed memory, 1 JAN 1988 00:00:00 UTC. The year the unit's date editors
 * default to (DateEditor); what the real unit's clock shows after the loss of its memory is a guess
 */
export const WIPED_CLOCK_MS = Date.UTC(1988, 0, 1);
/** #471: the last known position of a receiver whose memory is lost while the host's initialization does not arrive. Never changed */
const NO_POSITION: Readonly<GeoPoint> = new GeoPoint(0, 0);

/**
 * Take-home mode flies without satellites (Installation manual 1-6, 2-4: it acts as if the GPS had a fix), so its
 * solution is a healthy one that never changes, apart from the altitude flag: eight satellites at HDOP 1. The flag follows
 * the altitude input as in flight (updateSolution), so STA 1 shows NAV A with it
 */
const TAKE_HOME_SOLUTION: Readonly<GpsGeometry> = {
    valid: true,
    satellites: 8,
    altitudeAided: false, //The base: updateSolution takes the real value from the altitude input
    measurements: 8,
    hdop: 1,
    cNorth: 0.5, //HDOP 1 split evenly
    cEast: 0.5,
    epeNm: UnitType.METER.convertTo(2 * SIGMA_UERE_M, UnitType.NMILE), //The formula of GpsSolution at HDOP 1
    maxSlope: 0,
};

/** "prn:time,prn:time" (setting lastEphemeris) */
function parseEphemeris(saved: string): [number, number][] {
    return saved === "" ? [] : saved.split(",")
        .map(e => e.split(":").map(Number) as [number, number])
        .filter(([prn, time]) => Number.isFinite(prn) && Number.isFinite(time));
}

export interface GPSEvents {
    timeUpdatedEvent: TimeStamp; //This is fired if either the time was manually updated by the other or when the time was changed by more than 10 minutes
}

/**
 * Note: We have emptied the gps_sbas.json, as WAAS satellites might be added with the default implementation, even though enabledSBASGroups is empty
 */
// @ts-ignore
export class KLNGPSSatComputer extends GPSSatComputer {

    public internalTime: number = 0;
    public search: GpsSearch | undefined = undefined; //Set by GPS after construction
    /** Called before a forced acquisition, to bring the satellites' signals up to date (#467). Set by GPS after construction */
    public onBeforeForcedAcquisition: (() => void) | undefined = undefined;
    /** Called after a forced acquisition, which the unit accepts at once (#215) */
    public onForcedAcquisition: (() => void) | undefined = undefined;

    constructor(index: number, bus: EventBus, ephemerisFile: string, sbasFile: string, updateInterval: number, enabledSBASGroups: Iterable<string> | SubscribableSet<string>, syncRole: "primary" | "replica" | "none", options: Readonly<GPSSatComputerOptions>) {
        super(index, bus, ephemerisFile, sbasFile, updateInterval, enabledSBASGroups, syncRole, options);
    }

    /**
     * The almanac is very important for the KLN 90B. If the position or time is off, it takes a long time to search for
     * the satellites. The start model (GpsSearch) decides whether the receiver may use its almanac (#62)
     *
     * @param simTime
     */
    public isAlmanacValid(simTime?: number): boolean {
        switch (this.search?.mode ?? SearchMode.Idle) {
            case SearchMode.Acquisition:
                return true; //The start model has decided (#62)
            case SearchMode.AlmanacSearch:
                return false;
            case SearchMode.SkySearch:
                //#465: the sky search after a lost fix keeps the receiver's belief, its almanac too (GpsSearch.lostFix)
                return this.search!.keepsBelief && super.isAlmanacValid(simTime);
            default:
                return super.isAlmanacValid(simTime);
        }
    }

    /**
     * The forced acquisition of an engine-running start ends the start model. FAST forces nothing (#468): it starts the
     * search from the true state instead, the same receiver as REAL. The receiver failures'
     * inhibits are applied first: the SDK's forced channel assignment skips inhibited satellites (#460, GPSSat.ts
     * losSatelliteFilterOmniscient). The transmitters' levels (#465) and the antenna's attitude are read before (#467), and
     * the signals are refreshed inside the forced update, at its first reachability query, once the SDK has computed that
     * update's positions: at power-on their reset emptied the lost set, and no calculation tick has run yet to refill it.
     * A lost satellite keeps the channel the forced update gives it and is searched there (#469, wrapReachability)
     */
    public acquireAndUseSatellites(): void {
        this.onBeforeForcedAcquisition?.();
        this.search?.end();
        this.search?.applyInhibits(); //A deliberate guard: end() applies too, but this path must never run unblocked
        super.acquireAndUseSatellites();
        this.onForcedAcquisition?.();
    }

    /**
     * #467: a satellite whose signal the receiver has lost acts on the SDK through its reachability, the SDK's own model of
     * a missing signal: a tracked satellite that is not reachable falls back to None and stays in its channel, searched; a
     * searched one is never acquired and times out to Unreachable. The SDK computes the reachability from the zenith angle
     * (signalStrength above 0.05) before its channel assignment and its updateState, in the same update. Each satellite's
     * updateState is wrapped so that a lost satellite is seen with a signal strength of 0 during that call only; the SDK's
     * own value is put back after it, so the channel assignment keeps the geometric value and gives channels from the
     * almanac's prediction, as the real receiver does. The wrapper allocates nothing per call.
     *
     * #469: a lost satellite always takes the SDK's unforced update, also in the forced update of an engine-running start.
     * The forced branch would make it Unreachable (GPSSat.ts updateStateTracked), which frees its channel and keeps it
     * out of the assignment for minutes after its signal returns. The forced update runs with a delta time of 0, so the
     * unforced branch neither acquires a searched satellite nor times it out: it stays None in its channel, searched, as
     * after any other loss.
     *
     * #470: the SDK's Unreachable means below the horizon, and it then leaves the satellite out of its channel assignment
     * for an hour. A receiver that knows its position, time and almanac does not give up on a satellite it predicts in
     * view because it cannot hear it; it keeps searching it, however long the loss lasts. So while the search has that
     * belief (GpsSearch.searchesBlind false), a lost satellite that is up by the SDK's own geometry has its acquisition
     * clock (timeSpentAcquiring, private) cleared before each update, and never reaches the timeout. One that is below
     * the horizon still times out, and the blind searches keep the SDK's timeout, which moves them on to the next PRN
     * (GpsSearch.nextPassWhenAllGivenUp)
     *
     * Safe to call again: each call wraps the SDK's own method, never an earlier wrapper. The data is private in the SDK
     * @param isLost Whether the receiver has lost the satellite's signal
     * @throws Error if a satellite's private data, its signal strength or its acquisition clock moved in an SDK upgrade
     */
    public wrapReachability(isLost: (prn: number) => boolean): void {
        const original = GPSSatellite.prototype.updateState;
        const computer = this;
        const wrapper = function (this: GPSSatellite, simTime: number, deltaTime: number, distanceFromLastKnownPos: number, forceAcquireAndUse: boolean): boolean {
            if (!isLost(this.prn)) {
                return original.call(this, simTime, deltaTime, distanceFromLastKnownPos, forceAcquireAndUse);
            }
            const data = (this as any).data;
            const strength = data.signalStrength;
            if (strength > SDK_REACHABLE_STRENGTH && !(computer.search?.searchesBlind ?? false)) {
                data.timeSpentAcquiring = undefined; //Searched without end (#470)
            }
            data.signalStrength = 0;
            try {
                return original.call(this, simTime, deltaTime, distanceFromLastKnownPos, false); //Never forced (#469)
            } finally {
                data.signalStrength = strength;
            }
        };
        for (const sat of this.getSatellites()) {
            if (typeof (sat as any).data?.signalStrength !== "number" || !("timeSpentAcquiring" in (sat as any).data)) {
                throw new Error("GPSSatellite data moved: recheck Gps.ts after the SDK upgrade");
            }
            (sat as any).updateState = wrapper;
        }
    }

    /**
     * #465, design "Recovery": the sky search after a lost fix searches every PRN. The SDK marks a satellite it searched in
     * vain for its acquisition timeout as Unreachable and leaves it out of its channel assignment for an hour; in a blind
     * search a satellite whose signal the receiver lost (#467) is marked so too, although it is up (with a belief it never
     * times out, #470). The marks are forgotten here: a satellite in a channel is searched again there, the others can be
     * given a channel again. Public SDK API only. Allocates nothing: the sky search that keeps the belief calls it in every
     * tick, and a blind search at the start of each pass (GpsSearch)
     */
    public forgetUnreachable(): void {
        const sats = this.getSatellites();
        for (let i = 0; i < sats.length; i++) {
            this.forget(sats[i]);
        }
    }

    /**
     * #465: forgets the Unreachable mark of one satellite, as forgetUnreachable does for all. For a satellite a fake
     * satellite's claim held lost (FakeReceiver.freeHeld). Public SDK API only
     */
    public forgetUnreachableSatellite(prn: number): void {
        const sats = this.getSatellites();
        for (let i = 0; i < sats.length; i++) {
            if (sats[i].prn === prn) {
                this.forget(sats[i]);
            }
        }
    }

    private forget(sat: GPSSatellite): void {
        if (sat.state.get() === GPSSatelliteState.Unreachable) {
            const tracked = this.getChannels().includes(sat);
            sat.resetState(); //None, and no longer tracked
            if (tracked) {
                sat.setTracked(true);
            }
        }
    }

    /** The time the receiver last completed an almanac, sim time. Private in the SDK */
    public getLastAlmanacTime(): number | undefined {
        return (this as any).lastAlamanacTime;
    }

    /** Sets the SDK's acquisition time without ephemeris. Its timing options are private; the satellites share the object */
    public setAcquisitionTime(mean: number, range: number): void {
        const options = (this as any).satelliteTimingOptions;
        if (options === undefined) {
            throw new Error("GPSSatComputer.satelliteTimingOptions moved: recheck Gps.ts after the SDK upgrade");
        }
        options.acquisitionTime = mean;
        options.acquisitionTimeRange = range;
    }

    /** Sets the SDK's acquisition time with a current ephemeris, the hot start of its 2 NM rule (#62). The same private options */
    public setAcquisitionTimeWithEphemeris(mean: number, range: number): void {
        const options = (this as any).satelliteTimingOptions;
        if (options === undefined) {
            throw new Error("GPSSatComputer.satelliteTimingOptions moved: recheck Gps.ts after the SDK upgrade");
        }
        options.acquisitionTimeWithEphemeris = mean;
        options.acquisitionTimeRangeWithEphemeris = range;
    }

    /** Puts a stored ephemeris back into the receiver (#62). The time is private satellite data in the SDK */
    public restoreEphemeris(entries: [number, number][]): void {
        for (const [prn, time] of entries) {
            const sat = this.getSatellites().find(s => s.prn === prn);
            if (sat !== undefined) {
                (sat as any).data.lastEphemerisTime = time;
            }
        }
    }

    /**
     * FAST (#468): gives every satellite a current ephemeris, collected at the given time. The time is private satellite
     * data in the SDK, as for restoreEphemeris. Does nothing before the satellites are loaded
     * @param time The sim time, UNIX ms: the time base the SDK checks the ephemeris' age against
     * @throws Error if a satellite's private data moved in an SDK upgrade
     */
    public setEphemerisCurrent(time: number): void {
        for (const sat of this.getSatellites()) {
            const data = (sat as any).data;
            if (data === undefined || !("lastEphemerisTime" in data)) {
                throw new Error("GPSSatellite data moved: recheck Gps.ts after the SDK upgrade");
            }
            data.lastEphemerisTime = time;
        }
    }

    /**
     * channels is private, but we display this in the STA 1 page, so we make it public here
     */
    public getChannels(): (GPSSatellite | null)[] {
        return (this as any).activeSimulationContext.channels;
    }
}


export class GPS {
    /** One object for the life of the unit, updated in place (#402): no reader keeps it */
    public readonly coords: GeoPoint;
    public trackTrue: Degrees = 0; //Consider accessing this via getTrackRespectingGroundspeed
    public groundspeed: Knots = 0;
    public timeZulu: TimeStamp;
    public gpsSatComputer: KLNGPSSatComputer;
    public readonly search: GpsSearch;
    /** STA 5 predicts the satellite geometry at the destination and ETA through this context (6-20, #214) */
    public readonly raimPrediction: GPSPredictionContext;
    /** The receiver failures, jamming and the faulty satellite (#460) */
    public readonly failures: GpsFailures;
    /** The jammer and the spoofer on the ground (#465) */
    public readonly transmitters: Transmitters;
    /** The SNR of every satellite and whether the receiver has lost its signal, whatever the cause (#467) */
    public readonly signals: SatelliteSignals;
    /** The spoofer's fake satellites in the unit's channels (#465) */
    public readonly fakeReceiver: FakeReceiver;
    /** What the fake receiver reads, filled in place once per calculation tick (#465) */
    private readonly fakeInputs: FakeReceiverInputs;
    /** The unit's channels for STA 1, reused (#465) */
    private readonly rows: ChannelRow[] = [];
    /** Gives a satellite a claim held until it timed out back to the SDK as searchable (#465, FakeReceiver.freeHeld) */
    private readonly freeSatellite = (prn: number) => this.gpsSatComputer.forgetUnreachableSatellite(prn);
    private readonly antenna: AntennaAttitudeSource;
    /** Filled by the antenna source once per calculation tick, and before a forced acquisition */
    private readonly attitude: AntennaAttitude = {...LEVEL_ATTITUDE};
    /** What the transmitters need of the aircraft, filled in place once per calculation tick and before a forced acquisition (#465) */
    private readonly _transmitterInputs: TransmitterInputs = {lat: 0, lon: 0, aglFt: 0, groundElevationFt: 0, simTimeS: 0, attitude: this.attitude};
    /**
     * A forced acquisition is under way: the signals are refreshed at its first reachability query (wrapReachability),
     * not before it. The SDK computes the satellites' positions in the forced update itself, and before the first update
     * of a boot every position is still 0 (overhead), which would lose no satellite
     */
    private signalsRefreshPending = false;
    /** The simulator's UNIX time of the last tick, for what the receiver reads from its satellites (STA 1) */
    public simTimeUnix: number = 0;
    private intSaveCount = 0;
    private readonly takeHomeMode: boolean;
    /** FAST has initialized the memory from the truth: the ephemeris restore of the satellites' late load must keep it current (#468) */
    private ephemerisFromTruthPending = false;
    /** #461: a wipe erased the receiver's memory: the ephemeris restore of the satellites' late load must erase instead */
    private ephemerisErasePending = false;
    /** #461: the wipe left no stored position, so the first fix has nothing to compare with (B-3). Until that fix or a power-off */
    private noStoredPosition = false;
    /** #461, #471: this power-on wiped the receiver's memory (the battery or rcvrMemory). FAST restores nothing from the truth until the next power event */
    private memoryLostThisPowerOn = false;
    private gpsStartTime: number = 0;
    private solutionAccepted = false; //5-29: the unit accepts the receiver's solution one calculation tick after it appears (TRAN)
    private inTransition = false;
    private _hadFixSincePowerOn = false;
    /** The unit's own position solution (#453, GpsSolution.ts), recomputed by updateSolution */
    private _solution: GpsGeometry;
    //The inputs of the last computation, kept in reused arrays: the SDK changes a satellite's position array in place
    private readonly solutionPrns: number[] = [];
    /** Per row: 1 for a fake satellite's row, which claims the false state (#465) */
    private readonly solutionClaims = new Uint8Array(MAX_ROWS);
    private readonly solutionPositions: number[] = []; //zenith, azimuth per satellite
    private solutionAltitude = false;
    private readonly solutionInputs: ReadonlyFloat64Array[] = [];
    /** The lines of sight of the rows from the reference state, one reused array per row (#465) */
    private readonly rowLines: Float64Array[] = Array.from({length: MAX_ROWS}, () => new Float64Array(2));
    /** The rows of the satellites before the reference state is known: PRN and claim (#465). Typed, so a tick allocates nothing */
    private readonly candidatePrns = new Int32Array(MAX_ROWS);
    private readonly candidateClaims = new Uint8Array(MAX_ROWS);
    /** The real satellites' rows, for the faulty satellite (ReceiverView.solutionPrns) */
    private readonly realSolutionPrns: number[] = [];
    /** The rows for the range errors, filled in place (#465) */
    private readonly solutionRows = {prns: this.solutionPrns as readonly number[], falseClaim: this.solutionClaims, altitudeRow: false, falseReference: false};
    /** The coefficients of the error mapping of the cached solution, written by computeGeometry (#402) */
    private readonly solutionCoefficients = new Float64Array(2 * MAX_ROWS);
    /** The matrices of the cached solution, written by computeGeometry; n = 0 without a valid solution (#465) */
    private readonly solutionMatrices = createSolutionMatrices();
    /** The range errors of the mixed solution: the shift from the reference state and the residual (#465) */
    public readonly rangeErrors = new RangeErrors();
    /** The index of a PRN in the SDK's satellites, -1 for none; rebuilt when the satellites are loaded */
    private readonly sdkIndex = new Int16Array(PRN_SLOTS).fill(-1);
    private sdkIndexedCount = 0;
    private readonly trueSinElevation = (prn: number): number => {
        const sat = this.sdkSatellite(prn);
        return sat === null ? NaN : Math.cos(sat.position.get()[0]);
    };
    private readonly falseSinElevation = (prn: number): number => Math.cos(this.fakeReceiver.fakeZenith(prn));
    /** The SDK's last known position is always the true one (#465): reused */
    private readonly truePosition = new GeoPoint(0, 0);
    /** Reused for every measurement update; the solution and the altitude are filled in before each */
    private readonly measurementInputs: MeasurementInputs;
    /** The measured position of a new fix, before it replaces coords */
    private readonly acquiredPosition = new GeoPoint(0, 0);
    /** The given measurement strategy with the faulty satellite's error added (#460) */
    private readonly measurement: GpsMeasurement;
    /** Sim time (s) the calculation ticks stopped at a hot-swap disable, or null while they run (#465) */
    private ticksStoppedAt: number | null = null;
    private lastPowerOffTime: number = SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds); //Sim time (s) of construction or the last power-off. The battery clock runs on while the unit is off (3-53)

    /**
     * @param indicatedAltitude the altitude input, null when there is none. The solution uses it as a measurement (5-29)
     * @param measurement where the position, the ground speed and the track come from while the unit has a fix (#402)
     * @param antenna where the attitude of the antenna comes from, which tilts the satellites' signals (#467)
     * @param signalRandom the random source of the signals' fades and estimate noise (#467)
     * @param failures the failure service; the receiver failures, jamming and the faulty satellite act here (#460)
     */
    constructor(private bus: EventBus, private userSettings: KLN90BUserSettings, options: KLN90PlaneSettings, private readonly messageHandler: MessageHandler,
                private readonly indicatedAltitude: () => Feet | null, measurement: GpsMeasurement, antenna: AntennaAttitudeSource,
                signalRandom: () => number, failures: Failures) {
        this.takeHomeMode = options.takeHomeMode;
        this.antenna = antenna;
        //Before the receiver and the search, which read it from their callbacks: the search's blocks, the signals and the
        //solution (updateSolution, also from acceptForcedSolution after a forced acquisition)
        const gps = this;
        const view: ReceiverView = {
            satellites: () => gps.gpsSatComputer.getSatellites(),
            solutionPrns: () => gps.realSolutionPrns,
            get solution(): GpsGeometry {
                return gps._solution;
            },
            isValid: () => gps.isValid(),
        };
        this.failures = new GpsFailures(bus, failures, view, this.takeHomeMode);
        this.transmitters = new Transmitters(bus, failures, this.takeHomeMode);
        this.signals = new SatelliteSignals(view, signalRandom);
        this.measurement = new FailingMeasurement(measurement, this.rangeErrors);
        this._solution = this.takeHomeMode ? {...TAKE_HOME_SOLUTION} : computeGeometry([], false, this.solutionCoefficients);
        //#465: the residual test's thresholds are solved here, outside the ticks: the first one of a redundancy costs a
        //bisection (GpsSolution raimThreshold), cached afterwards
        for (let dof = 1; dof <= MAX_ROWS - 4; dof++) {
            raimThreshold(dof);
        }
        this.measurementInputs = {geometry: this._solution, prns: this.solutionPrns, coefficients: this.solutionCoefficients, indicatedAltitudeFt: null};
        //#468: FAST and REAL are the same receiver with the same timings. FAST only sets the unit's memory to the true state
        //at power-on (initializeFromTruth)
        const gpsOptions: GPSSatComputerOptions = {
            channelCount: 8,
            timingOptions: { //3-17, #62
                almanacExpireTime: 182 * 24 * 60 * 60 * 1000, //Six months
                ephemerisExpireTime: 2 * 60 * 60 * 1000,
                acquisitionTime: IDLE_ACQUISITION, //GpsSearch sets it per power-on
                acquisitionTimeRange: WARM_ACQUISITION_RANGE,
                acquisitionTimeWithEphemeris: HOT_ACQUISITION, //#62: a power cycle with a current ephemeris has its fix in 0:17, self-test included
                acquisitionTimeRangeWithEphemeris: HOT_ACQUISITION_RANGE,
                acquisitionTimeout: 4 * 60 * 1000,
                ephemerisDownloadTime: 30000, //30 Seconds, one data frame
                almanacDownloadTime: 750000, //12.5 minutes
            },
        };

        //#463: the SDK publishes the receiver's events synced to every instrument, on topics named by its index. Other GPS
        //units use the same topics (the Working Title GNS reads gps_system_state_changed_1) and the KLN reads none of
        //them, so the receiver gets a bus of its own that syncs nothing and asks for no resync
        const receiverBus = new EventBus(() => ({sendSyncedEvent: () => undefined}), false);
        this.gpsSatComputer = new KLNGPSSatComputer(
            1,
            receiverBus,
            `coui://${options.basePath}/Assets/gps_ephemeris.json`,
            `coui://${options.basePath}/Assets/gps_sbas.json`,
            5000,
            [],
            'none',
            gpsOptions,
        );
        //Before the power event subscription, so that powerChanged always finds the search. PowerSupply publishes no power
        //event before Sensors exists, so powerChanged never runs before the end of this constructor
        this.search = new GpsSearch(this.gpsSatComputer, () => this.failures.receiverFailed, () => this.acquisitionFactor);
        this.gpsSatComputer.search = this.search;
        //#465: the fake sky at the false position and time, and the sky the unit's almanac predicts at its belief
        this.fakeReceiver = new FakeReceiver(this.gpsSatComputer.createPredictionContext(), this.gpsSatComputer.createPredictionContext(), signalRandom);
        this.fakeInputs = {
            simTimeMs: 0, spoofer: null, spooferRatio: 0, jammerRatio: 0, antennaLossDb: 0, beliefLat: 0, beliefLon: 0, beliefTimeMs: 0,
            searchAll: false, almanacSearch: false, acquisitionFactor: 1, sdkChannels: this.gpsSatComputer.getChannels(),
            realSnr: prn => this.signals.snr(prn), realLost: prn => this.signals.isLost(prn),
        };
        //Through the object, not a bound method, so that a test's spy on signals.isLost takes effect. #465: a satellite in
        //a channel that a fake satellite claims is held lost too, read from the channels at each query (FakeReceiver)
        const isLost = (prn: number) => {
            if (this.signalsRefreshPending) {
                this.signalsRefreshPending = false;
                this.signals.refresh(this.attitude, this.currentNoiseRiseDb());
            }
            return this.signals.isLost(prn) || this.fakeReceiver.claimsSdkPrn(prn);
        };
        this.gpsSatComputer.onBeforeForcedAcquisition = () => {
            //A forced acquisition the SDK delays until its satellites are loaded runs before awaitInit resolves below
            this.gpsSatComputer.wrapReachability(isLost);
            this.antenna.read(this.attitude);
            if (this.transmitters.anyActive) {
                //Only for a transmitter: with no failure the forced acquisition reads what it read before #465
                this.readTransmitterInputs(SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds),
                    SimVar.GetSimVarValue('PLANE LATITUDE', SimVarValueType.Degree),
                    SimVar.GetSimVarValue('PLANE LONGITUDE', SimVarValueType.Degree));
            }
            this.transmitters.refresh(this._transmitterInputs); //#465: the levels at the aircraft, a stored transmitter loaded
            this.signalsRefreshPending = true;
        };
        this.raimPrediction = this.gpsSatComputer.createPredictionContext(); //STA 5 (6-20): one context for the life of the unit; pages are rebuilt on every knob step
        this.gpsSatComputer.onForcedAcquisition = () => this.acceptForcedSolution();
        bus.getSubscriber<PowerEvent>().on("powerEvent").handle(this.powerChanged.bind(this));
        //Published before the powerEvent of the same power-on, and after the storage wipe (KLN90BCore subscribes first)
        bus.getSubscriber<UserMemoryLostEvent>().on("userMemoryLost").handle(this.forgetMemory.bind(this));

        this.gpsSatComputer.init();
        const savedEphemeris = parseEphemeris(userSettings.getSetting("lastEphemeris").get());
        this.gpsSatComputer.awaitInit().then(() => {
            if (this.ephemerisErasePending) {
                //#461: a wipe ran before the satellites were loaded: the ephemeris parsed above was lost with the memory
                this.gpsSatComputer.eraseCachedEphemeris();
            } else {
                this.gpsSatComputer.restoreEphemeris(savedEphemeris);
            }
            if (this.ephemerisFromTruthPending) {
                //A FAST power-on ran before the satellites were loaded: its ephemeris would be lost to the restore (#468)
                this.gpsSatComputer.setEphemerisCurrent(this.currentSimUnixTime());
            }
            this.gpsSatComputer.wrapReachability(isLost);
        });

        this.coords = new GeoPoint(
            userSettings.getSetting("lastLatitude").get(),
            userSettings.getSetting("lastLongitude").get(),
        );
        this.gpsSatComputer.downloadAlamanac(userSettings.getSetting("lastAlmanacDownload").get());

        this.gpsSatComputer.syncLastKnownPosition(this.coords);


        //We assume that the internal clock kept the time fairly accurate since it has last been running
        const timeRandom = Math.random() * 5 - 2.5;
        //#461: the clock is kept across sessions as its offset from the sim time, so a wrong era stays until it is corrected
        const storedOffset = userSettings.getSetting("clockOffset").get();
        const offset = Number.isFinite(storedOffset) ? storedOffset : 0;
        const unixTime = this.absoluteTimeToUNIXTime(SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds) + timeRandom) + offset;
        this.timeZulu = this.unixToTimestamp(unixTime);
        this.gpsSatComputer.internalTime = unixTime;
    }

    tick() {
        const simTime = SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds);
        const actualUnixTime = this.absoluteTimeToUNIXTime(simTime);
        this.simTimeUnix = actualUnixTime;
        const lat = SimVar.GetSimVarValue('PLANE LATITUDE', SimVarValueType.Degree);
        const lon = SimVar.GetSimVarValue('PLANE LONGITUDE', SimVarValueType.Degree);
        if (this.ticksStoppedAt !== null) {
            //#465: the first tick after a hot-swap disable. The battery clock ran on while the ticks stood, as over a
            //power-off (3-53): without it, the general time check and the clock rule of a lost fix would see it behind
            const stoppedMs = (simTime - this.ticksStoppedAt) * 1000;
            this.timeZulu.setTimestamp(this.timeZulu.getTimestamp() + stoppedMs);
            this.ticksStoppedAt = null;
            if (!this.isValid()) {
                //The search reads it before the solution. #471: with 0400 the receiver's own clock runs on over the stop too
                this.gpsSatComputer.internalTime = this.failures.receiverErrors.hostBlocked
                    ? this.gpsSatComputer.internalTime + stoppedMs
                    : this.timeZulu.getTimestamp();
            }
        }

        if (this.takeHomeMode) {
            const distance = this.groundspeed / 60 / 60 / 1000 * TICK_TIME_CALC;

            this.coords.offset(this.trackTrue, UnitType.NMILE.convertTo(distance, UnitType.GA_RADIAN)); //In place

            this.intSaveCount += TICK_TIME_CALC;
            if (this.intSaveCount >= SAVE_INTERVALL) {
                this.savePosition();
                this.intSaveCount = 0;
            }
            this.timeZulu.setTimestamp(this.timeZulu.getTimestamp() + TICK_TIME_CALC);
            this.gpsSatComputer.internalTime = this.timeZulu.getTimestamp();
            this.updateSolution(simTime);
        } else {
            const hadFix = this.isValid(); //The fix of the last tick: a power-off clears it, and ticks run only while powered
            //#460, #465, #467: the failures first, then the antenna's attitude and the transmitters' levels at the aircraft,
            //then the signals from that attitude and the noise rise of the levels, then the fake satellites' claims on the
            //channels, then the search and its inhibits for the channel assignment, then the receiver, which reads the lost
            //set and the claims through the reachability (wrapReachability)
            this.failures.tick(simTime);
            this.antenna.read(this.attitude);
            this.readTransmitterInputs(simTime, lat, lon);
            this.transmitters.tick(this._transmitterInputs);
            this.signals.tick(simTime, this.attitude, this.currentNoiseRiseDb());
            this.readFakeInputs(actualUnixTime);
            this.fakeReceiver.tick(this.fakeInputs);
            if (this.fakeReceiver.fakeSkyCount > 0) {
                //The fake sky's count is known only once a spoofer is there: the next spoofer's edge is computed for it
                this.transmitters.setFakeCount(this.fakeReceiver.fakeSkyCount);
            }
            this.search.tick(actualUnixTime, {lat, lon}, this.gpsSatComputer.internalTime);
            this.search.applyInhibits();
            this.gpsSatComputer.onUpdate();
            //#471: 0008 leaves the word in the first tick that tracks a satellite (IM C-3). The bit first: no channel scan without it
            if (this.failures.receiverErrors.memoryBitSet && this.tracksSatellite) {
                this.failures.receiverErrors.satelliteTracked();
            }
            this.fakeReceiver.freeHeld(this.fakeInputs, this.freeSatellite); //#465: after the SDK's timeouts and channel moves
            this.updateSolution(simTime);

            if (!this._solution.valid) {
                this.solutionAccepted = false;
                this.inTransition = false;
            } else if (!this.solutionAccepted) {
                if (this.inTransition) {
                    this.solutionAccepted = true;
                    this.inTransition = false;
                    this.gpsAcquired();
                } else {
                    this.inTransition = true;
                }
            }
            if (hadFix && !this.isValid()) {
                this.fixLost(actualUnixTime, lat, lon);
            }

            if (this.isValid()) {
                this.measure(simTime, lat, lon);
                this.coords.set(this.measurement.lat, this.measurement.lon);
                if (!this.hasSdkSolution()) {
                    //Three satellites plus the altitude, or fake satellites in the channels: the SDK has no solution of its
                    //own and would keep its last known position where its solution ended. Beyond 100 NM of it, its
                    //line-of-sight filter offers no satellite for a free channel and it searches blind in PRN order (#453,
                    //design 5.1, GpsSolution.test.ts). Always the true position (#465, design "Kept from the issue"): a
                    //false one beyond 100 NM would send the SDK into that blind search
                    this.gpsSatComputer.syncLastKnownPosition(this.truePosition.set(lat, lon));
                }
                this.groundspeed = this.measurement.groundspeedKt;

                //3-35: the track is updated only from 2 kt (3-34: it may lag a bit). The measurement gives none while the
                //sim is paused, and the last one is held
                if (this.groundspeed >= MIN_GROUND_SPEED_FOR_TRACK && this.measurement.trackTrue !== null) {
                    this.trackTrue = this.measurement.trackTrue;
                }

                this.intSaveCount += TICK_TIME_CALC;
                if (this.intSaveCount >= SAVE_INTERVALL) {
                    this.savePosition();
                    this.intSaveCount = 0;
                }
                const assumedTime = this.timeZulu.getTimestamp() + TICK_TIME_CALC; //We need to add a second, otherwise we would roll back right to the start of the GPS epcoh
                this.timeZulu = this.calculateGPSTime(assumedTime, this.solutionTime(actualUnixTime));
                //#465, B-4: the general time check, in every tick with a fix (a spoofer's time shift, or the sim's time changed
                //during a fix). In the tick of the acquisition gpsAcquired has just set the clock to this time and posted itself
                if (Math.abs(this.timeZulu.getTimestamp() - assumedTime) > TIME_UPDATE_LIMIT) {
                    this.timeUpdated(this.timeZulu);
                }
                this.gpsSatComputer.internalTime = actualUnixTime; //The SDK's receiver keeps the true time (#465)
            } else {
                this.timeZulu.setTimestamp(this.timeZulu.getTimestamp() + TICK_TIME_CALC);
                //#471: with 0400 the host does not hand the receiver its clock (IM C-4): the receiver's own runs on
                this.gpsSatComputer.internalTime = this.failures.receiverErrors.hostBlocked
                    ? this.gpsSatComputer.internalTime + TICK_TIME_CALC
                    : this.timeZulu.getTimestamp();
                /*
                    4-13:
                        If the present position flags (NAV flag) after being valid
                        in the NAV mode, the flight timer continues to run if
                        the groundspeed was more than 30 knots immediately
                        before the flag.
                    This means, the last values are keep the way they are when the signal becomes invalid.
                 */

            }
        }
    }

    /** What the transmitters were last given of the aircraft (#465). The object is reused: copy it to keep it */
    public get transmitterInputs(): Readonly<TransmitterInputs> {
        return this._transmitterInputs;
    }

    /**
     * Fills the transmitters' inputs: the true position, the sim time and the antenna's attitude, which the caller has read
     * before, and the height above the ground and the ground's elevation, read once each (the tick cost rule, CLAUDE.md).
     * The heights only while a transmitter failure is in effect (final review, 2026-11-08): nothing else needs them, so with
     * no failure the tick reads the SimVars it read before #465. Height above the ground, so that a jet parked at a high
     * airport is on the ground for its transmitters (design, "Transmitters")
     */
    private readTransmitterInputs(simTime: number, lat: number, lon: number): void {
        const inputs = this._transmitterInputs;
        inputs.lat = lat;
        inputs.lon = lon;
        if (this.transmitters.anyActive) {
            inputs.aglFt = SimVar.GetSimVarValue('PLANE ALT ABOVE GROUND', SimVarValueType.Feet);
            inputs.groundElevationFt = SimVar.GetSimVarValue('PLANE ALTITUDE', SimVarValueType.Feet) - inputs.aglFt;
        }
        inputs.simTimeS = simTime;
    }

    /** Fills the fake receiver's inputs: the transmitters' levels, the unit's belief (its position and clock) and the start model's search (#465) */
    private readFakeInputs(simTimeMs: number): void {
        const inputs = this.fakeInputs;
        inputs.simTimeMs = simTimeMs;
        inputs.spoofer = this.transmitters.spoofer;
        //#465: no signal reaches a dead antenna or receiver (IM C-7). The fake satellites fall below the lock rule and their
        //claims go in this tick; their rows leave the solution with the real ones (updateSolution)
        inputs.spooferRatio = this.failures.receiverFailed ? 0 : this.transmitters.spooferRatio;
        inputs.jammerRatio = this.transmitters.jammerRatio;
        inputs.antennaLossDb = this.failures.receiverErrors.antennaLossDb;
        inputs.beliefLat = this.coords.lat;
        inputs.beliefLon = this.coords.lon;
        inputs.beliefTimeMs = this.timeZulu.getTimestamp();
        inputs.searchAll = this.search.mode === SearchMode.SkySearch || this.search.mode === SearchMode.AlmanacSearch;
        inputs.almanacSearch = this.search.mode === SearchMode.AlmanacSearch;
        inputs.acquisitionFactor = this.acquisitionFactor;
        inputs.sdkChannels = this.gpsSatComputer.getChannels();
    }

    /**
     * The unit's channels as of the last calculation tick, for STA 1 (5-29): a channel a fake satellite claims shows it, the
     * others the SDK's satellite (#465). The array and its rows are reused: copy them to keep them
     */
    public channelRows(): readonly ChannelRow[] {
        this.fakeReceiver.fillRows(this.rows, this.fakeInputs);
        return this.rows;
    }

    /**
     * What the signals subtract from every real satellite's SNR: the rise of the noise floor from the jammer's and the
     * spoofer's levels at the aircraft (#465), plus the antennaGain failure's loss (#471, IM C-7; KLN 900 Pilot's Guide B-6).
     * Only the signals call it, so the loss is no transmitter's noise rise anywhere else. The fake satellites take the
     * loss through FakeReceiverInputs.antennaLossDb
     */
    private currentNoiseRiseDb(): number {
        return noiseRiseDb(this.transmitters.jammerRatio, this.transmitters.spooferRatio) + this.failures.receiverErrors.antennaLossDb;
    }

    /**
     * 3-32 The track is only shown, when the speed is sufficient. This method return null if it's not
     */
    public getTrackTrueRespectingGroundspeed(): Knots | null {
        return this.groundspeed >= MIN_GROUND_SPEED_FOR_TRACK ? this.trackTrue : null;
    }

    private hasSdkSolution(): boolean {
        const state = this.gpsSatComputer.systemState.get();
        return state === GPSSystemState.SolutionAcquired || state === GPSSystemState.DiffSolutionAcquired;
    }

    /**
     * 5-29: a position needs four satellites, or three when the altitude input is used in the solution. The unit's own
     * solution decides, not the SDK's, which always needs four (#453)
     */
    public isValid(): boolean {
        return this.solutionAccepted && this._solution.valid;
    }

    /** The unit's own position solution from the satellites the SDK has in use and the altitude input (#453). Constant in take-home mode */
    public get solution(): GpsGeometry {
        return this._solution;
    }

    /**
     * #471, rcvrEeprom (IM C-4, 0800): how much longer the receiver's searches take, for the real satellites (GpsSearch) and
     * the fake ones (FakeReceiver) alike. The factor ends with the first fix of the power-on, as a receiver with a fix has
     * solved its clock drift (design "rcvrEeprom"); a search restarted after a lost fix takes the normal times
     */
    private get acquisitionFactor(): number {
        return this._hadFixSincePowerOn ? 1 : this.failures.receiverErrors.acquisitionFactor;
    }

    /** Whether the unit has accepted a fix since it was last turned on */
    public get hadFixSincePowerOn(): boolean {
        return this._hadFixSincePowerOn;
    }

    /**
     * The rows of the solution: the satellites the SDK has in use, in PRN order, then the fake satellites in use (#465), in
     * channel order, and the altitude input. The geometry is recomputed only when one of them, their claims or their lines of
     * sight changed: the SDK moves the satellites every 5 s, the calculation ticks at 1 Hz. The range errors are updated in
     * every call, as the faulty satellite's bias ramps per tick (#460). Public SDK API only: the in-use state of the
     * satellites, not the private channel list.
     *
     * #465, design "The solution": the reference state is the one most satellite rows claim, the true one on a tie. The
     * lines of sight are the directions from it: the SDK's satellites in the real sky for the true state, the fake sky for
     * the false state
     * @param simTimeS The sim time in seconds
     */
    private updateSolution(simTimeS: number): void {
        if (this.takeHomeMode) {
            const aided = this.receiverAltitude() !== null;
            if (aided !== this._solution.altitudeAided) {
                this._solution = {...TAKE_HOME_SOLUTION, altitudeAided: aided};
            }
            return;
        }
        const altitudeFt = this.receiverAltitude();
        const altitude = altitudeFt !== null;
        let changed = altitude !== this.solutionAltitude;
        const receiverFailed = this.failures.receiverFailed; //Once: it reads the settings (the tick cost rule, CLAUDE.md)
        const candidates = this.candidatePrns;
        const claims = this.candidateClaims;
        let count = 0;
        //#460: the SDK releases an inhibited satellite only at its next position update, up to 5 s later. The unit does not
        //wait (design, "Blocked satellites leave the unit's solution at once"); #465: nor for the fake satellites
        if (!receiverFailed) {
            const sats = this.gpsSatComputer.getSatellites();
            for (let i = 0; i < sats.length && count < MAX_ROWS; i++) {
                const sat = sats[i];
                const state = sat.state.get();
                if (state !== GPSSatelliteState.InUse && state !== GPSSatelliteState.InUseDiffApplied) {
                    continue;
                }
                //#467: a satellite lost between the signals' tick and the SDK's update is left out. #465: so is one in a
                //channel a fake satellite claims. That filter is a guard and is not reached today: a claim never takes a
                //channel whose satellite is tracked and not lost (FakeReceiver.channelFor), and the reachability wrapper
                //holds a claimed SDK satellite lost, so the SDK never has one in use
                if (this.signals.isLost(sat.prn) || this.fakeReceiver.claimsSdkPrn(sat.prn)) {
                    continue;
                }
                claims[count] = 0;
                candidates[count++] = sat.prn;
            }
            const fakes = this.fakeReceiver.inUsePrns();
            for (let i = 0; i < fakes.length && count < MAX_ROWS; i++) {
                claims[count] = 1;
                candidates[count++] = fakes[i];
            }
        }
        //The satellite rows vote; the altitude row claims no state
        const falseReference = falseReferenceOf(claims, count);
        if (falseReference !== this.solutionRows.falseReference) {
            changed = true;
            this.solutionRows.falseReference = falseReference;
        }

        let n = 0;
        let real = 0;
        for (let i = 0; i < count; i++) {
            const prn = candidates[i];
            const line = this.rowLines[n];
            if (falseReference) {
                line[0] = this.fakeReceiver.fakeZenith(prn);
                line[1] = this.fakeReceiver.fakeHourAngle(prn);
            } else {
                const sat = this.sdkSatellite(prn);
                if (sat === null) {
                    continue;
                }
                const position = sat.position.get();
                line[0] = position[0];
                line[1] = position[1];
            }
            if (!hasFiniteAngles(line)) {
                continue; //Left out here, not in computeGeometry, so that the PRNs and the coefficients stay row by row (#456)
            }
            if (n >= this.solutionPrns.length
                || this.solutionPrns[n] !== prn
                || this.solutionClaims[n] !== claims[i]
                || this.solutionPositions[2 * n] !== line[0]
                || this.solutionPositions[2 * n + 1] !== line[1]) {
                changed = true;
                this.solutionPrns[n] = prn;
                this.solutionClaims[n] = claims[i];
                this.solutionPositions[2 * n] = line[0];
                this.solutionPositions[2 * n + 1] = line[1];
            }
            if (claims[i] === 0) {
                this.realSolutionPrns[real++] = prn;
            }
            this.solutionInputs[n] = line;
            n++;
        }
        if (real !== this.realSolutionPrns.length) {
            this.realSolutionPrns.length = real; //Only when it changes, as for the rows below
        }
        if (n !== this.solutionPrns.length) {
            changed = true;
            this.solutionPrns.length = n;
            this.solutionPositions.length = 2 * n;
        }
        this.solutionInputs.length = n;
        if (changed) {
            this.solutionAltitude = altitude;
            this.solutionMatrices.n = 0; //An invalid solution leaves it so: no range errors without a solution
            this._solution = computeGeometry(this.solutionInputs, altitude, this.solutionCoefficients, this.solutionMatrices);
        }
        const rows = this.solutionRows;
        rows.altitudeRow = altitude;
        this.rangeErrors.update(rows, this.solutionMatrices, simTimeS, this.trueSinElevation, this.falseSinElevation,
            this.transmitters.spoofer, this.transmitters.spooferSlantM, altitudeFt === null ? null : altitudeFt * METERS_PER_FOOT,
            this.failures.faultyPrn, this.failures.faultyBiasM);
    }

    /** The SDK's satellite of a PRN, null for none. The lookup is rebuilt when the SDK has loaded its satellites */
    private sdkSatellite(prn: number): GPSSatellite | null {
        const sats = this.gpsSatComputer.getSatellites();
        if (sats.length !== this.sdkIndexedCount) {
            this.sdkIndex.fill(-1);
            for (let i = 0; i < sats.length; i++) {
                if (sats[i].prn < PRN_SLOTS) {
                    this.sdkIndex[sats[i].prn] = i;
                }
            }
            this.sdkIndexedCount = sats.length;
        }
        const index = prn < PRN_SLOTS ? this.sdkIndex[prn] : -1;
        return index < 0 ? null : sats[index];
    }

    /**
     * #465, B-3: RAIM detects a bad range (design, "RAIM detection"): RAIM is available for the alert limit and the residual
     * test of the solution's range errors fails. One rule for the faulty satellite (#460) and the fake satellites. With 4
     * measurements there is no RAIM, and nothing is detected
     */
    public rangeErrorDetected(halNm: number): boolean {
        return raimStatus(this._solution, halNm) === Raim.Available && raimTestFails(this.rangeErrors.sseM2, this._solution.measurements);
    }

    /**
     * The time of the solution's reference state (#465, design "The solution"): the true time, or the false time plus the
     * clock the fake signals claim, moved by the solution's clock. The SDK's receiver keeps the true time
     * @param actualUnixTime The sim time, UNIX ms
     */
    private solutionTime(actualUnixTime: number): number {
        const spoofer = this.transmitters.spoofer;
        if (!this.rangeErrors.falseReference || spoofer === null) {
            return actualUnixTime;
        }
        return actualUnixTime + spoofer.shiftMs + this.rangeErrors.clockM / METERS_PER_MS;
    }

    /**
     * The altitude input as the receiver gets it, null when there is none. #471, rcvrInit: with 0400 nothing from the host
     * reaches the receiver (IM C-4), the altitude neither, so there is no altitude aiding (5-29). What the unit itself
     * reads of the altitude (the ALT page, VNAV, ALTITUDE FAIL) does not come through here
     */
    private receiverAltitude(): Feet | null {
        return this.failures.receiverErrors.hostBlocked ? null : this.indicatedAltitude();
    }

    /** One update of the measurement strategy with the current solution (#402) */
    private measure(simTime: number, lat: number, lon: number): void {
        const inputs = this.measurementInputs;
        inputs.geometry = this._solution;
        inputs.indicatedAltitudeFt = this.receiverAltitude();
        this.measurement.update(simTime, lat, lon, inputs);
    }

    /** 5-29: enough satellites are tracked, but the unit has not accepted the position yet */
    public isTransition(): boolean {
        return this.inTransition;
    }

    /** The forced acquisition of an engine-running start is accepted at once, without TRAN */
    public acceptForcedSolution(): void {
        this.updateSolution(SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds)); //No tick has seen the satellites of the forced acquisition yet
        if (this._solution.valid && !this.solutionAccepted) {
            this.solutionAccepted = true;
            this.inTransition = false;
            this.gpsAcquired();
        }
    }


    reset(): void {
        this.savePosition();
        this.gpsSatComputer.reset();
        this.updateSolution(SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds)); //The receiver has no satellites in use now

        //we still keep all old values
    }

    /**
     * 3-5, 3-17..3-19: the pilot entered the date, the time or the position while the unit searches. The receiver starts
     * its search again from the corrected values (#357). With a fix the satellites supply both, and nothing changes.
     * #471: with 0400 the host's values do not reach the receiver (IM C-4): only the unit's own clock is set and saved
     */
    public reinitializeSearch(): void {
        this.saveClock(); //The caller has just set the clock (#461)
        if (this.isValid() || this.takeHomeMode || this.failures.receiverErrors.hostBlocked) {
            return;
        }
        this.gpsSatComputer.internalTime = this.timeZulu.getTimestamp();
        this.search.start(this.coords);
    }

    /**
     * SET 10 switched to FAST (#468): without a fix, the memory is set to the true state and the search starts again from
     * it, as at a power-on with FAST. No forced acquisition: FAST is the same receiver as REAL and runs the normal search,
     * which acquires each satellite in its own time. With a fix nothing changes, and take-home mode has no satellites
     */
    public startFast(): void {
        //#461: after a wipe in this power-on FAST does nothing either; its hot start stands for a current memory. #471: nor
        //with 0400, as the truth cannot reach the receiver (IM C-4; the maintainer, 2026-11-08)
        if (this.isValid() || this.takeHomeMode || this.memoryLostThisPowerOn || this.failures.receiverErrors.hostBlocked) {
            return;
        }
        this.initializeFromTruth();
        this.search.start(this.coords);
    }

    /**
     * FAST (SET 10, #468): sets the unit's memory to the true state, as a pilot would on SET 1 and SET 2 (3-17..3-19), plus
     * a current almanac and ephemeris. The start model then runs as in REAL and finds a hot start: the stored position is
     * the present one (the SDK's 2 NM rule) and every satellite has a current ephemeris. The first fix then matches the
     * stored position and the clock, so neither B-3 nor B-4 posts. Nothing in take-home mode, which has no satellites
     */
    public initializeFromTruth(): void {
        if (this.takeHomeMode) {
            return;
        }
        const now = this.currentSimUnixTime(); //The time base the SDK checks the almanac's and the ephemeris' age against
        this.coords.set(
            SimVar.GetSimVarValue('PLANE LATITUDE', SimVarValueType.Degree),
            SimVar.GetSimVarValue('PLANE LONGITUDE', SimVarValueType.Degree),
        );
        //#461: the true time in the era of the unit's clock, so that the receiver (which works modulo the era) sees an exact
        //clock, the start stays hot and the unit keeps its era. Almanac and ephemeris keep the sim time base
        const clock = this.calculateGPSTime(this.timeZulu.getTimestamp(), now);
        this.timeZulu = clock;
        this.gpsSatComputer.internalTime = clock.getTimestamp();
        this.saveClock();
        this.ephemerisErasePending = false; //The truth replaces a wiped memory
        this.gpsSatComputer.downloadAlamanac(now); //Explicitly: the SDK's default is its context time, stale before its first update
        this.gpsSatComputer.syncLastKnownPosition(this.coords);
        this.gpsSatComputer.setEphemerisCurrent(now); //Nothing yet if the satellites are still loading: see the constructor
        this.ephemerisFromTruthPending = true;
    }

    private currentSimUnixTime(): number {
        return this.absoluteTimeToUNIXTime(SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds));
    }

    /**
     * #461, design "The wipe": the battery-backed memory was lost at this power-on, the receiver's and the unit's. Runs
     * before the powerEvent, whose search then starts from this memory: an almanac search (ORS 01 6-30)
     */
    private forgetMemory(): void {
        this.forgetReceiverMemory();
        this.forgetUnitMemory();
    }

    /**
     * #461, #471: the receiver module's battery-backed memory is lost (IM C-3, 0008; 5-29): the almanac and every ephemeris
     * are erased. The battery's wipe and rcvrMemory both run it
     */
    private forgetReceiverMemory(): void {
        this.gpsSatComputer.eraseAlamanac();
        this.gpsSatComputer.eraseCachedEphemeris(); //Nothing yet if the satellites are still loading: see the constructor
        this.fakeReceiver.forgetEphemeris(); //Also the fake ephemeris collected from a spoofer
        this.ephemerisErasePending = true;
        this.ephemerisFromTruthPending = false; //A truth written earlier is lost with the memory
    }

    /**
     * #461, design "The wipe": the unit's own battery-backed memory is lost (CMM 22), only by the battery's wipe. The clock
     * starts on WIPED_CLOCK_MS and there is no stored position (the settings' default 0/0). The off time adds nothing to
     * the clock (lastPowerOffTime is now), and the clock is saved over the wiped storage
     */
    private forgetUnitMemory(): void {
        this.timeZulu = this.unixToTimestamp(WIPED_CLOCK_MS);
        this.gpsSatComputer.internalTime = WIPED_CLOCK_MS;
        this.lastPowerOffTime = SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds);
        this.coords.set(0, 0);
        this.gpsSatComputer.syncLastKnownPosition(this.coords);
        this.noStoredPosition = true;
        this.saveClock();
    }

    /**
     * #461: the receiver tracks a satellite: some real satellite in the SDK's channels is in an acquired state, as STA 1
     * shows it. RCVR HARDWARE ERROR 0008 ends with it: IM C-3 ties the code's end at the first satellites to another of its
     * causes, and applying it to the loss of the battery backup is the design's reading (2026-11-08). Allocates nothing
     */
    public get tracksSatellite(): boolean {
        const channels = this.gpsSatComputer.getChannels();
        for (let i = 0; i < channels.length; i++) {
            const sat = channels[i];
            if (sat !== null && ACQUIRED_STATES.has(sat.state.get())) {
                return true;
            }
        }
        return false;
    }

    /** #461: stores the clock as its offset from the sim time, the battery-backed memory of the unit's clock */
    public saveClock(): void {
        this.userSettings.getSetting("clockOffset").set(this.timeZulu.getTimestamp() - this.currentSimUnixTime());
    }

    /**
     * #461, SERVICE? on FLR 1: the clock is set to the true time. Without a fix the receiver's clock and search follow, as
     * after a SET 2 entry; with a fix the satellites supply the time anyway
     */
    public serviceClock(): void {
        const now = this.currentSimUnixTime();
        this.timeZulu = this.unixToTimestamp(now);
        this.reinitializeSearch(); //Saves the clock, and restarts a search without a fix from it
    }

    public savePosition(): void {
        this.saveClock();
        this.userSettings.getSetting("lastLatitude").set(this.coords.lat);
        this.userSettings.getSetting("lastLongitude").set(this.coords.lon);
        this.userSettings.getSetting("lastAlmanacDownload").set(this.gpsSatComputer.getLastAlmanacTime() ?? 0);
        this.userSettings.getSetting("lastEphemeris").set(this.gpsSatComputer.getSatellites()
            .filter(s => s.lastEphemerisTime !== undefined)
            .map(s => `${s.prn}:${s.lastEphemerisTime}`)
            .join(","));
    }

    private unixToTimestamp(unix: number): TimeStamp {
        return TimeStamp.create(unix);
    }

    private absoluteTimeToUNIXTime(absoluteTime: number): number {
        return (absoluteTime - 62135596800) * 1000;
    }

    /**
     * #465, design "Recovery": the unit lost its fix. With a belief far from the real sky (the clock off by more than the
     * start model's tolerance, Install manual 2-66, or the position beyond the SDK's 100 NM) the receiver starts its search
     * again from that belief, as at a power-on. Otherwise it reacquires as before, and searches the sky after the give-up
     * time without a fix (GpsSearch.lostFix). Not at a power-off, which ends the search (powerChanged), nor in take-home mode
     * @param simTime The sim time, UNIX ms
     */
    private fixLost(simTime: number, lat: number, lon: number): void {
        const clockOff = Math.abs(receiverTimeDifference(this.timeZulu.getTimestamp(), simTime)) > CLOCK_TOLERANCE;
        const positionOff = UnitType.GA_RADIAN.convertTo(this.coords.distance(lat, lon), UnitType.NMILE) >= FAR_BELIEF_NM;
        if (clockOff || positionOff) {
            this.search.start(this.coords);
        } else {
            this.search.lostFix(simTime);
        }
    }

    /** B-4: SYSTEM TIME UPDATED TO GPS TIME, and the time for the pages that show it */
    private timeUpdated(time: TimeStamp): void {
        this.messageHandler.addMessage(new OneTimeMessage(["SYSTEM TIME UPDATED", "TO GPS TIME"]));
        this.bus.getPublisher<GPSEvents>().pub("timeUpdatedEvent", time);
        this.saveClock();
    }

    private gpsAcquired() {
        this.search.end(); //The first fix ends the start model (#62); #465: and the give-up time of a fix lost before
        const firstFix = !this._hadFixSincePowerOn;
        this._hadFixSincePowerOn = true;
        const timeNow = SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds);
        console.log(`gpsAcquired in ${timeNow - this.gpsStartTime} seconds`);
        const actualUnixTime = this.absoluteTimeToUNIXTime(timeNow);
        const calculatedTime = this.calculateGPSTime(this.timeZulu.getTimestamp(), this.solutionTime(actualUnixTime));
        //#402, design 6.7: every fix starts the measurement from the current one, with no history. Also outside the
        //calculation tick, for the forced acquisition of an engine-running start
        this.measurement.restart();
        this.measure(timeNow,
            SimVar.GetSimVarValue('PLANE LATITUDE', SimVarValueType.Degree),
            SimVar.GetSimVarValue('PLANE LONGITUDE', SimVarValueType.Degree));
        const pos = this.acquiredPosition.set(this.measurement.lat, this.measurement.lon);

        //B-3: only the first NAV after power-on is compared with the position at power-off. A fix regained in flight
        //would compare with the position where the fix was lost (#454). Before coords takes the new position. #461: after
        //a wipe there is no stored position to compare with
        if (firstFix && !this.noStoredPosition && UnitType.GA_RADIAN.convertTo(this.coords.distance(pos), UnitType.NMILE) > 2) {
            this.messageHandler.addMessage(new OneTimeMessage(["POSITION DIFFERS FROM", "LAST POSITION BY >2NM"]));
        }
        this.noStoredPosition = false;

        if (Math.abs(calculatedTime.getTimestamp() - this.timeZulu.getTimestamp()) > TIME_UPDATE_LIMIT) {
            this.timeUpdated(calculatedTime);
        }

        this.timeZulu = calculatedTime;
        this.gpsSatComputer.internalTime = actualUnixTime;
        this.saveClock();
        this.coords.set(pos);
    }

    /**
     * The calculation ticks stopped: a hot-swap disable or a power-off (TickController). The first tick after a disable
     * carries the clock over the stopped time; a power-on does that itself (powerChanged) and forgets this. Ticks that stand
     * already keep the time they stopped at: no tick has counted it yet
     */
    public onTicksStopped(): void {
        if (this.ticksStoppedAt === null) {
            this.ticksStoppedAt = SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds);
        }
    }

    private powerChanged(evt: PowerEventData) {
        if (!evt.isPowered && this.ticksStoppedAt !== null) {
            //#465, final review (2026-11-08): a power-off while the ticks stand after a hot-swap disable. The battery clock
            //ran over the disable (3-53), which no tick has counted; the off time is counted from lastPowerOffTime below
            this.timeZulu.setTimestamp(this.timeZulu.getTimestamp() + (SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds) - this.ticksStoppedAt) * 1000);
        }
        this.ticksStoppedAt = null; //The power-on counts the off time from lastPowerOffTime
        this.failures.reset(); //#460: the faulty satellite's count restarts; the stored failures stay
        this.signals.reset(); //#467: the lost set and the fades restart
        this.transmitters.reset(); //#465: the last position and the levels are forgotten, the sites kept
        this.fakeReceiver.reset(); //#465: every fake satellite lost and its channel freed; the fake ephemeris kept
        this.rangeErrors.reset(); //#465: the rows' whole milliseconds and their ranges' rates are forgotten
        this.signalsRefreshPending = false; //A forced acquisition asked before the satellites were loaded may never run
        this.memoryLostThisPowerOn = evt.isPowered && evt.memoryLost === true; //#461
        if (evt.isPowered) {
            //#471: the receiver's error word is latched first, before the search decides its start. The battery's wipe
            //has already run (userMemoryLost comes before the powerEvent). rcvrMemory loses only the receiver's memory:
            //the clock and the position come from the unit below, as at every power-on (design "rcvrMemory")
            const receiverErrors = this.failures.receiverErrors;
            receiverErrors.latchPowerOn(evt.memoryLost === true);
            if (receiverErrors.memoryLostAtPowerOn) {
                if (evt.memoryLost !== true) {
                    this.forgetReceiverMemory();
                }
                this.memoryLostThisPowerOn = true; //FAST is blocked as for the battery: no memory to be hot from
            }
            //Ticks are not running, when we are powered off. The battery clock counts the off time itself:
            //PowerSupply's timeSincePowerChange is shaped for the CRT warm-up and is about 0 on a forced start (#328).
            //It counts sim time: the clock follows the sim's world time, as the satellites do, and a sim pause has no
            //real-world counterpart
            this.timeZulu.setTimestamp(this.timeZulu.getTimestamp() + (SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds) - this.lastPowerOffTime) * 1000);
            //#471, rcvrInit: with 0400 the host's initialization does not reach the receiver (IM C-4, 5-29). It starts from
            //its own memory, which here holds the unit's values as at every power-on, unless rcvrMemory lost it: then it
            //has neither clock nor position, while the unit's stay right (design "rcvrMemory")
            const receiverLost = receiverErrors.hostBlocked && receiverErrors.memoryLostAtPowerOn;
            if (receiverLost) {
                this.gpsSatComputer.internalTime = WIPED_CLOCK_MS;
                this.gpsSatComputer.syncLastKnownPosition(NO_POSITION);
            } else {
                this.gpsSatComputer.internalTime = this.timeZulu.getTimestamp(); //The receiver reads it on the first update, before tick refreshes it (#211)
            }
            //#461, #471: FAST does nothing at a power-on that wiped the memory: a wiped receiver has no memory to be hot from.
            //Nor with 0400: FAST sends nothing either (the maintainer, 2026-11-08)
            if (this.userSettings.getSetting("fastGpsAcquisition").get() && !this.memoryLostThisPowerOn && !receiverErrors.hostBlocked) {
                this.initializeFromTruth(); //#468: before the search, which decides its start from this memory
            }
            this.search.start(receiverLost ? NO_POSITION : this.coords); //The receiver starts from the position stored at power-off (#62)
            this._hadFixSincePowerOn = false;
            this.gpsStartTime = SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds);
            this.measurement.restart(); //Design 6.7: nothing of the receiver's errors and filter survives a power cycle
        } else {
            this.lastPowerOffTime = SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds);
            this.saveClock(); //#461: the battery keeps the clock over the power-off
            //Sensors.reset -> gps.reset -> savePosition -> saveClock also runs at a power-on or off, and stores the right
            //clock only because GPS subscribes to powerEvent before Sensors does: powerChanged has carried the clock over the off time first
            this.solutionAccepted = false;
            this.inTransition = false;
            this._hadFixSincePowerOn = false;
            this.noStoredPosition = false; //#461: the position of this power-off is stored
            this.search.end();
            this.measurement.restart();
        }
    }

    /**
     * The GPS only transmites the date as week and as a timestamp since that week
     * The week is a 10 bit value and as such rolls over every 1024 weeks (19.6 years)
     * If it gets the epoch wrong, then the date will be of by about 20 years
     * We simulate this here.
     * See https://en.wikipedia.org/wiki/GPS_week_number_rollover
     * @private
     * @param assumedTime We use this time to calculate the GPS era we think we are in
     * @param actualUnixTime
     */
    private calculateGPSTime(assumedTime: number, actualUnixTime: number): TimeStamp {
        const assumedEra = Math.floor((assumedTime - GPS_EPOCH) / GPS_ERA_DURATION);
        const actualEra = Math.floor((actualUnixTime - GPS_EPOCH) / GPS_ERA_DURATION);

        return TimeStamp.create(actualUnixTime - (actualEra - assumedEra) * GPS_ERA_DURATION);
    }



}