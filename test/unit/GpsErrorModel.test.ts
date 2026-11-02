import {describe, expect, it} from 'vitest';
import {
    GpsErrorModel,
    SIGMA_ALT_RATE_MPS,
    SIGMA_DOPPLER_MPS,
    SIGMA_FAST_M,
    SIGMA_SLOW_M,
    TAU_SLOW_S,
} from '../../kln90b/GpsErrorModel';
import {ALTITUDE_WEIGHT, MAX_ROWS} from '../../kln90b/GpsSolution';
import {mulberry32} from '../harness/sim/random';

// #402: the per-satellite error processes. The model's random source is injected, so every test draws from a small
// seeded generator (the harness's mulberry32). The expected values are derived by hand from the design (6.3, 6.4):
// sigma_s = 4.9 m, sigma_f = 1 m (total 5.001 m), tau = 300 s, sigma_d = 0.05 m/s, sigma_altRate = 0.5 m/s, and the
// altitude row enters multiplied by 5/30.

function sampleSigma(values: number[]): number {
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
}

function correlation(a: number[], b: number[]): number {
    const n = a.length;
    const ma = a.reduce((s, v) => s + v, 0) / n;
    const mb = b.reduce((s, v) => s + v, 0) / n;
    let cov = 0, va = 0, vb = 0;
    for (let i = 0; i < n; i++) {
        cov += (a[i] - ma) * (b[i] - mb);
        va += (a[i] - ma) ** 2;
        vb += (b[i] - mb) ** 2;
    }
    return cov / Math.sqrt(va * vb);
}

/** Coefficients with north and east for the given rows, zero elsewhere. */
function coefficients(...rows: [number, number][]): Float64Array {
    const c = new Float64Array(2 * MAX_ROWS);
    rows.forEach(([n, e], i) => {
        c[2 * i] = n;
        c[2 * i + 1] = e;
    });
    return c;
}

describe('GpsErrorModel constants', () => {
    it('the budget is the design table', () => {
        expect(SIGMA_SLOW_M).toBe(4.9);
        expect(TAU_SLOW_S).toBe(300);
        expect(SIGMA_FAST_M).toBe(1);
        expect(SIGMA_DOPPLER_MPS).toBe(0.05);
        expect(SIGMA_ALT_RATE_MPS).toBe(0.5);
    });
});

