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
    MathUtils,
    Publisher,
    SimVarValueType,
    SubscribableSet,
    UnitType,
    Vec3Math,
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
}


abstract class KalmanFilter {

    public abstract update(pos: Float64Array, speed: Float64Array, dt: number, anp: number): number[];

    protected matrixMultiply(A: number[][], B: number[][]): number[][] {
        return A.map(row => B[0].map((_, j) => row.reduce((sum, val, i) => sum + val * B[i][j], 0)));
    }

    protected matrixVectorMultiply(A: number[][], B: number[]): number[] {
        return A.map(row => row.reduce((sum, val, i) => sum + val * B[i], 0));
    }

    protected matrixAdd(A: number[][], B: number[][]): number[][] {
        return A.map((row, i) => row.map((val, j) => val + B[i][j]));
    }

    protected matrixSubtract(A: number[][], B: number[][]): number[][] {
        return A.map((row, i) => row.map((val, j) => val - B[i][j]));
    }

    protected transpose(A: number[][]): number[][] {
        return A[0].map((_, colIndex) => A.map(row => row[colIndex]));
    }

    protected inverse(A: number[][]): number[][] {
        const n = A.length;
        const I = this.identityMatrix(n);
        const AI = A.map((row, i) => [...row, ...I[i]]);

        for (let i = 0; i < n; i++) {
            let maxRow = i;
            for (let k = i + 1; k < n; k++) {
                if (Math.abs(AI[k][i]) > Math.abs(AI[maxRow][i])) {
                    maxRow = k;
                }
            }
            [AI[i], AI[maxRow]] = [AI[maxRow], AI[i]];

            const diag = AI[i][i];
            AI[i] = AI[i].map(x => x / diag);

            for (let k = 0; k < n; k++) {
                if (k !== i) {
                    const factor = AI[k][i];
                    AI[k] = AI[k].map((x, j) => x - factor * AI[i][j]);
                }
            }
        }
        return AI.map(row => row.slice(n));
    }

    protected identityMatrix(size: number): number[][] {
        return Array.from({length: size}, (_, i) =>
            Array.from({length: size}, (_, j) => (i === j ? 1 : 0)),
        );
    }

    protected vectorAdd(A: number[], B: number[]): number[] {
        return A.map((val, i) => val + B[i]);
    }

    protected vectorSubtract(A: number[], B: number[]): number[] {
        return A.map((val, i) => val - B[i]);
    }

}

class ConstantAccelKalmanFilter extends KalmanFilter {

    private x: number[]; //State vector
    private P: number[][]; // Covariance matrix
    private readonly H: number[][]; // Measurement matrix
    private readonly I: number[][];

    constructor(pos: Float64Array, initialVariance: number) {
        super();
        this.x = [pos[0], pos[1], pos[2], 0, 0, 0, 0, 0, 0];

        this.P = [
            [initialVariance, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, initialVariance, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, initialVariance, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
        ];

        this.H = [
            [1, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 1, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 1, 0, 0, 0, 0, 0, 0],
        ];

        this.I = [
            [1, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 1, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 1, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 1, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 1, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 1, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 1, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 1, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 1],
        ];
    }

    public update(pos: Float64Array, speed: Float64Array, dt: number, anp: number): number[] {
        //Predict
        const dtacc = 0.5 * dt * dt;
        const F = [
            [1, 0, 0, dt, 0, 0, dtacc, 0, 0],
            [0, 1, 0, 0, dt, 0, 0, dtacc, 0],
            [0, 0, 1, 0, 0, dt, 0, 0, dtacc],
            [0, 0, 0, 1, 0, 0, dt, 0, 0],
            [0, 0, 0, 0, 1, 0, 0, dt, 0],
            [0, 0, 0, 0, 0, 1, 0, 0, dt],
            [0, 0, 0, 0, 0, 0, 1, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 1, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 1],

        ];


        // Estimate process noise from ANP
        const processNoise = Math.max(0.0001, anp * 0.01); // Scale process noise by ANP

        // Construct the proper Q matrix
        const Q = [
            [processNoise, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, processNoise, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, processNoise, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 10, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 10, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 10, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0, 0],
        ];

        // Dynamic measurement noise matrix (trust GPS more when ANP is low)
        const measurementNoise = Math.max(0.1, anp * 0.5); // Scale measurement noise by ANP
        const R = [
            [measurementNoise, 0, 0],
            [0, measurementNoise, 0],
            [0, 0, measurementNoise],
        ];

        this.x = this.matrixVectorMultiply(F, this.x);

        this.P = this.matrixAdd(
            this.matrixMultiply(this.matrixMultiply(F, this.P), this.transpose(F)),
            Q,
        );


        // Measurement update
        const z = [pos[0], pos[1], pos[2]]; // New GPS measurement
        const y = this.vectorSubtract(z, this.matrixVectorMultiply(this.H, this.x)); // Innovation
        const S = this.matrixAdd(this.matrixMultiply(this.H, this.matrixMultiply(this.P, this.transpose(this.H))), R);
        const K = this.matrixMultiply(this.P, this.matrixMultiply(this.transpose(this.H), this.inverse(S))); // Kalman gain

        // Update state estimate
        this.x = this.vectorAdd(this.x, this.matrixVectorMultiply(K, y));

        // Update covariance matrix: P = (I - K * H) * P
        this.P = this.matrixMultiply(this.matrixSubtract(this.I, this.matrixMultiply(K, this.H)), this.P);
        return this.x;

    }


}

const RANDOM_SMOOTHNESS = 0.04;

class ConstantSpeedKalmanFilter extends KalmanFilter {

