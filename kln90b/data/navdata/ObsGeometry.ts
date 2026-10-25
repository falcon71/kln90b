import {GeoPoint, LatLonInterface, NavMath} from "@microsoft/msfs-sdk";
import {Degrees} from "../Units";

/**
 * Pure geometry for the OBS course. No state, no sensors: every function takes the positions it needs.
 */

const WPT_CACHE = new GeoPoint(0, 0);

/**
 * The course of the great circle from position to wpt, measured at wpt (its final course), degrees true, in [0, 360).
 *
 * The great circle crosses the meridians, so its course changes along the way. A course laid through the waypoint,
 * which is where the unit measures the OBS deviation, has to be the one the direct path has there, not the initial
 * bearing at the aircraft (5-37, #370).
 */
export function courseAtWaypoint(position: LatLonInterface, wpt: LatLonInterface): Degrees {
    return NavMath.normalizeHeading(WPT_CACHE.set(wpt).bearingTo(position) + 180);
}
