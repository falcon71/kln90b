import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {SignalOutputFilter} from '../../../kln90b/services/SignalOutputFilter';

// The filter reads the time through Date. The unit stage installs no fake clock, so the test fakes Date alone.
const START = new Date('2026-06-01T12:00:00Z').getTime();
// The 16 Hz signal loop runs every 62 ms under the fake timers (test/README.md section 6); the calculation tick, which
// gives the filter a new value, every 1000 ms.
const SIGNAL_MS = 62;
const CALC_MS = 1000;

/**
 * Runs the filter on the unit's two clocks from START for `durationMs`: a new measurement `measure(t)` (XTK and scale)
 * at every whole second (t in ms since START), and a sample every 62 ms. Returns the samples as a map from t to value.
 */
function run(measure: (tMs: number) => [number, number], durationMs: number): Map<number, number> {
    const filter = new SignalOutputFilter();
    const samples = new Map<number, number>();
    for (let t = 0; t <= durationMs; t++) {
        vi.setSystemTime(START + t);
        if (t % CALC_MS === 0) {
            filter.setValue(...measure(t));
        }
        if (t % SIGNAL_MS === 0) {
            samples.set(t, filter.getCurrentValue());
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

// The expected values are the charge curve of an RC low-pass with τ = 51.1 kΩ × 4.7 µF = 240.17 ms (R102 and C88 of
// the KLN 90B main module, maintenance manual 34-50-14 pages 2079 and 10050/10060), computed outside the filter:
// v(t) = target - (target - v0) * exp(-dt / 240.17 ms).
describe('SignalOutputFilter (the D-bar output filter)', () => {
    // A filter at rest at 0 meets a step to 0.5 NM at t = 2 s on a 1 NM scale, as when a sequence or a direct-to
    // changes the leg
    const step = (t: number): [number, number] => [t < 2000 ? 0 : 0.5, 1];

    it('follows a step in XTK along the RC charge curve', () => {
        const samples = run(step, 4000);

        expect(samples.get(1984)).toBe(0);
        expect(samples.get(2046)).toBeCloseTo(0.087153, 5);
        expect(samples.get(2108)).toBeCloseTo(0.181084, 5);
        expect(samples.get(2232)).toBeCloseTo(0.309695, 5);
        expect(samples.get(2480)).toBeCloseTo(0.432236, 5);
        expect(samples.get(2976)).toBeCloseTo(0.491408, 5);
    });

    // An RC low-pass cannot carry the needle past the new value (#158: the old filter extrapolated the step and ran on to
    // twice the step for a second)
    it('does not overshoot a step in XTK (#158)', () => {
        const samples = run(step, 8000);

        const peak = Math.max(...samples.values());
        expect(peak).toBeLessThanOrEqual(0.5);
        // Settled 4 s after the step
        expect([...samples].filter(([t]) => t >= 6000).every(([, v]) => Math.abs(v - 0.5) < 1e-6)).toBe(true);
    });

    // On a steadily changing XTK (drifting off the leg at 0.05 NM per second) the input moves in 1 Hz steps, which the
    // filter rounds off: the output trails the true XTK, so the needle still moves once per second. The values come from
    // the same RC curve, run on the held 1 Hz values.
    it('lags a steadily changing XTK (characterization)', () => {
        const samples = run(t => [t / 1000 * 0.05, 1], 8000);

        expect(samples.get(3038)).toBeCloseTo(0.106643, 5);
        expect(samples.get(5952)).toBeCloseTo(0.249036, 5);
        expect(samples.get(7998)).toBeCloseTo(0.349204, 5);
    });

    // The circuit smooths the needle position, which is the XTK divided by the scale. When the scale changes and the XTK
    // stays, the needle moves smoothly to its new position, so the XTK the output gives (needle × the new scale) jumps
    // down to where the needle still is and then climbs back. 1 NM off course, the scale goes from 5 to 1 NM at t = 5 s.
    it('filters the deviation, not the distance: a scale change moves the needle smoothly', () => {
        const samples = run(t => [1, t < 5000 ? 5 : 1], 7000);

        expect(samples.get(4960)).toBeCloseTo(1, 6); // 1/5 of the 5 NM scale, given as 1 NM
        expect(samples.get(5022)).toBeCloseTo(0.270025, 5); // 22 ms after the change the needle has moved from 0.2 to 0.27 of full scale
        expect(samples.get(5208)).toBeCloseTo(0.663513, 5);
        expect(samples.get(6944)).toBeCloseTo(1, 3);
    });

    // Installation manual 1-7: the drive range of the CDI output is ±300 mV for ±150 mV full scale, so the deviation stops
    // at two full scales
    it('stops the deviation at two full scales either side', () => {
        expect(run(() => [5, 1], 6000).get(5952)).toBeCloseTo(2, 6);
        expect(run(() => [-5, 1], 6000).get(5952)).toBeCloseTo(-2, 6);
        expect(run(() => [1, 0.3], 6000).get(5952)).toBeCloseTo(0.6, 6); // 3.3 full scales of 0.3 NM
    });

    it('passes a deviation inside two full scales (sibling)', () => {
        expect(run(() => [1.5, 1], 6000).get(5952)).toBeCloseTo(1.5, 6);
        expect(run(() => [-1.9, 1], 6000).get(5952)).toBeCloseTo(-1.9, 6);
    });

    // The capacitor discharges while the unit is off, so the first output after a power-on starts from zero
    it('starts from zero after a reset', () => {
        const filter = new SignalOutputFilter();
        vi.setSystemTime(START);
        filter.setValue(1, 1);
        vi.setSystemTime(START + 5000);
        expect(filter.getCurrentValue()).toBeCloseTo(1, 6); // Precondition: charged
        filter.reset();
        vi.setSystemTime(START + 60000);
        expect(filter.getCurrentValue()).toBe(0);
    });
});