    private x: number[]; //State vector
    private P: number[][]; // Covariance matrix
    private readonly H: number[][]; // Measurement matrix
    private readonly I: number[][];

    constructor(pos: Float64Array, initialVariance: number) {
        super();
        this.x = [pos[0], pos[1], pos[2], 0, 0, 0];

        // Initial covariance matrix
        this.P = [
            [initialVariance, 0, 0, 0, 0, 0],
            [0, initialVariance, 0, 0, 0, 0],
            [0, 0, initialVariance, 0, 0, 0],
            [0, 0, 0, 10, 0, 0],
            [0, 0, 0, 0, 10, 0],
            [0, 0, 0, 0, 0, 10],
        ];

        // Measurement matrix (maps state to observed values)
        this.H = [
            [1, 0, 0, 0, 0, 0],
            [0, 1, 0, 0, 0, 0],
            [0, 0, 1, 0, 0, 0],
            [0, 0, 0, 1, 0, 0],
            [0, 0, 0, 0, 1, 0],
            [0, 0, 0, 0, 0, 1],
        ];

        this.I = this.identityMatrix(this.P.length);
    }

    /**
     * https://medium.com/towards-data-science/kalman-filter-an-algorithm-for-making-sense-from-the-insights-of-various-sensors-fused-together-ddf67597f35e
     * @param pos
     * @param speed
     * @param dt
     * @param anpRadians
     */
    public update(pos: Float64Array, speed: Float64Array, dt: number, anpRadians: number): number[] {
        //Predict
        const F = [
            [1, 0, 0, dt, 0, 0],
            [0, 1, 0, 0, dt, 0],
            [0, 0, 1, 0, 0, dt],
            [0, 0, 0, 1, 0, 0],
            [0, 0, 0, 0, 1, 0],
            [0, 0, 0, 0, 0, 1],
        ];


        // The speed might be different up to 10 knots between measurements
        const processNoiseSpeed = UnitType.NMILE.convertTo(10, UnitType.GA_RADIAN);
        // The position must have changed a little less though
        const processNoisePosition = processNoiseSpeed / HOURS_TO_SECONDS;
        const diag = dt ** 2 * processNoiseSpeed;
        //const diag = 0;
        // const processNoisePosition =  0;

        // Construct the proper Q matrix

        /*
        const Q = [
            [processNoisePosition, 0, 0, diag, 0, 0],
            [0, processNoisePosition, 0, 0, diag, 0],
            [0, 0, processNoisePosition, 0, 0,diag],
            [0, 0, 0, processNoiseSpeed, 0, 0],
            [0, 0, 0, 0, processNoiseSpeed, 0],
            [0, 0, 0, 0, 0, processNoiseSpeed],
        ];*/
        const sv = (anpRadians / 2) ** 2;
        const svM = [
            [sv, sv, sv, sv, sv, sv],
            [sv, sv, sv, sv, sv, sv],
            [sv, sv, sv, sv, sv, sv],
            [sv, sv, sv, sv, sv, sv],
            [sv, sv, sv, sv, sv, sv],
            [sv, sv, sv, sv, sv, sv],
        ];
        const G = [
            [0.5 * dt ** 2],
            [0.5 * dt ** 2],
            [0.5 * dt ** 2],
            [dt],
            [dt],
            [dt],
        ];
        const Q = this.matrixMultiply(this.matrixMultiply(G, this.transpose(G)), svM);

        // Dynamic measurement noise matrix (trust GPS more when ANP is low)

        const measurementNoisePosition = anpRadians;
        const measurementNoiseSpeed = anpRadians;

        const R = [
            [measurementNoisePosition, 0, 0, 0, 0, 0],
            [0, measurementNoisePosition, 0, 0, 0, 0],
            [0, 0, measurementNoisePosition, 0, 0, 0],
            [0, 0, 0, measurementNoiseSpeed, 0, 0],
            [0, 0, 0, 0, measurementNoiseSpeed, 0],
            [0, 0, 0, 0, 0, measurementNoiseSpeed],
        ];

        const predicted = this.matrixVectorMultiply(F, this.x);
        SimVar.SetSimVarValue("L:KLN_predicted", SimVarValueType.NM, UnitType.GA_RADIAN.convertTo(predicted[3], UnitType.NMILE) * 10000);

        this.P = this.matrixAdd(
            this.matrixMultiply(this.matrixMultiply(F, this.P), this.transpose(F)),
            Q,
        );


        // Measurement update
        const z = [pos[0], pos[1], pos[2], speed[0], speed[1], speed[2]]; // New GPS measurement
        const y = this.vectorSubtract(z, this.matrixVectorMultiply(this.H, predicted)); // Innovation
        const S = this.matrixAdd(this.matrixMultiply(this.H, this.matrixMultiply(this.P, this.transpose(this.H))), R);
        const K = this.matrixMultiply(this.P, this.matrixMultiply(this.transpose(this.H), this.inverse(S))); // Kalman gain

        // Update state estimate
        this.x = this.vectorAdd(predicted, this.matrixVectorMultiply(K, y));
        SimVar.SetSimVarValue("L:KLN_final", SimVarValueType.NM, UnitType.GA_RADIAN.convertTo(this.x[3], UnitType.NMILE) * 10000);

        // Update covariance matrix: P = (I - K * H) * P
        this.P = this.matrixMultiply(this.matrixSubtract(this.I, this.matrixMultiply(K, this.H)), this.P);
        return this.x;
    }


}

export class GPS {
    public coords: GeoPoint;
    public trackTrue: Degrees = 0; //Consider accessing this via getTrackRespectingGroundspeed
    public groundspeed: Knots = 0;
    public timeZulu: TimeStamp;
    public gpsSatComputer: KLNGPSSatComputer;
    private static ANP_MULTIPLIER = 1 / 0.95;
    public anp: number = 0;
    private lastCoords: GeoPoint = new GeoPoint(0, 0);
    private intSaveCount = 0;
    private readonly takeHomeMode: boolean;
    private isStarted: boolean = false;
    private clockPublisher: Publisher<ClockEvents>;
    private gnssPublisher: Publisher<GNSSEvents>;
    private lastUnfilteredCoords = new Float64Array(3);
    private positionMultiplierLat = 0;
    private positionMultiplierLong = 0;

