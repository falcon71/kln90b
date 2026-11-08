import {ALTITUDE_WEIGHT, MAX_ROWS, SolutionMatrices, solveErrors} from '../GpsSolution';
import {METERS_PER_MS, rangeFromSinElevationM} from '../GpsTransmitter';
import type {SpooferSite} from './Transmitters';

/**
 * What the measurement reads of the mixed solution (#465): the reference state and the solution's shift from it. Updated in
 * place once per calculation tick
 */
export interface RangeErrorView {
    /** The solution's reference state is the false one: the spoofer's false position and time */
    readonly falseReference: boolean;
    /** The false position, degrees; 0 without a spoofer */
    readonly falseLat: number;
    readonly falseLon: number;
    /** The position's shift from the reference state, meters */
    readonly northM: number;
    readonly eastM: number;
    /** The velocity's shift, m/s: from the true velocity with the true reference, from 0 with the false one */
    readonly velNorthMps: number;
    readonly velEastMps: number;
    /**
     * The receiver's clock against the reference state's nominal time, meters: the clock component of the solution's shift,
     * plus the spoofer's clock offset and the spoofer's slant range with the false reference (the fake signals claim the
     * false time plus that offset, and travel the spoofer's path on top)
     */
    readonly clockM: number;
    /** The sum of the squared residuals of the rows' errors, m² (GpsSolution solveErrors) */
    readonly sseM2: number;
}

/** The rows of the unit's solution, in the row order of its matrices; the altitude row, if any, comes last */
export interface RangeErrorRows {
    readonly prns: readonly number[];
    /** Per row: 1 the row's signal claims the false state (a fake satellite), 0 the true state. Only the first prns.length count */
    readonly falseClaim: Uint8Array;
    readonly altitudeRow: boolean;
    /** The reference state of the rows (falseReferenceOf) */
    readonly falseReference: boolean;
}

const PRN_SLOTS = 256;
const METERS_PER_FOOT = 0.3048;
/** A range's rate is known only from two of its values at most this far apart, in seconds of sim time */
const MAX_RATE_STEP_S = 60;

/**
 * The reference state of a solution (design, "The solution"): the state claimed by most of its satellite rows, the true one
 * on a tie (our call)
 * @param falseClaim per row 1 for a row claiming the false state
 * @param n the number of satellite rows
 * @returns true for the false state
 */
export function falseReferenceOf(falseClaim: Uint8Array, n: number): boolean {
    let falseRows = 0;
    for (let i = 0; i < n; i++) {
        falseRows += falseClaim[i];
    }
    return 2 * falseRows > n;
}

/**
 * One claimed range per PRN, kept with the time it last changed and the rate of that change. The skies give their satellites'
 * directions in steps (the SDK every 5 s, the fake sky as often), so a range's rate is the step over the time since its last
 * change, held until its next one
 */
class RangeTrack {
    private readonly value = new Float64Array(PRN_SLOTS).fill(NaN);
    private readonly time = new Float64Array(PRN_SLOTS);
    private readonly rate = new Float64Array(PRN_SLOTS).fill(NaN);

    /** Takes the range of a PRN at a time and returns its rate, m/s, or NaN while it is not known */
    public observe(prn: number, rangeM: number, timeS: number): number {
        const previous = this.value[prn];
        const dt = timeS - this.time[prn];
        if (rangeM !== previous) {
            this.rate[prn] = previous === previous && dt > 0 && dt <= MAX_RATE_STEP_S ? (rangeM - previous) / dt : NaN;
            this.value[prn] = rangeM;
            this.time[prn] = timeS;
            return this.rate[prn];
        }
        return dt >= 0 && dt <= MAX_RATE_STEP_S ? this.rate[prn] : NaN;
    }

    public reset(): void {
        this.value.fill(NaN);
        this.rate.fill(NaN);
    }
}

