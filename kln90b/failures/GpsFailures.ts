import {EventBus, GPSSatellite} from '@microsoft/msfs-sdk';
import {Failures, FailureChangedEvents} from "./Failures";
import {MAX_TRIGGER_STEP_S} from "./FailureTrigger";
import {MASK_ZENITH_RAD} from "../GpsSignal";
import {GpsGeometry, Raim, RAIM_K, raimStatus, SIGMA_UERE_M} from "../GpsSolution";

/** Short-term variation of the jamming level around its ramp, in dB. Our own choice */
export const JAMMING_WANDER_SIGMA_DB = 3;
/** Correlation time of that variation, in seconds. Our own choice */
export const JAMMING_WANDER_TAU_S = 10;
/** The ramp progress is saved at most this often, in seconds of progress */
export const RAMP_SAVE_INTERVAL_S = 10;

/** The faulty satellite is replaced after this many seconds out of the solution while the unit has a fix. Our own choice */
export const FAULT_SWITCH_S = 120;
/** The smallest bias the protection level of GpsSolution is built to catch (5-29 RAIM, our model) */
export const FAULT_DETECTION_BIAS_M = RAIM_K * SIGMA_UERE_M;

const RAMP_S_MIN = 180;
const RAMP_S_MAX = 360;
const FINAL_DB_MIN = 24;
const FINAL_DB_MAX = 28;
const BIAS_M_MIN = 500;
const BIAS_M_MAX = 3000;
const FAULT_RAMP_S_MIN = 120;
const FAULT_RAMP_S_MAX = 300;

/** What GpsFailures needs from the receiver; the GPS class implements it, tests fake it */
export interface ReceiverView {
    satellites(): readonly GPSSatellite[];
    /** The unit's solution in row order, lost satellites already left out */
    solutionPrns(): readonly number[];
    readonly solution: GpsGeometry;
    isValid(): boolean;
}

/** The progress of a ramp in sim time and when it was last saved; the one rule for jamming and the faulty satellite */
class RampProgress {
    public totalS = 0;
    public elapsedS = 0;
    private lastSavedS = 0;
    private endSaved = false;

    public start(totalS: number, elapsedS: number): void {
        this.totalS = totalS;
        this.elapsedS = elapsedS;
        this.lastSavedS = elapsedS;
        this.endSaved = elapsedS >= totalS;
    }

    /** The share of the ramp done, 0 to 1 */
    public get share(): number {
        return Math.min(1, this.elapsedS / this.totalS);
    }

    /** Counts dt and calls save at most every RAMP_SAVE_INTERVAL_S of progress and once at the end */
    public advance(dt: number, save: () => void): void {
        this.elapsedS = Math.min(this.totalS, this.elapsedS + dt);
        if (this.elapsedS >= this.totalS) {
            if (!this.endSaved) {
                this.endSaved = true;
                save();
            }
        } else if (this.elapsedS - this.lastSavedS >= RAMP_SAVE_INTERVAL_S) {
            save();
        }
    }

    public markSaved(): void {
        this.lastSavedS = this.elapsedS;
    }
}

function finiteField(values: Record<string, number>, key: string): boolean {
    return typeof values[key] === 'number' && isFinite(values[key]);
}

/**
 * The failures of the GPS receiver (#460): a dead antenna or receiver blocks every satellite, jamming raises the noise
 * floor (Installation Manual C-7, Pilot's Guide 5-29). Jamming only gives the level: the receiver's signal model
 * (SatelliteSignals, #467) takes it off every satellite's SNR, and its lock rule loses the satellites, the weakest first.
 * It holds a cache of the stored values; the failure state itself is the saved settings.
 */
export class GpsFailures {
    public wanderSigmaDb: number = JAMMING_WANDER_SIGMA_DB;

    private lastTimeS: number | null = null;
    private wander = 0;
    private level = 0;

    private cacheValid = false;
    private finalDb = 0;
    private readonly jamRamp = new RampProgress();

    private faultCacheValid = false;
    private faultPrn = 0;
    private faultBiasM = 0;
    private readonly faultRamp = new RampProgress();
    private outOfSolutionS = 0;
    /** The stored values are unusable and the last draw found no satellite: only the pick is retried, the text is not parsed again */
    private faultNeedsPick = false;

    private readonly saveJammingFn = () => this.saveJamming();
    private readonly saveFaultFn = () => this.saveFault();

    private hasSpare = false;
    private spare = 0;

    constructor(bus: EventBus, private readonly failures: Failures, private readonly receiver: ReceiverView, private readonly takeHomeMode: boolean, public random: () => number = Math.random) {
        bus.getSubscriber<FailureChangedEvents>().on("failureChanged").handle(e => {
            if (e.key === 'gpsJamming') {
                if (e.active) {
                    this.drawJamming();
                } else {
                    this.clearJamming();
                }
            } else if (e.key === 'faultySatellite') {
                if (e.active) {
                    if (!this.takeHomeMode) {
                        this.drawFault(false);
                    }
                } else {
                    this.clearFault();
                }
            }
        });
    }

