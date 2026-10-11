import {GeoPoint, GPSPredictionContext, GPSPredictionSatellite, GPSSatelliteState, LatLonInterface, UnitType} from "@microsoft/msfs-sdk";
import type {KLNGPSSatComputer} from "./Gps";

export const enum SearchMode {
    /** No start in progress: the unit navigates, FAST acquisition is selected, or the start was forced. The SDK runs on its own */
    Idle,
    /** 3-17, 5-29: the receiver searches the satellites its almanac predicts for the stored position and its own clock */
    Acquisition,
    /** ORS 01 6-30: the almanac is too old. Blind search for one satellite, then collect a new almanac from it */
    AlmanacSearch,
    /** The predicted satellites were not there: blind search with the current almanac (3-17: at most 12 minutes) */
    SkySearch,
}

/** 1024 weeks: the GPS week number rolls over after it (#63) */
export const GPS_ERA_DURATION = 1024 * 7 * 24 * 60 * 60 * 1000;

/**
 * a - b as the receiver sees it. It keeps GPS time as the week modulo 1024 and the time of week, and cannot tell eras
 * apart; only the host resolves the era for the date it shows (#63). The difference is wrapped into ±512 weeks
 */
export function receiverTimeDifference(a: number, b: number): number {
    const d = (a - b) % GPS_ERA_DURATION;
    if (d > GPS_ERA_DURATION / 2) {
        return d - GPS_ERA_DURATION;
    }
    if (d < -GPS_ERA_DURATION / 2) {
        return d + GPS_ERA_DURATION;
    }
    return d;
}

const SIX_MONTHS = 182 * 24 * 60 * 60 * 1000; //3-17, the same as the SDK almanacExpireTime in Gps.ts
const CLOCK_TOLERANCE = 10 * 60 * 1000; //Install manual 2-66: the time must be right within 10 minutes for ACQ
const SDK_LAST_KNOWN_POSITION_LIMIT = UnitType.NMILE.convertTo(100, UnitType.GA_RADIAN); //The SDK's own rule in its channel assignment
const ELEVATION_MASK_DEG = 5; //5-30: the elevation ranges from 5 to 90 degrees
/** Install manual 2-66: ACQ has its fix within 5 minutes; without one the predicted satellites are not there */
export const GIVE_UP_TIME = 5 * 60 * 1000;

/** The warm-start acquisition time is drawn once per power-on: oscillator warm-up and the phase of the 30 s data frame are common to all channels (#62) */
export const WARM_ACQUISITION_MIN = 2 * 1000;
export const WARM_ACQUISITION_MAX = 75 * 1000;
export const WARM_ACQUISITION_RANGE = 6 * 1000;
/** A satellite with a current ephemeris, searched from where the unit believes it is (the SDK's 2 NM rule): a hot start has its fix before the 17 s self-test ends (#62: 0:17) */
export const HOT_ACQUISITION = 9 * 1000;
export const HOT_ACQUISITION_RANGE = 6 * 1000;
/** No start in progress: a satellite reacquired in flight, or the harness's coldGps (a reset without a power-on) */
export const IDLE_ACQUISITION = 40 * 1000;
/** A blind search knows neither Doppler nor which satellites are up */
export const BLIND_ACQUISITION = 90 * 1000;
export const BLIND_ACQUISITION_RANGE = 60 * 1000;
/**
 * The blind search for the first satellite of an almanac search. A receiver that does not trust its clock searches with
 * no Doppler or time aid. Calibrated so that the whole almanac search lands near the 20 minutes of ORS 01 6-30 and the
 * 21:36 observed on a real unit (#62)
 */
export const ALMANAC_SEARCH_ACQUISITION = 390 * 1000;
export const ALMANAC_SEARCH_ACQUISITION_RANGE = 120 * 1000;

const ACQUIRED_STATES = new Set([GPSSatelliteState.Acquired, GPSSatelliteState.DataCollected, GPSSatelliteState.InUse, GPSSatelliteState.InUseDiffApplied]);

const elevationDeg = (sat: GPSPredictionSatellite): number => 90 - UnitType.RADIAN.convertTo(sat.position.get()[0], UnitType.DEGREE);