/**
 * The range errors of the unit's solution and what they do to it (#465, design "The solution" and "RAIM detection"). Each row
 * of the solution claims a receiver state: a real satellite the true position and time, a fake satellite the false position
 * on the ground and the false time plus the spoofer's clock offset. The solution is linearized about its reference state;
 * a row claiming the other state carries the range it claims minus the range from the reference state, less the whole
 * milliseconds the receiver resolved for it when it entered the rows or the reference state last changed. Between those
 * moments the row is tracked, so its error drifts and does not wrap.
 *
 * The ranges come from the elevations (GpsTransmitter rangeFromSinElevationM). A fake signal travels from the spoofer to the
 * aircraft on top of the range it claims, so its claimed range includes the spoofer's slant range (decided at the final
 * review, 2026-11-08); the false reference state, which the fake rows define, includes it as well. It is common to every
 * fake row: in an all-fake solution it goes into the clock, and in the mixed phase the aircraft's speed toward the spoofer
 * enters the velocity error. The faulty satellite's bias (#460) is added on its real row. The altitude row (5-29) carries the
 * altitude input against the false altitude under the false reference; under the true one its error is the altimeter's,
 * which the measurement strategy already has (GpsMeasurement), so 0 here. The velocity error comes from the range-rate
 * errors, each claimed range's rate from its own steps (RangeTrack) and the slant range's from its change since the last
 * update; the faulty satellite's ramp is a clock jump and has none.
 *
 * Allocation-free: typed arrays by PRN and by row.
 */
export class RangeErrors implements RangeErrorView {
    public falseReference = false;
    public falseLat = 0;
    public falseLon = 0;
    public northM = 0;
    public eastM = 0;
    public velNorthMps = 0;
    public velEastMps = 0;
    public clockM = 0;
    public sseM2 = 0;

    /** Per PRN: the whole milliseconds resolved for its row */
    private readonly wholeMs = new Int32Array(PRN_SLOTS);
    /** Per PRN: its claim in the last update's rows, 1 true, 2 false, 0 not a row */
    private readonly lastClaim = new Uint8Array(PRN_SLOTS);
    /** The PRNs of the last update's rows; typed, so an update allocates nothing */
    private readonly lastPrns = new Int32Array(MAX_ROWS);
    private lastCount = 0;
    private lastFalseReference = false;
    private readonly trueRanges = new RangeTrack();
    private readonly falseRanges = new RangeTrack();
    /**
     * The spoofer's slant range of the last update and its rate. The slant changes every tick with the aircraft, not in the
     * skies' steps: its rate is its change since the last update, 0 while it does not change
     */
    private lastSlantM = NaN;
    private lastSlantTimeS = 0;
    private slantRateMps = 0;
    private readonly errors = new Float64Array(MAX_ROWS);
    private readonly rateErrors = new Float64Array(MAX_ROWS);
    private readonly shift = new Float64Array(4);

