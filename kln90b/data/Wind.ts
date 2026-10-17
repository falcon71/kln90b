import {Degrees, Knots} from "./Units";
import {NavMath} from "@microsoft/msfs-sdk";

/**
 * #167, 5-2, 5-3: the TAS and wind apply to the direction of flight (what those pages show). The ground speed along a
 * course is the math of it: the aircraft crabs into the wind to hold the course.
 * Returns null where the crosswind is stronger than the TAS (no heading holds the course) or no forward speed is left.
 * https://edwilliams.org/avform147.htm#Wind
 */
export function calculateGroundspeedAlongCourse(tas: Knots, course: Degrees, windspeed: Knots, windDirection: Degrees): Knots | null {
    const angle = (windDirection - course) * Avionics.Utils.DEG2RAD;
    const crosswind = windspeed * Math.sin(angle);
    const radicand = tas ** 2 - crosswind ** 2;
    if (radicand < -1e-6) {
        return null;
    }
    //the clamp absorbs rounding: sin(180 deg) is not exactly 0, which made a tailwind at TAS 0 the root of a negative
    const groundspeed = Math.sqrt(Math.max(0, radicand)) - windspeed * Math.cos(angle);
    return groundspeed > 0 ? groundspeed : null;
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