import {FacilitySearchType, FacilityType, ICAO} from "@microsoft/msfs-sdk";
import {KLNFacilityLoader} from "./KLNFacilityLoader";
import {KLNFacilityRepository} from "./KLNFacilityRepository";

const CACHE_SIZE = 1000;

const CHARSET = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

export const MAX_SCROLL_SPEED = CACHE_SIZE / 2;

export class Scanlists {
    public readonly aptScanlist: Scanlist;
    public readonly vorScanlist: Scanlist;
    public readonly ndbScanlist: Scanlist;
    public readonly intScanlist: Scanlist;
    public readonly supScanlist: SupScanlist;


    constructor(facilityLoader: KLNFacilityLoader) {
        this.aptScanlist = new FacilityLoaderScanlist(FacilitySearchType.Airport, facilityLoader);
        this.vorScanlist = new FacilityLoaderScanlist(FacilitySearchType.Vor, facilityLoader);
        this.ndbScanlist = new FacilityLoaderScanlist(FacilitySearchType.Ndb, facilityLoader);
        this.intScanlist = new FacilityLoaderScanlist(FacilitySearchType.Intersection, facilityLoader);
        this.supScanlist = new SupScanlist(FacilitySearchType.User, facilityLoader.getFacilityRepo());
    }

}

export interface Scanlist {
    isEmpty(): boolean;

    /**
     * Gets the first waypoint in the list. null if no waypoints exists (should only occur for SUP)
     */
    start(): Promise<string | null>;

    /**
     * Gets the last waypoint in the list. null if no waypoints exists (should only occur for SUP)
     */
    end(): Promise<string | null>;

    /**
     * Gets the next waypoint from the list in the specified direction
     * @param icao
     * @param direction -1 or 1 for the previous or next waypoint. 10 would select the tenths next waypoint
     */
    getNext(icao: string, direction: number): Promise<string | null>;
}

/**
 * 3-21
 * THE KLN can select a waypoint by scanning. Normalliy, this would be simple, since you could just keep an array of
 * ICAOs and an Index
 *
 * We however do not want to keep every single ICAO code in memory. Therefore we use a cache as a window and selectively
 * query searchByIdent.
 * We never know an our absolute waypoint index, however, we can move forward and backwards within our window.
 */
export class FacilityLoaderScanlist implements Scanlist {

    private icaoListCache: string[] = [];


    constructor(private readonly facilitySearchType: FacilitySearchType, private readonly facilityLoader: KLNFacilityLoader) {
    }

    public isEmpty(): boolean {
        return this.icaoListCache.length === 0;
    }

    /**
     * Gets the first waypoint in the list. null if no waypoints exists (should only occur for SUP)
     */
    public async start(): Promise<string | null> {
        await this.buildList("       0    ", 1);
        if (this.icaoListCache.length > 0) {
            return this.icaoListCache[0];
        } else {
            return null;
        }
    }

    /**
     * Gets the last waypoint in the list. null if no waypoints exists (should only occur for SUP)
     */
    public async end(): Promise<string | null> {
        await this.buildList("       ZZZZZ", 1);
        if (this.icaoListCache.length > 0) {
            return this.icaoListCache[0];
        } else {
            return null;
        }
    }

    /**
     * Gets the next waypoint from the list in the specified direction
     * @param icao
     * @param direction -1 or 1 for the previous or next waypoint. 10 would select the tenths next waypoint
     */
    public async getNext(icao: string, direction: number): Promise<string | null> {
        if (direction === 0) {
            throw new Error("Direction must not be 0");
        }
        if (Math.abs(direction) > MAX_SCROLL_SPEED) {
            throw new Error(`direction${direction} is to large. Max: ${CACHE_SIZE / 2}`);
        } else if (Math.abs(direction) === MAX_SCROLL_SPEED) {
            //maximum speed. Rebuilding the cache is to0 slow for this, so we simply jump to the next full ident Letter
            const nextFullIdentLetter = this.getNextIdentSearch(ICAO.getIdent(icao).substring(0, 1), direction);
            if (nextFullIdentLetter !== null) {
                icao = `       ${nextFullIdentLetter.padEnd(5, " ")}`;
                direction = 0;
            }
        }

        await this.buildList(icao, direction);

        if (this.isEmpty()) {
            return null;
        }

        let listIndex = this.icaoListCache.indexOf(icao);
        if (listIndex === -1) {
            listIndex = this.findClosest(icao, direction);
        }

        const nextIndex = Utils.Clamp(listIndex + direction, 0, this.icaoListCache.length - 1);
        if (nextIndex === listIndex) {
            return null; //Start or end of the list
        }

        return this.icaoListCache[nextIndex];
    }

