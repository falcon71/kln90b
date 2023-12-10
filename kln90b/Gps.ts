import {
    ClockEvents,
    EventBus,
    GeoPoint,
    GNSSEvents,
    GPSEphemeris,
    GPSSatComputer,
    GPSSatComputerEvents,
    GPSSatComputerOptions,
    GPSSatellite,
    GPSSatelliteState,
    GPSSatelliteTimingOptions,
    GPSSystemState,
    Publisher,
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
import {HOURS_TO_SECONDS} from "./data/navdata/NavCalculator";
import {TICK_TIME_CALC} from "./TickController";

const SAVE_INTERVALL = 60000;
const MIN_GROUND_SPEED_FOR_TRACK = 2; //3-35
export interface GPSEvents {
    timeUpdatedEvent: TimeStamp; //This is fired if either the time was manually updated by the other or when the time was changed by more than 10 minutes
}

/**
 * Note: We have emptied the gps_sbas.json, as WAAS satellites might be added with the default implementation, even though enabledSBASGroups is empty
 */
// @ts-ignore
class KLNGPSSatComputer extends GPSSatComputer {

    public internalTime: number = 0;

    constructor(index: number, bus: EventBus, ephemerisFile: string, sbasFile: string, updateInterval: number, enabledSBASGroups: Iterable<string> | SubscribableSet<string>, syncRole: "primary" | "replica" | "none", options: Readonly<GPSSatComputerOptions>) {
        super(index, bus, ephemerisFile, sbasFile, updateInterval, enabledSBASGroups, syncRole, options);
    }

    /**
     * The alamanc is very important for the KLN 90B. If the position or time is off, it takes a long time to search for
     * the satellites. We mimic this behavour here
     *
     * @param simTime
     */
    public isAlmanacValid(simTime?: number): boolean {
        const anythis = (this as any); //Yeah, we're cheating

        if (simTime === undefined) {
            simTime = anythis.simTime as number;
        }

        return Math.abs(this.internalTime - simTime) < 10 * 60 * 1000 //The KLN cannot find the satellites from the almanac, if the internal clock is off by more than 10 minutes (10 Minutes are mentioned in the install manual)
            && anythis.distanceFromLastKnownPos < 0.0174221163 // 60 nautical miles, mentioned in the Install manual
            && super.isAlmanacValid(simTime);  //Actual validity
    }

    /**
     * channels is private, but we display this in the STA 1 page, so we make it public here
     */
    public getChannels(): (GPSSatellite | null)[] {
        return (this as any).channels;
    }

    /**
     * Loads the GPS ephemeris data file.
     * Overwritte to instantiate our own KLNSatellite
     */
    private loadEphemerisData(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const request = new XMLHttpRequest();
            const anythis = (this as any); //Yeah, we're cheating
            request.onreadystatechange = () => {
                if (request.readyState === XMLHttpRequest.DONE) {
                    if (request.status === 200) {
                        anythis.ephemerisData = JSON.parse(request.responseText);
                        for (const prn in anythis.ephemerisData) {
                            anythis.satellites.push(new KLNSatellite(parseInt(prn), undefined, anythis.ephemerisData[prn], anythis.satelliteTimingOptions, this));
                        }

                        resolve();
                    } else {
                        reject(`Could not initialize sat computer system with ephemeris data: ${request.responseText}`);
                    }
                }
            };

            request.open('GET', anythis.ephemerisFile);
            request.send();
        });
    }
}

// @ts-ignore
class KLNSatellite extends GPSSatellite {

    /**
     *
     * @param prn
     * @param sbasGroup
     * @param ephemeris
     * @param timingOptions
     * @param computer added, because we need to check if the almanac is valid
     */
    constructor(prn: number, sbasGroup: string | undefined, ephemeris: GPSEphemeris | undefined, timingOptions: Readonly<Required<GPSSatelliteTimingOptions>>, private readonly computer: KLNGPSSatComputer) {
        super(prn, sbasGroup, ephemeris, timingOptions);
    }

