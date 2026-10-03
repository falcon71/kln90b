/**
 * Earth radius in NM used for expectations. This is the sphere of the SDK's great-arc radian
 * (UnitType.GA_RADIAN, defined as 6378100 m in msfssdk.js:4469). The instrument's own distances
 * use this sphere, so expectations computed here model the same sphere. The formulas stay
 * independent of the SDK.
 */
export const EARTH_RADIUS_NM = 6378100 / 1852;
const RAD = Math.PI / 180;

export interface LatLon {
    lat: number;
    lon: number;
}

/** Great-circle distance in NM (haversine) */
export function distanceNm(a: LatLon, b: LatLon): number {
    const dLat = (b.lat - a.lat) * RAD;
    const dLon = (b.lon - a.lon) * RAD;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_RADIUS_NM * Math.asin(Math.sqrt(h));
}

/** Initial great-circle course from a to b, degrees true */
export function courseDeg(a: LatLon, b: LatLon): number {
    const dLon = (b.lon - a.lon) * RAD;
    const y = Math.sin(dLon) * Math.cos(b.lat * RAD);
    const x = Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) - Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos(dLon);
    return (Math.atan2(y, x) / RAD + 360) % 360;
}

/** Final course arriving at b on the great circle from a, degrees true */
export function finalCourseDeg(a: LatLon, b: LatLon): number {
    return (courseDeg(b, a) + 180) % 360;
}

export function norm360(deg: number): number {
    return ((deg % 360) + 360) % 360;
}
