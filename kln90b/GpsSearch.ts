import {GeoPoint, GPSPredictionContext, GPSPredictionSatellite, GPSSatelliteState, LatLonInterface, UnitType} from "@microsoft/msfs-sdk";
import type {KLNGPSSatComputer} from "./Gps";

export const enum SearchMode {
    /** No start in progress: the unit navigates, or the start was forced. The SDK runs on its own */
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
export const CLOCK_TOLERANCE = 10 * 60 * 1000; //Install manual 2-66: the time must be right within 10 minutes for ACQ
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

/** The SDK's own line of sight: a satellite with a geometric signal strength above this is in view (GPSSat.ts) */
const SDK_REACHABLE_STRENGTH = 0.05;
const PRN_SLOTS = 256;

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
    /** The search's own choice: the PRNs the receiver may track, or null for all (#460, design "The inhibits") */
    private allowed: Set<number> | null = null;
    /** The inhibit last applied here, by PRN, so that applyInhibits changes only what changed */
    private readonly applied = new Uint8Array(PRN_SLOTS);
    /**
     * Per PRN: a satellite below the horizon that the SDK's blind fill put into a channel, held inhibited during the sky search
     * that keeps the belief until it has left the channels (tickSkySearchKeepingBelief)
     */
    private readonly releasing = new Uint8Array(PRN_SLOTS);
    /** Per PRN: in a channel, filled in place */
    private readonly inChannel = new Uint8Array(PRN_SLOTS);
    /**
     * The sim time the unit lost its fix, or null (#465, design "Recovery"). Read only while idle; end() clears it, which every
     * fix calls (GPS.gpsAcquired), so a fix before the give-up time cancels the sky search
     */
    private lostAt: number | null = null;
    /**
     * The sky search keeps the receiver's belief: its position, its almanac and the SDK's timings for a satellite it
     * predicts (#465, final review 2026-11-08). Only the sky search after a lost fix in flight; see lostFix
     */
    private _keepsBelief = false;

    /**
     * The receiver failures' block (#460) is merged with the search's choice, so that it survives every start, end and
     * forced acquisition of the search. A satellite whose signal is lost is not inhibited: the receiver keeps it in its
     * channel and searches it (#467, Gps.ts wrapReachability)
     * @param allBlocked The failures forbid tracking any satellite (a receiver failure). Asked once per application, not
     * per satellite: it reads the settings (the tick cost rule, CLAUDE.md)
     */
    constructor(private readonly computer: KLNGPSSatComputer, private readonly allBlocked: () => boolean) {
        this.prediction = computer.createPredictionContext();
        this.prediction.awaitInit().then(() => this.predictionReady = true);
    }

    /**
     * Power-on: the receiver starts from the position it had at power-off. The mode is decided on the next tick. FAST runs
     * the same search, from the true state it has written into the memory before (Gps.ts initializeFromTruth, #468)
     */
    public start(storedPosition: LatLonInterface): void {
        this.end();
        this.pendingStart = new GeoPoint(storedPosition.lat, storedPosition.lon);
    }

    /** First fix, forced acquisition or power-off: the SDK runs on its own until the next power-on */
    public end(): void {
        this.pendingStart = null;
        this.lostAt = null;
        this._keepsBelief = false;
        this.releasing.fill(0);
        this.predicted = [];
        this.keptPrn = null;
        if (this.mode !== SearchMode.Idle) {
            this.inhibitAllExcept(null);
            this.computer.setAcquisitionTime(IDLE_ACQUISITION, WARM_ACQUISITION_RANGE);
            this.computer.setAcquisitionTimeWithEphemeris(HOT_ACQUISITION, HOT_ACQUISITION_RANGE);
        } else {
            this.allowed = null;
            this.applyInhibits(); //Only the receiver failures' block is left, and it stays
        }
        this.mode = SearchMode.Idle;
    }

    /**
     * #465, design "Recovery": the unit lost its fix, with a belief close enough to the real sky to reacquire as before.
     * Without a fix for the give-up time (Install manual 2-66: 5 minutes) the satellites it predicts are not there, and it
     * searches the sky as after a power-on (3-17), every PRN, until a fix ends the search.
     *
     * Decided at the final review (2026-11-08): that sky search keeps the receiver's belief. A jammed receiver's clock and
     * position stay right, so it does not search blind: the SDK keeps its last known position, its almanac and the idle and
     * hot timings of the satellites it predicts (startSkySearchKeepingBelief), and the fix returns within about a minute of
     * four satellites coming back, as the jammed A321 of Felux et al. (NAVIGATION 71(3), 2024) recovered some 2 minutes
     * after the interference ended. Its almanac puts no satellite below the horizon into a channel, and it does not give up
     * on a satellite in view for an hour (tickSkySearchKeepingBelief). The fake receiver still searches every PRN with its
     * blind time (FakeReceiver), as a fake satellite outside the believed sky is not predicted. The power-on sky search is
     * unchanged
     * @param simTime The sim time, UNIX ms
     */
    public lostFix(simTime: number): void {
        this.lostAt = simTime;
    }

    /**
     * Applies the search's choice and the receiver failures' block: a satellite is inhibited when the search does not
     * allow it or a receiver failure blocks every satellite. GPS.tick calls it every tick, as a receiver failure can start
     * or be repaired at any time. It changes only the satellites whose inhibit changed since the last call, so with no
     * failure and no change of the choice it touches nothing. Allocates nothing
     */
    public applyInhibits(): void {
        this.apply(false);
    }

    /** The sky search keeps the receiver's belief (lostFix): the SDK keeps its almanac */
    public get keepsBelief(): boolean {
        return this._keepsBelief;
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
            case SearchMode.SkySearch:
                if (this._keepsBelief) {
                    this.tickSkySearchKeepingBelief();
                }
                break;
            case SearchMode.Idle:
                if (this.lostAt !== null && simTime - this.lostAt >= GIVE_UP_TIME) {
                    this.startSkySearchKeepingBelief(simTime);
                    this.tickSkySearchKeepingBelief();
                }
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
        this._keepsBelief = false;
        this.releasing.fill(0);
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

    /**
     * The sky search after a lost fix (lostFix): every PRN, no inhibit of the search's choice, but the SDK keeps its last
     * known position, its almanac and the idle and hot timings
     */
    private startSkySearchKeepingBelief(simTime: number): void {
        this.predicted = [];
        this.keptPrn = null;
        this._keepsBelief = true;
        this.inhibitAllExcept(null);
        this.computer.setAcquisitionTime(IDLE_ACQUISITION, WARM_ACQUISITION_RANGE);
        this.computer.setAcquisitionTimeWithEphemeris(HOT_ACQUISITION, HOT_ACQUISITION_RANGE);
        this.mode = SearchMode.SkySearch;
        this.modeStartTime = simTime;
    }

    /**
     * The sky search that keeps the belief, in every tick before the SDK's update. The SDK gives up on a satellite it searched
     * in vain for its acquisition timeout (4 minutes) for an hour, and fills a channel it has nothing in view for with
     * satellites in PRN order, below the horizon too (GPSSat.ts). Neither is what a receiver does that knows where it is,
     * its time and its almanac:
     * - the Unreachable marks are forgotten (KLNGPSSatComputer.forgetUnreachable), so that a satellite in view whose signal
     *   is lost stays in its channel, searched, and one out of a channel can be given one;
     * - a satellite below the horizon in a channel is inhibited until the SDK has taken it out at its next channel
     *   assignment (every 5 s), so that the channel goes to a satellite in view. The SDK's own line of sight stands in for
     *   the receiver's almanac at its belief, which is within the SDK's 100 NM and the start model's clock tolerance of the
     *   truth here (Gps.fixLost). The inhibit is lifted as soon as the satellite has left the channels
     * Allocates nothing
     */
    private tickSkySearchKeepingBelief(): void {
        this.computer.forgetUnreachable();
        const channels = this.computer.getChannels();
        const inChannel = this.inChannel;
        inChannel.fill(0);
        for (let i = 0; i < channels.length; i++) {
            const sat = channels[i];
            if (sat !== null && sat.prn < PRN_SLOTS) {
                inChannel[sat.prn] = 1;
                if (!(sat.signalStrength.get() > SDK_REACHABLE_STRENGTH)) {
                    this.releasing[sat.prn] = 1;
                }
            }
        }
        const sats = this.computer.getSatellites();
        for (let i = 0; i < sats.length; i++) {
            const prn = sats[i].prn;
            if (prn < PRN_SLOTS && this.releasing[prn] === 1 && inChannel[prn] === 0) {
                this.releasing[prn] = 0;
            }
        }
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

    /**
     * Stores the search's choice and sets the inhibit of every satellite from it, the receiver failures' block merged in
     * @param allowed The PRNs the receiver may track, or null to lift every inhibit the search set
     */
    private inhibitAllExcept(allowed: Set<number> | null): void {
        this.allowed = allowed;
        this.apply(true);
    }

    /** @param all Sets every satellite, not only those whose inhibit changed */
    private apply(all: boolean): void {
        const sats = this.computer.getSatellites();
        const allBlocked = this.allBlocked();
        for (let i = 0; i < sats.length; i++) {
            const prn = sats[i].prn;
            const inhibit = allBlocked || (this.allowed !== null && !this.allowed.has(prn)) || this.releasing[prn] === 1;
            const value = inhibit ? 1 : 0;
            if (all || this.applied[prn] !== value) {
                this.applied[prn] = value;
                this.computer.setSatelliteInhibit(prn, inhibit);
            }
        }
    }
}
