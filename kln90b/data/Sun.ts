import {TimeStamp, UTC} from "./Time";
import {Degrees} from "./Units";
import {LatLonInterface, NavMath} from "@microsoft/msfs-sdk";


//zenith 91 seems to fit best the examples from the manual
export function calculateSunrise(date: TimeStamp, coords: LatLonInterface, zenith: Degrees = 91) {
    return calculateSunriseSet(date, coords, zenith, true);
}

//zenith 91 seems to fit best the examples from the manual
export function calculateSunset(date: TimeStamp, coords: LatLonInterface, zenith: Degrees = 91) {
    return calculateSunriseSet(date, coords, zenith, false);
}

/**
 * https://edwilliams.org/sunrise_sunset_algorithm.htm
 */
function calculateSunriseSet(date: TimeStamp, coords: LatLonInterface, zenith: Degrees, isRise: boolean): TimeStamp | null {
    const utcDate = date.atTimezone(UTC);

    //1. first calculate the day of the year
    const N = calcDayOfYear(utcDate);

    //2. convert the longitude to hour value and calculate an approximate time
    const lngHour = coords.lon / 15;

    let t: number;
    if (isRise) {
        t = N + ((6 - lngHour) / 24);
    } else {
        t = N + ((18 - lngHour) / 24);
    }

    //3. calculate the Sun's mean anomaly
    const M = (0.9856 * t) - 3.289;

    //4. calculate the Sun's true longitude
    const L = NavMath.normalizeHeading(M + (1.916 * Math.sin(M * Avionics.Utils.DEG2RAD)) + (0.020 * Math.sin(2 * M * Avionics.Utils.DEG2RAD)) + 282.634);
    //NOTE: L potentially needs to be adjusted into the range [0,360) by adding/subtracting 360


    //5a. calculate the Sun's right ascension
    let RA = Math.atan(0.91764 * Math.tan(L * Avionics.Utils.DEG2RAD)) * Avionics.Utils.RAD2DEG;
    //NOTE: RA potentially needs to be adjusted into the range [0,360) by adding/subtracting 360

    //5b. right ascension value needs to be in the same quadrant as L
    const Lquadrant = (Math.floor(L / 90)) * 90;
    const RAquadrant = (Math.floor(RA / 90)) * 90;
    RA = RA + (Lquadrant - RAquadrant);

    //5c. right ascension value needs to be converted into hours
    RA = RA / 15;

    // 6. calculate the Sun's declination
    const sinDec = 0.39782 * Math.sin(L * Avionics.Utils.DEG2RAD);
    const cosDec = Math.cos(Math.asin(sinDec));

    //7a. calculate the Sun's local hour angle
    const cosH = (Math.cos(zenith * Avionics.Utils.DEG2RAD) - (sinDec * Math.sin(coords.lat * Avionics.Utils.DEG2RAD))) / (cosDec * Math.cos(coords.lat * Avionics.Utils.DEG2RAD));

    if (cosH > 1) {
        // the sun never rises on this location (on the specified date)
        return null;
    }
    if (cosH < -1) {
        //the sun never sets on this location (on the specified date)
        return null;
    }

    //7b. finish calculating H and convert into hours
    let H: number;
    if (isRise) {
        H = 360 - Math.acos(cosH) * Avionics.Utils.RAD2DEG;
    } else {
        H = Math.acos(cosH) * Avionics.Utils.RAD2DEG;
    }
    H = H / 15;


    // 8. calculate local mean time of rising/setting
    const T = H + RA - (0.06571 * t) - 6.622;


    //9. adjust back to UTC
    const UT = (T - lngHour) % 24;
    //NOTE: UT potentially needs to be adjusted into the range [0,24) by adding/subtracting 24

    const hours = Math.floor(UT);
    const minutes = (UT - hours) * 60;
    return utcDate.withTime(hours, minutes);
}

function calcDayOfYear(date: TimeStamp) {
    const month = date.getMonth() + 1;
    const N1 = Math.floor(275 * month / 9);
    const N2 = Math.floor((month + 9) / 12);
    const N3 = (1 + Math.floor((date.getYear() - 4 * Math.floor(date.getYear() / 4) + 2) / 3));
    return N1 - (N2 * N3) + date.getDate() - 30
}