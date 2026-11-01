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
 * with w = SIGMA_UERE_M / SIGMA_ALT_M.
 *
 * This is a pure math module: it imports nothing from the project, so that Gps can import it without a cycle. The alert
 * limit of a flight phase is `halForMode` in services/ModeController.
 */

/** The ranging error of one satellite in meters (1 sigma): single frequency, no selective availability */
export const SIGMA_UERE_M = 5;
/** The error of the altitude input in meters: 100 ft encoder steps plus the error of the altimeter setting */
export const SIGMA_ALT_M = 30;
/** The protection level factor for a missed-detection probability of 0.001 */
export const RAIM_K = 5.3;
/** B-4: above this error estimate the solution is not valid */
export const MAX_EPE_NM = 3.8;

const METERS_PER_NM = 1852;
const SINGULAR = 1e-9;
/** More rows than any receiver has channels, so the scratch arrays never overflow. Extra satellites are ignored */
const MAX_ROWS = 16;

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
    /** The 95% error estimate: 2 × HDOP × SIGMA_UERE_M. NaN when the normal matrix is singular */
    epeNm: number;
    /** The largest horizontal slope over all measurements. Infinity when the geometry is invalid */
    maxSlope: number;
}

// Scratch space: a call allocates nothing but its result
const rows = new Float64Array(MAX_ROWS * 4);
const augmented = new Float64Array(4 * 8);
const los = new Float64Array(3);

/**
 * @param satellites [zenith, azimuth] in rad of each satellite in use, as GPSSatellite.position.get() returns it
 * @param altitudeAided whether the altitude input is present
 */
export function computeGeometry(satellites: readonly ReadonlyFloat64Array[], altitudeAided: boolean): GpsGeometry {
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
        rows[n * 4 + 2] = SIGMA_UERE_M / SIGMA_ALT_M;
        rows[n * 4 + 3] = 0;
        n++;
    }

    const result: GpsGeometry = {
        valid: false,
        satellites: satelliteCount,
        altitudeAided: altitudeAided,
        measurements: n,
        hdop: NaN,
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
    const hdop = Math.sqrt(augmented[4] + augmented[8 + 5]);
    result.hdop = hdop;
    result.epeNm = 2 * hdop * SIGMA_UERE_M / METERS_PER_NM;
    if (!(result.epeNm <= MAX_EPE_NM)) {
        return result;
    }

    // Slope of measurement i: the horizontal part of column i of H = C G^T, over sqrt(S_ii) with S = I - G H
    let maxSlope = 0;
    for (let i = 0; i < n; i++) {
        const o = i * 4;
        let h0 = 0;
        let h1 = 0;
        let hg = 0;
        for (let c = 0; c < 4; c++) {
            h0 += augmented[4 + c] * rows[o + c];
            h1 += augmented[8 + 4 + c] * rows[o + c];
        }
        for (let r = 0; r < 4; r++) {
            let hr = 0;
            for (let c = 0; c < 4; c++) {
                hr += augmented[r * 8 + 4 + c] * rows[o + c];
            }
            hg += rows[o + r] * hr;
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

    result.valid = true;
    result.maxSlope = maxSlope;
    return result;
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
        if (state === GPSSatelliteState.InUse || state === GPSSatelliteState.InUseDiffApplied) {
            predictedLos.push(satellites[i].position.get());
        }
    }
    const available = raimStatus(computeGeometry(predictedLos, altitudeAided), halNm) === Raim.Available;
    predictedLos.length = 0;
    return available;
}