    /**
     * @param rows the rows of the solution
     * @param m the matrices of the rows' solution (computeGeometry); with another row count, as n = 0 for no solution, the
     * outputs are 0
     * @param simTimeS the sim time, seconds
     * @param trueSinElevation the sine of a PRN's elevation in the real sky at the true position
     * @param falseSinElevation the same in the fake sky at the false position
     * @param spoofer the spoofer, null without one
     * @param spooferSlantM the slant range from the spoofer to the aircraft, meters; ignored without a spoofer
     * @param altitudeInputM the altitude input, null without one
     * @param faultyPrn the faulty satellite (#460), null without one
     * @param faultyBiasM its range bias, meters
     */
    public update(rows: RangeErrorRows, m: SolutionMatrices, simTimeS: number, trueSinElevation: (prn: number) => number,
                  falseSinElevation: (prn: number) => number, spoofer: Readonly<SpooferSite> | null, spooferSlantM: number,
                  altitudeInputM: number | null, faultyPrn: number | null, faultyBiasM: number): void {
        const n = Math.min(rows.prns.length, MAX_ROWS);
        const falseReference = rows.falseReference;
        const flipped = falseReference !== this.lastFalseReference;
        //The fake signals' common terms: the spoofer's clock offset and its path to the aircraft
        const slantM = spoofer === null ? 0 : spooferSlantM;
        const slantRate = this.observeSlant(slantM, simTimeS);
        const fakeCommonM = spoofer === null ? 0 : spoofer.clockM + slantM;
        const errors = this.errors;
        const rateErrors = this.rateErrors;

        for (let i = 0; i < n; i++) {
            const prn = rows.prns[i];
            const claimsFalse = rows.falseClaim[i] === 1;
            const trueRange = rangeFromSinElevationM(trueSinElevation(prn));
            const falseRange = rangeFromSinElevationM(falseSinElevation(prn));
            const trueRate = this.trueRanges.observe(prn, trueRange, simTimeS);
            const falseRate = this.falseRanges.observe(prn, falseRange, simTimeS);
            const claim = claimsFalse ? 2 : 1;
            let error = 0;
            let rateError = 0;
            if (claimsFalse !== falseReference) {
                const claimed = claimsFalse ? falseRange + fakeCommonM : trueRange;
                const reference = falseReference ? falseRange + fakeCommonM : trueRange;
                if (flipped || this.lastClaim[prn] !== claim) {
                    //The row entered, or the reference state changed: the code phase is placed within half a millisecond of
                    //the range the reference state predicts
                    this.wholeMs[prn] = Math.round((claimed - reference) / METERS_PER_MS);
                }
                error = claimed - reference - this.wholeMs[prn] * METERS_PER_MS;
                rateError = claimsFalse ? falseRate + slantRate - trueRate : trueRate - falseRate - slantRate;
                if (rateError !== rateError) {
                    rateError = 0; //A rate not known yet
                }
            }
            if (!claimsFalse && prn === faultyPrn) {
                error += faultyBiasM;
            }
            errors[i] = error;
            rateErrors[i] = rateError;
        }

        for (let i = 0; i < this.lastCount; i++) {
            this.lastClaim[this.lastPrns[i]] = 0;
        }
        for (let i = 0; i < n; i++) {
            const prn = rows.prns[i];
            this.lastClaim[prn] = rows.falseClaim[i] === 1 ? 2 : 1;
            this.lastPrns[i] = prn;
        }
        this.lastCount = n;
        this.lastFalseReference = falseReference;

        let measurements = n;
        if (rows.altitudeRow) {
            //Entered negated (GpsSolution solveErrors): an input reading above the false altitude moves the solution up
            errors[n] = falseReference && altitudeInputM !== null && spoofer !== null
                ? -ALTITUDE_WEIGHT * (altitudeInputM - spoofer.falseAltFt * METERS_PER_FOOT)
                : 0;
            rateErrors[n] = 0;
            measurements++;
        }

        this.falseReference = falseReference;
        this.falseLat = spoofer === null ? 0 : spoofer.falseLat;
        this.falseLon = spoofer === null ? 0 : spoofer.falseLon;
        const referenceClockM = falseReference ? fakeCommonM : 0;
        if (m.n !== measurements || measurements === 0) {
            this.northM = 0;
            this.eastM = 0;
            this.velNorthMps = 0;
            this.velEastMps = 0;
            this.clockM = referenceClockM;
            this.sseM2 = 0;
            return;
        }
        const shift = this.shift;
        //+ 0 turns the -0 of an error-free solution into 0
        this.sseM2 = solveErrors(m, errors, shift);
        this.northM = shift[0] + 0;
        this.eastM = shift[1] + 0;
        this.clockM = referenceClockM + shift[3];
        solveErrors(m, rateErrors, shift);
        this.velNorthMps = shift[0] + 0;
        this.velEastMps = shift[1] + 0;
    }

    /** The slant range's rate, m/s, from its change since the last update; held for an update in the same tick */
    private observeSlant(slantM: number, timeS: number): number {
        const dt = timeS - this.lastSlantTimeS;
        if (slantM !== this.lastSlantM || dt !== 0) {
            this.slantRateMps = this.lastSlantM === this.lastSlantM && dt > 0 && dt <= MAX_RATE_STEP_S ? (slantM - this.lastSlantM) / dt : 0;
            this.lastSlantM = slantM;
            this.lastSlantTimeS = timeS;
        }
        return this.slantRateMps;
    }

    /** Power change: the rows, their whole milliseconds and the ranges' rates are forgotten */
    public reset(): void {
        this.lastSlantM = NaN;
        this.slantRateMps = 0;
        this.lastClaim.fill(0);
        this.lastCount = 0;
        this.lastFalseReference = false;
        this.wholeMs.fill(0);
        this.trueRanges.reset();
        this.falseRanges.reset();
        this.falseReference = false;
        this.northM = 0;
        this.eastM = 0;
        this.velNorthMps = 0;
        this.velEastMps = 0;
        this.clockM = 0;
        this.sseM2 = 0;
    }
}