/**
 * #62: what the unit believes decides how it searches. At every power-on it picks a start mode from its stored position,
 * its almanac and its own clock. See docs/superpowers/specs/2026-10-11-gps-acquisition-design.md
 */
export class GpsSearch {
    public mode: SearchMode = SearchMode.Idle;

    private readonly prediction: GPSPredictionContext;
    private predictionReady = false;
    private pendingStart: GeoPoint | null = null;
    private storedPosition = new GeoPoint(0, 0);
    private predicted: GPSPredictionSatellite[] = [];
    private modeStartTime = 0;
    private almanacTimeAtStart: number | undefined = undefined;
    private keptPrn: number | null = null;

    constructor(private readonly computer: KLNGPSSatComputer, private readonly isFast: () => boolean) {
        this.prediction = computer.createPredictionContext();
        this.prediction.awaitInit().then(() => this.predictionReady = true);
    }

    /** Power-on: the receiver starts from the position it had at power-off. The mode is decided on the next tick */
    public start(storedPosition: LatLonInterface): void {
        this.end();
        if (this.isFast()) {
            return; //FAST is a simulator convenience (#46): the SDK runs on its own with short timings
        }
        this.pendingStart = new GeoPoint(storedPosition.lat, storedPosition.lon);
    }

    /** First fix, forced acquisition or power-off: the SDK runs on its own until the next power-on */
    public end(): void {
        this.pendingStart = null;
        this.predicted = [];
        this.keptPrn = null;
        if (this.mode !== SearchMode.Idle) {
            this.inhibitAllExcept(null);
            this.computer.setAcquisitionTime(IDLE_ACQUISITION, WARM_ACQUISITION_RANGE);
            this.computer.setAcquisitionTimeWithEphemeris(HOT_ACQUISITION, HOT_ACQUISITION_RANGE);
        }
        this.mode = SearchMode.Idle;
    }

    /** The satellites the unit predicts during ACQ, for STA 1 (#213) */
    public predictedSatellites(): readonly GPSPredictionSatellite[] {
        return this.predicted;
    }

    /**
     * Called by GPS.tick before the computer's onUpdate, so that inhibits and timings apply to the channel assignment.
     * @param simTime The sim time, UNIX ms
     * @param present The aircraft position
     * @param unitTime The unit's own clock, UNIX ms
     */
    public tick(simTime: number, present: LatLonInterface, unitTime: number): void {
        if (this.pendingStart !== null) {
            if (!this.predictionReady) {
                return;
            }
            this.storedPosition = this.pendingStart;
            this.pendingStart = null;
            this.begin(simTime, present, unitTime);
            return;
        }

        switch (this.mode) {
            case SearchMode.Acquisition:
                if (simTime - this.modeStartTime >= GIVE_UP_TIME) {
                    this.startBlindSearch(SearchMode.SkySearch, simTime);
                }
                break;
            case SearchMode.AlmanacSearch:
                this.tickAlmanacSearch(simTime, present);
                break;
        }
    }

    private begin(simTime: number, present: LatLonInterface, unitTime: number): void {
        const almanacTime = this.computer.getLastAlmanacTime();
        //ORS 01 6-30: an almanac six months old or more must be collected again. The unit judges the age by the receiver's
        //clock, which runs modulo the GPS era. A wrong date makes a current almanac look expired when it is six months or
        //more off modulo the era (the wrong date of #62); a date wrong by whole eras, as after a rollover (#63), does not
        if (almanacTime === undefined || Math.abs(receiverTimeDifference(unitTime, almanacTime)) >= SIX_MONTHS) {
            this.startBlindSearch(SearchMode.AlmanacSearch, simTime);
        } else {
            this.startAcquisition(simTime, present, unitTime, Math.abs(receiverTimeDifference(unitTime, simTime)) <= CLOCK_TOLERANCE);
        }
    }

