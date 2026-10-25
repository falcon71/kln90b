import {LatLonInterface, NavMath} from "@microsoft/msfs-sdk";
import {Degrees} from "../Units";
import {bearingBetween} from "./Bearing";

/**
 * Pure geometry for the OBS course. No state, no sensors: every function takes the positions it needs.
 */

/**
 * The course of the great circle from position to wpt, measured at wpt (its final course), degrees true, in [0, 360).
 *
 * The great circle crosses the meridians, so its course changes along the way. A course laid through the waypoint,
 * which is where the unit measures the OBS deviation, has to be the one the direct path has there, not the initial
 * bearing at the aircraft (5-37, #370).
 *
 * Null with the position on the waypoint: there is no great circle between the two (#426).
 */
export function courseAtWaypoint(position: LatLonInterface, wpt: LatLonInterface): Degrees | null {
    const bearingFromWpt = bearingBetween(wpt, position);
    return bearingFromWpt === null ? null : NavMath.normalizeHeading(bearingFromWpt + 180);
}