    /**
     * Happens, when the user has selected an ident, that does not exist
     * We now look by the ident to find the next closest entry, respecting the search direction
     * @param icao
     * @param direction
     * @private
     */
    private findClosest(icao: string, direction: number): number {
        const targetIdent = ICAO.getIdent(icao);
        let sign = Math.sign(direction) * -1;
        if (sign === 0) {
            sign = -1;
        }
        return this.icaoListCache.findIndex(testIcao => ICAO.getIdent(testIcao).localeCompare(targetIdent) == sign);
    }


    private async buildList(icao: string, direction: number) {
        const listIndex = this.icaoListCache.indexOf(icao);

        //Check if our value is already within the cache
        if (listIndex >= 0) {
            if (direction < 0 && listIndex >= 0 - direction) {
                return;
            } else if (direction >= 0 && listIndex < this.icaoListCache.length - direction) {
                return;
            }
        }

        this.icaoListCache = this.trimList(icao, direction);

        let ident: string | null = ICAO.getIdent(icao).substring(0, this.getMaxIdentLength(this.facilitySearchType));


        console.log(`Searching for ${ident}`);
        this.icaoListCache = this.addResultToCache(await this.facilityLoader.searchByIdent(this.facilitySearchType, ident, CACHE_SIZE));
        while (this.icaoListCache.length < CACHE_SIZE) {
            ident = this.getNextIdentSearch(ident, direction);
            if (ident === null) { //End of the list
                break;
            }
            console.log(`Searching for ${ident}`);
            this.icaoListCache = this.addResultToCache(await this.facilityLoader.searchByIdent(this.facilitySearchType, ident, CACHE_SIZE));
        }

        console.log("cache rebuilt", this.icaoListCache);
    }

    /**
     * If we were to search for the full strings backwards (I.E. EDDH, EDDG, EDDF), this would take way to long.
     * There should never be 1000 possibilities for the last character anyway
     * @param type
     * @private
     */
    private getMaxIdentLength(type: FacilitySearchType): number {
        switch (type) {
            case FacilitySearchType.Airport:
                return 3;
            case FacilitySearchType.Intersection:
            case FacilitySearchType.User:
                return 4;
            case FacilitySearchType.Ndb:
            case FacilitySearchType.Vor:
                return 2;
            default:
                throw new Error(`Unsupported type: ${type}`);
        }
    }

    private addResultToCache(result: string[]): string[] {
        const cache = this.icaoListCache.concat(result);
        return this.cleanupCache(cache);
    }

    private trimList(icao: string, direction: number): string[] {
        const listIndex = this.icaoListCache.indexOf(icao);
        if (listIndex === -1) { // a completeliy new seach
            return [];
        }
        let startIndex;
        let endIndex;
        //we want our current value at the minimum to be in the middle or more in the search direction
        if (direction < 0) {
            startIndex = Math.max(0);
            endIndex = Math.min(Math.round(listIndex + CACHE_SIZE / 2), this.icaoListCache.length);
        } else {
            startIndex = Math.max(Math.round(listIndex - CACHE_SIZE / 2), 0);
            endIndex = Math.min(this.icaoListCache.length);
        }

        return this.icaoListCache.slice(startIndex, endIndex)

    }


    private cleanupCache(cache: string[]): string[] {
        cache = [...new Set(cache)];
        return cache.sort(this.listSortFunction);
    }

    private listSortFunction(aIcao: string, bIcao: string): number {
        const aIdent = ICAO.getIdent(aIcao);
        const bIdent = ICAO.getIdent(bIcao);
        if (aIdent === bIdent) {
            return aIcao.localeCompare(bIcao);
        }

        return aIdent.localeCompare(bIdent);
    }

    /**
     * If we have searched for an ident and our cache is not yet full, then this method returns the next viable icao
     * code to search for.
     *
     * For example given AY, this would return AZ and afterwards B
     *
     * todo: should we keep the lengt? (return B0 in the example above?) If we search backwards, then C would come after
     * B and that would have more than 1000 results for intersections
     *
     * @param ident
     * @param direction
     * @private
     */
    private getNextIdentSearch(ident: string, direction: number): string | null {
        let signOfDirection = Math.sign(direction);
        if (signOfDirection === 0) {
            signOfDirection = 1;
        }
        const prevString = ident.substring(0, ident.length - 1);
        const lastChar = ident.substring(ident.length - 1);
        const nextCharIdx = CHARSET.indexOf(lastChar) + signOfDirection;
        if (nextCharIdx < CHARSET.length && nextCharIdx >= 0) {
            return prevString + CHARSET[nextCharIdx];
        } else {
            if (prevString.length === 0) {
                return null;
            }
            return this.getNextIdentSearch(prevString, signOfDirection);
        }
    }


}