    private readonly kalmanFilter: KalmanFilter;

    private readonly CACHED_GEOPOINT = new GeoPoint(0, 0);
    private readonly COORD_CACHE = new Float64Array(3);
    private readonly VELOCITY_CACHE = new Float64Array(3);

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


        this.coords.toCartesian(this.COORD_CACHE);
        this.coords.toCartesian(this.lastUnfilteredCoords);
        this.kalmanFilter = new ConstantSpeedKalmanFilter(this.COORD_CACHE, 1);

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

    //Code from https://github.com/microsoft/msfs-avionics-mirror/blob/main/src/workingtitle-instruments-uns-1lw/html_ui/Pages/VCockpit/Instruments/NavSystems/WTUns1v2/Fms/Navigation/UnsPositionSystems.ts#L367
    private static readonly ANPmeters = (pdop: number): number => {
        /** In meters. Used for calculating the ANP. Sets at 222 under the assumption that airplane cruises at 800 km/h,
         * hence if gps position is updated every second, the deviation would be 222 m/s.
         * Source: https://en.wikipedia.org/wiki/Error_analysis_for_the_Global_Positioning_System */
        const STANDARD_DEVIATION_OF_USER_EQUIVALENT_RANGE_ERROR = 222;

        /** In meters. Used for calculating the ANP. Source: https://en.wikipedia.org/wiki/Error_analysis_for_the_Global_Positioning_System */
        const ESTIMATED_NUMERICAL_ERROR = 200;

        /** Used for calculating the ANP. Source: https://www.calculator.net/confidence-interval-calculator.html */
        const Z_FACTOR_OF_95_PERCENT_CONFIDENT_INTERVAL = 1.96;

        /** Used for calculating the ANP. Source: https://www.calculator.net/confidence-interval-calculator.html */
        const HYPOTHETICAL_SAMPLE_SIZE = 1;

        const STANDARD_DEVIATION_OF_ERROR_IN_ESTIMATED_RECEIVER_POS = (): number => {
            return Math.sqrt((pdop * STANDARD_DEVIATION_OF_USER_EQUIVALENT_RANGE_ERROR) ^ 2 + ESTIMATED_NUMERICAL_ERROR ^ 2);
        };

        return Z_FACTOR_OF_95_PERCENT_CONFIDENT_INTERVAL * STANDARD_DEVIATION_OF_ERROR_IN_ESTIMATED_RECEIVER_POS() / Math.sqrt(HYPOTHETICAL_SAMPLE_SIZE);
    };

