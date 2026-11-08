/**
 * The physics of ground transmitters for GPS jamming and spoofing (#465). A pure math module: it imports only the antenna
 * curve of GpsSignal.ts and nothing else of the project. The stateful parts (the transmitters, their placement and their
 * effect on the satellites) live in other modules; this one holds the functions of one transmitter at one moment.
 *
 * Transmitters (spec section "Transmitters"): a jammer or spoofer is an antenna on a mast, so its signal travels by line
 * of sight. Past the radio horizon of mast and aircraft the signal does not stop but is diffracted around the earth and
 * falls by a loss per nautical mile (DIFFRACTION_DB_PER_NM, our guess within the "few NM to a few tens of NM" band).
 *
 * Power (spec section "Power"): a level is in dB over the thermal noise in the receiver's bandwidth. It falls with the
 * free-space spreading, 20 log10 of the distance, and with the diffraction loss, and it is raised or lowered by the
 * antenna's gain towards the transmitter (transmitterGainDb). The drawn power of a jammer is defined by the distance at
 * which it first takes the weakest satellite, and that of a spoofer by the distance at which it captures the receiver, both
 * in level flight at CALIBRATION_AGL_FT as if in line of sight (the horizon left out), with the gain at the transmitter's
 * depression there. A distance beyond the radio horizon makes a transmitter limited by the horizon: every spoofer and the
 * strong jammers.
 *
 * The gain toward a ground transmitter (decided at the final review, 2026-11-08): a satellite's curve falls to its floor at
 * the antenna's plane, but a real top-mounted L1 antenna is only some 8 to 11 dB under its zenith at its horizon (the
 * minimum gains of RTCA DO-301 and ICAO Annex 10: -7 dBic at 0 degrees, -5.5 at 5, -4 at 10, against +2 to +4 at the
 * zenith) and rolls off gradually below it, to the -20 to -25 dB near the nadir of the EEC 337 measurements (GpsSignal).
 * Above the plane the gain is the curve's, but at least PLANE_GAIN_DB; below it, PLANE_GAIN_DB less
 * BELOW_PLANE_DB_PER_DEG for each degree of depression, down to the curve's floor. A transmitter a few degrees under the
 * plane in level flight is therefore some 12 to 14 dB under the zenith, and a bank of 20 degrees toward it raises its
 * level by about 6 to 8 dB, one away lowers it.
 *
 * The noise floor and the real satellites (spec section "The noise floor and the real satellites"): jammer and fake
 * signals add to the noise that every satellite is received in. The noise rise in dB is 10 log10(1 + J + F), with J and F
 * the jammer's and the fake signals' levels as ratios. A real satellite loses that rise from its SNR.
 *
 * The fake signals (spec section "The fake signals"): a spoofer sends one fake satellite per real one it imitates. Each
 * has the SNR of a signal of its own level over the noise that the jammer and the other fake signals make, scaled by the
 * spectral separation of one C/A code from another (SPECTRAL_SEPARATION_DBHZ). The SNR therefore saturates at about 51.5
 * dB-Hz with eight fake satellites however strong the spoofer is, as the fake signals jam each other, which sits in the
 * spec's range of 51 to 54.
 *
 * Placement (spec section "Placement"): the elevation of a transmitter above the antenna's plane is taken from its bearing,
 * its elevation above the local horizon over a 4/3 earth and the aircraft's attitude. Unlike a satellite it may be below
 * the local horizon, and a banked antenna can still see it, so the below-the-horizon rule of antennaSinElevation does not
 * apply. rangeFromSinElevationM gives the range of a satellite from its elevation, for the fake satellites' delays.
 *
 * The guessed constants are marked `//guess`: the research found no published figures for them.
 */

import {ACQUIRE_SNR, antennaCurveSnr, AntennaAttitude, BACKLOBE_SNR, ZENITH_SNR} from './GpsSignal';

/** The height of a transmitter's antenna above the ground */
export const MAST_FT = 100; //guess
/** The loss beyond the radio horizon */
export const DIFFRACTION_DB_PER_NM = 2; //guess
/**
 * The C/N0 in dB-Hz of a signal whose level equals the noise it is received in: the spectral separation of one C/A code
 * from the noise of the others, as the fake signals are C/A codes on the same carrier (Betz: about 61.8 dB-Hz for C/A on
 * C/A; the value is rounded down). With eight fake satellites the SNR cap is 60 - 10 log10(7), about 51.5
 */