    /**
     * @param believedTime The time the unit believes it is
     * @param canAcquire false when the clock is off by more than the tolerance: the Doppler predictions are wrong and
     * no predicted satellite can be acquired
     */
    private startAcquisition(simTime: number, present: LatLonInterface, believedTime: number, canAcquire: boolean): void {
        //The raw believed time is right across eras too: the SDK reduces the time to the time of week before it propagates the
        //orbits (GPSSat.ts computeSatellitePositions), so a clock off by whole eras predicts the same satellites
        this.prediction.setPosition(this.storedPosition.lat, this.storedPosition.lon, 0, believedTime).predict();
        this.predicted = this.prediction.getSatellites().filter(s => s.sbasGroup === undefined
            && ACQUIRED_STATES.has(s.state.get())
            && elevationDeg(s) >= ELEVATION_MASK_DEG);

        this.inhibitAllExcept(canAcquire ? new Set(this.predicted.map(s => s.prn)) : new Set());

        //The SDK ignores almanac and position beyond 100 NM from its last known position; the KLN decision above replaces
        //that rule. Within it, the stored position keeps the SDK's 2 NM rule for a hot start working
        const presentPoint = new GeoPoint(present.lat, present.lon);
        const storedNearby = this.storedPosition.distance(presentPoint) < SDK_LAST_KNOWN_POSITION_LIMIT;
        this.computer.syncLastKnownPosition(storedNearby ? this.storedPosition : presentPoint);

        const warm = WARM_ACQUISITION_MIN + Math.random() * (WARM_ACQUISITION_MAX - WARM_ACQUISITION_MIN);
        this.computer.setAcquisitionTime(warm, WARM_ACQUISITION_RANGE);
        //Beyond 100 NM the SDK's last known position is the present one, so its 2 NM rule would make every satellite with
        //a current ephemeris hot. The unit searches from the stored position, which is far away: no hot start this time
        if (storedNearby) {
            this.computer.setAcquisitionTimeWithEphemeris(HOT_ACQUISITION, HOT_ACQUISITION_RANGE);
        } else {
            this.computer.setAcquisitionTimeWithEphemeris(warm, WARM_ACQUISITION_RANGE);
        }

        this.mode = SearchMode.Acquisition;
        this.modeStartTime = simTime;
    }

    private startBlindSearch(mode: SearchMode.AlmanacSearch | SearchMode.SkySearch, simTime: number): void {
        this.predicted = [];
        this.keptPrn = null;
        this.inhibitAllExcept(null);
        this.computer.eraseLastKnownPosition();
        if (mode === SearchMode.AlmanacSearch) {
            this.computer.setAcquisitionTime(ALMANAC_SEARCH_ACQUISITION, ALMANAC_SEARCH_ACQUISITION_RANGE);
        } else {
            this.computer.setAcquisitionTime(BLIND_ACQUISITION, BLIND_ACQUISITION_RANGE);
        }
        this.almanacTimeAtStart = this.computer.getLastAlmanacTime();
        this.mode = mode;
        this.modeStartTime = simTime;
    }

    private tickAlmanacSearch(simTime: number, present: LatLonInterface): void {
        if (this.keptPrn !== null && !this.computer.getChannels().some(s => s !== null && s.prn === this.keptPrn && ACQUIRED_STATES.has(s.state.get()))) {
            //The kept satellite was lost before the almanac was complete: resume the blind search, the next satellite
            //acquired is kept instead. Without this the search would never end, as every other satellite is inhibited
            this.keptPrn = null;
            this.inhibitAllExcept(null);
        }

        if (this.keptPrn === null) {
            const acquired = this.computer.getChannels()
                .filter(s => s !== null && ACQUIRED_STATES.has(s.state.get()))
                .map(s => s!.prn)
                .sort((a, b) => a - b);
            if (acquired.length > 0) {
                //ORS 01 6-30: one satellite is enough to collect the almanac
                this.keptPrn = acquired[0];
                this.inhibitAllExcept(new Set([this.keptPrn]));
            }
        } else if (this.computer.getLastAlmanacTime() !== this.almanacTimeAtStart) {
            //The almanac is complete, and the satellite has given the time: predict with the right time from here on
            this.startAcquisition(simTime, present, simTime, true);
        }
    }

    /** @param allowed The PRNs the receiver may track, or null to lift every inhibit */
    private inhibitAllExcept(allowed: Set<number> | null): void {
        for (const sat of this.computer.getSatellites()) {
            this.computer.setSatelliteInhibit(sat.prn, allowed !== null && !allowed.has(sat.prn));
        }
    }
}
