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

/** a - b, signed, in (-180, 180] */
export function angleDiff(a: number, b: number): number {
    const d = ((a - b) % 360 + 540) % 360 - 180;
    return d === -180 ? 180 : d;
}

/** |a - b| in degrees, 0 to 180; a null course (no DTK) counts as 180, the farthest it can be */
export function angleBetween(a: number | null, b: number): number {
    return a === null ? 180 : Math.abs(angleDiff(a, b));
}

/** The point nm from p on the initial course bearingTrue (textbook destination formula on the same sphere) */
export function pointFrom(p: LatLon, bearingTrue: number, nm: number): LatLon {
    const d = nm / EARTH_RADIUS_NM;
    const b = bearingTrue * RAD;
    const lat1 = p.lat * RAD;
    const lon1 = p.lon * RAD;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
    const lon2 = lon1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    return {lat: lat2 / RAD, lon: ((lon2 / RAD + 540) % 360) - 180};
}

/** The point nm before `to` on the great circle from `from` */
export function pointBefore(from: LatLon, to: LatLon, nm: number): LatLon {
    return pointFrom(to, courseDeg(to, from), nm);
}

/**
 * The signed cross-track distance in NM of `position` from the great circle that passes through `through` on the true
 * course `courseTrue` there, positive right of the course. Textbook spherical cross-track: asin(sin(d13) sin(b13 - c)),
 * with d13 the angular distance and b13 the initial course from `through` to `position`. The whole great circle counts,
 * not only the part ahead of `through`, so a position behind it is measured the same way.
 */
export function crossTrackNm(position: LatLon, through: LatLon, courseTrue: number): number {
    const d13 = distanceNm(through, position) / EARTH_RADIUS_NM;
    const b13 = courseDeg(through, position);
    return EARTH_RADIUS_NM * Math.asin(Math.sin(d13) * Math.sin((b13 - courseTrue) * RAD));
}
