import {describe, expect, it} from 'vitest';
import {EventBus, Facility, FacilityClient, FacilitySearchType, ICAO, IcaoValue} from '@microsoft/msfs-sdk';
import {FacilityLoaderScanlist} from '../../../../kln90b/data/navdata/Scanlist';
import {KLNFacilityRepository} from '../../../../kln90b/data/navdata/KLNFacilityRepository';
import {MemoryFacilityClient} from '../../../harness/navdata/MemoryFacilityClient';
import {intersection} from '../../../harness/navdata/builders';

/** The scan list's private background job (misspelled in Scanlist.ts); see Scanlist.test.ts managerJob */
const managerJob = (list: FacilityLoaderScanlist) => (list as unknown as { listManangerJob: Promise<void> | null }).listManangerJob;

/** A sim that returns every match, whatever maxItems asks for */
class IgnoringMaxItemsClient extends MemoryFacilityClient {
    public searchByIdentWithIcaoStructs(filter: FacilitySearchType, ident: string, _maxItems?: number): Promise<IcaoValue[]> {
        return super.searchByIdentWithIcaoStructs(filter, ident, 1_000_000);
    }
}

/** A sim that returns new ICAO objects for every search, as Coherent does */
class FreshCopyClient extends MemoryFacilityClient {
    public searchByIdentWithIcaoStructs(filter: FacilitySearchType, ident: string, maxItems?: number): Promise<IcaoValue[]> {
        return super.searchByIdentWithIcaoStructs(filter, ident, maxItems).then(r => r.map(i => ICAO.value(i.type, i.region, i.airport, i.ident)));
    }
}

/** A deterministic pseudo-random generator, so that the world is the same in every run */
function random(seed: number): () => number {
    return () => {
        seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
    };
}

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Idents of two to five characters on three first letters, so that prefix groups are larger than the cache window;
 * some idents are prefixes of others (AB, ABC) and some exist twice in two regions.
 */
function world(size: number, seed: number): Facility[] {
    const r = random(seed);
    const idents = new Set<string>();
    while (idents.size < size) {
        const length = 2 + Math.floor(r() * 4);
        let ident = 'ABK'[Math.floor(r() * 3)];
        for (let i = 1; i < length; i++) ident += CHARS[Math.floor(r() * (i < 2 ? 6 : 36))];
        idents.add(ident);
        if (r() < 0.1 && ident.length > 2) idents.add(ident.substring(0, ident.length - 1));
    }
    const facilities: Facility[] = [];
    let i = 0;
    for (const ident of idents) {
        facilities.push(intersection(ident, 47 + (i++) * 0.0001, 8));
        if (r() < 0.03) facilities.push(intersection(ident, 40 + i * 0.0001, -100, {region: 'K2'}));
    }
    return facilities;
}

const listOrder = (a: IcaoValue, b: IcaoValue) => a.ident === b.ident ? ICAO.valueToStringV2(a).localeCompare(ICAO.valueToStringV2(b)) : a.ident.localeCompare(b.ident);
const key = (icao: IcaoValue) => ICAO.valueToStringV2(icao);

/** Scans one slow step at a time from `from`, as WaypointPage does (getNext, then sync), and returns what is shown */
async function scan(list: FacilityLoaderScanlist, from: IcaoValue, direction: number, max: number): Promise<string[]> {
    list.sync(from);
    await managerJob(list);
    const shown: string[] = [];
    let current: IcaoValue | null = from;
    while (current !== null && shown.length < max) {
        shown.push(key(current));
        current = await list.getNext(current, direction);
        if (current !== null) list.sync(current);
    }
    return shown;
}

// 3-21: turning the knob slowly steps through the waypoints one at a time, in alphabetical order. The list is longer
// than the scan list's cache window, and the sim may or may not honor maxItems (#201)
describe.each([
    ['honors maxItems', (f: Facility[]) => new MemoryFacilityClient(f)],
    ['ignores maxItems', (f: Facility[]) => new IgnoringMaxItemsClient(f)],
    ['returns fresh ICAO objects', (f: Facility[]) => new FreshCopyClient(f)],
])('FacilityLoaderScanlist over a long list, the sim %s (3-21, #201)', (_name, makeClient) => {
    it('shows every waypoint once in list order, both ways and after a user waypoint change', async () => {
        const facilities = world(3000, 1);
        const icaos = facilities.map(f => f.icaoStruct).sort(listOrder);
        const sorted = icaos.map(key); // list order, each waypoint once: the expectation
        const bus = new EventBus();
        const list = new FacilityLoaderScanlist(FacilitySearchType.Intersection, makeClient(facilities) as unknown as FacilityClient, bus);
        await list.init();
        await managerJob(list);

        // A prefix searched twice leaves no duplicate: every fill that starts at a waypoint not cached yet searches its
        // prefix in both halves, and with the fresh-copy sim the second search returns new objects. This first scan
        // already shows it (the first fill starts at the first waypoint)
        expect(await scan(list, icaos[0], 1, sorted.length + 5)).toEqual(sorted);
        expect(await scan(list, icaos[icaos.length - 1], -1, sorted.length + 5)).toEqual([...sorted].reverse());
        expect(await scan(list, icaos[0], 1, sorted.length + 5)).toEqual(sorted);

        // A user waypoint change throws the cache away and refills it around the waypoint shown
        bus.getPublisher<any>().pub(KLNFacilityRepository.SYNC_TOPIC, undefined); // what the repository publishes on a change
        const middle = Math.floor(icaos.length / 2);
        expect(await scan(list, icaos[middle], -1, middle + 5)).toEqual(sorted.slice(0, middle + 1).reverse());
    });
});

// The cache drops the waypoints more than half the cache (750) before the one shown, and the cut falls between two
// idents. Here one ident has more waypoints than that, so the cut cannot fall between two idents before the waypoint
// shown: it falls at that waypoint, which stays. No real ident is that common, and only a sim that ignores maxItems
// returns them all (the search of a five-character ident is never divided): a characterization of the code (#201).
describe('FacilityLoaderScanlist with more waypoints of one ident than half its cache (characterization, #201)', () => {
    it('shows every waypoint once scanning clockwise through them', async () => {
        const facilities: Facility[] = [];
        for (let i = 0; i < 800; i++) {
            facilities.push(intersection('AAAAA', 47 + i * 0.0001, 8, {region: CHARS[Math.floor(i / 36)] + CHARS[i % 36]}));
        }
        facilities.push(intersection('AAAAB', 46, 8), intersection('AAAAC', 46.1, 8));
        const icaos = facilities.map(f => f.icaoStruct).sort(listOrder);
        const list = new FacilityLoaderScanlist(FacilitySearchType.Intersection, new IgnoringMaxItemsClient(facilities) as unknown as FacilityClient, new EventBus());
        await list.init();
        await managerJob(list);

        expect(await scan(list, icaos[0], 1, icaos.length + 5)).toEqual(icaos.map(key));
    });
});
