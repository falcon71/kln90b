import {Degrees} from "./Units";

/**
 * Rounds a bearing to the given decimals and wraps it into [0, 360): north is 000, never 360 (checked in the KLN 89
 * trainer, 2026-10-07 and 2026-10-08, #263). Round first and format after, so the format never rounds up to 360.
 * @param value a bearing in [0, 360)
 * @param decimals 0 for whole degrees, 1 for tenths
 */
export function roundBearing(value: Degrees, decimals: number = 0): Degrees {
    const factor = Math.pow(10, decimals);
    const rounded = Math.round(value * factor) / factor;
    return rounded >= 360 ? rounded - 360 : rounded;
}

/**
 * Splits the magnitude of a latitude or longitude into whole degrees and minutes, the way the unit shows them (3-8,
 * 3-32): the minutes to the hundredth. The total is rounded to hundredths of a minute first, so a position that is a
 * hair below a whole degree carries into the degrees (47°00.00') and never shows 60.00 minutes.
 * @param value the coordinate in degrees, the sign is ignored
 */
export function splitDegreesMinutes(value: Degrees): { degrees: number, minutes: number } {
    const hundredths = Math.round(Math.abs(value) * 60 * 100);
    return {degrees: Math.floor(hundredths / 6000), minutes: (hundredths % 6000) / 100};
}
