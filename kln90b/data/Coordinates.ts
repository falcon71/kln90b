import {Degrees} from "./Units";

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
