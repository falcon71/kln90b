import {describe, expect, it} from 'vitest';
import {ALTITUDE_WEIGHT, computeGeometry, createSolutionMatrices, raimTestFails, SolutionMatrices} from '../../../kln90b/GpsSolution';
import {falseReferenceOf, RangeErrorRows, RangeErrors} from '../../../kln90b/failures/RangeErrors';
import {SpooferSite} from '../../../kln90b/failures/Transmitters';

/**
 * #465: the range errors of the mixed solution (design docs/superpowers/specs/2026-11-07-gps-jamming-spoofing-transmitters-
 * design.md, "The solution" and "RAIM detection"). Every expected value is derived here by hand: the ranges by a bisection
 * on the orbit radius, the response of the solution by a least squares fit of the test's own. Only the matrices the module
 * reads come from computeGeometry (#453)
 */

const DEG = Math.PI / 180;
const EARTH_M = 6_371_000;
const ORBIT_M = 26_560_000;
const C_M_PER_MS = 299_792.458;
const FT = 0.3048;
const W = 5 / 30; // SIGMA_UERE_M / SIGMA_ALT_M

/** The slant range to a satellite on the orbit radius at an elevation: the distance d along the line of sight at which |R up + d u| = r */
function rangeAt(elevationDeg: number): number {
    const e = elevationDeg * DEG;
    let lo = 0;
    let hi = 2 * ORBIT_M;
    for (let i = 0; i < 200; i++) {
        const d = (lo + hi) / 2;
        const x = d * Math.cos(e);
        const y = EARTH_M + d * Math.sin(e);
        if (x * x + y * y < ORBIT_M * ORBIT_M) {
            lo = d;
        } else {
            hi = d;
        }
    }
    return (lo + hi) / 2;
}

/** [zenith deg, hour angle deg] per PRN in the real sky (the SDK's) and in the fake sky */
type Sky = Record<number, [number, number]>;
const TRUE_SKY: Sky = {
    1: [10, 0], 2: [30, 50], 3: [45, 100], 4: [60, 150], 5: [70, 200], 6: [50, 250], 7: [35, 300], 8: [75, 330], 9: [55, 20],
};
const FALSE_SKY: Sky = {
    1: [20, 30], 2: [40, 80], 3: [55, 130], 4: [65, 180], 5: [25, 230], 6: [45, 280], 7: [70, 330], 8: [30, 10], 9: [60, 90],
};

const elevation = (sky: Sky, prn: number) => 90 - sky[prn][0];
const sinOf = (sky: Sky) => (prn: number) => Math.cos(sky[prn][0] * DEG);

const SPOOFER: SpooferSite = {
    lat: 47.1, lon: 8.1, powerDb: 100, refAglFt: 10_000, falseLat: 48.25, falseLon: 9.5, falseAltFt: 1000, shiftMs: 6 * 3600_000, clockM: 0,
};

function rows(prns: number[], fake: number[], altitudeRow = false): RangeErrorRows {
    const falseClaim = Uint8Array.from(prns.map(p => fake.includes(p) ? 1 : 0));
    return {prns, falseClaim, altitudeRow, falseReference: falseReferenceOf(falseClaim, prns.length)};
}

/** The lines of sight of the rows from the reference state */
function los(r: RangeErrorRows, trueSky: Sky, falseSky: Sky): Float64Array[] {
    const sky = r.falseReference ? falseSky : trueSky;
    return r.prns.map(p => Float64Array.of(sky[p][0] * DEG, sky[p][1] * DEG));
}

function matricesFor(r: RangeErrorRows, trueSky: Sky = TRUE_SKY, falseSky: Sky = FALSE_SKY): SolutionMatrices {
    const m = createSolutionMatrices();
    expect(computeGeometry(los(r, trueSky, falseSky), r.altitudeRow, undefined, m).valid).toBe(true);
    return m;
}

/**
 * The test's own least squares: the rows [x north, y west, z up, 1] (and [0, 0, W, 0] for the altitude), the normal
 * equations solved by Gauss-Jordan. Returns [north, east, up, clock] of the solution's shift for the whitened errors, and the
 * sum of the squared residuals
 */
