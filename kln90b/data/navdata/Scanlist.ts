import {EventBus, FacilityClient, FacilitySearchType, ICAO, IcaoValue} from "@microsoft/msfs-sdk";
import {KLNFacilityRepository} from "./KLNFacilityRepository";

const TARGET_CACHE_SIZE = 1000;
const MAXIMUM_CACHE_SIZE = TARGET_CACHE_SIZE * 1.5;

const CHARSET = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

export const MAX_SCROLL_SPEED = TARGET_CACHE_SIZE / 4;

//No ident is longer. A prefix of this length cannot be divided into longer prefixes
const MAX_IDENT_LENGTH = 5;
//The results asked for when the index looks for a first or last waypoint
const INDEX_SEARCH_SIZE = 1000;
//The number of results asked for in each search that fills the cache. Whether the sim honors maxItems is not known: a
//search that returns this many or more may have been cut, so its prefix is not taken as complete (#201)
const SEARCH_SIZE = TARGET_CACHE_SIZE / 2 + 100;

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

    //#201: the first ident the cache encompasses; every ident from it up to the current waypoint is cached. null: nothing.
    //Might be smaller than the first value. We may have checked '0', but the first used icao can be '1'
    private cacheValidFromIdent: string | null = null;
    //#201: every ident below this one, down to cacheValidFromIdent, is in the cache. null: up to the end of the list
    private cacheValidBelowIdent: string | null = "0";

    private readonly loggingEnabled: boolean = false;


    constructor(private readonly facilitySearchType: FacilitySearchType, private readonly facilityLoader: FacilityClient, bus: EventBus) {
        bus.getSubscriber<any>().on(KLNFacilityRepository.SYNC_TOPIC).handle(this.waypointsChanged.bind(this));
    }

    public async init(): Promise<IcaoValue | null> {
        await this.rebuildIndex();
        if (this.index.length > 0) {
            this.lastIcao = this.index[0];
        }
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

        let listIndex = this.indexOfIcaoInCache(icao);
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

    /**
     * We can't use the normal js indexOf function, because IcaoValues may change with a __cachedUid field and are no longer considered equal
     * Since our array is already sorted, we can use a simple binary search which should actually be faster than indexOf
     * @param icao
     * @private
     */
    private indexOfIcaoInCache(icao: IcaoValue): number {
        const uidToSearch = ICAO.getUid(icao);

        let start = 0;
        let end = this.icaoListCache.length - 1;

        while (start <= end) {
            const mid = Math.floor((start + end) / 2);
            const midIcao = this.icaoListCache[mid];
            const midUid = ICAO.getUid(midIcao);

            if (midUid === uidToSearch) {
                return mid;
            }

            if (this.listSortFunction(icao, midIcao) < 0) {
                end = mid - 1;
            } else {
                start = mid + 1;
            }
        }
        return -1;
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
        const jobId = ++this.lastManangerJobId;
        //getNext sets lastIcao while this job still runs. Both halves of the fill must start from the same position, or
        //the stretch between the old and the new position is never searched
        const lastIcao = this.lastIcao;
        let sizeBeforeCurrent = 0;
        let sizeAfterCurrent = 0;

        const listIndex = this.indexOfIcaoInCache(lastIcao);
        this.log(`${this.facilitySearchType}: Cache size: ${this.icaoListCache.length} ${this.cacheValidFromIdent}-${this.cacheValidBelowIdent}, lastIcao: ${lastIcao}, index: ${listIndex}`);

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
            let ident: string | null = lastIcao.ident;
            let exact = false;
            while (sizeBeforeCurrent < targetSizeForExtension) {
                if (ident === null || ident === "") { //End of the list
                    break;
                }
                if (this.cacheValidFromIdent !== null && this.cacheValidFromIdent.localeCompare(ident) <= 0) {
                    [ident, exact] = this.getPreviousSearch(ident);
                    continue;
                }
                this.log(`${this.facilitySearchType} : Searching for ${ident}`);
                const results = await this.facilityLoader.searchByIdentWithIcaoStructs(this.facilitySearchType, ident, SEARCH_SIZE);
                if (jobId !== this.lastManangerJobId) {
                    //Happens, when we use the index, that one does not wait for this job to finish
                    this.log(`${this.facilitySearchType}: filling of list canceled`);
                    return;
                }
                //An exact ident is not divided any further. Its search is a prefix search too: when the sim cuts it, the
                //waypoints of the exact ident stay only if the sim keeps the first idents in list order (the shorter
                //ident sorts first). Which ones the sim keeps is not known; that case is not covered
                if (!exact && this.mayBeCut(results, ident)) {
                    //#201: the scan needs the last idents of this prefix. Search its longer prefixes, from the last one
                    ident = ident + CHARSET[CHARSET.length - 1];
                    continue;
                }
                this.cacheValidFromIdent = ident;
                const exactIdent: string = ident;
                this.icaoListCache = this.addResultToCache(exact ? results.filter(icao => icao.ident === exactIdent) : results);
                //#201: only the waypoints before the current one count. The search of the current ident's own prefix
                //finds the longer idents after it too, and so do all of its longer prefixes when that search was cut
                sizeBeforeCurrent = this.countBefore(lastIcao);
                [ident, exact] = this.getPreviousSearch(ident);
            }

        } else if (sizeBeforeCurrent > MAXIMUM_CACHE_SIZE / 2) {
            this.log(`${this.facilitySearchType}: Size towards beginning: ${sizeBeforeCurrent}, Pruning beginning of cache`);
            //#201: the cut falls between two idents, so that every waypoint of the first ident kept stays. The last entry
            //stays too. With more waypoints of one ident before the current one than half the cache holds, the cut falls
            //inside that ident at the current waypoint (not covered; no ident is that common)
            let start = sizeBeforeCurrent - MAXIMUM_CACHE_SIZE / 2;
            while (start < listIndex && this.icaoListCache[start].ident === this.icaoListCache[start - 1].ident) {
                start++;
            }
            this.icaoListCache = this.icaoListCache.slice(start);
            this.cacheValidFromIdent = this.icaoListCache[0].ident;
        }

        if (sizeAfterCurrent < TARGET_CACHE_SIZE / 2) {
            this.log(`${this.facilitySearchType}: Size towards end: ${sizeAfterCurrent}, extending cache towards end`);
            //#201: the walk starts with the prefix of the current ident itself, whose longer idents may be missing after a prune
            let ident: string | null = lastIcao.ident;
            while (sizeAfterCurrent < targetSizeForExtension) {
                if (ident === null) { //End of the list
                    break;
                }
                const upperIdent: string | null = this.getNextIdentForSearch(ident, 1);
                if (this.cacheValidBelowIdent === null || (upperIdent !== null && upperIdent.localeCompare(this.cacheValidBelowIdent) <= 0)) {
                    ident = upperIdent;
                    continue;
                }
                this.log(`${this.facilitySearchType} : Searching for ${ident}`);
                const sizeBefore = this.icaoListCache.length;
                const results = await this.facilityLoader.searchByIdentWithIcaoStructs(this.facilitySearchType, ident, SEARCH_SIZE);
                if (jobId !== this.lastManangerJobId) {
                    //Happens, when we use the index, that one does not wait for this job to finish
                    this.log(`${this.facilitySearchType}: filling of list canceled`);
                    return;
                }
                if (this.mayBeCut(results, ident)) {
                    //#201: take this ident itself, then search its longer prefixes, from the first one. The ident sorts
                    //first in its prefix; it is in a cut result only if the sim keeps the first idents in list order
                    //(not known; as with the exact ident towards the beginning, the other case is not covered)
                    const prefix: string = ident;
                    this.icaoListCache = this.addResultToCache(results.filter(icao => icao.ident === prefix));
                    sizeAfterCurrent += this.icaoListCache.length - sizeBefore;
                    //The bound stays: it lies below this prefix or inside it, and is true either way. Lowering it to the
                    //first longer prefix would search cached idents again
                    ident = prefix + CHARSET[0];
                    continue;
                }
                this.icaoListCache = this.addResultToCache(results);
                sizeAfterCurrent += this.icaoListCache.length - sizeBefore;
                this.cacheValidBelowIdent = upperIdent;
                ident = upperIdent;
            }
        } else if (sizeAfterCurrent > MAXIMUM_CACHE_SIZE / 2) {
            this.log(`${this.facilitySearchType}: Size towards end: ${sizeAfterCurrent}, pruning end of cache`);
            //#201: the bound is the first ident dropped, and it excludes that ident. When the cut falls inside the
            //waypoints of one ident, the ident is not taken as cached, and the next refill searches it again.
            //The half towards the beginning may have moved the current waypoint (a prune drops entries before it, an
            //extension adds some), so its position is read again. Nothing after it was dropped, so more than half the cache
            //still follows it and the first entry dropped exists
            const end = this.countBefore(lastIcao) + MAXIMUM_CACHE_SIZE / 2;
            this.cacheValidBelowIdent = this.icaoListCache[end].ident;
            this.icaoListCache = this.icaoListCache.slice(0, end);
        }
        this.log(`${this.facilitySearchType}: "Listmanager done ${this.cacheValidFromIdent}-${this.cacheValidBelowIdent}`, this.icaoListCache);
        this.listManangerJob = null;
    }

    private invalidateCache() {
        //Happens with sync. We jumped to a random waypoint not in our list, now we need to throw everything away
        this.cacheValidFromIdent = null;
        this.cacheValidBelowIdent = "0";
        this.icaoListCache = [];
    }

    /**
     * #201: the number of cached waypoints that come before the waypoint in list order, whether it is cached or not
     */
    private countBefore(icao: IcaoValue): number {
        let start = 0;
        let end = this.icaoListCache.length;
        while (start < end) {
            const mid = Math.floor((start + end) / 2);
            if (this.listSortFunction(this.icaoListCache[mid], icao) < 0) {
                start = mid + 1;
            } else {
                end = mid;
            }
        }
        return start;
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

    /**
     * #201: a search that returned SEARCH_SIZE results or more may have been cut at maxItems, unless its prefix cannot be
     * divided any further
     */
    private mayBeCut(results: IcaoValue[], prefix: string): boolean {
        return results.length >= SEARCH_SIZE && prefix.length < MAX_IDENT_LENGTH;
    }

    private cleanupCache(cache: IcaoValue[]): IcaoValue[] {
        //#201: a prefix may be searched again. The sim returns new objects each time, so equal ICAOs are found by their uid
        const byUid = new Map<string, IcaoValue>();
        for (const icao of cache) {
            byUid.set(ICAO.getUid(icao), icao);
        }
        const unique: IcaoValue[] = [];
        byUid.forEach(icao => unique.push(icao));
        return unique.sort(this.listSortFunction);
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
                //#105: with duplicate idents the search may return any of them. The index holds the first in list order
                const sameIdent = await this.searchExactIdent(res[0].ident);
                this.index.push(sameIdent.length > 0 ? sameIdent[0] : res[0]);
            }
        }

        //Now we just need to find the very last navaid
        if (this.index.length > 0) {
            const lastResult = this.index[this.index.length - 1];
            const lastEntry = await this.findLastInListOrder(lastResult.ident.substring(0, 1));
            if (lastEntry !== null && !ICAO.valueEquals(lastEntry, lastResult)) {
                this.index.push(lastEntry);
            }
        }

        this.log("index", this.index);
        return this.index;
    }

    /**
     * The waypoints with exactly this ident, in list order
     */
    private async searchExactIdent(ident: string): Promise<IcaoValue[]> {
        const results = await this.facilityLoader.searchByIdentWithIcaoStructs(this.facilitySearchType, ident, INDEX_SEARCH_SIZE);
        return results.filter(icao => icao.ident === ident).sort(this.listSortFunction);
    }

    /**
     * #105: the last waypoint in list order whose ident starts with the prefix. A search that returns INDEX_SEARCH_SIZE
     * results may have been cut (whether the sim honors maxItems is not known), so the longest group is searched then,
     * from the last character down.
     */
    private async findLastInListOrder(prefix: string): Promise<IcaoValue | null> {
        const results = await this.facilityLoader.searchByIdentWithIcaoStructs(this.facilitySearchType, prefix, INDEX_SEARCH_SIZE);
        if (results.length < INDEX_SEARCH_SIZE || prefix.length >= MAX_IDENT_LENGTH) {
            const sorted = results.slice().sort(this.listSortFunction);
            return sorted.length > 0 ? sorted[sorted.length - 1] : null;
        }
        for (let i = CHARSET.length - 1; i >= 0; i--) {
            const last = await this.findLastInListOrder(prefix + CHARSET[i]);
            if (last !== null) {
                return last;
            }
        }
        //No longer ident exists: the prefix is an ident of its own
        const sameIdent = await this.searchExactIdent(prefix);
        return sameIdent.length > 0 ? sameIdent[sameIdent.length - 1] : null;
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

    /**
     * #203: the search that comes before the prefix (or the exact ident) going towards the beginning of the list. Before
     * the prefix AB0 comes the ident AB itself, which sorts before every longer ident, and only then the prefix AA.
     * Returns the ident to search and whether only that exact ident is wanted.
     */
    private getPreviousSearch(ident: string): [string | null, boolean] {
        if (ident.endsWith(CHARSET[0])) {
            return [ident.substring(0, ident.length - 1), true];
        }
        return [this.getNextIdentForSearch(ident, -1), false];
    }

    private log(message?: any, ...optionalParams: any[]): void {
        if (this.loggingEnabled) {
            console.log(message, optionalParams);
        }
    }
}