export const SPECTRAL_SEPARATION_DBHZ = 60; //guess
/** The gain toward a ground transmitter at the antenna's plane, under the zenith (DO-301 / ICAO Annex 10 minimum gains) */
export const PLANE_GAIN_DB = -12; //guess
/** The roll-off of that gain below the antenna's plane, dB per degree of depression (toward the EEC 337 nadir values) */
export const BELOW_PLANE_DB_PER_DEG = 0.5; //guess
/** The floor of the gain far below the plane: the satellite curve's floor under the zenith (GpsSignal BACKLOBE_SNR) */
export const FLOOR_GAIN_DB = BACKLOBE_SNR - ZENITH_SNR;
/**
 * The height above the ground of the level flight the drawn powers are defined at: a jet's cruise. A drawn distance beyond
 * its radio horizon (about 242 NM) is taken as if in line of sight. Our own choice
 */
export const CALIBRATION_AGL_FT = 35_000;
export const GPS_ORBIT_RADIUS_M = 26_560_000;
export const EARTH_RADIUS_M = 6_371_000;
export const METERS_PER_MS = 299_792.458;

const DEG = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const FT_PER_NM = 1852 / 0.3048;
const EARTH_RADIUS_NM = EARTH_RADIUS_M / 1852;

/**
 * @param aircraftAglFt The aircraft's height above the ground
 * @returns The radio horizon between a mast and the aircraft in NM
 */
export function radioHorizonNm(aircraftAglFt: number): number {
    return 1.23 * (Math.sqrt(MAST_FT) + Math.sqrt(Math.max(0, aircraftAglFt)));
}

/**
 * @returns The loss in dB beyond the radio horizon, 0 within it
 */
export function diffractionLossDb(distanceNm: number, aircraftAglFt: number): number {
    return Math.max(0, distanceNm - radioHorizonNm(aircraftAglFt)) * DIFFRACTION_DB_PER_NM;
}

/**
 * @returns The sine of the transmitter's elevation above the aircraft's local horizon over a 4/3 earth. Negative while
 * the transmitter is below it
 */
export function transmitterSinLocalElevation(distanceNm: number, aircraftAglFt: number): number {
    const distanceFt = Math.max(distanceNm, 0.1) * FT_PER_NM;
    const sin = (MAST_FT - aircraftAglFt) / distanceFt - distanceNm / (2 * 4 / 3 * EARTH_RADIUS_NM);
    return Math.max(-1, Math.min(1, sin));
}

/**
 * @param bearingTrueDeg The true bearing from the aircraft to the transmitter, clockwise from north
 * @param sinLocalElevation The sine of the transmitter's elevation above the local horizon
 * @param attitude The aircraft's attitude
 * @returns The sine of the elevation above the antenna's plane, as antennaSinElevation but without its rule for what is
 * under the local horizon
 */
export function transmitterSinAntennaElevation(bearingTrueDeg: number, sinLocalElevation: number, attitude: Readonly<AntennaAttitude>): number {
    const sinE = sinLocalElevation;
    const cosE = Math.sqrt(Math.max(0, 1 - sinE * sinE));
    const relative = (bearingTrueDeg - attitude.headingTrueDeg) * DEG;
    const phi = attitude.bankRightDeg * DEG;
    const theta = attitude.pitchUpDeg * DEG;
    return sinE * Math.cos(phi) * Math.cos(theta)
        - cosE * (Math.cos(phi) * Math.sin(theta) * Math.cos(relative) - Math.sin(phi) * Math.sin(relative));
}

/**
 * The antenna's gain toward a ground transmitter (see the module): above the plane the satellite curve's, at least
 * PLANE_GAIN_DB; below it PLANE_GAIN_DB less BELOW_PLANE_DB_PER_DEG per degree of depression, at least FLOOR_GAIN_DB
 * @param sinAntennaElevation The sine of the transmitter's elevation above the antenna's plane
 * @returns The gain in dB relative to the zenith. FLOOR_GAIN_DB for a value that is not a number
 */
export function transmitterGainDb(sinAntennaElevation: number): number {
    if (sinAntennaElevation > 0) {
        return Math.max(antennaCurveSnr(sinAntennaElevation) - ZENITH_SNR, PLANE_GAIN_DB);
    }
    if (!(sinAntennaElevation <= 0)) {
        return FLOOR_GAIN_DB;
    }
    const depressionDeg = Math.asin(Math.min(1, -sinAntennaElevation)) * RAD_TO_DEG;
    return Math.max(FLOOR_GAIN_DB, PLANE_GAIN_DB - BELOW_PLANE_DB_PER_DEG * depressionDeg);
}

/**
 * @returns The gain toward a transmitter at a horizontal distance in level flight, where the antenna's plane is the local
 * horizon: the gain at the transmitter's depression under it
 */
export function levelFlightGainDb(distanceNm: number, aircraftAglFt: number): number {
    return transmitterGainDb(transmitterSinLocalElevation(distanceNm, aircraftAglFt));
}

