import {GeoPoint, LatLonInterface} from "@microsoft/msfs-sdk";
import {Degrees} from "../Units";

const FROM_CACHE = new GeoPoint(0, 0);

/**
 * The initial bearing from one point to another, degrees true. Null where the SDK has none and gives NaN: for two points
 * at the same position (within about 1e-14 rad) and for antipodal points there is no unique great circle between them.
 * A NaN would show as a blank instead of the dashes of a missing value (#426)
 */
export function bearingBetween(from: LatLonInterface, to: LatLonInterface): Degrees | null {
    const bearing = FROM_CACHE.set(from).bearingTo(to);
    return isNaN(bearing) ? null : bearing;
}