/**
 * This one is way more dynamic than the other scanlists. But it is only backed by a facilityrepo, this makes a lot of
 * stuff easier
 */
export class SupScanlist implements Scanlist {

    private icaoListCache: string[] = [];


    constructor(private readonly facilitySearchType: FacilitySearchType, private readonly facilityRepository: KLNFacilityRepository) {
    }

    public isEmpty(): boolean {
        this.buildList();
        return this.icaoListCache.length === 0;
    }

    /**
     * Gets the first waypoint in the list. null if no waypoints exists (should only occur for SUP)
     */
    public async start(): Promise<string | null> {
        this.buildList();
        if (this.icaoListCache.length > 0) {
            return this.icaoListCache[0];
        } else {
            return null;
        }
    }

    /**
     * Gets the last waypoint in the list. null if no waypoints exists (should only occur for SUP)
     */

    public async end(): Promise<string | null> {
        this.buildList();
        if (this.icaoListCache.length > 0) {
            return this.icaoListCache[0];
        } else {
            return null;
        }
    }

    /**
     * Gets the next waypoint from the list in the specified direction
     * @param icao
     * @param direction -1 or 1 for the previous or next waypoint. 10 would select the tenths next waypoint
     */

    public async getNext(icao: string, direction: number): Promise<string | null> {
        if (direction === 0) {
            throw new Error("Direction must not be 0");
        }
        if (Math.abs(direction) > MAX_SCROLL_SPEED) {
            throw new Error(`direction${direction} is to large. Max: ${CACHE_SIZE / 2}`);
        } else if (Math.abs(direction) === MAX_SCROLL_SPEED) {
            //maximum speed. Rebuilding the cache is to0 slow for this, so we simply jump to the next full ident Letter
            const nextFullIdentLetter = this.getNextIdentSearch(ICAO.getIdent(icao).substring(0, 1), direction);
            if (nextFullIdentLetter !== null) {
                icao = `       ${nextFullIdentLetter.padEnd(5, " ")}`;
                direction = 0;
            }
        }

        this.buildList();

        if (this.isEmpty()) {
            return null;
        }

        let listIndex = this.icaoListCache.indexOf(icao);
        if (listIndex === -1) {
            listIndex = this.findClosest(icao, direction);
        }

        const nextIndex = Utils.Clamp(listIndex + direction, 0, this.icaoListCache.length - 1);
        if (nextIndex === listIndex) {
            return null; //Start or end of the list
        }

        return this.icaoListCache[nextIndex];
    }

    /**
     * Happens, when the user has selected an ident, that does not exist
     * We now look by the ident to find the next closest entry, respecting the search direction
     * @param icao
     * @param direction
     * @private
     */
    private findClosest(icao: string, direction: number): number {
        const targetIdent = ICAO.getIdent(icao);
        let sign = Math.sign(direction) * -1;
        if (sign === 0) {
            sign = -1;
        }
        return this.icaoListCache.findIndex(testIcao => ICAO.getIdent(testIcao).localeCompare(targetIdent) == sign);
    }


    private buildList(): void {
        this.icaoListCache = [];
        this.facilityRepository.forEach(fac => this.icaoListCache.push(fac.icao), [FacilityType.USR]);

        this.icaoListCache.sort(this.listSortFunction);

        console.log("cache rebuilt", this.icaoListCache);
    }


    private listSortFunction(aIcao: string, bIcao: string): number {
        const aIdent = ICAO.getIdent(aIcao);
        const bIdent = ICAO.getIdent(bIcao);
        if (aIdent === bIdent) {
            return aIcao.localeCompare(bIcao);
        }

        return aIdent.localeCompare(bIdent);
    }

    /**
     * If we have searched for an ident and our cache is not yet full, then this method returns the next viable icao
     * code to search for.
     *
     * For example given AY, this would return AZ and afterwards B
     *
     * todo: should we keep the lengt? (return B0 in the example above?) If we search backwards, then C would come after
     * B and that would have more than 1000 results for intersections
     *
     * @param ident
     * @param direction
     * @private
     */
    private getNextIdentSearch(ident: string, direction: number): string | null {
        let signOfDirection = Math.sign(direction);
        if (signOfDirection === 0) {
            signOfDirection = 1;
        }
        const prevString = ident.substring(0, ident.length - 1);
        const lastChar = ident.substring(ident.length - 1);
        const nextCharIdx = CHARSET.indexOf(lastChar) + signOfDirection;
        if (nextCharIdx < CHARSET.length && nextCharIdx >= 0) {
            return prevString + CHARSET[nextCharIdx];
        } else {
            if (prevString.length === 0) {
                return null;
            }
            return this.getNextIdentSearch(prevString, signOfDirection);
        }
    }


}