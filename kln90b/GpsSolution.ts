import {GPSSatelliteState, ReadonlyFloat64Array, Vec3Math} from '@microsoft/msfs-sdk';
import type {GPSPredictionContext} from '@microsoft/msfs-sdk';

/**
 * The receiver's position solution from the geometry of the satellites in use: whether there is one, how good it is
 * and whether RAIM is available. #453, design in docs/superpowers/specs/2026-11-01-gps-signal-loss-design.md (5.1, 5.2).
 *
 * 5-29: a position needs four satellites, or three with an altitude input. B-4: the error estimate above 3.8 NM is
 * not a usable solution. The error levels, K and the alert limits are our own choice, see the design.
 *
 * The solution is a weighted least squares fit on whitened rows, so the normal matrix is G^T G. Every satellite is one
 * row [x, y, z, 1] of the unit vector of its line of sight and a clock column. The altitude is one row [0, 0, w, 0]
 * with w = ALTITUDE_WEIGHT = SIGMA_UERE_M / SIGMA_ALT_M.
 *
 * The same pass gives the error coefficients of #402: how an error of every row moves the solution to the north and to
 * the east (design 6.4), and the north and east entries of the covariance. The SDK gives a satellite as [zenith angle,
 * hour angle], and the hour angle turns from north towards the west (GPSSatellite.applyProjection, held by a test).
 * setFromSpherical therefore puts the north in x and the west in y, so the east is -y.
 *
 * Signs: a satellite row is +u, the unit vector toward the satellite, so its coefficient has the sign of its line of
 * sight and a positive range error moves the position the other way. `solveErrors` applies that sign for a single
 * satellite's bias (#465). The sign of the altitude row is physical: a reading too high moves the position up, so the
 * caller enters that row's error negated (see `solveErrors`).
 *
 * This is a pure math module: it imports nothing from the project, so that Gps can import it without a cycle. The alert
 * limit of a flight phase is `halForMode` in services/ModeController.
 */

/** The ranging error of one satellite in meters (1 sigma): single frequency, no selective availability */
export const SIGMA_UERE_M = 5;
/** The error of the altitude input in meters: 100 ft encoder steps plus the error of the altimeter setting */
export const SIGMA_ALT_M = 30;
/** The altitude row is scaled by this, because its error is SIGMA_ALT_M and not SIGMA_UERE_M */
export const ALTITUDE_WEIGHT = SIGMA_UERE_M / SIGMA_ALT_M;
/** The protection level factor for a missed-detection probability of 0.001 */
export const RAIM_K = 5.3;
/** B-4: above this error estimate the solution is not valid */
export const MAX_EPE_NM = 3.8;

const METERS_PER_NM = 1852;
const SINGULAR = 1e-9;
/** More rows than any receiver has channels, so the scratch arrays never overflow. Extra satellites are ignored */
export const MAX_ROWS = 16;

export const enum Raim {
    Available,
    TooFewMeasurements,
    Geometry,
}

export interface GpsGeometry {
    /** A solution exists and its error estimate is within MAX_EPE_NM */
    valid: boolean;
    satellites: number;
    altitudeAided: boolean;
    /** The satellites plus one for the altitude */
    measurements: number;
    /** In units of SIGMA_UERE_M. NaN when the normal matrix is singular */
    hdop: number;
    /** The north entry of the covariance C = (G^T G)^-1, in units of SIGMA_UERE_M squared. NaN when singular */
    cNorth: number;
    /** The east entry of the covariance, as cNorth. cNorth + cEast is hdop squared */
    cEast: number;
    /** The 95% error estimate: 2 × HDOP × SIGMA_UERE_M. NaN when the normal matrix is singular */
    epeNm: number;
    /** The largest horizontal slope over all measurements. Infinity when the geometry is invalid */
    maxSlope: number;
}

/**
 * The matrices of the last valid solution that `solveErrors` needs. `g` is MAX_ROWS × 4, row i at [4 i .. 4 i + 3]: the
 * line of sight x, y, z and 1, the altitude row [0, 0, ALTITUDE_WEIGHT, 0]. `h` is 4 × MAX_ROWS, h[c × MAX_ROWS + i] is
 * component c of C·Gᵀ for row i, the components being x north, y west, z up and the clock. `n` is the number of rows.
 */
