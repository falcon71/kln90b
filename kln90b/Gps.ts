import {
    ClockEvents,
    EventBus,
    GeoPoint,
    GNSSEvents,
    GPSSatComputer,
    GPSSatComputerEvents,
    GPSSatComputerOptions,
    GPSSatellite,
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
const GPS_EPOCH = 315964800000; //Jan 6 1980
const GPS_ERA_DURATION = 1024 * 60 * 60 * 24 * 7 * 1000;
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
        return (this as any).activeSimulationContext.channels;
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
    private clockPublisher: Publisher<ClockEvents>;
    private gnssPublisher: Publisher<GNSSEvents>;
    private gpsStartTime: number = 0;

    constructor(private bus: EventBus, private userSettings: KLN90BUserSettings, options: KLN90PlaneSettings, private readonly messageHandler: MessageHandler) {
        const fastGPS = this.userSettings.getSetting("fastGpsAcquisition").get();

        const gpsOptions: GPSSatComputerOptions = {
            channelCount: 8,
            timingOptions: { //3-17
                almanacExpireTime: 90 * 24 * 60 * 60 * 1000, //Manual says 6 months, but it's 90 days
                acquisitionTime: fastGPS ? 10 * 1000 : 1.5 * 60 * 1000, //Up to two minutes -> 90 +- 30 seconds -> + 30 seconds to download ephemeris
                acquisitionTimeRange: fastGPS ? 1000 : 60 * 1000,
                acquisitionTimeWithEphemeris: fastGPS ? 10 * 1000 : 60 * 1000,
                acquisitionTimeRangeWithEphemeris: fastGPS ? 1000 : 60 * 1000,
                acquisitionTimeout: fastGPS ? 1000 : 4 * 60 * 1000, //4 + 2 -> this puts us close to the 6 minutes the manual mentions. With a second miss, we are at 8+2, that's the value from the manual
                ephemerisDownloadTime: fastGPS ? 1000 : 30000, //30 Seconds
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
            this.clockPublisher.pub('simTime', actualUnixTime);
            this.gnssPublisher.pub('gps-position', new LatLongAlt(lat, lon, alt));
            this.gpsSatComputer.onUpdate();

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

    public isValid(): boolean {
        //todo this is not entirely correct. GPSSatComputer assumes navigation is only possible with 4 sats. 5-29 states that navigation may be possible with 3 sats when an altitude input is used in the solution
        return this.gpsSatComputer.state === GPSSystemState.SolutionAcquired || this.gpsSatComputer.state === GPSSystemState.DiffSolutionAcquired;
    }


    reset(): void {
        this.savePosition();
        this.gpsSatComputer.reset();

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
            //Ticks are not running, when we are powered off
            this.timeZulu.setTimestamp(this.timeZulu.getTimestamp() + evt.timeSincePowerChange);
            this.gpsStartTime = SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds);
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