describe('GpsErrorModel slow error', () => {
    // The process is correlated over 300 s, so a run of this length holds about 3000 independent samples: a 1.3%
    // standard error on a sigma
    const STEPS = 1000000;
    const run = (seed: number) => {
        const model = new GpsErrorModel(mulberry32(seed));
        const out = new Float64Array(4);
        const c = coefficients([1, 0]);
        const slow: number[] = [];
        const north: number[] = [];
        for (let i = 0; i < STEPS; i++) {
            model.update(1, [7], c, null, out);
            slow.push(model.slowError(7));
            north.push(out[0]);
        }
        return {slow, north};
    };

    it('the slow error is stationary at SIGMA_SLOW_M', () => {
        const {slow, north} = run(1);
        expect(Math.abs(sampleSigma(slow) / 4.9 - 1)).toBeLessThan(0.05);
        // The total with the fast part: sqrt(4.9^2 + 1^2) = 5.001
        expect(Math.abs(sampleSigma(north) / 5.0 - 1)).toBeLessThan(0.05);
    });

    it('the slow error decorrelates over TAU_SLOW_S', () => {
        // One run of this length scatters about 0.016 in the lag-300 correlation (measured over 20 seeds), the mean
        // of four runs about 0.008. A tolerance of 0.03 therefore holds at about 3.8 sigma, and a tau off by 15%
        // (a difference of 0.05 or more at this lag) fails
        const lag = 300;
        let sum = 0;
        for (const seed of [2, 3, 4, 5]) {
            const {slow} = run(seed);
            sum += correlation(slow.slice(0, STEPS - lag), slow.slice(lag));
        }
        expect(Math.abs(sum / 4 - Math.exp(-1))).toBeLessThan(0.03);
    });

    it('one step of 600 s equals the stationary distribution', () => {
        const model = new GpsErrorModel(mulberry32(3));
        const out = new Float64Array(4);
        const c = coefficients([1, 0]);
        const before: number[] = [];
        const after: number[] = [];
        for (let i = 0; i < 20000; i++) {
            model.reset();
            model.update(1, [9], c, null, out);
            before.push(model.slowError(9));
            model.update(600, [9], c, null, out);
            after.push(model.slowError(9));
        }
        // exp(-600 / 300) = exp(-2)
        expect(Math.abs(correlation(before, after) - Math.exp(-2))).toBeLessThan(0.05);
        // The starting draw and the stepped value are both stationary
        expect(Math.abs(sampleSigma(before) / 4.9 - 1)).toBeLessThan(0.05);
        expect(Math.abs(sampleSigma(after) / 4.9 - 1)).toBeLessThan(0.05);
    });

    it('no time passed leaves the slow error unchanged and stays finite, also for a negative step', () => {
        const model = new GpsErrorModel(mulberry32(4));
        const out = new Float64Array(4);
        const c = coefficients([1, 0]);
        model.update(1, [3], c, null, out);
        const e = model.slowError(3);
        expect(e).not.toBe(0);
        for (const dt of [0, -5]) {
            model.update(dt, [3], c, null, out);
            expect(model.slowError(3)).toBe(e);
            for (let i = 0; i < 4; i++) {
                expect(Number.isFinite(out[i])).toBe(true);
            }
        }
        // The white parts are still drawn: north = slow + a fresh fast draw
        const first = out[0];
        model.update(0, [3], c, null, out);
        expect(out[0]).not.toBe(first);
    });

    it('a satellite that leaves and comes back starts fresh', () => {
        const model = new GpsErrorModel(mulberry32(5));
        const out = new Float64Array(4);
        const c = coefficients([1, 0], [1, 0]);
        model.update(1, [5, 6], c, null, out);
        const e5 = model.slowError(5);
        const e6 = model.slowError(6);
        expect(e5).not.toBe(0);
        // 6 stays, 5 leaves
        model.update(0, [6], c, null, out);
        expect(model.slowError(5)).toBe(0);
        expect(model.slowError(6)).toBe(e6);
        // 5 returns; with no time passed a remembered value would survive, a fresh draw does not
        model.update(0, [5, 6], c, null, out);
        expect(model.slowError(5)).not.toBe(e5);
        expect(model.slowError(5)).not.toBe(0);
        expect(model.slowError(6)).toBe(e6);
    });

    it('reset forgets every satellite', () => {
        const model = new GpsErrorModel(mulberry32(6));
        const out = new Float64Array(4);
        const c = coefficients([1, 0], [1, 0]);
        model.update(1, [5, 6], c, null, out);
        const e5 = model.slowError(5);
        model.reset();
        expect(model.slowError(5)).toBe(0);
        expect(model.slowError(6)).toBe(0);
        model.update(0, [5], c, null, out);
        expect(model.slowError(5)).not.toBe(e5);
        expect(model.slowError(5)).not.toBe(0);
    });

    it('many resets do not leave the bookkeeping behind: a satellite still leaves afterwards', () => {
        const model = new GpsErrorModel(mulberry32(16));
        const out = new Float64Array(4);
        const c = coefficients([1, 0], [1, 0], [1, 0]);
        for (let i = 0; i < 200; i++) {
            model.reset();
            model.update(1, [1, 2, 3], c, null, out);
        }
        model.update(1, [10], c, null, out);
        expect(model.slowError(10)).not.toBe(0);
        model.update(1, [], c, null, out);
        expect(model.slowError(10)).toBe(0);
        expect(model.slowError(1)).toBe(0);
    });

    it('a PRN that is not in the rows has no slow error', () => {
        const model = new GpsErrorModel(mulberry32(7));
        expect(model.slowError(42)).toBe(0);
    });
});

