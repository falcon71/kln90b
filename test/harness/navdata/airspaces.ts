import {BoundaryAltitudeType, BoundaryFacility, BoundaryType, BoundaryVectorType, UnitType} from '@microsoft/msfs-sdk';
import {distanceNm, EARTH_RADIUS_NM, LatLon, pointFrom} from '../flight/geo';

/** Ids are unique per file: the SDK's LodBoundary cache is keyed by id (singletons.ts clears it between tests). */
let nextId = 1;

export interface AirspaceOptions {
    /** Default 0 */
    minFt?: number;
    /** Default 10000 */
    maxFt?: number;
    /** Default MSL */
    minType?: BoundaryAltitudeType;
    /** Default MSL */
    maxType?: BoundaryAltitudeType;
    /** Center boundaries carry a frequency that OTH 2 reads (the field is untyped in the SDK, see Oth2Page) */
    frequencyMHz?: number;
    /** The name OTH 2 shows for the Center; defaults to the airspace name (Oth2Page reads frequency.name, and fails without it) */
    frequencyName?: string;
}

function facility(name: string, type: BoundaryType, vectors: BoundaryFacility['vectors'], box: {
    top: number; left: number; bottom: number; right: number
}, o: AirspaceOptions): BoundaryFacility {
    // lods: [] makes the SDK's LodBoundary use the exact vectors as LOD 0 (msfssdk.js, LodBoundary.processLods: "From
    // the sim, LOD0 is always the original shapes"). A facility without the lods array would be simplified with the
    // Douglas-Peucker thresholds instead.
    return {
        id: nextId++, name, type,
        minAlt: UnitType.FOOT.convertTo(o.minFt ?? 0, UnitType.METER), maxAlt: UnitType.FOOT.convertTo(o.maxFt ?? 10000, UnitType.METER),
        minAltType: o.minType ?? BoundaryAltitudeType.MSL, maxAltType: o.maxType ?? BoundaryAltitudeType.MSL,
        topLeft: {lat: box.top, long: box.left}, bottomRight: {lat: box.bottom, long: box.right},
        vectors, lods: [],
        ...(o.frequencyMHz !== undefined ? {frequency: {freqMHz: o.frequencyMHz, name: o.frequencyName ?? name}} : {}),
    } as unknown as BoundaryFacility;
}

/**
 * A polygon airspace given as [lat, lon] corners; the ring is closed for you. The bounding box is the extent of the
 * corners as given, so a polygon across the date line gets the box (min lon to max lon) that BoundaryUtils expects.
 */
export function airspace(name: string, type: BoundaryType, polygon: [number, number][], o: AirspaceOptions = {}): BoundaryFacility {
    const ring = [...polygon, polygon[0]];
    const lats = polygon.map(p => p[0]);
    const lons = polygon.map(p => p[1]);
    const vectors = ring.map(([lat, lon], i) => ({
        type: i === 0 ? BoundaryVectorType.Start : BoundaryVectorType.Line, originId: 0, lat, lon, radius: 0,
    }));
    return facility(name, type, vectors, {top: Math.max(...lats), left: Math.min(...lons), bottom: Math.min(...lats), right: Math.max(...lons)}, o);
}

/** The bounding box of a circle: its north and south points, and the longitudes where its east and west edges peak */
function circleBox(lat: number, lon: number, radiusNm: number): { top: number; left: number; bottom: number; right: number } {
    const dLat = (radiusNm / EARTH_RADIUS_NM) * 180 / Math.PI;
    const dLon = Math.asin(Math.min(1, Math.sin(radiusNm / EARTH_RADIUS_NM) / Math.cos(lat * Math.PI / 180))) * 180 / Math.PI;
    return {top: lat + dLat, left: lon - dLon, bottom: lat - dLat, right: lon + dLon};
}

/**
 * A circular airspace: an Origin vector and a Circle vector (radius in meters), the form the sim uses. The SDK's
 * LodBoundary turns it into a two-point shape that carries the circle, which BoundaryUtils cuts into a polyline (#209).
 */