function fit(lines: Float64Array[], altitude: boolean, errors: number[]): { north: number, east: number, up: number, clock: number, sse: number } {
    const g = lines.map(l => [Math.sin(l[0]) * Math.cos(l[1]), Math.sin(l[0]) * Math.sin(l[1]), Math.cos(l[0]), 1]);
    if (altitude) {
        g.push([0, 0, W, 0]);
    }
    const a = [0, 1, 2, 3].map(r => [0, 1, 2, 3].map(c => g.reduce((s, row) => s + row[r] * row[c], 0))
        .concat([g.reduce((s, row, i) => s + row[r] * errors[i], 0)]));
    for (let col = 0; col < 4; col++) {
        let p = col;
        for (let r = col + 1; r < 4; r++) {
            if (Math.abs(a[r][col]) > Math.abs(a[p][col])) {
                p = r;
            }
        }
        [a[col], a[p]] = [a[p], a[col]];
        const pivot = a[col][col];
        for (let c = 0; c < 5; c++) {
            a[col][c] /= pivot;
        }
        for (let r = 0; r < 4; r++) {
            if (r !== col) {
                const f = a[r][col];
                for (let c = 0; c < 5; c++) {
                    a[r][c] -= f * a[col][c];
                }
            }
        }
    }
    const x = a.map(row => row[4]);
    const sse = g.reduce((s, row, i) => {
        const res = errors[i] - row.reduce((t, v, c) => t + v * x[c], 0);
        return s + res * res;
    }, 0);
    // A range too long moves the position away from the satellite: the shift is minus the fit; y points west
    return {north: -x[0], east: x[1], up: -x[2], clock: x[3], sse};
}

/** The error of a row claiming the other state than the reference, whole milliseconds taken out: within ±0.5 ms */
function wrapped(claimed: number, reference: number): number {
    return claimed - reference - Math.round((claimed - reference) / C_M_PER_MS) * C_M_PER_MS;
}

const EIGHT = [1, 2, 3, 4, 5, 6, 7, 8];

function update(re: RangeErrors, r: RangeErrorRows, t: number, opts: {
    m?: SolutionMatrices, trueSky?: Sky, falseSky?: Sky, spoofer?: SpooferSite | null, slantM?: number, altitudeInputM?: number | null,
    faultyPrn?: number | null, faultyBiasM?: number,
} = {}): void {
    const trueSky = opts.trueSky ?? TRUE_SKY;
    const falseSky = opts.falseSky ?? FALSE_SKY;
    re.update(r, opts.m ?? matricesFor(r, trueSky, falseSky), t, sinOf(trueSky), sinOf(falseSky), opts.spoofer === undefined ? SPOOFER : opts.spoofer,
        opts.slantM ?? 0, opts.altitudeInputM ?? null, opts.faultyPrn ?? null, opts.faultyBiasM ?? 0);
}

