import {Feet} from "../data/Units";
import {GeoCircle, GeoPoint, LatLonInterface} from "@microsoft/msfs-sdk";

/** Crossings closer than this to an end of a leg are the end itself, in great-arc radians (about 6 mm, #181) */
const END_TOLERANCE = 1e-9;

/**
 * Returns the lowest and the highest latitude of the great circle leg from coord0 to coord1: the end points, and the
 * vertex of the great circle where it lies inside the leg (#181)
 */
export function legLatitudeRange(coord0: LatLonInterface, coord1: LatLonInterface): [number, number] {
    let min = Math.min(coord0.lat, coord1.lat);
    let max = Math.max(coord0.lat, coord1.lat);
    const path = new GeoCircle(new Float64Array(3), 0).setAsGreatCircle(coord0, coord1);
    const length = new GeoPoint(coord0.lat, coord0.lon).distance(coord1);
    const n = path.center;
    const k = Math.sqrt(1 - n[2] * n[2]); // the cosine of the latitude of the circle's pole
    if (k > 1e-9) {
        //the northern vertex is the point of the circle closest to the north pole, the southern one its antipode
        const north = new Float64Array([-n[2] * n[0] / k, -n[2] * n[1] / k, k]);
        const south = new Float64Array([-north[0], -north[1], -north[2]]);
        const vertexLat = Math.asin(k) * Avionics.Utils.RAD2DEG;
        const alongNorth = path.distanceAlong(coord0, north, 1e-9);
        if (alongNorth > 0 && alongNorth < length) {
            max = Math.max(max, vertexLat);
        }
        const alongSouth = path.distanceAlong(coord0, south, 1e-9);
        if (alongSouth > 0 && alongSouth < length) {
            min = Math.min(min, -vertexLat);
        }
    }
    return [min, max];
}

/**
 * 3-33
 * Since the sim does not expose MSAs, we have to rely on our own data. The data was generated using a DEM and
 * does not account for obstacles.
 */
export class MSA {

    private msaTable: number[][] | undefined;
    private GEOPOINTCACHE: GeoPoint = new GeoPoint(0, 0);
    private readonly PATH = new GeoCircle(new Float64Array(3), 0);
    private readonly GRID_LINE = new GeoCircle(new Float64Array(3), 0);
    private readonly CROSSINGS = [new Float64Array(3), new Float64Array(3)];

    public getMSA(coord: LatLonInterface): Feet | null {
        if (coord.lat >= 75 || coord.lat < -56) {
            return null;
        }
        const latTable = this.msaTable![Math.floor(coord.lat) + 56];
        return latTable[(Math.floor(coord.lon) + 180) % 360]; //180E is 180W, the file's 361st column is only a filler
    }

    /**
     * 3-33: the ESA of a leg is the highest MSA of the 1-degree sectors it passes through. #181: the great circle of the
     * leg is cut at every whole-degree meridian and parallel it crosses; each piece between two cuts lies in one sector,
     * so its middle reads that sector
     */
    public getMSAFromTo(coord0: LatLonInterface, coord1: LatLonInterface): Feet | null {
        if (GeoPoint.equals(coord0, coord1)) {
            return this.getMSA(coord0);
        }
        const path = this.PATH.setAsGreatCircle(coord0, coord1);
        const length = this.GEOPOINTCACHE.set(coord0).distance(coord1);
        const cuts = [0, length];
        const addCuts = () => {
            const count = path.intersection(this.GRID_LINE, this.CROSSINGS);
            for (let i = 0; i < count; i++) {
                const along = path.distanceAlong(coord0, this.CROSSINGS[i], 1e-9);
                //A crossing at an end point is no cut (an end point on a whole degree is common, e.g. 50N 30W): the
                //piece of no length before it would read a point on the grid line, in either sector by rounding
                if (along > END_TOLERANCE && along < length - END_TOLERANCE) {
                    cuts.push(along);
                }
            }
        };

        //the parallels within the leg's latitudes (the vertex included), as small circles around the north pole
        const [minLat, maxLat] = legLatitudeRange(coord0, coord1);
        for (let lat = Math.max(-89, Math.ceil(minLat)); lat <= Math.min(89, Math.floor(maxLat)); lat++) {
            this.GRID_LINE.set(new Float64Array([0, 0, 1]), (90 - lat) * Avionics.Utils.DEG2RAD);
            addCuts();
        }
        //the meridians between the two longitudes, the short way round
        const dLon = ((coord1.lon - coord0.lon) % 360 + 540) % 360 - 180;
        const lonFrom = Math.min(coord0.lon, coord0.lon + dLon);
        const lonTo = Math.max(coord0.lon, coord0.lon + dLon);
        for (let lon = Math.ceil(lonFrom); lon <= Math.floor(lonTo); lon++) {
            const l = lon * Avionics.Utils.DEG2RAD;
            this.GRID_LINE.set(new Float64Array([-Math.sin(l), Math.cos(l), 0]), Math.PI / 2);
            addCuts();
        }

        cuts.sort((a, b) => a - b);
        let msa: number | null = 0;
        const sample = (coord: LatLonInterface) => {
            const msa2 = this.getMSA(coord);
            msa = msa2 === null || msa === null ? null : Math.max(msa, msa2);
        };
        //The end points read their own sectors; a point offset along the path could land a hair beside a grid line
        sample(coord0);
        sample(coord1);
        for (let i = 1; i < cuts.length; i++) {
            sample(path.offsetDistanceAlong(coord0, (cuts[i - 1] + cuts[i]) / 2, this.GEOPOINTCACHE));
        }
        return msa;
    }

    public getMSAForRoute(coords: LatLonInterface[]): Feet | null {
        let esa: number | null = 0;
        for (let i = 1; i < coords.length; i++) {
            const legEsa = this.getMSAFromTo(coords[i - 1], coords[i]);
            if (legEsa === null) {
                return null
            }
            esa = Math.max(esa, legEsa);
        }
        return esa;
    }

    public async init(basePath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = new XMLHttpRequest();
            request.onreadystatechange = () => {
                if (request.readyState === XMLHttpRequest.DONE) {
                    if (request.status === 200) {
                        this.msaTable = JSON.parse(request.responseText);
                        resolve();
                    } else {
                        reject(`Could not initialize msa table: ${request.status}`);
                    }
                }
            };
            request.open('GET', `coui://${basePath}/Assets/msa.json`);
            request.send();
        });
    }
}