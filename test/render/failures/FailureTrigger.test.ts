import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../harness/boot';

function activeCount(unit: Awaited<ReturnType<typeof bootUnit>>): number {
    return unit.props.failures.activeList().length;
}

describe('the failure trigger on the running unit', () => {
    it('the trigger fails a component on the running unit', async () => {
        const unit = await bootUnit();
        unit.core.failureTrigger!.random = () => 0;
        unit.props.failures.setMtbfHours(1);

        // Ticks at 1 s and 2 s: the first sets the reference, the second counts
        await vi.advanceTimersByTimeAsync(2500);

        expect(activeCount(unit)).toBe(1);
    });

    it('MTBF off fails nothing on the running unit', async () => {
        const unit = await bootUnit();
        unit.core.failureTrigger!.random = () => 0;

        await vi.advanceTimersByTimeAsync(10_000);

        expect(activeCount(unit)).toBe(0);
    });

    /** Counts the trigger's ticks from now on, by the reads of its clock */
    function countTicks(unit: Awaited<ReturnType<typeof bootUnit>>): { n: number } {
        const trigger = unit.core.failureTrigger as unknown as { simTimeS: () => number };
        const counter = {n: 0};
        const read = trigger.simTimeS;
        trigger.simTimeS = () => {
            counter.n++;
            return read();
        };
        return counter;
    }

    // A short disable is the real pin: a long one is also stopped by the 60 s step limit
    for (const disabledMs of [30_000, 10 * 60_000]) {
        it(`disabled time counts nothing (${disabledMs / 1000} s)`, async () => {
            const unit = await bootUnit();
            unit.props.failures.setMtbfHours(1);
            await vi.advanceTimersByTimeAsync(3000);
            const sim = unit.env.sim;

            sim.set('L:KLN90B_Disabled', 'bool', true);
            await vi.advanceTimersByTimeAsync(disabledMs);
            unit.core.failureTrigger!.random = () => 0;
            const ticks = countTicks(unit);
            sim.set('L:KLN90B_Disabled', 'bool', false);

            // Step by step: nothing may fail at the first tick after the resume, which only sets the reference
            while (ticks.n < 1) {
                await vi.advanceTimersByTimeAsync(50);
            }
            expect(ticks.n).toBe(1);
            expect(activeCount(unit)).toBe(0);

            while (ticks.n < 2) {
                await vi.advanceTimersByTimeAsync(50);
            }
            expect(activeCount(unit)).toBe(1);
        });
    }
});
