import {GeoPoint, LatLonInterface} from "@microsoft/msfs-sdk";

const GEOPOINTCACHE = new GeoPoint(0, 0);

/**
 * https://edwilliams.org/avform147.htm#Intermediate
 * @param coord0
 * @param coord1
 * @param f
 */
export function intermediatePoint(coord0: LatLonInterface, coord1: LatLonInterface, f: number): GeoPoint {
    const lat1 = coord0.lat * Avionics.Utils.DEG2RAD;
    const lat2 = coord1.lat * Avionics.Utils.DEG2RAD;
    const lon1 = coord0.lon * Avionics.Utils.DEG2RAD;
    const lon2 = coord1.lon * Avionics.Utils.DEG2RAD;
    GEOPOINTCACHE.set(coord0);
    const d = GEOPOINTCACHE.distance(coord1);
    const A = (Math.sin(1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1);
    const lat = Math.atan2(z, Math.sqrt((x ** 2) + (y ** 2)));
    const lon = Math.atan2(y, x);
    return new GeoPoint(lat * Avionics.Utils.RAD2DEG, lon * Avionics.Utils.RAD2DEG);
}