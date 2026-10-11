import {
    EventBus,
    GeoPoint,
    GPSSatComputer,
    GPSSatComputerOptions,
    GPSSatellite,
    GPSSystemState,
    SimVarValueType,
    SubscribableSet,
    UnitType,
} from "@microsoft/msfs-sdk";
import {Degrees, Knots} from "./data/Units";
import {TimeStamp} from "./data/Time";
import {KLN90BUserSettings} from "./settings/KLN90BUserSettings";
import {KLN90PlaneSettings} from "./settings/KLN90BPlaneSettings";
import {MessageHandler, OneTimeMessage} from "./data/MessageHandler";
import {PowerEvent, PowerEventData} from "./PowerButton";
import {TICK_TIME_CALC} from "./TickController";
import {GPS_ERA_DURATION, GpsSearch, HOT_ACQUISITION, HOT_ACQUISITION_RANGE, IDLE_ACQUISITION, SearchMode, WARM_ACQUISITION_RANGE} from "./GpsSearch";

const SAVE_INTERVALL = 60000;
const MIN_GROUND_SPEED_FOR_TRACK = 2; //3-35
const GPS_EPOCH = 315964800000; //Jan 6 1980

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

    /** The forced acquisition of an engine-running start or of SET 10 FAST ends the start model */
    public acquireAndUseSatellites(): void {
        this.search?.end();
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
    public coords: GeoPoint;
    public trackTrue: Degrees = 0; //Consider accessing this via getTrackRespectingGroundspeed
    public groundspeed: Knots = 0;
    public timeZulu: TimeStamp;
    public gpsSatComputer: KLNGPSSatComputer;
    public readonly search: GpsSearch;
    /** The simulator's UNIX time of the last tick, for what the receiver reads from its satellites (STA 1) */
    public simTimeUnix: number = 0;
    private lastCoords: GeoPoint;
    private intSaveCount = 0;
    private readonly takeHomeMode: boolean;
    private gpsStartTime: number = 0;
    private solutionAccepted = false; //5-29: the unit accepts the receiver's solution one calculation tick after it appears (TRAN)
    private inTransition = false;
    private lastPowerOffTime: number = SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds); //Sim time (s) of construction or the last power-off. The battery clock runs on while the unit is off (3-53)

    constructor(private bus: EventBus, private userSettings: KLN90BUserSettings, options: KLN90PlaneSettings, private readonly messageHandler: MessageHandler) {
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

        this.gpsSatComputer = new KLNGPSSatComputer(
            1,
            bus,
            `coui://${options.basePath}/Assets/gps_ephemeris.json`,
            `coui://${options.basePath}/Assets/gps_sbas.json`,
            5000,
            [],
            'none',
            gpsOptions,
        );
        //Before the power event subscription, so that powerChanged always finds the search. PowerButton publishes no power
        //event before Sensors exists, so powerChanged never runs before the end of this constructor
        //The model needs the REAL timings the computer was built with: after a switch from FAST it stays off until the next session
        this.search = new GpsSearch(this.gpsSatComputer, () => fastGPS || this.userSettings.getSetting("fastGpsAcquisition").get());
        this.gpsSatComputer.search = this.search;
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

        this.lastCoords = this.coords;
        this.gpsSatComputer.syncLastKnownPosition(this.coords);
        this.takeHomeMode = options.takeHomeMode;


        //We assume that the internal clock kept the time fairly accurate since it has last been running
        const timeRandom = Math.random() * 5 - 2.5;
        const unixTime = this.absoluteTimeToUNIXTime(SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds) + timeRandom);
        this.timeZulu = this.unixToTimestamp(unixTime);
        this.gpsSatComputer.internalTime = unixTime;
    }

    tick() {
        const actualUnixTime = this.absoluteTimeToUNIXTime(SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds));
        this.simTimeUnix = actualUnixTime;
        const lat = SimVar.GetSimVarValue('PLANE LATITUDE', SimVarValueType.Degree);
        const lon = SimVar.GetSimVarValue('PLANE LONGITUDE', SimVarValueType.Degree);

        if (this.takeHomeMode) {
            const distance = this.groundspeed / 60 / 60 / 1000 * TICK_TIME_CALC;

            this.coords = this.coords.offset(this.trackTrue, UnitType.NMILE.convertTo(distance, UnitType.GA_RADIAN));

            this.intSaveCount += TICK_TIME_CALC;
            if (this.intSaveCount >= SAVE_INTERVALL) {
                this.savePosition();
                this.intSaveCount = 0;
            }
            this.timeZulu.setTimestamp(this.timeZulu.getTimestamp() + TICK_TIME_CALC);
            this.gpsSatComputer.internalTime = this.timeZulu.getTimestamp();
        } else {
            this.search.tick(actualUnixTime, {lat, lon}, this.gpsSatComputer.internalTime);
            this.gpsSatComputer.onUpdate();

            if (!this.hasSdkSolution()) {
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
                this.lastCoords = this.coords;
                this.coords = new GeoPoint(
                    lat,
                    lon,
                );
                this.groundspeed = SimVar.GetSimVarValue('GROUND VELOCITY', SimVarValueType.Knots);

                if (this.groundspeed >= MIN_GROUND_SPEED_FOR_TRACK) {
                    //3-34 The manual mentions, that this can lag a bit, so this works for me
                    if (!this.lastCoords.equals(this.coords)) { //Sim is paused
                        this.trackTrue = this.lastCoords.bearingTo(this.coords);
                    }
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

    public isValid(): boolean {
        //todo this is not entirely correct. GPSSatComputer assumes navigation is only possible with 4 sats. 5-29 states that navigation may be possible with 3 sats when an altitude input is used in the solution
        return this.solutionAccepted && this.hasSdkSolution();
    }

    /** 5-29: enough satellites are tracked, but the unit has not accepted the position yet */
    public isTransition(): boolean {
        return this.inTransition;
    }

    /** The forced acquisition of an engine-running start or SET 10 FAST is accepted at once, without TRAN */
    public acceptForcedSolution(): void {
        if (this.hasSdkSolution() && !this.solutionAccepted) {
            this.solutionAccepted = true;
            this.inTransition = false;
            this.gpsAcquired();
        }
    }


    reset(): void {
        this.savePosition();
        this.gpsSatComputer.reset();

        //we still keep all old values
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
        const timeNow = SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds);
        console.log(`gpsAcquired in ${timeNow - this.gpsStartTime} seconds`);
        const actualUnixTime = this.absoluteTimeToUNIXTime(timeNow);
        const calculatedTime = this.calculateGPSTime(this.timeZulu.getTimestamp(), actualUnixTime);
        const pos = new GeoPoint(
            SimVar.GetSimVarValue('PLANE LATITUDE', SimVarValueType.Degree),
            SimVar.GetSimVarValue('PLANE LONGITUDE', SimVarValueType.Degree),
        );

        if (UnitType.GA_RADIAN.convertTo(this.coords.distance(pos), UnitType.NMILE) > 2) {
            this.messageHandler.addMessage(new OneTimeMessage(["POSITION DIFFERS FROM", "LAST POSITION BY >2NM"]));
        }

        if (Math.abs(calculatedTime.getTimestamp() - this.timeZulu.getTimestamp()) > 10 * 60 * 1000) {
            this.messageHandler.addMessage(new OneTimeMessage(["SYSTEM TIME UPDATED", "TO GPS TIME"]));
            this.bus.getPublisher<GPSEvents>().pub("timeUpdatedEvent", calculatedTime);
        }

        this.timeZulu = calculatedTime;
        this.gpsSatComputer.internalTime = actualUnixTime;
        this.coords = pos;
    }

    private powerChanged(evt: PowerEventData) {
        if (evt.isPowered) {
            //Ticks are not running, when we are powered off. The battery clock counts the off time itself:
            //PowerButton's timeSincePowerChange is shaped for the CRT warm-up and is about 0 on a forced start (#328).
            //It counts sim time: the clock follows the sim's world time, as the satellites do, and a sim pause has no
            //real-world counterpart
            this.timeZulu.setTimestamp(this.timeZulu.getTimestamp() + (SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds) - this.lastPowerOffTime) * 1000);
            this.gpsSatComputer.internalTime = this.timeZulu.getTimestamp(); //The receiver reads it on the first update, before tick refreshes it (#211)
            this.search.start(this.coords); //The receiver starts from the position stored at power-off (#62)
            this.gpsStartTime = SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds);
        } else {
            this.lastPowerOffTime = SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds);
            this.solutionAccepted = false;
            this.inTransition = false;
            this.search.end();
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