describe('GpsErrorModel mapping', () => {
    it('north and east use their own coefficients, for position and for velocity', () => {
        const model = new GpsErrorModel(mulberry32(8));
        const out = new Float64Array(4);
        const c = coefficients([1, 2]);
        const posN: number[] = [], posE: number[] = [], velN: number[] = [], velE: number[] = [];
        // 600 s steps make the slow error nearly independent between samples
        for (let i = 0; i < 20000; i++) {
            model.update(600, [11], c, null, out);
            posN.push(out[0]);
            posE.push(out[1]);
            velN.push(out[2]);
            velE.push(out[3]);
        }
        expect(Math.abs(sampleSigma(posN) / 5.001 - 1)).toBeLessThan(0.05);
        expect(Math.abs(sampleSigma(posE) / 10.002 - 1)).toBeLessThan(0.05);
        expect(Math.abs(sampleSigma(velN) / 0.05 - 1)).toBeLessThan(0.05);
        expect(Math.abs(sampleSigma(velE) / 0.1 - 1)).toBeLessThan(0.05);
    });

    it('the fast noise is white with SIGMA_FAST_M on top of the slow error', () => {
        const model = new GpsErrorModel(mulberry32(15));
        const out = new Float64Array(4);
        const c = coefficients([1, 0]);
        const fast: number[] = [];
        for (let i = 0; i < 20000; i++) {
            model.update(1, [12], c, null, out);
            fast.push(out[0] - model.slowError(12));
        }
        expect(Math.abs(sampleSigma(fast) / 1 - 1)).toBeLessThan(0.05);
        // White: no correlation from one tick to the next
        expect(Math.abs(correlation(fast.slice(1), fast.slice(0, -1)))).toBeLessThan(0.05);
    });

    // Two satellites with the same coefficients. Independent errors add as sqrt(2); one draw shared by both would add as 2
    describe('two satellites', () => {
        const PRNS = [30, 31];
        const sigmas = (c: Float64Array, dt: number, steps: number) => {
            const model = new GpsErrorModel(mulberry32(17));
            const out = new Float64Array(4);
            model.update(1, PRNS, c, null, out);
            const r = {posN: [] as number[], posE: [] as number[], velN: [] as number[], velE: [] as number[],
                slowA: [] as number[], slowB: [] as number[], fastN: [] as number[], fastE: [] as number[]};
            for (let i = 0; i < steps; i++) {
                model.update(dt, PRNS, c, null, out);
                r.posN.push(out[0]);
                r.posE.push(out[1]);
                r.velN.push(out[2]);
                r.velE.push(out[3]);
                r.slowA.push(model.slowError(30));
                r.slowB.push(model.slowError(31));
                // What is left of the position after the slow errors: the fast noise of the satellites
                r.fastN.push(out[0] - model.slowError(30));
                r.fastE.push(out[1] - model.slowError(31));
            }
            return r;
        };

        it('position and velocity errors add independently', () => {
            // 600 s steps: the slow errors are nearly new every tick
            const r = sigmas(coefficients([1, 0], [1, 0]), 600, 20000);
            expect(Math.abs(sampleSigma(r.posN) / (Math.SQRT2 * 5.001) - 1)).toBeLessThan(0.05);
            expect(Math.abs(sampleSigma(r.velN) / (Math.SQRT2 * 0.05) - 1)).toBeLessThan(0.05);
        });

        it('the slow errors of two satellites are uncorrelated', () => {
            const r = sigmas(coefficients([1, 0], [1, 0]), 600, 20000);
            expect(Math.abs(correlation(r.slowA, r.slowB))).toBeLessThan(0.05);
        });

        it('the fast noise of two satellites is independent', () => {
            // No time passes, so the slow errors stay as they are and only the fast noise changes. The north error
            // holds satellite 30 and the east error satellite 31
            const r = sigmas(coefficients([1, 0], [1, 0]), 0, 20000);
            const sumOfBoth = r.posN.map((n, i) => n - r.slowA[i] - r.slowB[i]);
            expect(Math.abs(sampleSigma(sumOfBoth) / Math.SQRT2 - 1)).toBeLessThan(0.05);
            const split = sigmas(coefficients([1, 0], [0, 1]), 0, 20000);
            expect(Math.abs(correlation(split.fastN, split.fastE))).toBeLessThan(0.05);
        });

        it('the Doppler noise of two satellites is independent', () => {
            const split = sigmas(coefficients([1, 0], [0, 1]), 1, 20000);
            expect(Math.abs(correlation(split.velN, split.velE))).toBeLessThan(0.05);
        });
    });

    it('rows are taken in the order of the PRNs', () => {
        // The coefficient of row 1 is 1, row 0 is 0: only satellite 21 shows
        const model = new GpsErrorModel(mulberry32(9));
        const out = new Float64Array(4);
        model.update(1, [20, 21], coefficients([0, 0], [1, 0]), null, out);
        // Slow part of satellite 21 plus its fast draw, which is within a few sigma
        expect(Math.abs(out[0] - model.slowError(21))).toBeLessThan(6 * SIGMA_FAST_M);

        const swapped = new GpsErrorModel(mulberry32(9));
        swapped.update(1, [20, 21], coefficients([1, 0], [0, 0]), null, out);
        expect(Math.abs(out[0] - swapped.slowError(20))).toBeLessThan(6 * SIGMA_FAST_M);
    });

    it('the altitude row error enters whitened', () => {
        const model = new GpsErrorModel(mulberry32(10));
        const out = new Float64Array(4);
        // Two satellites with zero coefficients, the altitude row is row 2, north 1 and east 2
        const c = coefficients([0, 0], [0, 0], [1, 2]);
        model.update(1, [1, 2], c, 300, out);
        // 300 m * 5 / 30 = 50 m
        expect(out[0]).toBe(300 * ALTITUDE_WEIGHT);
        expect(out[0]).toBeCloseTo(50, 9);
        expect(out[1]).toBeCloseTo(100, 9);
    });

    it('the altitude rate error is white with SIGMA_ALT_RATE_MPS times the weight', () => {
        const model = new GpsErrorModel(mulberry32(11));
        const out = new Float64Array(4);
        const c = coefficients([1, 2]);
        const velN: number[] = [], velE: number[] = [];
        // No satellites: the altitude row is row 0
        for (let i = 0; i < 20000; i++) {
            model.update(1, [], c, 0, out);
            velN.push(out[2]);
            velE.push(out[3]);
        }
        const expected = 0.5 * 5 / 30;
        expect(Math.abs(sampleSigma(velN) / expected - 1)).toBeLessThan(0.05);
        expect(Math.abs(sampleSigma(velE) / (2 * expected) - 1)).toBeLessThan(0.05);
        // Position: no error, no satellites
        expect(out[0]).toBe(0);
        expect(out[1]).toBe(0);
    });

    it('ignores coefficients beyond the current rows', () => {
        const model = new GpsErrorModel(mulberry32(12));
        const out = new Float64Array(4);
        const c = new Float64Array(2 * MAX_ROWS).fill(1e6);
        // Rows 0 and 1 are satellites, row 2 is the altitude row (error 0)
        c.fill(1, 0, 6);
        for (let i = 0; i < 50; i++) {
            model.update(1, [1, 2], c, 0, out);
            for (let k = 0; k < 4; k++) {
                expect(Math.abs(out[k])).toBeLessThan(100);
            }
        }
        // Without the altitude row, row 2 is beyond the rows as well. Its error would be 1e6 times a draw
        c.fill(1e6, 4, 6);
        for (let i = 0; i < 50; i++) {
            model.update(1, [1, 2], c, null, out);
            for (let k = 0; k < 4; k++) {
                expect(Number.isNaN(out[k])).toBe(false);
                expect(Math.abs(out[k])).toBeLessThan(100);
            }
        }
    });

    it('with no rows at all the output is zero', () => {
        const model = new GpsErrorModel(mulberry32(13));
        const out = new Float64Array(4).fill(9);
        model.update(1, [], new Float64Array(2 * MAX_ROWS).fill(1e6), null, out);
        expect(Array.from(out)).toEqual([0, 0, 0, 0]);
    });
});

describe('GpsErrorModel random source', () => {
    it('keeps the second value of each Box-Muller pair', () => {
        let calls = 0;
        const rng = mulberry32(14);
        const model = new GpsErrorModel(() => {
            calls++;
            return rng();
        });
        const out = new Float64Array(4);
        const c = coefficients([1, 0]);
        // The first update draws the slow start, the fast noise and the Doppler noise (3 normals), and so does
        // every later update (slow step, fast, Doppler)
        for (let i = 0; i < 100; i++) {
            model.update(1, [4], c, null, out);
        }
        // 300 normals are 150 pairs of two uniform values
        expect(calls).toBe(300);
    });

    it('never produces a non-finite value, also when the generator returns 0', () => {
        const model = new GpsErrorModel(() => 0);
        const out = new Float64Array(4);
        model.update(1, [4], coefficients([1, 1]), 10, out);
        for (let i = 0; i < 4; i++) {
            expect(Number.isFinite(out[i])).toBe(true);
        }
    });
});
