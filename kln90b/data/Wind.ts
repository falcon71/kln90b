import {Degrees, Knots} from "./Units";
import {NavMath} from "@microsoft/msfs-sdk";

/**
 * https://edwilliams.org/avform147.htm#Wind
 * @param tas
 * @param windspeed
 * @param windDirection
 * @param heading
 */
export function calculateGroundspeed(tas: Knots, heading: Degrees, windspeed: Knots, windDirection: Degrees) {
    return Math.sqrt((windspeed ** 2) + (tas ** 2) - 2 * windspeed * tas * Math.cos(heading * Avionics.Utils.DEG2RAD - windDirection * Avionics.Utils.DEG2RAD));
}

/**
 * https://edwilliams.org/avform147.htm#Wind
 */
export function calculateWindspeed(tas: Knots, gs: Knots, heading: Degrees, track: Degrees): Knots {
    return Math.sqrt((tas - gs) ** 2 + 4 * tas * gs * (Math.sin(((heading - track) * Avionics.Utils.DEG2RAD) / 2)) ** 2);
}

export function calculateWindDirection(tas: Knots, gs: Knots, heading: Degrees, track: Degrees): Degrees {
    return NavMath.normalizeHeading((track * Avionics.Utils.DEG2RAD + Math.atan2(tas * Math.sin((heading - track) * Avionics.Utils.DEG2RAD), tas * Math.cos((heading - track) * Avionics.Utils.DEG2RAD) - gs)) * Avionics.Utils.RAD2DEG);
}

export function calculateHeadwind(windSpeed: Knots, windDirection: Degrees, heading: Degrees): Knots {
    return windSpeed * Math.cos((windDirection - heading) * Avionics.Utils.DEG2RAD);
}