    /** Runtime state back to its start; called at every power change */
    public reset(): void {
        this.lastTimeS = null;
        this.wander = 0;
        this.hasSpare = false;
        this.level = 0;
        this.outOfSolutionS = 0;
    }

    /** Take-home mode has no receiver failures */
    public get receiverFailed(): boolean {
        return !this.takeHomeMode && (this.failures.isEffective('gpsAntenna') || this.failures.isEffective('gpsReceiver'));
    }

    public get jamming(): boolean {
        return !this.takeHomeMode && this.failures.isEffective('gpsJamming');
    }

    public get jammingDb(): number {
        return this.level;
    }

    private get faultActive(): boolean {
        return !this.takeHomeMode && this.failures.isEffective('faultySatellite');
    }

    /** The faulty satellite, null without the failure or before the draw */
    public get faultyPrn(): number | null {
        return this.faultCacheValid && this.faultActive ? this.faultPrn : null;
    }

    /** The pseudorange bias in meters of the faulty satellite: its drawn bias times the share of the ramp done */
    public get faultyBiasM(): number {
        return this.faultCacheValid && this.faultActive ? this.faultBiasM * this.faultRamp.share : 0;
    }

    /** Whether RAIM detects the faulty satellite for an alert limit: it is in the solution, its bias is large enough and RAIM is available */
    public faultDetected(halNm: number): boolean {
        if (!this.faultCacheValid || !this.faultActive || !this.inSolution(this.faultPrn)) {
            return false;
        }
        return this.faultyBiasM >= FAULT_DETECTION_BIAS_M && raimStatus(this.receiver.solution, halNm) === Raim.Available;
    }

    private inSolution(prn: number): boolean {
        const prns = this.receiver.solutionPrns();
        for (let i = 0; i < prns.length; i++) {
            if (prns[i] === prn) {
                return true;
            }
        }
        return false;
    }

    /** @param simTimeS The sim clock in seconds */
    public tick(simTimeS: number): void {
        const last = this.lastTimeS;
        this.lastTimeS = simTimeS;
        let dt = last === null ? 0 : simTimeS - last;
        //The rule of FailureTrigger: the first tick, a step back and a jump count nothing
        if (!(dt > 0) || dt > MAX_TRIGGER_STEP_S) {
            dt = 0;
        }

        this.tickJamming(dt);
        this.tickFault(dt);
    }

    private tickJamming(dt: number): void {
        if (!this.jamming) {
            if (this.cacheValid || this.level !== 0) {
                this.clearJamming();
            }
            return;
        }

        if (!this.cacheValid) {
            this.loadJamming();
        }

        this.jamRamp.advance(dt, this.saveJammingFn);
        this.advanceWander(dt);
        this.updateLevel();
    }

    private updateLevel(): void {
        this.level = Math.max(0, this.finalDb * this.jamRamp.share + this.wander);
    }

    /**
     * Brings the jamming level up to date outside the calculation tick, for the forced acquisition of an engine-running
     * start: reset() sets the level to 0 at power-on, and the forced acquisition runs before the first
     * tick sets it again. Loads the stored values when they are not cached. Counts no time and draws no wander. Allocates
     * nothing once the values are cached
     */
    public refreshLevel(): void {
        if (!this.jamming) {
            return;
        }
        if (!this.cacheValid) {
            this.loadJamming();
        }
        this.updateLevel();
    }

    private advanceWander(dt: number): void {
        if (dt === 0) {
            return;
        }
        const a = Math.exp(-dt / JAMMING_WANDER_TAU_S);
        this.wander = a * this.wander + this.wanderSigmaDb * Math.sqrt(1 - a * a) * this.normal();
    }

    /** Takes the stored values into the cache; draws new ones when they are missing or unusable (an older session, a hand-edited profile) */
    private loadJamming(): void {
        const v = this.failures.values('gpsJamming');
        if (!finiteField(v, 'rampS') || !(v.rampS > 0) || !finiteField(v, 'finalDb')) {
            this.drawJamming();
            return;
        }
        this.finalDb = v.finalDb;
        this.jamRamp.start(v.rampS, finiteField(v, 'elapsedS') ? Math.max(0, Math.min(v.rampS, v.elapsedS)) : 0);
        this.cacheValid = true;
    }

    private drawJamming(): void {
        const rampS = RAMP_S_MIN + this.random() * (RAMP_S_MAX - RAMP_S_MIN);
        this.finalDb = FINAL_DB_MIN + this.random() * (FINAL_DB_MAX - FINAL_DB_MIN);
        this.jamRamp.start(rampS, 0);
        this.cacheValid = true;
        this.saveJamming();
    }

