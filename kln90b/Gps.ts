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
    public failures: GpsFailures | undefined = undefined; //Set by GPS after construction
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
     * The forced acquisition of an engine-running start or of SET 10 FAST ends the start model. The failures' blocks are
     * applied first: the SDK's forced channel assignment skips inhibited satellites (#460, GPSSat.ts
     * losSatelliteFilterOmniscient). The jamming blocks are brought up to date before: at power-on reset() emptied them,
     * and no calculation tick has run yet to refill them
     */
    public acquireAndUseSatellites(): void {
        this.failures?.refreshBlocks();
        this.search?.end();
        this.search?.applyInhibits(); //A deliberate guard: end() applies too, but this path must never run unblocked
        super.acquireAndUseSatellites();
        this.onForcedAcquisition?.();
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
    /** The simulator's UNIX time of the last tick, for what the receiver reads from its satellites (STA 1) */
    public simTimeUnix: number = 0;
    private intSaveCount = 0;
    private readonly takeHomeMode: boolean;
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
     * @param failures the failure service; the receiver failures, jamming and the faulty satellite act here (#460)
     */
    constructor(private bus: EventBus, private userSettings: KLN90BUserSettings, options: KLN90PlaneSettings, private readonly messageHandler: MessageHandler,
                private readonly indicatedAltitude: () => Feet | null, measurement: GpsMeasurement, failures: Failures) {
        this.takeHomeMode = options.takeHomeMode;
        //Before the receiver and the search, which read it from their callbacks: the search's blocks and the solution
        //(updateSolution, also from acceptForcedSolution after a forced acquisition)
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
        this.measurement = new FailingMeasurement(measurement, this.failures);
        this._solution = this.takeHomeMode ? {...TAKE_HOME_SOLUTION} : computeGeometry([], false, this.solutionCoefficients);
        this.measurementInputs = {geometry: this._solution, prns: this.solutionPrns, coefficients: this.solutionCoefficients, indicatedAltitudeFt: null};
        const fastGPS = this.userSettings.getSetting("fastGpsAcquisition").get();

        const gpsOptions: GPSSatComputerOptions = {
            channelCount: 8,
            timingOptions: { //3-17, #62
                almanacExpireTime: 182 * 24 * 60 * 60 * 1000, //Six months
                ephemerisExpireTime: 2 * 60 * 60 * 1000,
                acquisitionTime: fastGPS ? 10 * 1000 : IDLE_ACQUISITION, //GpsSearch sets it per power-on
                acquisitionTimeRange: fastGPS ? 1000 : WARM_ACQUISITION_RANGE,
                acquisitionTimeWithEphemeris: fastGPS ? 10 * 1000 : HOT_ACQUISITION, //#62: a power cycle with a current ephemeris has its fix in 0:17, self-test included
                acquisitionTimeRangeWithEphemeris: fastGPS ? 1000 : HOT_ACQUISITION_RANGE,
                acquisitionTimeout: fastGPS ? 1000 : 4 * 60 * 1000,
                ephemerisDownloadTime: fastGPS ? 1000 : 30000, //30 Seconds, one data frame
                almanacDownloadTime: fastGPS ? 1000 : 750000, //12.5 minutes
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
        //The model needs the REAL timings the computer was built with: after a switch from FAST it stays off until the next session
        this.search = new GpsSearch(this.gpsSatComputer, () => fastGPS || this.userSettings.getSetting("fastGpsAcquisition").get(), prn => this.failures.isJammed(prn), () => this.failures.receiverFailed);
        this.gpsSatComputer.search = this.search;
        this.gpsSatComputer.failures = this.failures;
        this.raimPrediction = this.gpsSatComputer.createPredictionContext(); //STA 5 (6-20): one context for the life of the unit; pages are rebuilt on every knob step
        this.gpsSatComputer.onForcedAcquisition = () => this.acceptForcedSolution();
        bus.getSubscriber<PowerEvent>().on("powerEvent").handle(this.powerChanged.bind(this));

        this.gpsSatComputer.init();
        const savedEphemeris = parseEphemeris(userSettings.getSetting("lastEphemeris").get());
        this.gpsSatComputer.awaitInit().then(() => this.gpsSatComputer.restoreEphemeris(savedEphemeris));

        this.coords = new GeoPoint(
            userSettings.getSetting("lastLatitude").get(),
            userSettings.getSetting("lastLongitude").get(),
        );
        if (fastGPS) {
            this.gpsSatComputer.downloadAlamanac();
        } else {
            this.gpsSatComputer.downloadAlamanac(userSettings.getSetting("lastAlmanacDownload").get());
        }

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
            //#460, design "GpsFailures": the failures first, then the search, then their inhibits for the channel assignment
            this.failures.tick(simTime);
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
            if (this.failures.isBlocked(sat.prn)) {
                //#460: the SDK releases an inhibited satellite only at its next position update, up to 5 s later. The unit
                //does not wait (design, "Blocked satellites leave the unit's solution at once")
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

    /** The forced acquisition of an engine-running start or SET 10 FAST is accepted at once, without TRAN */
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
        this.failures.reset(); //#460: the jamming fluctuation and the blocked set restart; the stored failures stay
        if (evt.isPowered) {
            //Ticks are not running, when we are powered off. The battery clock counts the off time itself:
            //PowerSupply's timeSincePowerChange is shaped for the CRT warm-up and is about 0 on a forced start (#328).
            //It counts sim time: the clock follows the sim's world time, as the satellites do, and a sim pause has no
            //real-world counterpart
            this.timeZulu.setTimestamp(this.timeZulu.getTimestamp() + (SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds) - this.lastPowerOffTime) * 1000);
            this.gpsSatComputer.internalTime = this.timeZulu.getTimestamp(); //The receiver reads it on the first update, before tick refreshes it (#211)
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