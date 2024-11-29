import {EventBus, FacilityClient, FacilitySearchType, ICAO, IcaoValue} from "@microsoft/msfs-sdk";
import {KLNFacilityRepository} from "./KLNFacilityRepository";

const TARGET_CACHE_SIZE = 1000;
const MAXIMUM_CACHE_SIZE = TARGET_CACHE_SIZE * 1.5;

const CHARSET = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

export const MAX_SCROLL_SPEED = TARGET_CACHE_SIZE / 4;

export class Scanlists {
    public readonly aptScanlist: Scanlist;
    public readonly vorScanlist: Scanlist;
    public readonly ndbScanlist: Scanlist;
    public readonly intScanlist: Scanlist;
    public readonly supScanlist: Scanlist;


    constructor(facilityLoader: FacilityClient, bus: EventBus) {
        this.aptScanlist = new FacilityLoaderScanlist(FacilitySearchType.Airport, facilityLoader, bus);
        this.vorScanlist = new FacilityLoaderScanlist(FacilitySearchType.Vor, facilityLoader, bus);
        this.ndbScanlist = new FacilityLoaderScanlist(FacilitySearchType.Ndb, facilityLoader, bus);
        this.intScanlist = new FacilityLoaderScanlist(FacilitySearchType.Intersection, facilityLoader, bus);
        this.supScanlist = new FacilityLoaderScanlist(FacilitySearchType.User, facilityLoader, bus);
    }

}

export interface Scanlist {
    isEmpty(): boolean;

    /**
     * Initialized the cache and returns the first waypoint
     */
    init(): Promise<IcaoValue | null>;

    /**
     * Gets the first waypoint in the list. null if no waypoints exists (should only occur for SUP)
     */
    start(): IcaoValue | null;

    /**
     * Gets the next waypoint from the list in the specified direction
     * @param icao
     * @param direction -1 or 1 for the previous or next waypoint. 10 would select the tenths next waypoint
     */
    getNext(icao: IcaoValue, direction: number): Promise<IcaoValue | null>;

    /**
     * Makes sure that the backing cache is up to date for this icao
     * @param icao
     */
    sync(icao: IcaoValue): void;
}

/**
 * 3-21
 * THE KLN can select a waypoint by scanning. Normalliy, this would be simple, since you could just keep an array of
 * ICAOs and an Index
 *
 * We however do not want to keep every single ICAO code in memory. Therefore we use a cache as a window and selectively
 * query searchByIdent.
 * We never know our absolute waypoint index, however, we can move forward and backwards within our window.
 */
export class FacilityLoaderScanlist implements Scanlist {

    //Contains the first waypoint for each letter of the alhpabet
    private index: IcaoValue[] = [];

    //A moving window of continous ICAO codes that are chached
    private icaoListCache: IcaoValue[] = [];

    private listManangerJob: Promise<void> | null = null;
    private lastManangerJobId = 0;

    //The last icao the pilot viewed. This should be the center of the moving cache window
    private lastIcao: IcaoValue = ICAO.emptyValue();

    //The first icao our cache currently encompasses. Might be smaller than the first value. We may have checked '0', but the first used icao can be '1'
    private cacheValidFromIdent = "ZZZZ";
    //The last icao our cache currently encompasses.
    private cacheValidToIdent = "0";

    private readonly loggingEnabled: boolean = false;


    constructor(private readonly facilitySearchType: FacilitySearchType, private readonly facilityLoader: FacilityClient, bus: EventBus) {
        bus.getSubscriber<any>().on(KLNFacilityRepository.SYNC_TOPIC).handle(this.waypointsChanged.bind(this));
    }

    public async init(): Promise<IcaoValue | null> {
        await this.rebuildIndex();
        this.lastIcao = this.index[0];
        this.listManangerJob = this.startListManager();
        return this.start();
    }

    /**
     * Gets the first waypoint in the list. null if no waypoints exists (should only occur for SUP)
     */
    public start(): IcaoValue | null {
        return this.index.length > 0 ? this.index[0] : null;
    }