    tick() {
        const actualUnixTime = this.absoluteTimeToUNIXTime(SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds));
        const altualLat = SimVar.GetSimVarValue('PLANE LATITUDE', SimVarValueType.Degree);
        const actualLon = SimVar.GetSimVarValue('PLANE LONGITUDE', SimVarValueType.Degree);
        const actualAlt = SimVar.GetSimVarValue('PLANE ALTITUDE', SimVarValueType.Meters);

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
                this.gnssPublisher.pub('gps-position', new LatLongAlt(altualLat, actualLon, actualAlt));
                this.gpsSatComputer.onUpdate();
            }

            if (this.isValid()) {
                this.lastCoords.set(this.coords);

                const pdop = Math.max(this.gpsSatComputer.pdop, 0);
                const anp = GPS.ANPmeters(pdop);

                //We simulate that the measured position is a bit fuzzy within the ANP
                this.positionMultiplierLat = this.getRandomNegative();
                this.positionMultiplierLong = this.getRandomNegative();

                const anpMultiplied = anp * GPS.ANP_MULTIPLIER;
                const actualCoords = this.CACHED_GEOPOINT.set(altualLat, actualLon);
                const measuredCoords = actualCoords
                    .offset(90, UnitType.GA_RADIAN.convertFrom(anpMultiplied * this.positionMultiplierLat, UnitType.METER))
                    .offset(0, UnitType.GA_RADIAN.convertFrom(anpMultiplied * this.positionMultiplierLong, UnitType.METER));

                measuredCoords.toCartesian(this.COORD_CACHE);

                const blub = new Float64Array(3);
                this.lastCoords.toCartesian(blub);
                this.VELOCITY_CACHE[0] = this.COORD_CACHE[0] - this.lastUnfilteredCoords[0];
                this.VELOCITY_CACHE[1] = this.COORD_CACHE[1] - this.lastUnfilteredCoords[1];
                this.VELOCITY_CACHE[2] = this.COORD_CACHE[2] - this.lastUnfilteredCoords[2];


                this.lastUnfilteredCoords = measuredCoords.toCartesian(this.lastUnfilteredCoords);
                SimVar.SetSimVarValue("L:KLN_measured", SimVarValueType.NM, UnitType.GA_RADIAN.convertTo(this.VELOCITY_CACHE[0], UnitType.NMILE) * 10000);
                SimVar.SetSimVarValue("L:KLN_actual", SimVarValueType.NM, 0 * 10000);

                //The measured position can not be used directly, this will cause the GS and bearing to jump around wildly
                //Therefore we smooth it out with a Kalman filter
                const filteredPos = this.kalmanFilter.update(this.COORD_CACHE, this.VELOCITY_CACHE, TICK_TIME_CALC / 1000, UnitType.METER.convertTo(anp, UnitType.GA_RADIAN));
                this.COORD_CACHE[0] = filteredPos[0];
                this.COORD_CACHE[1] = filteredPos[1];
                this.COORD_CACHE[2] = filteredPos[2];
                this.VELOCITY_CACHE[0] = filteredPos[3];
                this.VELOCITY_CACHE[1] = filteredPos[4];
                this.VELOCITY_CACHE[2] = filteredPos[5];


                this.coords.setFromCartesian(this.COORD_CACHE);

                this.groundspeed = UnitType.GA_RADIAN.convertTo(this.calculateGroundSpeed(this.COORD_CACHE, this.VELOCITY_CACHE), UnitType.NMILE);

                //this.groundspeed = UnitType.GA_RADIAN.convertTo(this.convertSpeedToGroundSpeedAndBearing(this.COORD_CACHE, this.VELOCITY_CACHE).groundSpeed, UnitType.NMILE);

                //this.groundspeed = UnitType.GA_RADIAN.convertTo(this.lastCoords.distance(this.coords), UnitType.NMILE) * HOURS_TO_SECONDS;

                //Can be enabled to debug the accuracy of the Kalman filter
                const actualCoords2 = new GeoPoint(altualLat, actualLon);
                const actualPosDiff = UnitType.GA_RADIAN.convertTo(actualCoords2.distance(this.coords), UnitType.NMILE);
                const actualMeasuredPosDiff = UnitType.GA_RADIAN.convertTo(actualCoords2.distance(measuredCoords), UnitType.NMILE);


                if (this.groundspeed >= MIN_GROUND_SPEED_FOR_TRACK) {
                    //3-34 The manual mentions, that this can lag a bit, so this works for me
                    //this.trackTrue = this.lastCoords.bearingTo(this.coords);
                    this.trackTrue = this.calculateCourse(this.COORD_CACHE, this.VELOCITY_CACHE);
                }
                this.trackTrue = this.calculateCourse(this.VELOCITY_CACHE, this.COORD_CACHE);
                console.log(`actualPosDiff: ${actualPosDiff}nm : ${actualMeasuredPosDiff}nm `, `gs:${this.groundspeed}kt : ${SimVar.GetSimVarValue('GROUND VELOCITY', SimVarValueType.Knots)}kt`, this.trackTrue, UnitType.GA_RADIAN.convertTo(this.VELOCITY_CACHE[0], UnitType.NMILE) * 10000);
                console.log(this.calculateCourse(this.COORD_CACHE, this.VELOCITY_CACHE), this.trackTrue);

                this.intSaveCount += TICK_TIME_CALC;
                if (this.intSaveCount >= SAVE_INTERVALL) {
                    this.savePosition();
                    this.intSaveCount = 0;
                }
                this.timeZulu = this.unixToTimestamp(actualUnixTime);
                this.gpsSatComputer.internalTime = actualUnixTime;


                this.anp = UnitType.METER.convertTo(anp, UnitType.NMILE);
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

    private calculateGroundSpeed(position: Float64Array, velocity: Float64Array): number {
        const out = new Float64Array(3);
        const cross = Vec3Math.cross(velocity, position, out);

        //This works, because we only use the lat/lon in our position and not the altitude
        return Math.sqrt(cross[0] ** 2 + cross[1] ** 2 + cross[2] ** 2) * HOURS_TO_SECONDS;
    }

    private calculateCourse(position: Float64Array, velocity: Float64Array): number {
        const out = new Float64Array(3);

        const cross = Vec3Math.cross(velocity, position, out);
        const course = Math.atan2(cross[0], cross[2]);


        return MathUtils.normalizeAngleDeg(course * Avionics.Utils.RAD2DEG + 90);
    }

    private convertSpeedToGroundSpeedAndBearing(
        position: Float64Array,
        speed: Float64Array,
    ): any {
        // Earth's radius in meters (mean value)
        const R_EARTH = 6371000;

        // Convert position to latitude and longitude
        const lat = Math.asin(position[2] / R_EARTH);
        const lon = Math.atan2(position[1], position[0]);

        // Convert velocity to local ENU (East-North-Up) coordinates
        const sinLat = Math.sin(lat);
        const cosLat = Math.cos(lat);
        const sinLon = Math.sin(lon);
        const cosLon = Math.cos(lon);

        const v_east = -sinLon * speed[0] + cosLon * speed[1];
        const v_north = -sinLat * cosLon * speed[0] - sinLat * sinLon * speed[1] + cosLat * speed[2];
        // const v_up = cosLat * cosLon * speed.x + cosLat * sinLon * speed.y + sinLat * speed.z;

        // Compute ground speed (magnitude of horizontal velocity)
        const groundSpeed = Math.sqrt(v_east ** 2 + v_north ** 2) * HOURS_TO_SECONDS;

        // Compute bearing (angle from North, clockwise)
        let bearing = MathUtils.normalizeAngleDeg(Math.atan2(v_east, v_north) * (180 / Math.PI) + 90);

        return {groundSpeed, bearing};
    }

    private lerp(a: number, b: number, alpha: number): number {
        return a + alpha * (b - a);
    }

    private getRandomNegative(): number {
        return this.randn_bm() * 2 - 1;
    }

    private gaussianRandom(mean: number = 0, stdev: number = 1) {
        const u = 1 - Math.random(); // Converting [0,1) to (0,1]
        const v = Math.random();
        const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        // Transform to the desired mean and standard deviation:
        return z * stdev + mean;
    }


    private randn_bm(): number {
        let u = 0, v = 0;
        while (u === 0) {
            u = Math.random();
        } //Converting [0,1) to (0,1)
        while (v === 0) {
            v = Math.random();
        }
        let num = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        num = num / 10.0 + 0.5; // Translate to 0 -> 1
        if (num > 1 || num < 0) {
            return this.randn_bm();
        } // resample between 0 and 1
        return num;
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