export function circularAirspace(name: string, type: BoundaryType, center: [number, number], radiusNm: number, o: AirspaceOptions = {}): BoundaryFacility {
    const [lat, lon] = center;
    const radiusM = UnitType.NMILE.convertTo(radiusNm, UnitType.METER);
    const vectors = [
        {type: BoundaryVectorType.Origin, originId: 1, lat, lon, radius: 0},
        {type: BoundaryVectorType.Circle, originId: 1, lat, lon, radius: radiusM},
    ];
    return facility(name, type, vectors, circleBox(lat, lon, radiusNm), o);
}

/**
 * A pie slice: a Line from the center out to the point at fromBearing, an ArcCW around the center to the point at
 * toBearing, and a Line back to the center, the vectors the sim uses for arcs (an Origin, then the arc to its end). The
 * SDK takes an arc's radius from its end point, so startOffsetNm moves the arc's start that far outward, off its
 * circle, as real data sometimes has it. counterClockwise makes the arc an ArcCCW, which runs from fromBearing
 * counterclockwise to toBearing. The bounding box is the full circle's.
 */
export function arcSectorAirspace(name: string, type: BoundaryType, center: [number, number], radiusNm: number, fromBearing: number,
                                  toBearing: number, o: AirspaceOptions & { startOffsetNm?: number, counterClockwise?: boolean } = {}): BoundaryFacility {
    const [lat, lon] = center;
    const from = pointFrom({lat, lon}, fromBearing, radiusNm + (o.startOffsetNm ?? 0));
    const to = pointFrom({lat, lon}, toBearing, radiusNm);
    const vectors = [
        {type: BoundaryVectorType.Start, originId: 0, lat, lon, radius: 0},
        {type: BoundaryVectorType.Line, originId: 0, lat: from.lat, lon: from.lon, radius: 0},
        {type: BoundaryVectorType.Origin, originId: 1, lat, lon, radius: 0},
        {type: o.counterClockwise ? BoundaryVectorType.ArcCCW : BoundaryVectorType.ArcCW, originId: 1, lat: to.lat, lon: to.lon, radius: 0},
        {type: BoundaryVectorType.Line, originId: 0, lat, lon, radius: 0},
    ];
    return facility(name, type, vectors, circleBox(lat, lon, radiusNm), o);
}

/**
 * An airspace of two shapes, the way a boundary can carry several: a polygon of [lat, lon] corners (closed for you),
 * then a circle around circleCenter. The bounding box covers both.
 */
export function multiShapeAirspace(name: string, type: BoundaryType, polygon: [number, number][], circleCenter: [number, number],
                                   circleRadiusNm: number, o: AirspaceOptions = {}): BoundaryFacility {
    const ring = [...polygon, polygon[0]];
    const [lat, lon] = circleCenter;
    const vectors = [
        ...ring.map(([pLat, pLon], i) => ({
            type: i === 0 ? BoundaryVectorType.Start : BoundaryVectorType.Line, originId: 0, lat: pLat, lon: pLon, radius: 0,
        })),
        {type: BoundaryVectorType.Origin, originId: 1, lat, lon, radius: 0},
        {type: BoundaryVectorType.Circle, originId: 1, lat, lon, radius: UnitType.NMILE.convertTo(circleRadiusNm, UnitType.METER)},
    ];
    const box = circleBox(lat, lon, circleRadiusNm);
    const lats = polygon.map(p => p[0]);
    const lons = polygon.map(p => p[1]);
    return facility(name, type, vectors, {
        top: Math.max(box.top, ...lats), left: Math.min(box.left, ...lons), bottom: Math.min(box.bottom, ...lats), right: Math.max(box.right, ...lons),
    }, o);
}

/**
 * Distance in NM from a point to the airspace's bounding box: the great-circle distance to the point of the box nearest
 * in latitude and longitude, 0 inside. The sim's boundary search is inferred to select by bounding box (see
 * MemoryFacilityClient).
 */
export function distanceToBoxNm(lat: number, lon: number, a: BoundaryFacility): number {
    const nearest: LatLon = {
        lat: Math.min(Math.max(lat, a.bottomRight.lat), a.topLeft.lat),
        lon: Math.min(Math.max(lon, a.topLeft.long), a.bottomRight.long),
    };
    return distanceNm({lat, lon}, nearest);
}
