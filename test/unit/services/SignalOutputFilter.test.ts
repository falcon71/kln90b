import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {SignalOutputFilter} from '../../../kln90b/services/SignalOutputFilter';

// The filter reads the time through Date. The unit stage installs no fake clock, so the test fakes Date alone.
const START = new Date('2026-06-01T12:00:00Z').getTime();
// The 16 Hz signal loop runs every 62 ms under the fake timers (docs/testing.md section 6); the calculation tick, which
// gives the filter a new value, every 1000 ms.
const SIGNAL_MS = 62;
const CALC_MS = 1000;

/**
 * Runs the filter on the unit's two clocks from START for `durationMs`: a new measurement `measure(t)` at every whole
 * second (t in ms since START), and a sample every 62 ms. Returns the samples as [t, value].
 */
function run(filter: SignalOutputFilter, measure: (tMs: number) => number, durationMs: number): [number, number][] {
    const samples: [number, number][] = [];
    for (let t = 0; t <= durationMs; t++) {
        vi.setSystemTime(START + t);
        if (t % CALC_MS === 0) {
            filter.setValue(measure(t));
        }
        if (t % SIGNAL_MS === 0) {
            samples.push([t, filter.getCurrentValue()]);
        }
    }
    return samples;
}

beforeEach(() => {
    vi.useFakeTimers({toFake: ['Date']});
});
afterEach(() => {
    vi.useRealTimers();
});

describe('SignalOutputFilter (the XTK output filter)', () => {
    // A filter at rest at 0 meets a step to 1000 m at t = 2 s, as when a sequence or a direct-to changes the leg.
    const step = (t: number) => t < 2000 ? 0 : 1000;

    // The sibling of the pin: the setup works, the output is 0 up to the step, moves after it and has settled on the new
    // value 4 s after it. (Today it settles two calculation ticks after the step; the bound leaves room for a smoother fix.)
    it('settles on a step in XTK (characterization)', () => {
        const samples = run(new SignalOutputFilter(), step, 8000);

        expect(samples.filter(([t]) => t <= 2000).every(([, v]) => v === 0)).toBe(true);
        expect(samples.find(([t]) => t === 2046)![1]).toBeGreaterThan(0);
        expect(samples.filter(([t]) => t >= 6000).every(([, v]) => Math.abs(v - 1000) < 1)).toBe(true);
    });

    // Component Maintenance Manual 34-50-14, page 29: the deviation output is the timer's PWM integrated into a DC level,
    // an averaging circuit, which smooths a change of the deviation but does not carry the needle past the new value.
    // The filter extrapolates the last change for one more second, so after a step it runs on to twice the step before
    // it comes back.
    it.fails('does not overshoot a step in XTK (#NEW-5-1)', () => {
        const samples = run(new SignalOutputFilter(), step, 8000);

        const peak = Math.max(...samples.map(([, v]) => v));
        expect(peak).toBeLessThanOrEqual(1000);
    });

    // On a steadily changing XTK (an aircraft drifting off the leg at a constant rate) the filter predicts the next
    // value, so the output follows the true XTK without the one-second lag of the calculation tick. Judged from 3 s on,
    // after the start from rest.
    it('follows a steadily changing XTK without lag (characterization)', () => {
        const ratePerMs = 0.05; // 50 m per second
        const samples = run(new SignalOutputFilter(), t => t * ratePerMs, 8000);

        const tracked = samples.filter(([t]) => t >= 3000);
        expect(tracked).toHaveLength(81); // 62 ms samples from 3.038 s to 7.998 s
        for (const [t, v] of tracked) {
            expect(Math.abs(v - t * ratePerMs)).toBeLessThan(1e-6);
        }
    });
});