    /**
     * We override this method to simulate a long acquisition time if the almanac is not valid
     * @param simTime
     * @param deltaTime
     * @param distanceFromLastKnownPos
     * @param forceAcquireAndUse
     * @private
     */
    private updateStateTracked(simTime: number, deltaTime: number, distanceFromLastKnownPos: number, forceAcquireAndUse: boolean): boolean {
        const reachable = this.signalStrength.get() > 0.05;
        const anythis = (this as any); //Yeah, we're cheating

        if (!forceAcquireAndUse && this.state.get() === GPSSatelliteState.None && reachable) {
            if (anythis.timeToAcquire === undefined) {
                if (this.computer.isAlmanacValid()) {
                    //This part is taken from the original GPSSatellite
                    const isEphemerisValid = distanceFromLastKnownPos < 5.80734e-4 /* 2 nautical miles */ && this.isCachedEphemerisValid(simTime);
                    if (isEphemerisValid) {
                        anythis.timeToAcquire = anythis.timingOptions.acquisitionTimeWithEphemeris + (Math.random() - 0.5) * anythis.timingOptions.acquisitionTimeRangeWithEphemeris;
                        console.log("timeToAcquire with Ephemeris", anythis.timeToAcquire);
                    } else {
                        anythis.timeToAcquire = anythis.timingOptions.acquisitionTime + (Math.random() - 0.5) * anythis.timingOptions.acquisitionTimeRange;
                        console.log("timeToAcquire without Ephemeris", anythis.timeToAcquire);
                    }
                } else {
                    //We added this branch to simulate a long acquisition time without almanac
                    anythis.timeToAcquire = anythis.timingOptions.acquisitionTimeWithoutAlmanac + (Math.random() - 0.5) * anythis.timingOptions.acquisitionTimeRangeWithoutAlmanac;
                    console.log("timeToAcquire without Almanac", anythis.timeToAcquire);
                }
            } else {
                if (this.computer.isAlmanacValid()) {
                    //The user might have corrected the location or the date, then we need to reduce the timeToAcquire
                    const isEphemerisValid = distanceFromLastKnownPos < 5.80734e-4 /* 2 nautical miles */ && this.isCachedEphemerisValid(simTime);
                    if (isEphemerisValid) {
                        if (anythis.timeToAcquire > anythis.timingOptions.acquisitionTimeWithEphemeris + 0.5 * anythis.timingOptions.acquisitionTimeRangeWithEphemeris) {
                            anythis.timeToAcquire = anythis.timingOptions.acquisitionTimeWithEphemeris + (Math.random() - 0.5) * anythis.timingOptions.acquisitionTimeRangeWithEphemeris;
                            console.log("Reduced timeToAcquire with Ephemeris", anythis.timeToAcquire);
                        }
                    } else {
                        if (anythis.timeToAcquire > anythis.timingOptions.acquisitionTime + 0.5 * anythis.timingOptions.acquisitionTimeRange) {
                            anythis.timeToAcquire = anythis.timingOptions.acquisitionTime + (Math.random() - 0.5) * anythis.timingOptions.acquisitionTimeRange;
                            console.log("Reduced timeToAcquire without Ephemeris", anythis.timeToAcquire);
                        }
                    }

                }

            }
        }

        // @ts-ignore
        return super.updateStateTracked(simTime, deltaTime, distanceFromLastKnownPos, forceAcquireAndUse);
    }
}

export class GPS {
    public coords: GeoPoint;
    public trackTrue: Degrees = 0; //Consider accessing this via getTrackRespectingGroundspeed
    public groundspeed: Knots = 0;
    public timeZulu: TimeStamp;
    public gpsSatComputer: KLNGPSSatComputer;
    private lastCoords: GeoPoint;
    private intSaveCount = 0;
    private readonly takeHomeMode: boolean;
    private isStarted: boolean = false;
    private clockPublisher: Publisher<ClockEvents>;
    private gnssPublisher: Publisher<GNSSEvents>;