/**
 * @returns The level of a transmitter at the receiver in dB over the thermal noise in the receiver's bandwidth
 */
export function levelDb(powerDb: number, distanceNm: number, aircraftAglFt: number, gainDb: number): number {
    return powerDb - 20 * Math.log10(Math.max(distanceNm, 0.1)) - diffractionLossDb(distanceNm, aircraftAglFt) + gainDb;
}

export function dbToRatio(db: number): number {
    return Math.pow(10, db / 10);
}

/**
 * @param jammerRatio The jammer's level as a ratio over the thermal noise
 * @param fakeRatio The fake signals' total level as a ratio
 * @returns The rise of the noise floor in dB
 */
export function noiseRiseDb(jammerRatio: number, fakeRatio: number): number {
    return 10 * Math.log10(1 + jammerRatio + fakeRatio);
}

/**
 * @param perSatelliteRatio The level of one fake satellite as a ratio
 * @param fakeCount The number of fake satellites
 * @param jammerRatio The jammer's level as a ratio
 * @returns The SNR of one fake satellite in dB-Hz
 */
export function fakeSnr(perSatelliteRatio: number, fakeCount: number, jammerRatio: number): number {
    return 10 * Math.log10(perSatelliteRatio) + SPECTRAL_SEPARATION_DBHZ
        - 10 * Math.log10(1 + jammerRatio + (fakeCount - 1) * perSatelliteRatio);
}

/**
 * @param firstLossNm The distance at which the jammer first takes the weakest satellite
 * @returns The power whose level there, in level flight at CALIBRATION_AGL_FT as if in line of sight, gives a noise rise of
 * 7 dB, with the gain at the jammer's depression there
 */
export function jammerPowerDb(firstLossNm: number): number {
    return 10 * Math.log10(Math.pow(10, 0.7) - 1) + 20 * Math.log10(firstLossNm) - levelFlightGainDb(firstLossNm, CALIBRATION_AGL_FT);
}

/**
 * @param captureNm The distance at which the spoofer captures the receiver
 * @returns The power whose total fake level there, in level flight at CALIBRATION_AGL_FT as if in line of sight, gives a
 * noise rise of 20 dB, with the gain at the spoofer's depression there
 */
export function spooferPowerDb(captureNm: number): number {
    return 10 * Math.log10(Math.pow(10, 2) - 1) + 20 * Math.log10(captureNm) - levelFlightGainDb(captureNm, CALIBRATION_AGL_FT);
}

/**
 * Bisection on the distance of a quantity that is true near the transmitter and false far from it. The level in level
 * flight falls with the distance everywhere but in the few NM under a high aircraft, where the gain's roll-off below the
 * antenna's plane outweighs the spreading; the thresholds asked for lie far beyond, where it is monotone
 */
function bisectNm(reaches: (distanceNm: number) => boolean): number {
    let lo = 0.1;
    let hi = 2000;
    for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (reaches(mid)) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    return (lo + hi) / 2;
}

/**
 * @param riseDb The noise rise that marks the edge; 1 dB unless a stronger effect is asked for (the placement, Transmitters)
 * @returns The horizontal distance in NM where the jammer's noise rise in level flight, with the gain at its depression
 * there, falls to riseDb
 */
export function jammerEdgeNm(powerDb: number, aircraftAglFt: number, riseDb = 1): number {
    return bisectNm(d => noiseRiseDb(dbToRatio(levelDb(powerDb, d, aircraftAglFt, levelFlightGainDb(d, aircraftAglFt))), 0) > riseDb);
}

/**
 * @param snr The fake SNR that marks the edge; ACQUIRE_SNR unless another is asked for (the placement and the leave rule,
 * Transmitters)
 * @returns The horizontal distance in NM where a fake satellite's SNR in level flight falls to snr
 */
export function spooferEdgeNm(powerDb: number, fakeCount: number, aircraftAglFt: number, snr = ACQUIRE_SNR): number {
    return bisectNm(d => fakeSnr(dbToRatio(levelDb(powerDb, d, aircraftAglFt, levelFlightGainDb(d, aircraftAglFt))) / fakeCount, fakeCount, 0) > snr);
}

/**
 * @param sinElevation The sine of the satellite's elevation above the local horizon
 * @returns The slant range in meters to a satellite on the orbit radius
 */
export function rangeFromSinElevationM(sinElevation: number): number {
    const R = EARTH_RADIUS_M;
    const r = GPS_ORBIT_RADIUS_M;
    return Math.sqrt(R * R * sinElevation * sinElevation + r * r - R * R) - R * sinElevation;
}