    /**
     * Gets the next waypoint from the list in the specified direction
     * @param icao
     * @param direction -1 or 1 for the previous or next waypoint. 10 would select the tenths next waypoint
     */
    public async getNext(icao: IcaoValue, direction: number): Promise<IcaoValue | null> {
        this.lastIcao = icao;

        if (direction === 0) {
            throw new Error("Direction must not be 0");
        }
        if (Math.abs(direction) > MAX_SCROLL_SPEED) {
            throw new Error(`direction${direction} is to large. Max: ${TARGET_CACHE_SIZE / 2}`);
        } else if (Math.abs(direction) === MAX_SCROLL_SPEED) {
            //maximum speed. Rebuilding the cache is to0 slow for this, so we simply jump to the next full ident Letter from the index
            const nextIcao = this.getNextFromIndex(icao, direction);
            if (nextIcao !== null) {
                this.lastIcao = nextIcao;
            }
            //We do not wait for the previos job to finish, because we need to be fast here
            //There is a comparison in the job, that detects when a newer job has been started
            this.listManangerJob = this.startListManager();
            return nextIcao;
        }

        if (this.isEmpty()) {
            return null;
        }

        //At this point, the cache must be up to date, otherwise we risk not finding our entry. If the job is not yet done, then we wait
        if (this.listManangerJob !== null) {
            await this.listManangerJob;
        }

        let listIndex = this.icaoListCache.indexOf(icao);
        if (listIndex === -1) {
            listIndex = this.findClosest(icao, direction);
        }

        const nextIndex = Utils.Clamp(listIndex + direction, 0, this.icaoListCache.length - 1);
        if (nextIndex === listIndex) {
            return null; //Start or end of the list
        }

        this.lastIcao = this.icaoListCache[nextIndex];
        this.listManangerJob = this.startListManager();
        return this.lastIcao;
    }

    public isEmpty(): boolean {
        return this.icaoListCache.length === 0;
    }

    public sync(icao: IcaoValue): void {
        this.lastIcao = icao;
        this.listManangerJob = this.startListManager();
    }

    /**
     * This function intends to keep the cache centered around the last waypoint the pilot viewed.
     * If the pilots scrolls further through the list, we extend the cache towards that direction and purge the other direction
     * This function is intended to be called AFTER we moved through the scan list. We can never jumpf further than the
     * cache size and this allows the pilot to view the next entry immediatly, while we refresh our cache in the background
     *
     * @private
     */
    private async startListManager(): Promise<void> {
        const jobId = Math.floor(Math.random() * 10000);
        this.lastManangerJobId = jobId;
        let sizeBeforeCurrent = 0;
        let sizeAfterCurrent = 0;

        const listIndex = this.icaoListCache.indexOf(this.lastIcao);
        this.log(`${this.facilitySearchType}: Cache size: ${this.icaoListCache.length} ${this.cacheValidFromIdent}-${this.cacheValidToIdent}, lastIcao: ${this.lastIcao}, index: ${listIndex}`);

        if (listIndex == -1) {
            //Happens with sync. We jumped to a random waypoint not in our list, now we need to throw everything away
            this.invalidateCache();
        } else {
            sizeBeforeCurrent = listIndex;
            sizeAfterCurrent = this.icaoListCache.length - listIndex;
        }

        //A little larger, because otherwise we would refresh the cache for every single scan operation
        const targetSizeForExtension = TARGET_CACHE_SIZE / 2 + 100;

        if (sizeBeforeCurrent < TARGET_CACHE_SIZE / 2) {
            this.log(`${this.facilitySearchType}: Size towards beginning: ${sizeBeforeCurrent}, extending cache towards beginning`);
            let ident: string | null = this.lastIcao.ident;
            while (sizeBeforeCurrent < targetSizeForExtension) {
                ident = this.getNextIdentForSearch(ident!, -1);
                if (ident === null) { //End of the list
                    break;
                }
                if (this.cacheValidFromIdent.localeCompare(ident) <= 0) {
                    continue;
                }
                this.log(`${this.facilitySearchType} : Searching for ${ident}`);
                const sizeBefore = this.icaoListCache.length;
                const results = await this.facilityLoader.searchByIdentWithIcaoStructs(this.facilitySearchType, ident, targetSizeForExtension - sizeBeforeCurrent);
                if (jobId !== this.lastManangerJobId) {
                    //Happens, when we use the index, that one does not wait for this job to finish
                    this.log(`${this.facilitySearchType}: filling of list canceled`);
                    return;
                }
                this.cacheValidFromIdent = ident;
                this.icaoListCache = this.addResultToCache(results);
                sizeBeforeCurrent += this.icaoListCache.length - sizeBefore;
            }

        } else if (sizeBeforeCurrent > MAXIMUM_CACHE_SIZE / 2) {
            this.log(`${this.facilitySearchType}: Size towards beginning: ${sizeBeforeCurrent}, Pruning beginning of cache`);
            this.icaoListCache = this.icaoListCache.slice(sizeBeforeCurrent - MAXIMUM_CACHE_SIZE / 2, this.icaoListCache.length - 1);
            this.cacheValidFromIdent = this.icaoListCache[0].ident;
        }

        if (sizeAfterCurrent < TARGET_CACHE_SIZE / 2) {
            this.log(`${this.facilitySearchType}: Size towards end: ${sizeAfterCurrent}, extending cache towards end`);
            let ident: string | null = this.lastIcao.ident;
            while (sizeAfterCurrent < targetSizeForExtension) {
                ident = this.getNextIdentForSearch(ident!, 1);
                if (ident === null) { //End of the list
                    break;
                }
                if (this.cacheValidToIdent.localeCompare(ident) >= 0) {
                    continue;
                }
                this.log(`${this.facilitySearchType} : Searching for ${ident}`);
                const sizeBefore = this.icaoListCache.length;
                const results = await this.facilityLoader.searchByIdentWithIcaoStructs(this.facilitySearchType, ident, targetSizeForExtension - sizeAfterCurrent);
                if (jobId !== this.lastManangerJobId) {
                    //Happens, when we use the index, that one does not wait for this job to finish
                    this.log(`${this.facilitySearchType}: filling of list canceled`);
                    return;
                }
                this.cacheValidToIdent = ident;
                this.icaoListCache = this.addResultToCache(results);
                sizeAfterCurrent += this.icaoListCache.length - sizeBefore;
                if (this.icaoListCache.length > 0) {
                    this.cacheValidToIdent = this.icaoListCache[this.icaoListCache.length - 1].ident;
                }
            }
        } else if (sizeAfterCurrent > MAXIMUM_CACHE_SIZE / 2) {
            this.log(`${this.facilitySearchType}: Size towards end: ${sizeAfterCurrent}, pruning end of cache`);
            this.icaoListCache = this.icaoListCache.slice(0, listIndex + MAXIMUM_CACHE_SIZE / 2);
            this.cacheValidToIdent = this.icaoListCache[this.icaoListCache.length - 1].ident;
        }
        this.log(`${this.facilitySearchType}: "Listmanager done ${this.cacheValidFromIdent}-${this.cacheValidToIdent}`, this.icaoListCache);
        this.listManangerJob = null;
    }

