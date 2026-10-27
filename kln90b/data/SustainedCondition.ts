/**
 * The step of the time that still counts as time passing. A larger step, or a step back, is a jump of the clock (a time
 * entered on SET 2, the correction when the fix comes, a change of the sim time): the count starts again, so that a jump
 * neither satisfies the condition at once nor holds it back for long. 60 s and not a few seconds, so that a high sim
 * rate does not restart the count on every tick.
 */
const MAX_TIME_STEP = 60_000;

/**
 * "The condition has held without a break for more than a duration" in the time the caller passes in, which the course
 * messages take from the GPS time (B-1, KA 90 Installation Manual pp. 3-43 and 3-45, #401). The time standing still is
 * a paused sim: the count does not advance.
 *
 * The state follows the time and not the number of calls: MessageHandler.tick asks a listed message twice per tick, so
 * a second update with the same time gives the same answer.
 */
export class SustainedCondition {

    /** Since when the condition has held, or null while it does not */
    private since: number | null = null;
    private last: number = 0;

    constructor(private readonly durationMs: number) {
    }

    /**
     * @param holds whether the condition holds now
     * @param now the time in ms
     * @return true once the condition has held without a break and now is more than the duration past its start
     */
    public update(holds: boolean, now: number): boolean {
        if (!holds) {
            this.since = null;
            return false;
        }

        if (this.since === null || now < this.last || now - this.last > MAX_TIME_STEP) {
            this.since = now;
        }
        this.last = now;

        return now - this.since > this.durationMs;
    }

    /** Counts the condition as held for longer than the duration from now on, for as long as it keeps holding */
    public satisfy(now: number): void {
        this.since = now - this.durationMs - 1;
        this.last = now;
    }

    /** The count starts again at now */
    public restart(now: number): void {
        this.since = now;
        this.last = now;
    }

    /** Forgets the count */
    public reset(): void {
        this.since = null;
    }
}
