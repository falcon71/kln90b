import {GeoPoint, LatLonInterface} from "@microsoft/msfs-sdk";
import {Degrees, Knots} from "../data/Units";
import {HOURS_TO_SECONDS, MAX_BANK_ANGLE} from "../data/navdata/NavCalculator";

const GEOPOINTCACHE = new GeoPoint(0, 0);

//We assume that the aircraft can change it's bank angle by 5°/s
const BANK_ANGLE_CHANGE_RATE = 5;

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

/**
 * https://edwilliams.org/avform147.htm#Turns
 * @param speed
 * @private
 */
export function bankeAngleForStandardTurn(speed: Knots) {
    return Math.min(57.3 * Math.atan(speed / 362.1), MAX_BANK_ANGLE);
}

/**
 * It is impossible to turn from 0° to 25° bank angle instantly. This calculates the distance we need to add to
 * achieve the desired bank angle change assuming a change of 5°/s
 * @param bankAngleChange
 * @param speed
 */
export function distanceToAchieveBankAngleChange(bankAngleChange: Degrees, speed: Knots) {
    return bankAngleChange / BANK_ANGLE_CHANGE_RATE * speed / HOURS_TO_SECONDS;
}