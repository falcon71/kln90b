import {GeoPoint, LodBoundary} from "@microsoft/msfs-sdk";

export class BoundaryUtils {


    /**
     * Returns true if the point is located within the airspace boundary
     * @param boundary
     * @param lat
     * @param lon
     */
    public static isInside(boundary: LodBoundary, lat: number, lon: number): boolean {
        if (boundary.lods.length <= 0 || boundary.lods[0].length <= 0) {
            return false;
        }

        const isCrossingDateLine = boundary.facility.bottomRight.long - boundary.facility.topLeft.long > 180;
        if (isCrossingDateLine && lon <= 0) {
            lon += 360; //If the airspace crosses the dateline, we shift the entire coordinate system of the left hemisphere to the right
        }

        const lod = boundary.lods[0][0];


        let intersections = 0;
        const count = lod.length;

        let wpt1 = lod[0].end;

        //todo we are only calculating direct paths here and ignore the circle property. This means, we do not support any circular airspaces!
        for (let i = 1; i < count; i++) {
            let wpt1Lon = wpt1.lon;
            if (isCrossingDateLine && wpt1Lon <= 0) {
                wpt1Lon += 360; //If the airspace crosses the dateline, we shift the entire coordinate system of the left hemisphere to the right
            }

            if (wpt1.lat == lat && wpt1Lon == lon) {
                return true;
            }

            const wpt2 = lod[i].end;
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
     * Returns true, if the flightpath crosses the airspace boundary
     * @param boundary
     * @param lat1
     * @param lon1
     * @param lat2
     * @param lon2
     */
    public static intersects(boundary: LodBoundary, lat1: number, lon1: number, lat2: number, lon2: number): boolean {
        if (boundary.lods.length <= 0 || boundary.lods[0].length <= 0) {
            return false;
        }
        const lod = boundary.lods[0][0];

        const isCrossingDateLine = boundary.facility.bottomRight.long - boundary.facility.topLeft.long > 180;
        if (isCrossingDateLine && lon1 <= 0) {
            lon1 += 360; //If the airspace crosses the dateline, we shift the entire coordinate system of the left hemisphere to the right
        }
        if (isCrossingDateLine && lon2 <= 0) {
            lon2 += 360; //If the airspace crosses the dateline, we shift the entire coordinate system of the left hemisphere to the right
        }

        //todo we are only calculating direct paths here and ignore the circle property. This means, we do not support any circular airspaces!
        for (let current = 0; current < lod.length; current++) {
            const next = (current + 1) % (lod.length - 1);
            const lat3 = lod[current].end.lat;
            let lon3 = lod[current].end.lon;
            const lat4 = lod[next].end.lat;
            let lon4 = lod[next].end.lon;

            if (isCrossingDateLine && lon3 <= 0) {
                lon3 += 360; //If the airspace crosses the dateline, we shift the entire coordinate system of the left hemisphere to the right
            }
            if (isCrossingDateLine && lon4 <= 0) {
                lon4 += 360; //If the airspace crosses the dateline, we shift the entire coordinate system of the left hemisphere to the right
            }

            const intersection = this.getIntersectionBetweenTwoLines(lat1, lon1, lat2, lon2, lat3, lon3, lat4, lon4);

            if (intersection !== null) {
                return true;
            }
        }

        return false;
    }

    public static getIntersections(boundary: LodBoundary, lat1: number, lon1: number, lat2: number, lon2: number): GeoPoint[] {
        if (boundary.lods.length <= 0 || boundary.lods[0].length <= 0) {
            return [];
        }
        const lod = boundary.lods[0][0];
        const results: GeoPoint[] = [];

        for (let current = 0; current < lod.length; current++) {
            const next = (current + 1) % (lod.length - 1);
            const lat3 = lod[current].end.lat;
            const lon3 = lod[current].end.lon;
            const lat4 = lod[next].end.lat;
            const lon4 = lod[next].end.lon;
            const intersection = this.getIntersectionBetweenTwoLines(lat1, lon1, lat2, lon2, lat3, lon3, lat4, lon4);

            if (intersection !== null) {
                results.push(intersection);
            }
        }

        return results;
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