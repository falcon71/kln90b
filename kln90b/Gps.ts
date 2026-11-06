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
import {PowerEvent, PowerEventData} from "./PowerSupply";
import {TICK_TIME_CALC} from "./TickController";
import {GPS_ERA_DURATION, GpsSearch, HOT_ACQUISITION, HOT_ACQUISITION_RANGE, IDLE_ACQUISITION, SearchMode, WARM_ACQUISITION_RANGE} from "./GpsSearch";
import {computeGeometry, GpsGeometry, hasFiniteAngles, MAX_ROWS, SIGMA_UERE_M} from "./GpsSolution";
import {GpsMeasurement, MeasurementInputs} from "./GpsMeasurement";
import {Failures} from "./failures/Failures";
import {GpsFailures, ReceiverView} from "./failures/GpsFailures";
import {FailingMeasurement} from "./failures/FailingMeasurement";
import {AntennaAttitude, LEVEL_ATTITUDE, SatelliteSignals} from "./GpsSignal";
import {AntennaAttitudeSource} from "./AntennaAttitude";

const SAVE_INTERVALL = 60000;
const MIN_GROUND_SPEED_FOR_TRACK = 2; //3-35
const GPS_EPOCH = 315964800000; //Jan 6 1980

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
            case SearchMode.SkySearch:
                return false;
            default:
                return super.isAlmanacValid(simTime);
        }
    }

    /**
     * The forced acquisition of an engine-running start ends the start model. FAST forces nothing (#468): it starts the
     * search from the true state instead, as a forced acquisition makes a lost satellite Unreachable. The receiver failures'
     * inhibits are applied first: the SDK's forced channel assignment skips inhibited satellites (#460, GPSSat.ts
     * losSatelliteFilterOmniscient). The jamming level and the antenna's attitude are read before (#467), and the signals
     * are refreshed inside the forced update, at its first reachability query, once the SDK has computed that update's
     * positions: at power-on their reset emptied the lost set, and no calculation tick has run yet to refill it. The
     * forced path makes a lost satellite Unreachable (GPSSat.ts updateStateTracked)
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
     * Safe to call again: each call wraps the SDK's own method, never an earlier wrapper. The data is private in the SDK
     * @param isLost Whether the receiver has lost the satellite's signal
     * @throws Error if a satellite's private data or its signal strength moved in an SDK upgrade
     */
    public wrapReachability(isLost: (prn: number) => boolean): void {
        const original = GPSSatellite.prototype.updateState;
        const wrapper = function (this: GPSSatellite, simTime: number, deltaTime: number, distanceFromLastKnownPos: number, forceAcquireAndUse: boolean): boolean {
            if (!isLost(this.prn)) {
                return original.call(this, simTime, deltaTime, distanceFromLastKnownPos, forceAcquireAndUse);
            }
            const data = (this as any).data;
            const strength = data.signalStrength;
            data.signalStrength = 0;
            try {
                return original.call(this, simTime, deltaTime, distanceFromLastKnownPos, forceAcquireAndUse);
            } finally {
                data.signalStrength = strength;
            }
        };
        for (const sat of this.getSatellites()) {
            if (typeof (sat as any).data?.signalStrength !== "number") {
                throw new Error("GPSSatellite data moved: recheck Gps.ts after the SDK upgrade");
            }
            (sat as any).updateState = wrapper;
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
    /** The SNR of every satellite and whether the receiver has lost its signal, whatever the cause (#467) */
    public readonly signals: SatelliteSignals;
    private readonly antenna: AntennaAttitudeSource;
    /** Filled by the antenna source once per calculation tick, and before a forced acquisition */
    private readonly attitude: AntennaAttitude = {...LEVEL_ATTITUDE};
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
    private gpsStartTime: number = 0;
    private solutionAccepted = false; //5-29: the unit accepts the receiver's solution one calculation tick after it appears (TRAN)
    private inTransition = false;
    private _hadFixSincePowerOn = false;
    /** The unit's own position solution (#453, GpsSolution.ts), recomputed by updateSolution */
    private _solution: GpsGeometry;
    //The inputs of the last computation, kept in reused arrays: the SDK changes a satellite's position array in place
    private readonly solutionPrns: number[] = [];
    private readonly solutionPositions: number[] = []; //zenith, azimuth per satellite
    private solutionAltitude = false;
    private readonly solutionInputs: ReadonlyFloat64Array[] = [];
    /** The coefficients of the error mapping of the cached solution, written by computeGeometry (#402) */
    private readonly solutionCoefficients = new Float64Array(2 * MAX_ROWS);
    /** Reused for every measurement update; the solution and the altitude are filled in before each */
    private readonly measurementInputs: MeasurementInputs;
    /** The measured position of a new fix, before it replaces coords */
    private readonly acquiredPosition = new GeoPoint(0, 0);
    /** The given measurement strategy with the faulty satellite's error added (#460) */
    private readonly measurement: GpsMeasurement;
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
            solutionPrns: () => gps.solutionPrns,
            get solution(): GpsGeometry {
                return gps._solution;
            },
            isValid: () => gps.isValid(),
        };
        this.failures = new GpsFailures(bus, failures, view, this.takeHomeMode);
        this.signals = new SatelliteSignals(view, signalRandom);
        this.measurement = new FailingMeasurement(measurement, this.failures);
        this._solution = this.takeHomeMode ? {...TAKE_HOME_SOLUTION} : computeGeometry([], false, this.solutionCoefficients);
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
        this.search = new GpsSearch(this.gpsSatComputer, () => this.failures.receiverFailed);
        this.gpsSatComputer.search = this.search;
        //Through the object, not a bound method, so that a test's spy on signals.isLost takes effect
        const isLost = (prn: number) => {
            if (this.signalsRefreshPending) {
                this.signalsRefreshPending = false;
                this.signals.refresh(this.attitude, this.failures.jammingDb);
            }
            return this.signals.isLost(prn);
        };
        this.gpsSatComputer.onBeforeForcedAcquisition = () => {
            //A forced acquisition the SDK delays until its satellites are loaded runs before awaitInit resolves below
            this.gpsSatComputer.wrapReachability(isLost);
            this.failures.refreshLevel();
            this.antenna.read(this.attitude);
            this.signalsRefreshPending = true;
        };
        this.raimPrediction = this.gpsSatComputer.createPredictionContext(); //STA 5 (6-20): one context for the life of the unit; pages are rebuilt on every knob step
        this.gpsSatComputer.onForcedAcquisition = () => this.acceptForcedSolution();
        bus.getSubscriber<PowerEvent>().on("powerEvent").handle(this.powerChanged.bind(this));

        this.gpsSatComputer.init();
        const savedEphemeris = parseEphemeris(userSettings.getSetting("lastEphemeris").get());
        this.gpsSatComputer.awaitInit().then(() => {
            this.gpsSatComputer.restoreEphemeris(savedEphemeris);
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
        const unixTime = this.absoluteTimeToUNIXTime(SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds) + timeRandom);
        this.timeZulu = this.unixToTimestamp(unixTime);
        this.gpsSatComputer.internalTime = unixTime;
    }

    tick() {
        const simTime = SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds);
        const actualUnixTime = this.absoluteTimeToUNIXTime(simTime);
        this.simTimeUnix = actualUnixTime;
        const lat = SimVar.GetSimVarValue('PLANE LATITUDE', SimVarValueType.Degree);
        const lon = SimVar.GetSimVarValue('PLANE LONGITUDE', SimVarValueType.Degree);

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
            this.updateSolution();
        } else {
            //#460, #467: the failures first (the jamming level), then the signals from the antenna's attitude and that level,
            //then the search and its inhibits for the channel assignment, then the receiver, which reads the lost set
            //through the reachability (wrapReachability)
            this.failures.tick(simTime);
            this.antenna.read(this.attitude);
            this.signals.tick(simTime, this.attitude, this.failures.jammingDb);
            this.search.tick(actualUnixTime, {lat, lon}, this.gpsSatComputer.internalTime);
            this.search.applyInhibits();
            this.gpsSatComputer.onUpdate();
            this.updateSolution();

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

            if (this.isValid()) {
                this.measure(simTime, lat, lon);
                this.coords.set(this.measurement.lat, this.measurement.lon);
                if (!this.hasSdkSolution()) {
                    //Three satellites plus the altitude: the SDK has no solution of its own and would keep its last known
                    //position where its solution ended. Beyond 100 NM of it, its line-of-sight filter offers no satellite
                    //for a free channel and it searches blind in PRN order (#453, design 5.1, GpsSolution.test.ts)
                    this.gpsSatComputer.syncLastKnownPosition(this.coords);
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
                this.timeZulu = this.calculateGPSTime(assumedTime, actualUnixTime);
                this.gpsSatComputer.internalTime = actualUnixTime;
            } else {
                this.timeZulu.setTimestamp(this.timeZulu.getTimestamp() + TICK_TIME_CALC);
                this.gpsSatComputer.internalTime = this.timeZulu.getTimestamp();
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

    /** Whether the unit has accepted a fix since it was last turned on */
    public get hadFixSincePowerOn(): boolean {
        return this._hadFixSincePowerOn;
    }

    /**
     * Recomputes the solution from the satellites the SDK has in use, in PRN order, and the altitude input. Only when
     * one of them changed: the SDK moves the satellites every 5 s, the calculation ticks at 1 Hz. Public SDK API only:
     * the in-use state of the satellites, not the private channel list
     */
    private updateSolution(): void {
        if (this.takeHomeMode) {
            const aided = this.indicatedAltitude() !== null;
            if (aided !== this._solution.altitudeAided) {
                this._solution = {...TAKE_HOME_SOLUTION, altitudeAided: aided};
            }
            return;
        }
        const altitude = this.indicatedAltitude() !== null;
        let changed = altitude !== this.solutionAltitude;
        const receiverFailed = this.failures.receiverFailed; //Once: it reads the settings (the tick cost rule, CLAUDE.md)
        let n = 0;
        for (const sat of this.gpsSatComputer.getSatellites()) {
            const state = sat.state.get();
            if (state !== GPSSatelliteState.InUse && state !== GPSSatelliteState.InUseDiffApplied) {
                continue;
            }
            const position = sat.position.get();
            if (!hasFiniteAngles(position)) {
                continue; //Left out here, not in computeGeometry, so that the PRNs and the coefficients stay row by row (#456)
            }
            if (receiverFailed || this.signals.isLost(sat.prn)) {
                //#460: the SDK releases an inhibited satellite only at its next position update, up to 5 s later. The unit
                //does not wait (design, "Blocked satellites leave the unit's solution at once"). #467: a satellite lost
                //between the signals' tick and the SDK's update is left out too
                continue;
            }
            if (n >= this.solutionPrns.length
                || this.solutionPrns[n] !== sat.prn
                || this.solutionPositions[2 * n] !== position[0]
                || this.solutionPositions[2 * n + 1] !== position[1]) {
                changed = true;
                this.solutionPrns[n] = sat.prn;
                this.solutionPositions[2 * n] = position[0];
                this.solutionPositions[2 * n + 1] = position[1];
            }
            this.solutionInputs[n] = position;
            n++;
        }
        if (n !== this.solutionPrns.length) {
            changed = true;
            this.solutionPrns.length = n;
            this.solutionPositions.length = 2 * n;
        }
        this.solutionInputs.length = n;
        if (changed) {
            this.solutionAltitude = altitude;
            this._solution = computeGeometry(this.solutionInputs, altitude, this.solutionCoefficients);
        }
    }

    /** One update of the measurement strategy with the current solution (#402) */
    private measure(simTime: number, lat: number, lon: number): void {
        const inputs = this.measurementInputs;
        inputs.geometry = this._solution;
        inputs.indicatedAltitudeFt = this.indicatedAltitude();
        this.measurement.update(simTime, lat, lon, inputs);
    }

    /** 5-29: enough satellites are tracked, but the unit has not accepted the position yet */
    public isTransition(): boolean {
        return this.inTransition;
    }

    /** The forced acquisition of an engine-running start is accepted at once, without TRAN */
    public acceptForcedSolution(): void {
        this.updateSolution(); //No tick has seen the satellites of the forced acquisition yet
        if (this._solution.valid && !this.solutionAccepted) {
            this.solutionAccepted = true;
            this.inTransition = false;
            this.gpsAcquired();
        }
    }


    reset(): void {
        this.savePosition();
        this.gpsSatComputer.reset();
        this.updateSolution(); //The receiver has no satellites in use now

        //we still keep all old values
    }

    /**
     * 3-5, 3-17..3-19: the pilot entered the date, the time or the position while the unit searches. The receiver starts
     * its search again from the corrected values (#357). With a fix the satellites supply both, and nothing changes
     */
    public reinitializeSearch(): void {
        if (this.isValid() || this.takeHomeMode) {
            return;
        }
        this.gpsSatComputer.internalTime = this.timeZulu.getTimestamp();
        this.search.start(this.coords);
    }

    /**
     * SET 10 switched to FAST (#468): without a fix, the memory is set to the true state and the search starts again from
     * it, as at a power-on with FAST. No forced acquisition: it would make a satellite with a lost signal Unreachable. With
     * a fix nothing changes, and take-home mode has no satellites
     */
    public startFast(): void {
        if (this.isValid() || this.takeHomeMode) {
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
        this.timeZulu.setTimestamp(now);
        this.gpsSatComputer.internalTime = now;
        this.gpsSatComputer.downloadAlamanac(now); //Explicitly: the SDK's default is its context time, stale before its first update
        this.gpsSatComputer.syncLastKnownPosition(this.coords);
        this.gpsSatComputer.setEphemerisCurrent(now); //Nothing yet if the satellites are still loading: see the constructor
        this.ephemerisFromTruthPending = true;
    }

    private currentSimUnixTime(): number {
        return this.absoluteTimeToUNIXTime(SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds));
    }

    public savePosition(): void {
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

    private gpsAcquired() {
        this.search.end(); //The first fix ends the start model (#62)
        const firstFix = !this._hadFixSincePowerOn;
        this._hadFixSincePowerOn = true;
        const timeNow = SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds);
        console.log(`gpsAcquired in ${timeNow - this.gpsStartTime} seconds`);
        const actualUnixTime = this.absoluteTimeToUNIXTime(timeNow);
        const calculatedTime = this.calculateGPSTime(this.timeZulu.getTimestamp(), actualUnixTime);
        //#402, design 6.7: every fix starts the measurement from the current one, with no history. Also outside the
        //calculation tick, for the forced acquisition of an engine-running start
        this.measurement.restart();
        this.measure(timeNow,
            SimVar.GetSimVarValue('PLANE LATITUDE', SimVarValueType.Degree),
            SimVar.GetSimVarValue('PLANE LONGITUDE', SimVarValueType.Degree));
        const pos = this.acquiredPosition.set(this.measurement.lat, this.measurement.lon);

        //B-3: only the first NAV after power-on is compared with the position at power-off. A fix regained in flight
        //would compare with the position where the fix was lost (#454). Before coords takes the new position
        if (firstFix && UnitType.GA_RADIAN.convertTo(this.coords.distance(pos), UnitType.NMILE) > 2) {
            this.messageHandler.addMessage(new OneTimeMessage(["POSITION DIFFERS FROM", "LAST POSITION BY >2NM"]));
        }

        if (Math.abs(calculatedTime.getTimestamp() - this.timeZulu.getTimestamp()) > 10 * 60 * 1000) {
            this.messageHandler.addMessage(new OneTimeMessage(["SYSTEM TIME UPDATED", "TO GPS TIME"]));
            this.bus.getPublisher<GPSEvents>().pub("timeUpdatedEvent", calculatedTime);
        }

        this.timeZulu = calculatedTime;
        this.gpsSatComputer.internalTime = actualUnixTime;
        this.coords.set(pos);
    }

    private powerChanged(evt: PowerEventData) {
        this.failures.reset(); //#460: the jamming fluctuation restarts; the stored failures stay
        this.signals.reset(); //#467: the lost set and the fades restart
        this.signalsRefreshPending = false; //A forced acquisition asked before the satellites were loaded may never run
        if (evt.isPowered) {
            //Ticks are not running, when we are powered off. The battery clock counts the off time itself:
            //PowerSupply's timeSincePowerChange is shaped for the CRT warm-up and is about 0 on a forced start (#328).
            //It counts sim time: the clock follows the sim's world time, as the satellites do, and a sim pause has no
            //real-world counterpart
            this.timeZulu.setTimestamp(this.timeZulu.getTimestamp() + (SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds) - this.lastPowerOffTime) * 1000);
            this.gpsSatComputer.internalTime = this.timeZulu.getTimestamp(); //The receiver reads it on the first update, before tick refreshes it (#211)
            if (this.userSettings.getSetting("fastGpsAcquisition").get()) {
                this.initializeFromTruth(); //#468: before the search, which decides its start from this memory
            }
            this.search.start(this.coords); //The receiver starts from the position stored at power-off (#62)
            this._hadFixSincePowerOn = false;
            this.gpsStartTime = SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds);
            this.measurement.restart(); //Design 6.7: nothing of the receiver's errors and filter survives a power cycle
        } else {
            this.lastPowerOffTime = SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds);
            this.solutionAccepted = false;
            this.inTransition = false;
            this._hadFixSincePowerOn = false;
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