export interface SolutionMatrices {
    readonly g: Float64Array;
    readonly h: Float64Array;
    n: number;
}

export function createSolutionMatrices(): SolutionMatrices {
    return {g: new Float64Array(MAX_ROWS * 4), h: new Float64Array(4 * MAX_ROWS), n: 0};
}

// Scratch space: a call allocates nothing but its result
const rows = new Float64Array(MAX_ROWS * 4);
const augmented = new Float64Array(4 * 8);
const los = new Float64Array(3);
const hColumn = new Float64Array(4);
const shift = new Float64Array(4);

/**
 * Whether the SDK gave a satellite a usable [zenith, azimuth]. For a satellite exactly due north or south of the plane,
 * GPSSatellite.applyProjection takes the acos of a dot product that can round past ±1, and the azimuth is NaN. Such a
 * satellite is left out of the solution for that update (#456)
 */
export function hasFiniteAngles(position: ReadonlyFloat64Array): boolean {
    return Number.isFinite(position[0]) && Number.isFinite(position[1]);
}

/**
 * @param satellites [zenith, azimuth] in rad of each satellite in use, as GPSSatellite.position.get() returns it. Only
 * finite angles (hasFiniteAngles): a NaN row makes the whole solution invalid
 * @param altitudeAided whether the altitude input is present
 * @param coefficients Written when the solution is valid and left alone otherwise: the north and the east position
 * error in meters per meter of whitened error of row i, at [2 i] and [2 i + 1]. The rows are in the order of the input,
 * the altitude row last. A satellite's error enters as it is, the altitude error multiplied by ALTITUDE_WEIGHT. The
 * coefficient of a satellite row has the sign of its line of sight (+u toward the satellite), see the header, the one
 * of the altitude row is physical. At least 2 * MAX_ROWS long.
 * @param matrices Written like the coefficients: G, H and the row count, for `solveErrors`
 */
export function computeGeometry(satellites: readonly ReadonlyFloat64Array[], altitudeAided: boolean, coefficients?: Float64Array, matrices?: SolutionMatrices): GpsGeometry {
    const satelliteCount = Math.min(satellites.length, altitudeAided ? MAX_ROWS - 1 : MAX_ROWS);
    for (let i = 0; i < satelliteCount; i++) {
        const sat = satellites[i];
        Vec3Math.setFromSpherical(1, sat[0], sat[1], los);
        rows[i * 4] = los[0];
        rows[i * 4 + 1] = los[1];
        rows[i * 4 + 2] = los[2];
        rows[i * 4 + 3] = 1;
    }
    let n = satelliteCount;
    if (altitudeAided) {
        rows[n * 4] = 0;
        rows[n * 4 + 1] = 0;
        rows[n * 4 + 2] = ALTITUDE_WEIGHT;
        rows[n * 4 + 3] = 0;
        n++;
    }

    const result: GpsGeometry = {
        valid: false,
        satellites: satelliteCount,
        altitudeAided: altitudeAided,
        measurements: n,
        hdop: NaN,
        cNorth: NaN,
        cEast: NaN,
        epeNm: NaN,
        maxSlope: Infinity,
    };
    if (n < 4) {
        return result;
    }

    // [N | I], with N = G^T G
    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
            let sum = 0;
            for (let i = 0; i < n; i++) {
                sum += rows[i * 4 + r] * rows[i * 4 + c];
            }
            augmented[r * 8 + c] = sum;
            augmented[r * 8 + 4 + c] = r === c ? 1 : 0;
        }
    }

    // Gauss-Jordan with partial pivoting, the right half ends up as C = N^-1
    for (let col = 0; col < 4; col++) {
        let pivotRow = col;
        for (let r = col + 1; r < 4; r++) {
            if (Math.abs(augmented[r * 8 + col]) > Math.abs(augmented[pivotRow * 8 + col])) {
                pivotRow = r;
            }
        }
        const pivot = augmented[pivotRow * 8 + col];
        if (Math.abs(pivot) < SINGULAR) {
            return result;
        }
        if (pivotRow !== col) {
            for (let c = 0; c < 8; c++) {
                const tmp = augmented[col * 8 + c];
                augmented[col * 8 + c] = augmented[pivotRow * 8 + c];
                augmented[pivotRow * 8 + c] = tmp;
            }
        }
        for (let c = 0; c < 8; c++) {
            augmented[col * 8 + c] /= pivot;
        }
        for (let r = 0; r < 4; r++) {
            if (r === col) {
                continue;
            }
            const factor = augmented[r * 8 + col];
            if (factor === 0) {
                continue;
            }
            for (let c = 0; c < 8; c++) {
                augmented[r * 8 + c] -= factor * augmented[col * 8 + c];
            }
        }
    }

    // The covariance C is symmetric. Its entry (r, c) is augmented[r * 8 + 4 + c]
    result.cNorth = augmented[4];
    result.cEast = augmented[8 + 5];
    const hdop = Math.sqrt(result.cNorth + result.cEast);
    result.hdop = hdop;
    result.epeNm = 2 * hdop * SIGMA_UERE_M / METERS_PER_NM;
    if (!(result.epeNm <= MAX_EPE_NM)) {
        return result;
    }

    // Slope of measurement i: the horizontal part of column i of H = C G^T, over sqrt(S_ii) with S = I - G H
    let maxSlope = 0;
    for (let i = 0; i < n; i++) {
        const o = i * 4;
        let hg = 0;
        for (let r = 0; r < 4; r++) {
            let hr = 0;
            for (let c = 0; c < 4; c++) {
                hr += augmented[r * 8 + 4 + c] * rows[o + c];
            }
            hg += rows[o + r] * hr;
            hColumn[r] = hr;
        }
        const h0 = hColumn[0];
        const h1 = hColumn[1];
        if (coefficients !== undefined) {
            coefficients[2 * i] = h0;
            coefficients[2 * i + 1] = -h1; // y points west
        }
        if (matrices !== undefined) {
            for (let c = 0; c < 4; c++) {
                matrices.g[o + c] = rows[o + c];
                matrices.h[c * MAX_ROWS + i] = hColumn[c];
            }
        }
        const horizontal = Math.sqrt(h0 * h0 + h1 * h1);
        const s = 1 - hg;
        let slope: number;
        if (s <= SINGULAR) {
            // Nothing checks this measurement. It only matters when it moves the horizontal position (the one
            // satellite that alone decides the vertical position cannot)
            slope = horizontal > SINGULAR ? Infinity : 0;
        } else {
            slope = horizontal / Math.sqrt(s);
        }
        if (slope > maxSlope) {
            maxSlope = slope;
        }
    }

    if (matrices !== undefined) {
        matrices.n = n;
    }
    result.valid = true;
    result.maxSlope = maxSlope;
    return result;
}