    constructor(private bus: EventBus, private userSettings: KLN90BUserSettings, options: KLN90PlaneSettings, private readonly messageHandler: MessageHandler) {
        const fastGPS = this.userSettings.getSetting("fastGpsAcquisition").get();

        const gpsOptions: GPSSatComputerOptions = {
            channelCount: 8,
            timingOptions: { //3-17
                almanacExpireTime: 90 * 24 * 60 * 60 * 1000, //Manual says 6 months, but it's 90 days
                // @ts-ignore We added this two timings without almanac in our own KLNSatellite
                acquisitionTimeWithoutAlmanac: fastGPS ? 10 * 1000 : 6 * 60 * 1000, //6 to 12 minutes -> 6 +- 4 minutes
                acquisitionTimeRangeWithoutAlmanac: fastGPS ? 1000 : 8 * 60 * 1000,
                acquisitionTime: fastGPS ? 10 * 1000 : 1.5 * 60 * 1000, //Up to two minutes -> 90 +- 30 seconds
                acquisitionTimeRange: fastGPS ? 1000 : 60 * 1000,
                acquisitionTimeWithEphemeris: fastGPS ? 10 * 1000 : 60 * 1000, //The ephemeris does not make much of a difference, only a missing almanac is slow
                acquisitionTimeRangeWithEphemeris: fastGPS ? 1000 : 60 * 1000,
                ephemerisDownloadTime: fastGPS ? 1000 : 30000, //30 Seconds
                almanacDownloadTime: fastGPS ? 1000 : 750000, //12.5 minutes

            },
        };

        this.gpsSatComputer = new KLNGPSSatComputer(
            1,
            bus,
            'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/GPS/KLN90B/Assets/gps_ephemeris.json',
            'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/GPS/KLN90B/Assets/gps_sbas.json',
            5000,
            [],
            'none',
            gpsOptions,
        );
        bus.getSubscriber<GPSSatComputerEvents>().on('gps_system_state_changed_1').handle(state => {
            const valid = state === GPSSystemState.SolutionAcquired || state === GPSSystemState.DiffSolutionAcquired;
            if (valid) {
                this.gpsAcquired();
            }
        });
        bus.getSubscriber<PowerEvent>().on("powerEvent").handle(this.powerChanged.bind(this));

        this.clockPublisher = bus.getPublisher<ClockEvents>();
        this.gnssPublisher = bus.getPublisher<GNSSEvents>();

        this.gpsSatComputer.init();

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
        //We subtract an hour, because the PowerButton assumes the device has been off for one our. Will be added back in powerChanged
        const unixTime = this.absoluteTimeToUNIXTime(SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds) + timeRandom - HOURS_TO_SECONDS);
        this.timeZulu = this.unixToTimestamp(unixTime);
        this.gpsSatComputer.internalTime = unixTime;
    }

    tick() {
        const actualUnixTime = this.absoluteTimeToUNIXTime(SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds));
        const lat = SimVar.GetSimVarValue('PLANE LATITUDE', SimVarValueType.Degree);
        const lon = SimVar.GetSimVarValue('PLANE LONGITUDE', SimVarValueType.Degree);
        const alt = SimVar.GetSimVarValue('PLANE ALTITUDE', SimVarValueType.Meters);

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

            if (this.isStarted) {
                this.clockPublisher.pub('simTime', actualUnixTime);
                this.gnssPublisher.pub('gps-position', new LatLongAlt(lat, lon, alt));
                this.gpsSatComputer.onUpdate();
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
                    this.trackTrue = this.lastCoords.bearingTo(this.coords);
                }

                SimVar.SetSimVarValue('GPS POSITION LAT', SimVarValueType.Degree, this.coords.lat);
                SimVar.SetSimVarValue('GPS POSITION LON', SimVarValueType.Degree, this.coords.lon);

                this.intSaveCount += TICK_TIME_CALC;
                if (this.intSaveCount >= SAVE_INTERVALL) {
                    this.savePosition();
                    this.intSaveCount = 0;
                }
                this.timeZulu = this.unixToTimestamp(actualUnixTime);
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

    public startGPSSearch(): void {
        this.isStarted = true;
    }

    public isValid(): boolean {
        //todo this is not entirely correct. GPSSatComputer assumes navigation is only possible with 4 sats. 5-29 states that navigation may be possible with 3 sats when an altitude input is used in the solution
        return this.gpsSatComputer.state === GPSSystemState.SolutionAcquired || this.gpsSatComputer.state === GPSSystemState.DiffSolutionAcquired;
    }


    reset(): void {
        this.savePosition();
        this.gpsSatComputer.reset();
        this.isStarted = false;

        //we still keep all old values
    }

    public savePosition(): void {
        this.userSettings.getSetting("lastLatitude").set(this.coords.lat);
        this.userSettings.getSetting("lastLongitude").set(this.coords.lon);
        this.userSettings.getSetting("lastAlmanacDownload").set((this.gpsSatComputer as any).lastAlamanacTime ?? 0);
    }

    private unixToTimestamp(unix: number): TimeStamp {
        return TimeStamp.create(unix);
    }

    private absoluteTimeToUNIXTime(absoluteTime: number): number {
        return (absoluteTime - 62135596800) * 1000;
    }

    private gpsAcquired() {
        const unixTime = this.absoluteTimeToUNIXTime(SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds));
        const time = this.unixToTimestamp(unixTime);
        const pos = new GeoPoint(
            SimVar.GetSimVarValue('PLANE LATITUDE', SimVarValueType.Degree),
            SimVar.GetSimVarValue('PLANE LONGITUDE', SimVarValueType.Degree),
        );

        if (UnitType.GA_RADIAN.convertTo(this.coords.distance(pos), UnitType.NMILE) > 2) {
            this.messageHandler.addMessage(new OneTimeMessage(["POSITION DIFFERS FROM", "LAST POSITION BY >2NM"]));
        }

        if (Math.abs(time.getTimestamp() - this.timeZulu.getTimestamp()) > 10 * 60 * 1000) {
            this.messageHandler.addMessage(new OneTimeMessage(["SYSTEM TIME UPDATED", "TO GPS TIME"]));
            this.bus.getPublisher<GPSEvents>().pub("timeUpdatedEvent", time);
        }

        this.timeZulu = time;
        this.gpsSatComputer.internalTime = time.getTimestamp();
        this.coords = pos;
    }

    private powerChanged(evt: PowerEventData) {
        if (evt.isPowered) {
            //Ticks are not running, when we are powered off
            this.timeZulu.setTimestamp(this.timeZulu.getTimestamp() + evt.timeSincePowerChange);
        }
    }
}