    private invalidateCache() {
        //Happens with sync. We jumped to a random waypoint not in our list, now we need to throw everything away
        this.cacheValidFromIdent = "ZZZZ";
        this.cacheValidToIdent = "0";
        if (ICAO.isValueEmpty(this.lastIcao)) {
            this.icaoListCache = [];
        } else {
            this.icaoListCache = [this.lastIcao];
        }
    }

    /**
     * Happens, when the user has selected an ident, that does not exist
     * We now look by the ident to find the next closest entry, respecting the search direction
     * @param icao
     * @param direction
     * @private
     */
    private findClosest(icao: IcaoValue, direction: number): number {
        let sign = Math.sign(direction) * -1;
        if (sign === 0) {
            sign = -1;
        }
        return this.icaoListCache.findIndex(testIcao => testIcao.ident.localeCompare(icao.ident) == sign);
    }

    /**
     * The first entry for all first letters are permanently stored in the index, we can simply query it here
     * @param icao
     * @param direction
     * @private
     */
    private getNextFromIndex(icao: IcaoValue, direction: number): IcaoValue | null {
        const signOfDirection = Math.sign(direction);
        let index = this.index;
        if (direction < 0) {
            index = index.slice().reverse();
        }

        for (const indexElement of index) {
            if (indexElement.ident.localeCompare(icao.ident) === signOfDirection) {
                return indexElement;
            }
        }
        return null;
    }

    private waypointsChanged(): void {
        this.rebuildIndex();
        this.invalidateCache();
        this.listManangerJob = this.startListManager();
    }

    private addResultToCache(result: IcaoValue[]): IcaoValue[] {
        const cache = this.icaoListCache.concat(result);
        return this.cleanupCache(cache);
    }

    private cleanupCache(cache: IcaoValue[]): IcaoValue[] {
        cache = [...new Set(cache)];
        return cache.sort(this.listSortFunction);
    }

    private listSortFunction(aIcao: IcaoValue, bIcao: IcaoValue): number {
        if (aIcao.ident === bIcao.ident) {
            return ICAO.valueToStringV2(aIcao).localeCompare(ICAO.valueToStringV2(bIcao));
        }

        return aIcao.ident.localeCompare(bIcao.ident);
    }

    private async rebuildIndex(): Promise<IcaoValue[]> {
        this.index = [];
        for (let i = 0; i < CHARSET.length; i++) {
            const res = await this.facilityLoader.searchByIdentWithIcaoStructs(this.facilitySearchType, CHARSET[i], 1);
            if (res.length > 0) {
                this.index.push(res[0]);
            }
        }

        //Now we just need to find the very last navaid
        if (this.index.length > 0) {
            const lastResult = this.index[this.index.length - 1];
            const res = await this.facilityLoader.searchByIdentWithIcaoStructs(this.facilitySearchType, lastResult.ident.substring(0, 1), 1000);
            const lastEntry = res[res.length - 1];
            if (!ICAO.valueEquals(lastEntry, lastResult)) {
                this.index.push(lastEntry);
            }
        }

        this.log("index", this.index);
        return this.index;

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
    private getNextIdentForSearch(ident: string, direction: number): string | null {
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
            return this.getNextIdentForSearch(prevString, signOfDirection);
        }
    }

    private log(message?: any, ...optionalParams: any[]): void {
        if (this.loggingEnabled) {
            console.log(message, optionalParams);
        }
    }
}