/**
 * The response of the solution to range errors (#465). The altitude row's sign is physical, so the caller enters its
 * error negated: a reading 100 m high is -ALTITUDE_WEIGHT × 100 and moves the solution up. A satellite's error enters
 * as it is (a range too long by 100 m is +100).
 * @param m The matrices of a valid `computeGeometry`
 * @param errors errors[i] is row i's whitened range error in meters
 * @param out [0] north m, [1] east m, [2] up m, [3] clock m: the shift of the solution (position −H·e, east the negative
 * of west, clock +H·e)
 * @returns the sum of the squared residuals Σ (e − G·(H·e))² in m²
 */
export function solveErrors(m: SolutionMatrices, errors: Float64Array, out: Float64Array): number {
    const n = m.n;
    for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let i = 0; i < n; i++) {
            sum += m.h[c * MAX_ROWS + i] * errors[i];
        }
        shift[c] = sum;
    }
    let sse = 0;
    for (let i = 0; i < n; i++) {
        let fit = 0;
        for (let c = 0; c < 4; c++) {
            fit += m.g[i * 4 + c] * shift[c];
        }
        const residual = errors[i] - fit;
        sse += residual * residual;
    }
    out[0] = -shift[0];
    out[1] = shift[1];
    out[2] = -shift[2];
    out[3] = shift[3];
    return sse;
}

/** The false alarm probability of the residual RAIM test */
export const RAIM_PFA = 1 / 15000; //guess

const LANCZOS = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

function logGamma(x: number): number {
    // Lanczos, g = 7, for x >= 0.5 (the half dof of 1 and up)
    const xm = x - 1;
    let a = 0.99999999999980993;
    const t = xm + 7.5;
    for (let i = 0; i < 8; i++) {
        a += LANCZOS[i] / (xm + i + 1);
    }
    return 0.5 * Math.log(2 * Math.PI) + (xm + 0.5) * Math.log(t) - t + Math.log(a);
}

