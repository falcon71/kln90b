/**
 * #465, final review (2026-11-08): the antenna's gain toward a ground transmitter, computed here from the ruling and not
 * from kln90b/GpsTransmitter.ts, so that the tests derive their expectations independently. The ruling: above the antenna's
 * plane the satellite curve's gain, 12 log10(sin e) (GpsSignal: 50 + 12 log10 sin e, floored at 25, less the zenith's 50),
 * but at least -12 dB; at or below the plane -12 dB less 0.5 dB per degree of depression, but at least -25 dB
 */

const FT_PER_NM = 1852 / 0.3048;
/** The 4/3 earth's radius in NM */
const EFFECTIVE_EARTH_NM = 4 / 3 * 6_371_000 / 1852;
const MAST_FT = 100;

/** The gain in dB under the zenith toward a transmitter at an elevation above the antenna's plane, in degrees */
export function gainAtElevationDb(elevationDeg: number): number {
    if (elevationDeg > 0) {
        return Math.max(-12, Math.max(-25, 12 * Math.log10(Math.sin(elevationDeg * Math.PI / 180))));
    }
    return Math.max(-25, -12 - 0.5 * -elevationDeg);
}

/**
 * The elevation in degrees of a transmitter's mast top above the aircraft's local horizon, over a 4/3 earth: its sine is
 * the height difference over the distance less the earth's drop, within -1 and 1 (close under the aircraft, where the
 * distance is shorter than the height, it is straight down)
 */
export function localElevationDeg(distanceNm: number, aglFt: number): number {
    const sin = (MAST_FT - aglFt) / (distanceNm * FT_PER_NM) - distanceNm / (2 * EFFECTIVE_EARTH_NM);
    return Math.asin(Math.max(-1, Math.min(1, sin))) * 180 / Math.PI;
}

/**
 * The elevation in degrees above the antenna's plane of a transmitter abeam on the right (or the left for a negative bank),
 * the aircraft banked right by bankRightDeg: the plane tilts toward the right by the bank
 */
export function abeamElevationDeg(distanceNm: number, aglFt: number, bankRightDeg: number): number {
    const e = localElevationDeg(distanceNm, aglFt) * Math.PI / 180;
    const phi = bankRightDeg * Math.PI / 180;
    return Math.asin(Math.sin(e) * Math.cos(phi) + Math.cos(e) * Math.sin(phi)) * 180 / Math.PI;
}

/** The gain in level flight toward a transmitter at a horizontal distance */
export function levelGainDb(distanceNm: number, aglFt: number): number {
    return gainAtElevationDb(localElevationDeg(distanceNm, aglFt));
}

/**
 * The power that gives a level in dB over the noise at an aircraft in level flight, at a horizontal distance within the
 * radio horizon: the level plus the spreading over the slant range less the gain at the transmitter's depression
 */
export function powerForLevelDb(levelDb: number, distanceNm: number, aglFt: number): number {
    const slantNm = Math.hypot(distanceNm, (aglFt - MAST_FT) / FT_PER_NM);
    return levelDb + 20 * Math.log10(slantNm) - levelGainDb(distanceNm, aglFt);
}