describe('RangeErrors', () => {
    it('the reference state is the majority of the satellite rows', () => {
        expect(falseReferenceOf(Uint8Array.of(1, 1, 1, 0, 0), 5)).toBe(true);
        expect(falseReferenceOf(Uint8Array.of(1, 1, 0, 0, 0), 5)).toBe(false);
        expect(falseReferenceOf(Uint8Array.of(0, 0, 0, 0), 4)).toBe(false);
        expect(falseReferenceOf(Uint8Array.of(1, 1, 1, 1), 4)).toBe(true);
        expect(falseReferenceOf(new Uint8Array(0), 0)).toBe(false);
        // Only the first n entries count: the array is reused
        expect(falseReferenceOf(Uint8Array.of(0, 0, 1, 1, 1, 1), 3)).toBe(false);
    });

    it('a 4-4 tie takes the true state', () => {
        expect(falseReferenceOf(Uint8Array.of(1, 0, 1, 0, 1, 0, 1, 0), 8)).toBe(false);
        const re = new RangeErrors();
        const r = rows(EIGHT, [2, 4, 6, 8]);
        update(re, r, 0);
        expect(re.falseReference).toBe(false);
        // The true rows carry no error, the fake ones their wrapped errors: the shift is that of the fake rows alone
        const errors = EIGHT.map(p => [2, 4, 6, 8].includes(p) ? wrapped(rangeAt(elevation(FALSE_SKY, p)), rangeAt(elevation(TRUE_SKY, p))) : 0);
        const expected = fit(los(r, TRUE_SKY, FALSE_SKY), false, errors);
        expect(re.northM).toBeCloseTo(expected.north, 3);
        expect(re.eastM).toBeCloseTo(expected.east, 3);
    });

    it('rows that all claim one state give no error and no residual', () => {
        const re = new RangeErrors();
        update(re, rows(EIGHT, []), 0);
        update(re, rows(EIGHT, []), 5);
        expect(re.falseReference).toBe(false);
        expect([re.northM, re.eastM, re.velNorthMps, re.velEastMps, re.clockM, re.sseM2]).toEqual([0, 0, 0, 0, 0, 0]);

        const spoofer = {...SPOOFER, clockM: 12_345};
        const captured = new RangeErrors();
        update(captured, rows(EIGHT, EIGHT), 0, {spoofer});
        update(captured, rows(EIGHT, EIGHT), 5, {spoofer, falseSky: {...FALSE_SKY, 3: [50, 130]}});
        expect(captured.falseReference).toBe(true);
        expect(captured.falseLat).toBe(48.25);
        expect(captured.falseLon).toBe(9.5);
        expect([captured.northM, captured.eastM, captured.velNorthMps, captured.velEastMps, captured.sseM2]).toEqual([0, 0, 0, 0, 0]);
        // The false state's clock is the false time plus the spoofer's clock offset
        expect(captured.clockM).toBe(12_345);
    });

    it('one fake row among seven real rows moves the position by minus its coefficients times its error, within ±150 km of range at the moment it enters', () => {
        for (const clockM of [0, 140_000, -149_000, 1_000_000]) {
            const re = new RangeErrors();
            const spoofer = {...SPOOFER, clockM};
            const r = rows(EIGHT, [5]);
            update(re, r, 0, {spoofer});
            expect(re.falseReference).toBe(false);
            const e = wrapped(rangeAt(elevation(FALSE_SKY, 5)) + clockM, rangeAt(elevation(TRUE_SKY, 5)));
            expect(Math.abs(e)).toBeLessThanOrEqual(C_M_PER_MS / 2);
            expect(Math.abs(e)).toBeGreaterThan(1000); // Precondition: a large error
            const expected = fit(los(r, TRUE_SKY, FALSE_SKY), false, EIGHT.map(p => p === 5 ? e : 0));
            expect(re.northM).toBeCloseTo(expected.north, 3);
            expect(re.eastM).toBeCloseTo(expected.east, 3);
            expect(re.clockM).toBeCloseTo(expected.clock, 3);
            expect(re.sseM2).toBeCloseTo(expected.sse, 0);
            expect(re.sseM2).toBeGreaterThan(0);
            expect(Math.hypot(re.northM, re.eastM)).toBeGreaterThan(100);
        }
    });

    it('the error drifts without a new wrap while the row stays', () => {
        const re = new RangeErrors();
        // The same elevation in both skies: the error at the entry is the clock offset, 140 km, inside the half millisecond
        const sameSky = {...FALSE_SKY, 5: TRUE_SKY[5]};
        const spoofer = {...SPOOFER, clockM: 140_000};
        const r = rows(EIGHT, [5]);
        update(re, r, 0, {spoofer, falseSky: sameSky});
        const lines = los(r, TRUE_SKY, FALSE_SKY);
        const entry = fit(lines, false, EIGHT.map(p => p === 5 ? 140_000 : 0));
        expect(re.northM).toBeCloseTo(entry.north, 3);

        // The fake satellite sinks by 6 degrees: its range grows by far more than the 10 km to the next wrap
        const lower: Sky = {...FALSE_SKY, 5: [TRUE_SKY[5][0] + 6, TRUE_SKY[5][1]]};
        const drift = rangeAt(elevation(lower, 5)) - rangeAt(elevation(TRUE_SKY, 5));
        expect(drift).toBeGreaterThan(100_000); // Precondition
        update(re, r, 5, {spoofer, falseSky: lower});
        const drifted = fit(lines, false, EIGHT.map(p => p === 5 ? 140_000 + drift : 0));
        expect(re.northM).toBeCloseTo(drifted.north, 3);
        expect(re.eastM).toBeCloseTo(drifted.east, 3);

        // Out of the rows and back: resolved anew, within the half millisecond again
        update(re, rows([1, 2, 3, 4, 6, 7, 8], []), 6, {spoofer, falseSky: lower});
        update(re, r, 7, {spoofer, falseSky: lower});
        const again = fit(lines, false, EIGHT.map(p => p === 5 ? wrapped(140_000 + drift, 0) : 0));
        expect(re.northM).toBeCloseTo(again.north, 3);
    });

    it('the whole milliseconds are resolved again when the reference flips', () => {
        const re = new RangeErrors();
        // PRN 1 stays a real row throughout. Its true and fake ranges differ by 400 km plus the clock offset's 0 here
        const trueSky: Sky = {...TRUE_SKY};
        const falseSky: Sky = {...FALSE_SKY};
        const before = rows([1, 2, 3, 4, 5, 6], [5, 6]); // Four real rows: the true reference
        update(re, before, 0, {trueSky, falseSky});
        expect(re.falseReference).toBe(false);
        const after = rows([1, 5, 6, 7, 8, 9], [5, 6, 7, 8, 9]); // Five fake rows: the false reference
        update(re, after, 1, {trueSky, falseSky});
        expect(re.falseReference).toBe(true);

        const raw = rangeAt(elevation(trueSky, 1)) - rangeAt(elevation(falseSky, 1));
        expect(Math.abs(raw)).toBeGreaterThan(C_M_PER_MS / 2); // Precondition: a wrap is needed
        const e = wrapped(rangeAt(elevation(trueSky, 1)), rangeAt(elevation(falseSky, 1)));
        const expected = fit(los(after, trueSky, falseSky), false, [e, 0, 0, 0, 0, 0]);
        expect(re.northM).toBeCloseTo(expected.north, 3);
        expect(re.eastM).toBeCloseTo(expected.east, 3);
        expect(re.sseM2).toBeCloseTo(expected.sse, 0);
    });

    it('captured with an altitude input: the altitude row\'s error makes raimTestFails true; without one, false', () => {
        const re = new RangeErrors();
        const aided = rows(EIGHT, EIGHT, true);
        update(re, aided, 0, {altitudeInputM: 35_000 * FT});
        expect(re.falseReference).toBe(true);
        // The input reads 34,000 ft above the false altitude: entered negated (GpsSolution solveErrors), it moves the solution up
        const altitudeError = -W * (35_000 - 1000) * FT;
        const expected = fit(los(aided, TRUE_SKY, FALSE_SKY), true, [...EIGHT.map(() => 0), altitudeError]);
        expect(expected.up).toBeGreaterThan(0);
        expect(re.sseM2).toBeCloseTo(expected.sse, 3);
        expect(re.northM).toBeCloseTo(expected.north, 6);
        expect(re.eastM).toBeCloseTo(expected.east, 6);
        expect(raimTestFails(re.sseM2, 9)).toBe(true);

        const without = new RangeErrors();
        update(without, rows(EIGHT, EIGHT), 0);
        expect(without.sseM2).toBe(0);
        expect(raimTestFails(without.sseM2, 8)).toBe(false);
    });

    it('with the true reference the altitude row carries no error: the measurement strategy has the altimeter\'s', () => {
        const re = new RangeErrors();
        update(re, rows(EIGHT, [], true), 0, {altitudeInputM: 35_000 * FT});
        expect([re.northM, re.eastM, re.sseM2]).toEqual([0, 0, 0]);
    });

    it('the faulty satellite\'s bias enters its row', () => {
        const re = new RangeErrors();
        const r = rows(EIGHT, []);
        update(re, r, 0, {faultyPrn: 3, faultyBiasM: 1000});
        const expected = fit(los(r, TRUE_SKY, FALSE_SKY), false, EIGHT.map(p => p === 3 ? 1000 : 0));
        expect(re.northM).toBeCloseTo(expected.north, 6);
        expect(re.eastM).toBeCloseTo(expected.east, 6);
        expect(re.sseM2).toBeCloseTo(expected.sse, 3);
        expect(re.sseM2).toBeGreaterThan(1000);
        // A ramp gives no velocity error: a clock jump changes the range, not the Doppler (#460)
        update(re, r, 1, {faultyPrn: 3, faultyBiasM: 1025});
        expect([re.velNorthMps, re.velEastMps]).toEqual([0, 0]);

        // A faulty satellite the rows lack adds nothing
        const lacking = new RangeErrors();
        update(lacking, r, 0, {faultyPrn: 9, faultyBiasM: 1000});
        expect([lacking.northM, lacking.eastM, lacking.sseM2]).toEqual([0, 0, 0]);
    });

    it('the faulty satellite\'s bias enters only its real row, also under the false reference', () => {
        const re = new RangeErrors();
        update(re, rows(EIGHT, [3]), 0, {faultyPrn: 4, faultyBiasM: 1000});
        const withBias = re.northM;
        update(re, rows(EIGHT, [3]), 1, {faultyPrn: 4, faultyBiasM: 0});
        expect(withBias - re.northM).toBeCloseTo(fit(los(rows(EIGHT, [3]), TRUE_SKY, FALSE_SKY), false, EIGHT.map(p => p === 4 ? 1000 : 0)).north, 6);

        // The faulty PRN's fake signal carries no bias
        const fake = new RangeErrors();
        update(fake, rows(EIGHT, [3]), 0);
        const plain = fake.northM;
        update(fake, rows(EIGHT, [3]), 1, {faultyPrn: 3, faultyBiasM: 1000});
        expect(fake.northM).toBe(plain);

        // A real row under the false reference
        const captured = new RangeErrors();
        const r = rows([1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5]);
        update(captured, r, 0);
        const before = [captured.northM, captured.eastM];
        update(captured, r, 1, {faultyPrn: 6, faultyBiasM: 500});
        const bias = fit(los(r, TRUE_SKY, FALSE_SKY), false, [0, 0, 0, 0, 0, 500]);
        expect(captured.northM - before[0]).toBeCloseTo(bias.north, 6);
        expect(captured.eastM - before[1]).toBeCloseTo(bias.east, 6);
    });

    describe('the velocity error', () => {
        // Each claimed range moves at its own rate, held between the 5 s steps of its sky. Two steps of each sky make both
        // rates known
        const r = rows(EIGHT, [5]);
        const fakeAt = (zenith: number): Sky => ({...FALSE_SKY, 5: [zenith, FALSE_SKY[5][1]]});
        const trueAt = (zenith: number): Sky => ({...TRUE_SKY, 5: [zenith, TRUE_SKY[5][1]]});

        it('a fake row\'s range-rate error moves the velocity by minus its coefficients times the rate error', () => {
            const re = new RangeErrors();
            const lines = los(r, TRUE_SKY, FALSE_SKY);
            update(re, r, 0, {m: matricesFor(r), falseSky: fakeAt(25), trueSky: trueAt(70)});
            expect([re.velNorthMps, re.velEastMps]).toEqual([0, 0]); // Nothing known yet
            update(re, r, 5, {m: matricesFor(r), falseSky: fakeAt(25.01), trueSky: trueAt(70.02)});
            const fakeRate = (rangeAt(90 - 25.01) - rangeAt(90 - 25)) / 5;
            const trueRate = (rangeAt(90 - 70.02) - rangeAt(90 - 70)) / 5;
            const expected = fit(lines, false, EIGHT.map(p => p === 5 ? fakeRate - trueRate : 0));
            expect(Math.abs(fakeRate - trueRate)).toBeGreaterThan(10); // Precondition
            expect(re.velNorthMps).toBeCloseTo(expected.north, 6);
            expect(re.velEastMps).toBeCloseTo(expected.east, 6);

            // A tick in which neither sky moved holds the rates
            update(re, r, 6, {m: matricesFor(r), falseSky: fakeAt(25.01), trueSky: trueAt(70.02)});
            expect(re.velNorthMps).toBeCloseTo(expected.north, 6);

            // The fake sky steps alone: its new rate, the true rate held
            update(re, r, 8, {m: matricesFor(r), falseSky: fakeAt(25.03), trueSky: trueAt(70.02)});
            const fakeRate2 = (rangeAt(90 - 25.03) - rangeAt(90 - 25.01)) / 3;
            const expected2 = fit(lines, false, EIGHT.map(p => p === 5 ? fakeRate2 - trueRate : 0));
            expect(re.velNorthMps).toBeCloseTo(expected2.north, 6);
            expect(re.velEastMps).toBeCloseTo(expected2.east, 6);
        });

        it('rows claiming the reference give none, and neither does a step of more than 60 s', () => {
            const re = new RangeErrors();
            const real = rows(EIGHT, []);
            update(re, real, 0, {trueSky: trueAt(70)});
            update(re, real, 5, {trueSky: trueAt(70.5)});
            expect([re.velNorthMps, re.velEastMps]).toEqual([0, 0]);

            const late = new RangeErrors();
            update(late, r, 0, {falseSky: fakeAt(25), trueSky: trueAt(70)});
            update(late, r, 61, {falseSky: fakeAt(25.5), trueSky: trueAt(70.5)});
            expect([late.velNorthMps, late.velEastMps]).toEqual([0, 0]);
            update(late, r, 66, {falseSky: fakeAt(25.6), trueSky: trueAt(70.6)});
            expect(late.velNorthMps).not.toBe(0);
        });

        it('a captured unit\'s real row moves a velocity of 0 by its true Doppler against the fake one', () => {
            const re = new RangeErrors();
            const captured = rows([1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5]);
            const m = matricesFor(captured);
            update(re, captured, 0, {m, trueSky: {...TRUE_SKY, 6: [50, 250]}, falseSky: {...FALSE_SKY, 6: [45, 280]}});
            update(re, captured, 5, {m, trueSky: {...TRUE_SKY, 6: [50.05, 250]}, falseSky: {...FALSE_SKY, 6: [45.01, 280]}});
            const trueRate = (rangeAt(90 - 50.05) - rangeAt(90 - 50)) / 5;
            const fakeRate = (rangeAt(90 - 45.01) - rangeAt(90 - 45)) / 5;
            const expected = fit(los(captured, TRUE_SKY, FALSE_SKY), false, [0, 0, 0, 0, 0, trueRate - fakeRate]);
            expect(re.velNorthMps).toBeCloseTo(expected.north, 6);
            expect(re.velEastMps).toBeCloseTo(expected.east, 6);
            expect(Math.hypot(re.velNorthMps, re.velEastMps)).toBeGreaterThan(1);
        });
    });

    // Final review (2026-11-08): a fake signal travels from the spoofer to the aircraft on top of the range it claims. The
    // slant range is common to every fake row, and its rate is its change since the last update
    describe('the spoofer\'s slant range', () => {
        const r = rows(EIGHT, [5]);
        const fakeAt = (zenith: number): Sky => ({...FALSE_SKY, 5: [zenith, FALSE_SKY[5][1]]});
        const trueAt = (zenith: number): Sky => ({...TRUE_SKY, 5: [zenith, TRUE_SKY[5][1]]});
        const spoofer = {...SPOOFER, clockM: 20_000};

        it('a fake row\'s range includes it, and the aircraft\'s speed toward the spoofer enters the velocity error', () => {
            const re = new RangeErrors();
            const lines = los(r, TRUE_SKY, FALSE_SKY);
            // 200 km from the spoofer, closing at 250 m/s
            update(re, r, 0, {m: matricesFor(r), spoofer, slantM: 200_000, falseSky: fakeAt(25), trueSky: trueAt(70)});
            const entry = wrapped(rangeAt(90 - 25) + 20_000 + 200_000, rangeAt(90 - 70));
            const atEntry = fit(lines, false, EIGHT.map(p => p === 5 ? entry : 0));
            expect(re.northM).toBeCloseTo(atEntry.north, 3);
            expect(re.eastM).toBeCloseTo(atEntry.east, 3);
            const wholeMs = Math.round((rangeAt(90 - 25) + 220_000 - rangeAt(90 - 70)) / C_M_PER_MS);

            update(re, r, 5, {m: matricesFor(r), spoofer, slantM: 198_750, falseSky: fakeAt(25.01), trueSky: trueAt(70.02)});
            const drifted = rangeAt(90 - 25.01) + 20_000 + 198_750 - rangeAt(90 - 70.02) - wholeMs * C_M_PER_MS;
            const atDrift = fit(lines, false, EIGHT.map(p => p === 5 ? drifted : 0));
            expect(re.northM).toBeCloseTo(atDrift.north, 3);
            expect(re.eastM).toBeCloseTo(atDrift.east, 3);
            const fakeRate = (rangeAt(90 - 25.01) - rangeAt(90 - 25)) / 5;
            const trueRate = (rangeAt(90 - 70.02) - rangeAt(90 - 70)) / 5;
            const velocity = fit(lines, false, EIGHT.map(p => p === 5 ? fakeRate - 250 - trueRate : 0));
            expect(re.velNorthMps).toBeCloseTo(velocity.north, 6);
            expect(re.velEastMps).toBeCloseTo(velocity.east, 6);
            // The slant's share alone is several m/s: not a rounding of the skies' rates
            const skiesOnly = fit(lines, false, EIGHT.map(p => p === 5 ? fakeRate - trueRate : 0));
            expect(Math.hypot(velocity.north - skiesOnly.north, velocity.east - skiesOnly.east)).toBeGreaterThan(10);

            // A tick in which the aircraft keeps its distance and neither sky moves: the slant's rate is 0, the skies' held
            update(re, r, 6, {m: matricesFor(r), spoofer, slantM: 198_750, falseSky: fakeAt(25.01), trueSky: trueAt(70.02)});
            expect(re.velNorthMps).toBeCloseTo(skiesOnly.north, 6);
            expect(re.velEastMps).toBeCloseTo(skiesOnly.east, 6);
        });

        it('under the false reference a real row carries minus it and minus its rate', () => {
            const re = new RangeErrors();
            const captured = rows([1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5]);
            const m = matricesFor(captured);
            const lines = los(captured, TRUE_SKY, FALSE_SKY);
            const sky = (t: number, f: number): { trueSky: Sky, falseSky: Sky } => ({trueSky: {...TRUE_SKY, 6: [t, 250]}, falseSky: {...FALSE_SKY, 6: [f, 280]}});
            update(re, captured, 0, {m, spoofer, slantM: 100_000, ...sky(50, 45)});
            const entry = wrapped(rangeAt(90 - 50), rangeAt(90 - 45) + 20_000 + 100_000);
            const atEntry = fit(lines, false, [0, 0, 0, 0, 0, entry]);
            expect(re.falseReference).toBe(true);
            expect(re.northM).toBeCloseTo(atEntry.north, 3);
            expect(re.eastM).toBeCloseTo(atEntry.east, 3);

            update(re, captured, 5, {m, spoofer, slantM: 101_000, ...sky(50.05, 45.01)});
            const trueRate = (rangeAt(90 - 50.05) - rangeAt(90 - 50)) / 5;
            const fakeRate = (rangeAt(90 - 45.01) - rangeAt(90 - 45)) / 5;
            const velocity = fit(lines, false, [0, 0, 0, 0, 0, trueRate - fakeRate - 200]);
            expect(re.velNorthMps).toBeCloseTo(velocity.north, 6);
            expect(re.velEastMps).toBeCloseTo(velocity.east, 6);
        });

        it('captured, every row fake: it goes into the clock, and a changing slant moves neither the position nor the velocity', () => {
            const re = new RangeErrors();
            update(re, rows(EIGHT, EIGHT), 0, {spoofer, slantM: 150_000});
            update(re, rows(EIGHT, EIGHT), 1, {spoofer, slantM: 149_800});
            expect([re.northM, re.eastM, re.velNorthMps, re.velEastMps, re.sseM2]).toEqual([0, 0, 0, 0, 0]);
            expect(re.clockM).toBe(20_000 + 149_800);
        });

        it('without a spoofer it is ignored', () => {
            const re = new RangeErrors();
            update(re, rows(EIGHT, []), 0, {spoofer: null, slantM: 150_000});
            expect(re.clockM).toBe(0);
        });
    });

    it('without a solution of the rows (the matrices of another row count) everything is 0', () => {
        const re = new RangeErrors();
        const m = createSolutionMatrices();
        update(re, rows(EIGHT, [5]), 0, {m});
        expect([re.northM, re.eastM, re.velNorthMps, re.velEastMps, re.clockM, re.sseM2]).toEqual([0, 0, 0, 0, 0, 0]);
    });

    it('reset forgets the whole milliseconds and the outputs', () => {
        const re = new RangeErrors();
        const spoofer = {...SPOOFER, clockM: 140_000};
        const sameSky = {...FALSE_SKY, 5: TRUE_SKY[5]};
        const lower: Sky = {...FALSE_SKY, 5: [TRUE_SKY[5][0] + 6, TRUE_SKY[5][1]]};
        update(re, rows(EIGHT, [5]), 0, {spoofer, falseSky: sameSky});
        re.reset();
        expect([re.northM, re.eastM, re.velNorthMps, re.velEastMps, re.clockM, re.sseM2]).toEqual([0, 0, 0, 0, 0, 0]);
        update(re, rows(EIGHT, [5]), 5, {spoofer, falseSky: lower});
        const drift = rangeAt(elevation(lower, 5)) - rangeAt(elevation(TRUE_SKY, 5));
        const expected = fit(los(rows(EIGHT, [5]), TRUE_SKY, FALSE_SKY), false, EIGHT.map(p => p === 5 ? wrapped(140_000 + drift, 0) : 0));
        expect(re.northM).toBeCloseTo(expected.north, 3);
    });
});