    private saveJamming(): void {
        this.jamRamp.markSaved();
        this.failures.setValues('gpsJamming', {rampS: this.jamRamp.totalS, finalDb: this.finalDb, elapsedS: this.jamRamp.elapsedS});
    }

    private clearJamming(): void {
        this.cacheValid = false;
        this.level = 0;
        this.wander = 0;
    }

    private tickFault(dt: number): void {
        if (!this.faultActive) {
            if (this.faultCacheValid || this.outOfSolutionS !== 0) {
                this.clearFault();
            }
            return;
        }

        if (!this.faultCacheValid) {
            if (this.faultNeedsPick) {
                this.drawFault(false);
            } else {
                this.loadFault();
            }
            if (!this.faultCacheValid) {
                return;
            }
        }

        this.faultRamp.advance(dt, this.saveFaultFn);

        //Out of the solution while the unit has a fix: counts. Without a fix the count is held, back in the solution it restarts
        if (this.receiver.isValid()) {
            if (this.inSolution(this.faultPrn)) {
                this.outOfSolutionS = 0;
            } else {
                this.outOfSolutionS += dt;
                if (this.outOfSolutionS >= FAULT_SWITCH_S) {
                    this.drawFault(true);
                }
            }
        }
    }

    /** Takes the stored values into the cache; draws new ones when they are missing or unusable */
    private loadFault(): void {
        const v = this.failures.values('faultySatellite');
        if (!finiteField(v, 'prn') || !finiteField(v, 'biasM') || !finiteField(v, 'rampS') || !(v.rampS > 0)) {
            this.drawFault(false);
            return;
        }
        this.faultPrn = v.prn;
        this.faultBiasM = v.biasM;
        this.faultRamp.start(v.rampS, finiteField(v, 'elapsedS') ? Math.max(0, Math.min(v.rampS, v.elapsedS)) : 0);
        this.faultCacheValid = true;
    }

    /** The satellite of the solution with the smallest zenith; without a solution the one with the smallest zenith above the mask; null without one */
    private pickFaultyPrn(): number | null {
        const sats = this.receiver.satellites();
        let best: number | null = null;
        let bestZenith = Infinity;
        for (let i = 0; i < sats.length; i++) {
            const zenith = sats[i].position.get()[0];
            if (zenith < bestZenith && this.inSolution(sats[i].prn)) {
                best = sats[i].prn;
                bestZenith = zenith;
            }
        }
        if (best !== null) {
            return best;
        }
        for (let i = 0; i < sats.length; i++) {
            const zenith = sats[i].position.get()[0];
            if (zenith < MASK_ZENITH_RAD && zenith < bestZenith) {
                best = sats[i].prn;
                bestZenith = zenith;
            }
        }
        return best;
    }

    /** @param isSwitch The satellite has been out of the solution too long: another one is wanted, so picking the same one changes nothing */
    private drawFault(isSwitch: boolean): void {
        this.outOfSolutionS = 0;
        const prn = this.pickFaultyPrn();
        if (prn === null) {
            //No satellite yet; the tick tries again. A switch with nothing to pick keeps the old one
            this.faultNeedsPick = !this.faultCacheValid;
            return;
        }
        if (isSwitch && prn === this.faultPrn) {
            return;
        }
        this.faultNeedsPick = false;
        this.faultPrn = prn;
        this.faultBiasM = BIAS_M_MIN + this.random() * (BIAS_M_MAX - BIAS_M_MIN);
        this.faultRamp.start(FAULT_RAMP_S_MIN + this.random() * (FAULT_RAMP_S_MAX - FAULT_RAMP_S_MIN), 0);
        this.faultCacheValid = true;
        this.saveFault();
    }

    private saveFault(): void {
        this.faultRamp.markSaved();
        this.failures.setValues('faultySatellite', {prn: this.faultPrn, biasM: this.faultBiasM, rampS: this.faultRamp.totalS, elapsedS: this.faultRamp.elapsedS});
    }

    private clearFault(): void {
        this.faultCacheValid = false;
        this.faultNeedsPick = false;
        this.outOfSolutionS = 0;
    }

    /** Box-Muller, as in GpsErrorModel. The second value of each pair is kept for the next call */
    private normal(): number {
        if (this.wanderSigmaDb === 0) {
            return 0;
        }
        if (this.hasSpare) {
            this.hasSpare = false;
            return this.spare;
        }
        const u1 = 1 - this.random();
        const u2 = this.random();
        const r = Math.sqrt(-2 * Math.log(u1));
        this.spare = r * Math.sin(2 * Math.PI * u2);
        this.hasSpare = true;
        return r * Math.cos(2 * Math.PI * u2);
    }
}
