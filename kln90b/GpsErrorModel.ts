import {ALTITUDE_WEIGHT} from './GpsSolution';

/** The slow ranging error of a satellite (ionosphere, ephemeris). With SIGMA_FAST_M the total stays 5 m. */
export const SIGMA_SLOW_M = 4.9;
/** Correlation time of the slow error */
export const TAU_SLOW_S = 300;
/** The white receiver noise on the range */
export const SIGMA_FAST_M = 1;
/** The white noise on the range rate (Doppler) of a satellite */
export const SIGMA_DOPPLER_MPS = 0.05;
/** The white noise on the vertical rate that stands in for the altitude row's rate */
export const SIGMA_ALT_RATE_MPS = 0.5;

/** SDK PRNs stay below this */
const PRN_COUNT = 256;

/**
 * The error processes of the simulated receiver (#402), one set per satellite in use, keyed by PRN: a slow
 * Gauss-Markov ranging error, white receiver noise and white range-rate noise. The errors are mapped through the
 * geometry coefficients of GpsSolution's computeGeometry to a north/east position and velocity error.
 *
 * It owns no allocations after construction, because it runs every tick. The random source is injected.
 */
export class GpsErrorModel {
    private readonly slow = new Float64Array(PRN_COUNT);
    private readonly known = new Uint8Array(PRN_COUNT);
    /** The PRNs that are known, in no particular order */
    private readonly knownList = new Int32Array(PRN_COUNT);
    private knownCount = 0;
    /** Marks the PRNs seen in the current update */
    private readonly seen = new Uint32Array(PRN_COUNT);
    private generation = 0;

    private spare = 0;
    private hasSpare = false;

    constructor(private readonly random: () => number = Math.random) {
    }

    /** Forgets every satellite */
    public reset(): void {
        this.slow.fill(0);
        this.known.fill(0);
        this.seen.fill(0);
        this.generation = 0;
        this.knownCount = 0;
        this.hasSpare = false;
    }

    /** The slow part of a PRN's error. Zero for a PRN that is not known. For tests */
    public slowError(prn: number): number {
        return this.slow[prn];
    }

    /**
     * Advances the slow errors by dtS and draws fresh white errors.
     * @param dtS Elapsed time. Zero or less means no time passed for the slow error; the white parts are still drawn
     * @param prns The satellite rows, in the order of the coefficients
     * @param coefficients From computeGeometry: north at 2i, east at 2i+1, meters of position error per meter of
     * whitened error of row i. Only the rows in use are read
     * @param altitudeErrorM The error of the unit's altitude in meters (indicated minus true), or null without an
     * altitude input. When present, its row is row prns.length
     * @param out Position error north and east (m), then velocity error north and east (m/s)
     */
    public update(dtS: number, prns: readonly number[], coefficients: Float64Array, altitudeErrorM: number | null, out: Float64Array): void {
        const a = dtS > 0 ? Math.exp(-dtS / TAU_SLOW_S) : 1;
        const stepSigma = SIGMA_SLOW_M * Math.sqrt(1 - a * a);

        this.generation++;

        let posN = 0, posE = 0, velN = 0, velE = 0;
        for (let i = 0; i < prns.length; i++) {
            const prn = prns[i];
            if (this.known[prn] === 1) {
                this.slow[prn] = a * this.slow[prn] + stepSigma * this.normal();
            } else {
                this.known[prn] = 1;
                this.knownList[this.knownCount++] = prn;
                this.slow[prn] = SIGMA_SLOW_M * this.normal();
            }
            this.seen[prn] = this.generation;

            const rangeError = this.slow[prn] + SIGMA_FAST_M * this.normal();
            const rateError = SIGMA_DOPPLER_MPS * this.normal();
            posN += coefficients[2 * i] * rangeError;
            posE += coefficients[2 * i + 1] * rangeError;
            velN += coefficients[2 * i] * rateError;
            velE += coefficients[2 * i + 1] * rateError;
        }

        // A satellite that is not in the rows loses its state
        let kept = 0;
        for (let i = 0; i < this.knownCount; i++) {
            const prn = this.knownList[i];
            if (this.seen[prn] === this.generation) {
                this.knownList[kept++] = prn;
            } else {
                this.known[prn] = 0;
                this.slow[prn] = 0;
            }
        }
        this.knownCount = kept;

        if (altitudeErrorM !== null) {
            const row = prns.length;
            const rateError = SIGMA_ALT_RATE_MPS * ALTITUDE_WEIGHT * this.normal();
            posN += coefficients[2 * row] * altitudeErrorM * ALTITUDE_WEIGHT;
            posE += coefficients[2 * row + 1] * altitudeErrorM * ALTITUDE_WEIGHT;
            velN += coefficients[2 * row] * rateError;
            velE += coefficients[2 * row + 1] * rateError;
        }

        out[0] = posN;
        out[1] = posE;
        out[2] = velN;
        out[3] = velE;
    }

    /** Box-Muller. The second value of each pair is kept for the next call */
    private normal(): number {
        if (this.hasSpare) {
            this.hasSpare = false;
            return this.spare;
        }
        // 1 - random() lies in (0, 1], so the logarithm is finite
        const u1 = 1 - this.random();
        const u2 = this.random();
        const r = Math.sqrt(-2 * Math.log(u1));
        this.spare = r * Math.sin(2 * Math.PI * u2);
        this.hasSpare = true;
        return r * Math.cos(2 * Math.PI * u2);
    }
}
