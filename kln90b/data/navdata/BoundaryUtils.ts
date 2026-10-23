import {GeoPoint, LatLonInterface, LodBoundary, LodBoundaryShape, UnitType} from "@microsoft/msfs-sdk";

/**
 * The most a chord of an arc or a circle may lie off the curve, in NM. #209: the sim hands out true arcs and circles;
 * they are cut into chords once per boundary, fine enough that the flat algorithms below read them as curves.
 */
export const ARC_CHORD_TOLERANCE_NM = 0.05;

/** The closed rings of a boundary, built on first use and kept as long as the boundary lives */
const ringCache = new WeakMap<LodBoundary, readonly (readonly LatLonInterface[])[]>();

const projected = new GeoPoint(0, 0);
const offset = new GeoPoint(0, 0);

export class BoundaryUtils {


    /**
     * Returns true if the point is located within the airspace boundary
     * @param boundary
     * @param lat
     * @param lon
     */
    public static isInside(boundary: LodBoundary, lat: number, lon: number): boolean {
        const rings = this.rings(boundary);
        if (rings.length <= 0) {
            return false;
        }

        const isCrossingDateLine = boundary.facility.bottomRight.long - boundary.facility.topLeft.long > 180;
        if (isCrossingDateLine && lon <= 0) {
            lon += 360; //If the airspace crosses the dateline, we shift the entire coordinate system of the left hemisphere to the right
        }

        for (const ring of rings) {
            if (this.isInsideRing(ring, lat, lon, isCrossingDateLine)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Returns true, if the flightpath crosses the airspace boundary
     * @param boundary
     * @param lat1
     * @param lon1
     * @param lat2
     * @param lon2
     */
    public static intersects(boundary: LodBoundary, lat1: number, lon1: number, lat2: number, lon2: number): boolean {
        return this.getIntersections(boundary, lat1, lon1, lat2, lon2).length > 0;
    }

    /**
     * Returns the points, where the flightpath crosses the airspace boundary
     * @param boundary
     * @param lat1
     * @param lon1
     * @param lat2
     * @param lon2
     */
    public static getIntersections(boundary: LodBoundary, lat1: number, lon1: number, lat2: number, lon2: number): GeoPoint[] {
        const rings = this.rings(boundary);
        if (rings.length <= 0) {
            return [];
        }
        const results: GeoPoint[] = [];

        //#106: the path and the ring are unwrapped into one continuous longitude range around the box, so that neither
        //the date line nor the prime meridian splits them. A box wider than 180 degrees is the code's sign of a box across
        //the date line (#9); its reference is 180, otherwise the middle of the box. GeoPoint normalizes the results.
        const left = boundary.facility.topLeft.long;
        const right = boundary.facility.bottomRight.long;
        const reference = right - left > 180 ? 180 : (left + right) / 2;
        const unwrap = (lon: number) => lon + 360 * Math.round((reference - lon) / 360);
        const pathLon1 = unwrap(lon1);
        const pathLon2 = pathLon1 + (((lon2 - lon1) % 360 + 540) % 360 - 180);

        for (const ring of rings) {
            // The ring is closed (the last point equals the first), so the edges run from point 0 to the last point
            for (let current = 0; current < ring.length - 1; current++) {
                const next = current + 1;
                const lat3 = ring[current].lat;
                const lon3 = unwrap(ring[current].lon);
                const lat4 = ring[next].lat;
                const lon4 = unwrap(ring[next].lon);
                const intersection = this.getIntersectionBetweenTwoLines(lat1, pathLon1, lat2, pathLon2, lat3, lon3, lat4, lon4);

                if (intersection !== null) {
                    results.push(intersection);
                }
            }
        }

        return results;
    }

    /**
     * The lateral distance from the point to the nearest edge of the boundary in NM: 0 inside, Infinity for a boundary
     * without shapes (#189). The edges are measured in a flat plane around the point (x = longitude difference times
     * cos(lat), y = latitude difference, 60 NM per degree), which is exact enough for the 2 NM of the alert. Arcs and
     * circles are measured along the chords of their polyline (#209).
     * @param boundary
     * @param lat
     * @param lon
     */
    public static distanceToBoundaryNm(boundary: LodBoundary, lat: number, lon: number): number {
        if (this.isInside(boundary, lat, lon)) {
            return 0;
        }

        const kLon = 60 * Math.cos(lat * Math.PI / 180);
        // The difference of two longitudes in degrees, taken the short way round the globe, so that the date line splits
        // neither the point from the ring nor an edge from itself (#9)
        const wrap = (degrees: number) => degrees - 360 * Math.round(degrees / 360);

        let nearestSquared = Infinity;
        for (const ring of this.rings(boundary)) {
            // The ring is closed (the last point equals the first), so the edges run from point 0 to the last point
            let x1 = wrap(ring[0].lon - lon) * kLon;
            let y1 = (ring[0].lat - lat) * 60;
            for (let i = 1; i < ring.length; i++) {
                const x2 = x1 + wrap(ring[i].lon - ring[i - 1].lon) * kLon;
                const y2 = (ring[i].lat - lat) * 60;

                // The point is the origin: the closest point of the edge is the one along it closest to 0, 0
                const dx = x2 - x1;
                const dy = y2 - y1;
                const lengthSquared = dx * dx + dy * dy;
                const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(x1 * dx + y1 * dy) / lengthSquared));
                const px = x1 + t * dx;
                const py = y1 + t * dy;
                nearestSquared = Math.min(nearestSquared, px * px + py * py);

                x1 = x2;
                y1 = y2;
            }
        }
        return Math.sqrt(nearestSquared);
    }

    /**
     * The ray cast of isInside over one closed ring. lon is already shifted for a boundary across the date line.
     */
    private static isInsideRing(ring: readonly LatLonInterface[], lat: number, lon: number, isCrossingDateLine: boolean): boolean {
        let intersections = 0;
        const count = ring.length;

        let wpt1 = ring[0];

        for (let i = 1; i < count; i++) {
            let wpt1Lon = wpt1.lon;
            if (isCrossingDateLine && wpt1Lon <= 0) {
                wpt1Lon += 360; //If the airspace crosses the dateline, we shift the entire coordinate system of the left hemisphere to the right
            }

            if (wpt1.lat == lat && wpt1Lon == lon) {
                return true;
            }

            const wpt2 = ring[i];
            let wpt2Lon = wpt2.lon;
            if (isCrossingDateLine && wpt2Lon <= 0) {
                wpt2Lon += 360; //If the airspace crosses the dateline, we shift the entire coordinate system of the left hemisphere to the right
            }


            if (wpt1.lat == wpt2.lat && wpt1.lat == lat && lon > Math.min(wpt1Lon, wpt2Lon) && lon < Math.max(wpt1Lon, wpt2Lon)) { // Check if point is on a horizontal polygon boundary
                return true;
            }
            if (lat > Math.min(wpt1.lat, wpt2.lat) && lat <= Math.max(wpt1.lat, wpt2.lat) && lon <= Math.max(wpt1Lon, wpt2Lon) && wpt1.lat != wpt2.lat) {
                const xinters = (lat - wpt1.lat) * (wpt2Lon - wpt1Lon) / (wpt2.lat - wpt1.lat) + wpt1Lon;
                if (xinters == lon) { // Check if point is on the polygon boundary (other than horizontal)
                    return true;
                }
                if (wpt1Lon == wpt2Lon || lon <= xinters) {
                    intersections++;
                }
            }
            wpt1 = wpt2;
        }

        // if the number of edges we passed through is odd, then it's in the poly.
        return intersections % 2 != 0;
    }

    /**
     * One closed ring (the last point equals the first) per shape of the boundary's LOD 0, built on first use and cached.
     * Lines stay single segments; arcs and circles are cut into chords no more than ARC_CHORD_TOLERANCE_NM off the curve
     * (#209).
     * @param boundary
     */
    private static rings(boundary: LodBoundary): readonly (readonly LatLonInterface[])[] {
        let rings = ringCache.get(boundary);
        if (rings === undefined) {
            rings = boundary.lods.length > 0 ? boundary.lods[0].filter(shape => shape.length > 0).map(shape => this.ring(shape)) : [];
            ringCache.set(boundary, rings);
        }
        return rings;
    }

    /**
     * The closed ring of one shape. A shape starts with an element that has only its end; every further element runs
     * along its circle from the previous end to its own: a great circle for a line, a small circle for an arc or a full
     * circle.
     * @param shape
     */
    private static ring(shape: Readonly<LodBoundaryShape>): LatLonInterface[] {
        const ring: LatLonInterface[] = [{lat: shape[0].end.lat, lon: shape[0].end.lon}];

        for (let i = 1; i < shape.length; i++) {
            const prev = ring[ring.length - 1];
            const {circle, end} = shape[i];

            if (circle !== undefined && !circle.isGreatCircle()) {
                //The SDK takes an arc's radius from its end point, so the start can lie off the circle: the curve starts at
                //the point of the circle closest to it. A start at the center has no closest point; it gets a line.
                circle.closest(prev, projected);
                if (!isNaN(projected.lat)) {
                    //A full circle starts and ends at the same point
                    const sweep = projected.equals(end) ? 2 * Math.PI : circle.angleAlong(projected, end, Math.PI);
                    //An ArcCW is a reversed circle, whose radius is measured from the antipode of the center
                    const radiusNm = UnitType.GA_RADIAN.convertTo(Math.min(circle.radius, Math.PI - circle.radius), UnitType.NMILE);
                    const step = 2 * Math.acos(Math.max(-1, 1 - ARC_CHORD_TOLERANCE_NM / radiusNm));
                    const n = Math.max(1, Math.ceil(sweep / step));

                    if (!projected.equals(prev)) {
                        ring.push({lat: projected.lat, lon: projected.lon});
                    }
                    for (let k = 1; k < n; k++) {
                        circle.offsetAngleAlong(projected, sweep * k / n, offset);
                        ring.push({lat: offset.lat, lon: offset.lon});
                    }
                }
            }

            ring.push({lat: end.lat, lon: end.lon});
        }

        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first.lat !== last.lat || first.lon !== last.lon) {
            ring.push({lat: first.lat, lon: first.lon});
        }
        return ring;
    }

    private static getIntersectionBetweenTwoLines(lat1: number, lon1: number, lat2: number, lon2: number, lat3: number, lon3: number, lat4: number, lon4: number): GeoPoint | null {
        const fakt = ((lon4 - lon3) * (lat2 - lat1) - (lat4 - lat3) * (lon2 - lon1));
        if (fakt == 0) { //One of the parameter was a point and not a line
            return null;
        }

        //https://stackoverflow.com/a/565282
        const uA = ((lat4 - lat3) * (lon1 - lon3) - (lon4 - lon3) * (lat1 - lat3)) / fakt;
        const uB = ((lat2 - lat1) * (lon1 - lon3) - (lon2 - lon1) * (lat1 - lat3)) / fakt;

        if (uA < 0 || uA > 1 || uB < 0 || uB > 1) {
            return null;
        }

        // if uA and uB are between 0-1, lines are colliding
        return new GeoPoint(lat1 + (lat2 - lat1) * uA, lon3 + (lon4 - lon3) * uB);
    }


}
