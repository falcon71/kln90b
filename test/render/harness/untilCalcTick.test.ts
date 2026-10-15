import {describe, expect, it, vi} from 'vitest';
import {bootUnit, untilCalcTick} from '../../harness/boot';

describe('untilCalcTick (harness)', () => {
    // The helper returns within 250 ms of a calculation tick (TICK_TIME_CALC is 1 s), so the next one is more than 700 ms
    // away and not later than a second
    it('returns right after a calculation tick, leaving more than 700 ms to the next', async () => {
        const unit = await bootUnit({});
        await vi.advanceTimersByTimeAsync(130); // an arbitrary phase
        await untilCalcTick(unit);
        const spy = vi.spyOn(unit.props.sensors, 'tick');

        await vi.advanceTimersByTimeAsync(700);
        const before = spy.mock.calls.length;
        await vi.advanceTimersByTimeAsync(300);

        expect([before, spy.mock.calls.length]).toEqual([0, 1]);
        spy.mockRestore();
    });
});
