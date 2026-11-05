import {CalcTickable} from "../TickController";
import {Failures} from "./Failures";
import {Detection, FAILURE_CATALOG, FailureKey} from "./FailureCatalog";
import {MAX_TRIGGER_STEP_S} from "./FailureTrigger";

/**
 * How long after the main page the ARINC 429 failures of the power-on show. The bench video shows the unit finding the
 * RS-232 failure at once and the ARINC 429 air data a few seconds later; the figure is the design's choice, as the
 * Pilot's Guide (B-1 to B-4) gives no time (#458)
 */
export const POWER_ON_ARINC429_DELAY_S = 5;
/** The range of the time a failure that happens in operation takes to be noticed, in seconds; our own choice, as above */
export const OPERATION_DELAY_MIN_S = 2;
export const OPERATION_DELAY_MAX_S = 10;

/**
 * What the detection has decided in this power-on. The unit forgets it at every power-on, also a short one
 * (VolatileMemory.reset), so it lives in VolatileMemory
 */
export interface FailureDetectionState {
    /** PageManager.startMainPage has run in this power-on: nothing is detected before it */
    mainPageShown: boolean;
    /** The failures that were there at the power-on have been scheduled */
    powerOnScheduled: boolean;
    /**
     * The seconds of sim time a scheduled failure still waits before it counts as detected. Elapsed time is counted as
     * the trigger counts it, so a jump of the sim clock neither hides nor hurries a detection
     */
    pendingS: Map<FailureKey, number>;
    /** The failures the unit has noticed. A failure stays detected until it is repaired or no longer effective */
    detected: Set<FailureKey>;
}

/**
 * When the unit notices a failure (#458, docs/failures.md, "Detection, messages and TEST FAIL"): the unit's own parts at
 * once, a missing input after a delay. Its own failures are those it finds itself (the internal ones); the messages
 * follow the detection (data/PersistentMessages.ts, B-1 to B-4).
 */
export class FailureDetector implements CalcTickable {
    private lastTimeS: number | null = null;

    /**
     * @param failures
     * @param state The detection state of this power-on, read at every call, as VolatileMemory replaces its contents
     * @param simTimeS The sim clock in seconds
     * @param random Replaceable, so that tests can steer the draws
     */
    constructor(private readonly failures: Failures, private readonly state: () => FailureDetectionState, private readonly simTimeS: () => number, public random: () => number = Math.random) {
    }

    public onTicksStopped(): void {
        this.lastTimeS = null;
    }

    public tick(): void {
        const now = this.simTimeS();
        const last = this.lastTimeS;
        this.lastTimeS = now;
        const state = this.state();

        for (const key of Array.from(state.pendingS.keys())) {
            if (!this.failures.isEffective(key)) {
                state.pendingS.delete(key);
            }
        }
        for (const key of Array.from(state.detected)) {
            if (!this.failures.isEffective(key)) {
                state.detected.delete(key);
            }
        }

        if (!state.mainPageShown) {
            return;
        }

        //The rule of FailureTrigger: the first tick after a stop, a step back and a jump of more than a minute (a date set
        //ahead, a long pause) count nothing
        const step = last === null ? 0 : now - last;
        const elapsed = step > 0 && step <= MAX_TRIGGER_STEP_S ? step : 0;
        for (const [key, remaining] of Array.from(state.pendingS)) {
            state.pendingS.set(key, remaining - elapsed);
        }

        const atPowerOn = !state.powerOnScheduled;
        state.powerOnScheduled = true;
        for (const d of FAILURE_CATALOG) {
            if (d.detection === null || state.pendingS.has(d.key) || state.detected.has(d.key) || !this.failures.isEffective(d.key)) {
                continue;
            }
            state.pendingS.set(d.key, this.delay(d.detection, atPowerOn));
        }

        for (const [key, remaining] of Array.from(state.pendingS)) {
            if (remaining <= 0) {
                state.pendingS.delete(key);
                state.detected.add(key);
            }
        }
    }

    private delay(detection: Detection, atPowerOn: boolean): number {
        if (detection === 'internal') {
            return 0;
        }
        if (atPowerOn) {
            return detection === 'arinc429' ? POWER_ON_ARINC429_DELAY_S : 0;
        }
        return OPERATION_DELAY_MIN_S + this.random() * (OPERATION_DELAY_MAX_S - OPERATION_DELAY_MIN_S);
    }

    /** Effective and noticed by a tick of this run of the ticks; it stays so until the repair */
    public isDetected(key: FailureKey): boolean {
        if (this.lastTimeS === null || !this.failures.isEffective(key)) {
            return false;
        }
        return this.state().detected.has(key);
    }
}