/** The regularized upper incomplete gamma function Q(a, x) */
function upperGamma(a: number, x: number): number {
    if (x <= 0) {
        return 1;
    }
    const prefix = Math.exp(-x + a * Math.log(x) - logGamma(a));
    if (x < a + 1) {
        // series for P
        let term = 1 / a;
        let sum = term;
        for (let k = 1; k < 500 && Math.abs(term) > Math.abs(sum) * 1e-15; k++) {
            term *= x / (a + k);
            sum += term;
        }
        return 1 - prefix * sum;
    }
    // continued fraction (modified Lentz)
    const tiny = 1e-300;
    let b = x + 1 - a;
    let c = 1 / tiny;
    let d = 1 / b;
    let f = d;
    for (let i = 1; i < 500; i++) {
        const an = -i * (i - a);
        b += 2;
        d = an * d + b;
        if (Math.abs(d) < tiny) {
            d = tiny;
        }
        c = b + an / c;
        if (Math.abs(c) < tiny) {
            c = tiny;
        }
        d = 1 / d;
        const delta = d * c;
        f *= delta;
        if (Math.abs(delta - 1) < 1e-15) {
            break;
        }
    }
    return prefix * f;
}

const thresholds: number[] = [];

/** The chi-square value that `dof` degrees of freedom exceed with probability RAIM_PFA. `dof` is an integer of 1 or more (it indexes the cache) */
export function raimThreshold(dof: number): number {
    const cached = thresholds[dof];
    if (cached !== undefined) {
        return cached;
    }
    let lo = 0;
    let hi = 1;
    while (upperGamma(dof / 2, hi / 2) > RAIM_PFA) {
        hi *= 2;
    }
    for (let i = 0; i < 100; i++) {
        const mid = (lo + hi) / 2;
        if (upperGamma(dof / 2, mid / 2) > RAIM_PFA) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    const value = (lo + hi) / 2;
    thresholds[dof] = value;
    return value;
}

/**
 * Whether the residual test detects an error: RAIM needs five measurements, the test statistic is the residual over
 * SIGMA_UERE_M squared against the threshold of measurements − 4 degrees of freedom.
 */
export function raimTestFails(sseM2: number, measurements: number): boolean {
    return measurements >= 5 && sseM2 / (SIGMA_UERE_M * SIGMA_UERE_M) > raimThreshold(measurements - 4);
}

/**
 * The protection level HPL = max slope × SIGMA_UERE_M × RAIM_K against the alert limit.
 * RAIM needs at least five measurements, the altitude counting as one.
 */
export function raimStatus(g: GpsGeometry, halNm: number): Raim {
    if (g.measurements < 5) {
        return Raim.TooFewMeasurements;
    }
    if (g.maxSlope * SIGMA_UERE_M * RAIM_K > halNm * METERS_PER_NM) {
        return Raim.Geometry;
    }
    return Raim.Available;
}

// Scratch space of predictRaim: the lines of sight of the satellites the prediction has in use
const predictedLos: ReadonlyFloat64Array[] = [];

/**
 * Whether RAIM is predicted available for the alert limit at a place and time (6-3, 6-20): the satellites the prediction
 * context would use there (InUse, InUseDiffApplied), with the altitude row when the unit has an altitude input, through the
 * same geometry and RAIM check as the live solution. The ACTV gate predicts the FAF and the MAP with it, STA 5 the
 * destination. The prediction is for sea level, as STA 5 always made it (#214)
 * @param timeMs the time of the prediction, a Javascript timestamp
 */
export function predictRaim(prediction: GPSPredictionContext, lat: number, lon: number, timeMs: number, altitudeAided: boolean, halNm: number): boolean {
    prediction.setPosition(lat, lon, 0, timeMs).predict();
    const satellites = prediction.getSatellites();
    for (let i = 0; i < satellites.length; i++) {
        const state = satellites[i].state.get();
        const position = satellites[i].position.get();
        if ((state === GPSSatelliteState.InUse || state === GPSSatelliteState.InUseDiffApplied) && hasFiniteAngles(position)) {
            predictedLos.push(position);
        }
    }
    const available = raimStatus(computeGeometry(predictedLos, altitudeAided), halNm) === Raim.Available;
    predictedLos.length = 0;
    return available;
}
