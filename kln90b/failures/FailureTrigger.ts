import {EventBus} from '@microsoft/msfs-sdk';
import {CalcTickable} from "../TickController";
import {PowerEvent} from "../PowerSupply";
import {Failures} from "./Failures";

/** A larger step of the sim clock is a jump (a date set ahead, a long pause) and counts nothing, as in SustainedCondition */
export const MAX_TRIGGER_STEP_S = 60;

/**
 * Fails a random component now and then (#458). In each counted tick a failure happens with probability
 * 1 - exp(-dt / MTBF), which gives exponentially distributed gaps with the mean MTBF. dt is sim time, not tick time,
 * so the rate follows the sim rate. Time the unit was off or disabled never counts: the first tick after it only
 * sets the reference.
 */
export class FailureTrigger implements CalcTickable {
    private lastTimeS: number | null = null;

    /**
     * @param bus
     * @param failures
     * @param simTimeS The sim clock in seconds, as the GPS read it in this tick
     * @param random Replaceable, so that tests can steer the draws
     */
    constructor(bus: EventBus, private readonly failures: Failures, private readonly simTimeS: () => number, public random: () => number = Math.random) {
        bus.getSubscriber<PowerEvent>().on("powerEvent").handle(() => this.reset());
    }

    /** Forgets the reference; called at a power event and by the TickController when the ticks stop (power off, hot swap) */
    public reset(): void {
        this.lastTimeS = null;
    }

    public onTicksStopped(): void {
        this.reset();
    }

    public tick(): void {
        const now = this.simTimeS();
        const last = this.lastTimeS;
        this.lastTimeS = now;
        if (last === null) {
            return;
        }

        const dt = now - last;
        const mtbfHours = this.failures.mtbfHours;
        if (mtbfHours <= 0 || !(dt > 0) || dt > MAX_TRIGGER_STEP_S) {
            return;
        }

        if (this.random() >= 1 - Math.exp(-dt / (mtbfHours * 3600))) {
            return;
        }

        const candidates = this.failures.randomCandidates();
        if (candidates.length === 0) {
            return;
        }
        this.failures.fail(candidates[Math.floor(this.random() * candidates.length)].key);
    }
}
