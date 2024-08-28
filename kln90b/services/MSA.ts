import {Feet} from "../data/Units";
import {GeoPoint, LatLonInterface, UnitType} from "@microsoft/msfs-sdk";
import {intermediatePoint} from "./KLNNavmath";

/**
 * 3-33
 * Since the sim does not expose MSAs, we have to rely on our own data. The data was generated using a DEM and
 * does not account for obstacles.
 */
export class MSA {

    private msaTable: number[][] | undefined;
    private GEOPOINTCACHE: GeoPoint = new GeoPoint(0, 0);

    public getMSA(coord: LatLonInterface): Feet | null {
        if (coord.lat >= 75 || coord.lat < -56) {
            return null;
        }
        const latTable = this.msaTable![Math.floor(coord.lat) + 56];
        return latTable[Math.floor(coord.lon) + 180];
    }

    public getMSAFromTo(coord0: LatLonInterface, coord1: LatLonInterface): Feet | null {
        if (GeoPoint.equals(coord0, coord1)) {
            return this.getMSA(coord0);
        }

        let msa: number | null = 0;
        let f = 0;
        this.GEOPOINTCACHE.set(coord0);
        const fDiff = 40 / UnitType.GA_RADIAN.convertTo(this.GEOPOINTCACHE.distance(coord1), UnitType.NMILE);
        while (f <= 1) {
            const coord = intermediatePoint(coord0, coord1, f);
            const msa2 = this.getMSA(coord);
            if (msa2 === null || msa === null) {
                msa = null;
            } else {
                msa = Math.max(msa, msa2);
            }
            f = f + fDiff;
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