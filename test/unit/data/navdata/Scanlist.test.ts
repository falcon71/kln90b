import {describe, expect, it, vi} from 'vitest';
import {EventBus, Facility, FacilityClient, FacilitySearchType, ICAO, IcaoValue, UserFacilityType} from '@microsoft/msfs-sdk';
import {FacilityLoaderScanlist, MAX_SCROLL_SPEED} from '../../../../kln90b/data/navdata/Scanlist';
import {ActualFacilityClient, KLNFacilityLoader} from '../../../../kln90b/data/navdata/KLNFacilityLoader';
import {KLNFacilityRepository} from '../../../../kln90b/data/navdata/KLNFacilityRepository';
import {MemoryFacilityClient} from '../../../harness/navdata/MemoryFacilityClient';
import {airport, intersection, ndb, vor} from '../../../harness/navdata/builders';
import {clearStatic} from '../../../harness/singletons';

/**
 * The scan list's private job: the cache is filled in the background and an error there is only a rejection.
 * Reaches the private listManangerJob (misspelled in Scanlist.ts) of FacilityLoaderScanlist: no public seam hands out the
 * job's promise to wait for or to see its rejection; a rename there, or fixing the spelling, breaks this test.
 */
function managerJob(list: FacilityLoaderScanlist): Promise<void> | null {
    return (list as unknown as { listManangerJob: Promise<void> | null }).listManangerJob;
}

const airports = () => new MemoryFacilityClient([airport('KAAA', 47, 8), airport('KAAB', 47.1, 8), airport('KAAC', 47.2, 8)]);

/** Initializes the list and waits until its background job has filled the cache, as a user scanning later would find it. */
async function airportScanlist(client: MemoryFacilityClient): Promise<FacilityLoaderScanlist> {
    const list = new FacilityLoaderScanlist(FacilitySearchType.Airport, client as unknown as FacilityClient, new EventBus());
    await list.init();
    await managerJob(list);
    return list;
}

// 3-21: the scan knob steps through the waypoints of a type in alphanumeric order.
describe('FacilityLoaderScanlist scanning (6a6c634)', () => {
    it('scans forward and backward from an ICAO that is a structural copy, not the cached object', async () => {
        const list = await airportScanlist(airports());
        // ICAO.value builds a new object: a lookup by reference would not find it in the cache
        const next = await list.getNext(ICAO.value('A', '', '', 'KAAB'), 1);
        expect(next?.ident).toBe('KAAC');
        const previous = await list.getNext(ICAO.value('A', '', '', 'KAAB'), -1);
        expect(previous?.ident).toBe('KAAA');
    });

    it('stops at the end of the list', async () => {
        const list = await airportScanlist(airports());
        expect(await list.getNext(ICAO.value('A', '', '', 'KAAC'), 1)).toBeNull();
        expect(await list.getNext(ICAO.value('A', '', '', 'KAAA'), -1)).toBeNull();
    });

    it('starts at the first waypoint', async () => {
        const list = await airportScanlist(airports());
        expect(list.start()?.ident).toBe('KAAA');
    });

    // sync is called when a page shows a waypoint it did not get from the list. With a lookup by reference the copy is
    // not found, the cache is thrown away at once and a scan right after the sync finds an empty list.
    it('scans right after a sync to a copy of a cached waypoint', async () => {
        const list = await airportScanlist(airports());
        list.sync(ICAO.value('A', '', '', 'KAAB'));
        expect(list.isEmpty()).toBe(false);
        expect((await list.getNext(ICAO.value('A', '', '', 'KAAB'), 1))?.ident).toBe('KAAC');
    });

    it('has no start and finds nothing with an empty list, without an error in the background job', async () => {
        const list = new FacilityLoaderScanlist(FacilitySearchType.Airport, new MemoryFacilityClient([]) as unknown as FacilityClient, new EventBus());
        await expect(list.init()).resolves.toBeNull();
        // An error in the private job is a rejection nobody awaits: awaiting it makes it a failure of this test
        await managerJob(list);
        expect(list.start()).toBeNull();
        expect(list.isEmpty()).toBe(true);
    });

    // The two halves of the fill start from the position the job started with, also when a scan from another waypoint
    // sets lastIcao while the first fill still runs (in the sim: a scan from an ident-only ICAO, a typed ident,
    // WaypointPage.tsx:156). Otherwise the stretch between the two positions is never searched, and KAAB is lost.
    it('keeps every waypoint when a scan starts during the first fill (#108)', async () => {
        const list = new FacilityLoaderScanlist(FacilitySearchType.Airport, airports() as unknown as FacilityClient, new EventBus());
        await list.init();
        await list.getNext(ICAO.value('A', '', '', 'KAAB'), 1);
        await managerJob(list);
        expect((await list.getNext(ICAO.value('A', '', '', 'KAAA'), 1))?.ident).toBe('KAAB');
    });

    // The same with the scan from a waypoint further on, so that more than one waypoint lies between the two positions
    it('keeps every waypoint when a scan starts from a later waypoint during the first fill (#108)', async () => {
        const client = new MemoryFacilityClient([airport('KAAA', 47, 8), airport('KAAB', 47.1, 8), airport('KAAC', 47.2, 8), airport('KAAD', 47.3, 8)]);
        const list = new FacilityLoaderScanlist(FacilitySearchType.Airport, client as unknown as FacilityClient, new EventBus());
        await list.init();
        await list.getNext(ICAO.value('A', '', '', 'KAAC'), 1);
        await managerJob(list);

        const forward = [
            (await list.getNext(ICAO.value('A', '', '', 'KAAA'), 1))?.ident,
            (await list.getNext(ICAO.value('A', '', '', 'KAAB'), 1))?.ident,
            (await list.getNext(ICAO.value('A', '', '', 'KAAC'), 1))?.ident,
        ];
        const backward = [
            (await list.getNext(ICAO.value('A', '', '', 'KAAD'), -1))?.ident,
            (await list.getNext(ICAO.value('A', '', '', 'KAAC'), -1))?.ident,
            (await list.getNext(ICAO.value('A', '', '', 'KAAB'), -1))?.ident,
        ];

        expect([forward, backward]).toEqual([['KAAB', 'KAAC', 'KAAD'], ['KAAC', 'KAAB', 'KAAA']]);
    });
});

/** A client whose searches wait to be released one by one once the gate is closed, so that a test decides when a job goes on */
class GatedClient extends MemoryFacilityClient {
    public gateClosed = false;
    public readonly searched: string[] = [];
    public readonly waiting: (() => void)[] = [];

    public searchByIdentWithIcaoStructs(filter: FacilitySearchType, ident: string, maxItems?: number): Promise<IcaoValue[]> {
        this.searched.push(ident);
        const result = super.searchByIdentWithIcaoStructs(filter, ident, maxItems);
        if (!this.gateClosed) {
            return result;
        }
        return new Promise(resolve => this.waiting.push(() => resolve(result)));
    }

    /** Lets the oldest waiting search answer and the job behind it run up to its next search */
    public async release(): Promise<void> {
        this.waiting.shift()!();
        for (let i = 0; i < 20; i++) {
            await Promise.resolve();
        }
    }
}

// The job that fills the cache is cancelled by the next job: it compares its id with the id of the newest job after each
// search. The scan list does not wait for a job when it starts the next one (a sync, a jump at the top speed).
describe('FacilityLoaderScanlist background jobs', () => {
    async function filledList(client: GatedClient): Promise<FacilityLoaderScanlist> {
        const list = new FacilityLoaderScanlist(FacilitySearchType.Airport, client as unknown as FacilityClient, new EventBus());
        await list.init();
        await managerJob(list);
        return list;
    }

    // Two jobs that overlap. The first search of the first job is answered after the second job has started: the first job
    // must stop there and not search any further. A random id would give both jobs the same id once in ten thousand times;
    // the stub makes it happen every time.
    it.each([
        ['a job id that is a fresh number each time', undefined],
        ['the random generator returning the same number twice', 0.5],
    ])('a job stops when a newer job has started, with %s (#117)', async (_name, random) => {
        if (random !== undefined) {
            vi.spyOn(Math, 'random').mockReturnValue(random);
        }
        try {
            const client = new GatedClient([airport('KAAA', 47, 8), airport('KAAB', 47.1, 8), airport('KAAC', 47.2, 8)]);
            const list = await filledList(client);
            client.gateClosed = true;
            client.searched.length = 0;

            list.sync(ICAO.value('A', '', '', 'KAAB'));
            expect(client.waiting).toHaveLength(1); // The first job waits for its first search
            list.sync(ICAO.value('A', '', '', 'KAAC'));
            expect(client.waiting).toHaveLength(2); // The second job waits for its first search
            const searchedByBoth = client.searched.length;

            await client.release(); // The answer to the first job

            expect(client.searched).toHaveLength(searchedByBoth); // The first job searched no further
            expect(client.waiting).toHaveLength(1);
        } finally {
            vi.restoreAllMocks();
        }
    });

    // The same for the half of the fill towards the beginning of the list. A sync to an ICAO that is not in the cache
    // throws the cache away, so this half searches first and the job waits there.
    it('a job that waits in the half towards the beginning stops when a newer job has started (#117)', async () => {
        const client = new GatedClient([airport('KAAA', 47, 8), airport('KAAB', 47.1, 8), airport('KAAC', 47.2, 8)]);
        const list = await filledList(client);
        client.gateClosed = true;
        client.searched.length = 0;

        list.sync(ICAO.value('A', '', '', 'KAAD'));
        expect(client.searched).toEqual(['KAAD']); // The first job waits for its first search, in the half towards the beginning
        list.sync(ICAO.value('A', '', '', 'KAAE'));
        expect(client.searched).toEqual(['KAAD', 'KAAE']);

        await client.release(); // The answer to the first job

        expect(client.searched).toEqual(['KAAD', 'KAAE']); // The first job searched no further
        expect(client.waiting).toHaveLength(1);
    });

    // The cancellation is not lost by the counter: the newest job, alone, runs to its end
    it('the newest job runs to its end when an older job was cancelled (#117)', async () => {
        const client = new GatedClient([airport('KAAA', 47, 8), airport('KAAB', 47.1, 8), airport('KAAC', 47.2, 8)]);
        const list = await filledList(client);
        client.gateClosed = true;
        list.sync(ICAO.value('A', '', '', 'KAAB'));
        list.sync(ICAO.value('A', '', '', 'KAAC'));
        const newest = managerJob(list)!;

        client.gateClosed = false;
        while (client.waiting.length > 0) {
            await client.release();
        }
        await newest;

        expect(managerJob(list)).toBeNull();
        expect((await list.getNext(ICAO.value('A', '', '', 'KAAA'), 1))?.ident).toBe('KAAB');
        expect((await list.getNext(ICAO.value('A', '', '', 'KAAB'), 1))?.ident).toBe('KAAC');
    });
});

// The user (SUP) scan list is built at every boot, and most boots have no user waypoints, so a failure here stopped
// the whole unit in its self-test. The null contract is the one of the Scanlist interface: no waypoint, no start.
describe('FacilityLoaderScanlist with no user waypoints (characterization, #42 07873c0, e1e75d0)', () => {
    function userScanlist(userWaypoints: Facility[]): FacilityLoaderScanlist {
        clearStatic(KLNFacilityRepository, 'INSTANCE', false);
        const bus = new EventBus();
        const repo = KLNFacilityRepository.getRepository(bus);
        userWaypoints.forEach(f => repo.add(f));
        const loader = new KLNFacilityLoader(new MemoryFacilityClient([]) as unknown as ActualFacilityClient, repo);
        return new FacilityLoaderScanlist(FacilitySearchType.User, loader, bus);
    }

    it('initializes to null and has no start', async () => {
        const list = userScanlist([]);
        await expect(list.init()).resolves.toBeNull();
        await managerJob(list);
        expect(list.start()).toBeNull();
        expect(list.isEmpty()).toBe(true);
    });

    it('finds nothing to scan to', async () => {
        const list = userScanlist([]);
        await list.init();
        await managerJob(list);
        expect(await list.getNext(ICAO.value('U', 'XX', '', 'USRA'), 1)).toBeNull();
    });

    it('starts at the first user waypoint when there is one', async () => {
        const user = (ident: string, lat: number) => ({
            icao: '', icaoStruct: ICAO.value('U', 'XX', '', ident), name: '', lat, lon: 8, region: 'XX', city: '',
            isTemporary: false, userFacilityType: UserFacilityType.LAT_LONG,
        }) as unknown as Facility;
        const list = userScanlist([user('USRB', 47.1), user('USRA', 47)]);
        const first = await list.init();
        expect(first?.ident).toBe('USRA');
        expect(list.start()?.ident).toBe('USRA');
    });
});

// 3-21: scanning visits every waypoint of the type. Two VORs can share an ident in different regions, and neither may be
// skipped. The order among them (region K1 before K2) is the code's own: the list sorts by ident, then by full ICAO.
describe('FacilityLoaderScanlist with duplicate idents (d3228dd)', () => {
    const duplicates = () => new MemoryFacilityClient([
        vor('ABC', 47, 8, {region: 'K1'}),
        vor('ABC', 40, -100, {region: 'K2'}),
        vor('ABD', 47.1, 8.1),
    ]);

    async function vorScanlist(): Promise<FacilityLoaderScanlist> {
        const list = new FacilityLoaderScanlist(FacilitySearchType.Vor, duplicates() as unknown as FacilityClient, new EventBus());
        await list.init();
        await managerJob(list);
        return list;
    }

    it('scans forward through both waypoints with the same ident', async () => {
        const list = await vorScanlist();
        const second = await list.getNext(ICAO.value('V', 'K1', '', 'ABC'), 1);
        expect([second?.ident, second?.region]).toEqual(['ABC', 'K2']);
        const third = await list.getNext(ICAO.value('V', 'K2', '', 'ABC'), 1);
        expect([third?.ident, third?.region]).toEqual(['ABD', 'K1']);
    });

    it('scans backward through both waypoints with the same ident', async () => {
        const list = await vorScanlist();
        const second = await list.getNext(ICAO.value('V', 'K1', '', 'ABD'), -1);
        expect([second?.ident, second?.region]).toEqual(['ABC', 'K2']);
        const first = await list.getNext(ICAO.value('V', 'K2', '', 'ABC'), -1);
        expect([first?.ident, first?.region]).toEqual(['ABC', 'K1']);
    });

    // The index takes the first of the waypoints with the same ident in list order (the cache sorts by ident and then by
    // full ICAO). The test database returns equal idents in insertion order, here the K2 VOR first; what the sim
    // returns for equal idents is not known, which is why the index must not depend on it.
    it('starts at the first of two VORs with the same ident in list order (#105)', async () => {
        const client = new MemoryFacilityClient([vor('ABC', 40, -100, {region: 'K2'}), vor('ABC', 47, 8, {region: 'K1'})]);
        const list = new FacilityLoaderScanlist(FacilitySearchType.Vor, client as unknown as FacilityClient, new EventBus());
        const first = await list.init();
        expect([first?.ident, first?.region]).toEqual(['ABC', 'K1']);
    });
});

async function scanlist(type: FacilitySearchType, facilities: Facility[], bus = new EventBus()): Promise<FacilityLoaderScanlist> {
    const list = new FacilityLoaderScanlist(type, new MemoryFacilityClient(facilities) as unknown as FacilityClient, bus);
    await list.init();
    await managerJob(list);
    return list;
}

describe('FacilityLoaderScanlist index (#105)', () => {
    // The top-speed jump goes to the index entries: the first waypoint of each character and the very last waypoint.
    // With more waypoints of the last character than one search returns, the last one must still be found (#105).
    it('jumps at top speed to the last waypoint of a character with more waypoints than one search returns (#105)', async () => {
        const CH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const facilities: Facility[] = [];
        for (let i = 0; i < 1100; i++) {
            // ZA000 to ZA0UJ: 1100 idents that sort before ZZZZZ
            const ident = 'ZA' + CH[Math.floor(i / 1296) % 36] + CH[Math.floor(i / 36) % 36] + CH[i % 36];
            facilities.push(intersection(ident, 47 + i * 0.0001, 8));
        }
        facilities.push(intersection('ZZZZZ', 46.9, 8));
        const list = await scanlist(FacilitySearchType.Intersection, facilities);

        const last = await list.getNext(ICAO.value('W', 'K1', '', 'ZA000'), MAX_SCROLL_SPEED);

        expect(last?.ident).toBe('ZZZZZ');
    });

    // Characterizations of the index code (code contract, not a page of the Pilot's Guide).
    /** The index entries as the list holds them. Reaches the private index: nothing public hands it out */
    function indexOf(list: FacilityLoaderScanlist): string[] {
        return (list as unknown as { index: IcaoValue[] }).index.map(icao => `${icao.ident}/${icao.region}`);
    }

    /** A client that answers every search with the given function and records the searches that ask for a full result */
    function stubClient(answer: (ident: string, maxItems: number) => IcaoValue[]) {
        const indexSearches: string[] = [];
        const client = {
            searchByIdentWithIcaoStructs: (_type: FacilitySearchType, ident: string, maxItems = 40): Promise<IcaoValue[]> => {
                if (maxItems === 1000) indexSearches.push(ident);
                return Promise.resolve(answer(ident, maxItems));
            },
        };
        return {client: client as unknown as FacilityClient, indexSearches};
    }

    it('holds the first and the last of two VORs with the same last ident in list order', async () => {
        // K2 is inserted before K1, so neither the first nor the last in insertion order is the answer
        const list = await scanlist(FacilitySearchType.Vor, [
            vor('ABC', 47, 8), vor('ZZZ', 40, -100, {region: 'K2'}), vor('ZZZ', 47, 8, {region: 'K1'}),
        ]);

        expect(indexOf(list)).toEqual(['ABC/K1', 'ZZZ/K1', 'ZZZ/K2']);
    });

    // A search that returned fewer results than asked for was not cut: no need to search the longer prefixes
    it('finds the last waypoint with one search when that search was not cut', async () => {
        const client = new MemoryFacilityClient([intersection('ZAAAA', 47, 8), intersection('ZBBBB', 47.1, 8), intersection('ZZZZZ', 47.2, 8)]);
        const spy = vi.spyOn(client, 'searchByIdentWithIcaoStructs');

        const list = new FacilityLoaderScanlist(FacilitySearchType.Intersection, client as unknown as FacilityClient, new EventBus());
        await list.init();

        const full = spy.mock.calls.filter(call => call[2] === 1000).map(call => call[1]);
        expect(full).toEqual(['ZAAAA', 'Z']);
        expect(indexOf(list)).toEqual(['ZAAAA/K1', 'ZZZZZ/K1']);
    });

    // More waypoints share one ident than one search returns: the search for the full ident cannot be divided further
    it('stops dividing at the longest ident and takes the last of the results', async () => {
        const CH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const facilities: Facility[] = [];
        for (let i = 0; i < 1100; i++) {
            facilities.push(intersection('ZZZZZ', 47 + i * 0.0001, 8, {region: CH[Math.floor(i / 36) % 36] + CH[i % 36]}));
        }
        const client = new MemoryFacilityClient(facilities);
        const spy = vi.spyOn(client, 'searchByIdentWithIcaoStructs');

        const list = new FacilityLoaderScanlist(FacilitySearchType.Intersection, client as unknown as FacilityClient, new EventBus());
        await list.init();

        const full = spy.mock.calls.filter(call => call[2] === 1000).map(call => call[1]);
        expect(full).toEqual(['ZZZZZ', 'Z', 'ZZ', 'ZZZ', 'ZZZZ', 'ZZZZZ']);
        // The test database cuts the 1100 equal idents to the first 1000 inserted (regions 00 to RR); the last of those
        expect(indexOf(list)[0]).toBe('ZZZZZ/00');
        expect(indexOf(list)[1]).toBe('ZZZZZ/RR');
    });

    // The ident of the prefix itself is the last waypoint when no longer ident exists, even with a full search of them
    it('finds the last of as many waypoints as one search returns that all have a one-character ident', async () => {
        const CH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        const facilities: Facility[] = [];
        for (let i = 0; i < 1000; i++) {
            facilities.push(intersection('Z', 47 + i * 0.0001, 8, {region: CH[Math.floor(i / 36) % 36] + CH[i % 36]}));
        }

        const list = await scanlist(FacilitySearchType.Intersection, facilities);

        expect(indexOf(list)).toEqual(['Z/00', 'Z/RR']);
    });

    it('takes the first result when the search for its exact ident finds nothing, and adds no last entry when the last search is empty', async () => {
        const first = ICAO.value('W', 'K1', '', 'ZAAAA');
        const {client} = stubClient((ident, maxItems) => (maxItems === 1 && ident === 'Z' ? [first] : []));
        const list = new FacilityLoaderScanlist(FacilitySearchType.Intersection, client, new EventBus());

        await list.init();

        expect(indexOf(list)).toEqual(['ZAAAA/K1']);
        expect(await list.getNext(first, MAX_SCROLL_SPEED)).toBeNull();
    });

    it('ignores waypoints with a longer ident in the search for an exact ident', async () => {
        const abc = ICAO.value('W', 'K1', '', 'ABC');
        const abcd = ICAO.value('W', 'K1', '', 'ABCD');
        const {client} = stubClient((ident, maxItems) => {
            if (maxItems === 1 && ident === 'A') return [abc];
            if (maxItems === 1000 && ident === 'ABC') return [abcd];
            return [];
        });
        const list = new FacilityLoaderScanlist(FacilitySearchType.Intersection, client, new EventBus());

        await list.init();

        expect(indexOf(list)).toEqual(['ABC/K1']);
    });

    it('adds no last entry when no waypoint of a divided search exists, not even one with the ident of the prefix', async () => {
        const first = ICAO.value('W', 'K1', '', 'ZAAAA');
        const cut: IcaoValue[] = [];
        for (let i = 0; i < 1000; i++) cut.push(ICAO.value('W', 'K1', '', 'ZA' + String(100 + i)));
        const {client} = stubClient((ident, maxItems) => {
            if (maxItems === 1 && ident === 'Z') return [first];
            if (maxItems === 1000 && ident === 'Z') return cut;
            return [];
        });
        const list = new FacilityLoaderScanlist(FacilitySearchType.Intersection, client, new EventBus());

        await list.init();

        expect(indexOf(list)).toEqual(['ZAAAA/K1']);
    });
});

/**
 * One slow knob step as WaypointPage does it: getNext, then the page shows the waypoint and changeFacility syncs the
 * list to it (WaypointPage.changeFacility).
 */
async function step(list: FacilityLoaderScanlist, from: IcaoValue, direction: number): Promise<IcaoValue | null> {
    const next = await list.getNext(from, direction);
    if (next !== null) list.sync(next);
    return next;
}

/** Shows the waypoint (sync, as a page does) and scans one way until the list ends; returns the idents shown */
async function scanToEnd(list: FacilityLoaderScanlist, from: IcaoValue, direction: number, max: number): Promise<string[]> {
    list.sync(from);
    await managerJob(list);
    const shown: string[] = [];
    let current: IcaoValue | null = from;
    while (current !== null && shown.length < max) {
        shown.push(current.ident);
        current = await step(list, current, direction);
    }
    return shown;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * n invented five-letter intersection idents that start with the letter, in alphabetical order by construction: the
 * counter i is written in base 26 into characters 2 to 4 (AAAAA, AAABA, ..., AAAZA, AABAA, ...).
 */
function idents(letter: string, n: number): string[] {
    return Array.from({length: n}, (_, i) => letter + LETTERS[Math.floor(i / 676) % 26] + LETTERS[Math.floor(i / 26) % 26] + LETTERS[i % 26] + 'A');
}

// 3-21: clockwise scanning goes through the waypoints in alphabetical order, and numbers come before letters; the
// guide's own example is the airport K98 before KAAF.
describe('FacilityLoaderScanlist order (3-21)', () => {
    it('scans from K98 to KAAF and back: numbers are lower than letters', async () => {
        const list = await scanlist(FacilitySearchType.Airport, [airport('KAAF', 47.1, 8), airport('K98', 47, 8), airport('KBBB', 47.2, 8)]);

        const shown = [
            (await list.getNext(ICAO.value('A', '', '', 'K98'), 1))?.ident,
            (await list.getNext(ICAO.value('A', '', '', 'KAAF'), -1))?.ident,
        ];

        expect(shown).toEqual(['KAAF', 'K98']);
    });
});

// 3-21: scanning slowly steps through the waypoints one at a time. The list keeps a window of about 1000 ICAOs and
// refills it with ident searches as the pilot scans (#40, 8abd5f7); these lists are longer than one refill.
describe('FacilityLoaderScanlist across the edge of its cache window (#40 8abd5f7)', () => {
    // 650 intersections AAAAA to AAYZA, then 10 BAAAA to BAAJA: 660 in all, in this order
    const world = () => [...idents('A', 650), ...idents('B', 10)];
    const facilities = (list: string[]) => list.map((ident, i) => intersection(ident, 47 + i * 0.0001, 8));

    it.fails('shows every intersection once scanning clockwise from the first (#201)', async () => {
        const all = world();
        const list = await scanlist(FacilitySearchType.Intersection, facilities(all));

        const shown = await scanToEnd(list, ICAO.value('W', 'K1', '', all[0]), 1, 1000);

        expect(shown).toEqual(all);
    });

    it.fails('shows every intersection once scanning counterclockwise from the last (#201)', async () => {
        const all = world();
        const list = await scanlist(FacilitySearchType.Intersection, facilities(all));

        const shown = await scanToEnd(list, ICAO.value('W', 'K1', '', all[all.length - 1]), -1, 1000);

        expect(shown).toEqual(all.slice().reverse());
    });

    // The pins above are about the window: a list that fits one refill (600 idents, two groups of 300) scans completely
    it('shows every intersection of a list that fits one refill, in both directions', async () => {
        const all = [...idents('A', 300), ...idents('B', 300)];
        const list = await scanlist(FacilitySearchType.Intersection, facilities(all));

        const clockwise = await scanToEnd(list, ICAO.value('W', 'K1', '', all[0]), 1, 1000);
        const counterclockwise = await scanToEnd(list, ICAO.value('W', 'K1', '', all[all.length - 1]), -1, 1000);

        expect([clockwise, counterclockwise]).toEqual([all, all.slice().reverse()]);
    });
});

// 3-21: scanning visits every waypoint. When a user waypoint is added or deleted, the list throws its cache away and
// refills it around the waypoint shown (waypointsChanged). NDB idents of different length share prefixes (AB, ABC).
describe('FacilityLoaderScanlist after a user waypoint change', () => {
    it.fails('scans counterclockwise from ABC to AB (#203)', async () => {
        const bus = new EventBus();
        const list = await scanlist(FacilitySearchType.Ndb, [ndb('AA', 47, 8), ndb('AB', 47, 8.1), ndb('ABC', 47, 8.2), ndb('ABD', 47, 8.3)], bus);
        const abc = ICAO.value('N', 'K1', '', 'ABC');
        list.sync(abc);
        await managerJob(list);
        bus.getPublisher<any>().pub(KLNFacilityRepository.SYNC_TOPIC, undefined); // what the repository publishes on a change
        await managerJob(list);

        expect((await step(list, abc, -1))?.ident).toBe('AB');
    });

    // The same list scans correctly before the change: the pin above is about the refill, not the order
    it('scans counterclockwise from ABC to AB before any change', async () => {
        const list = await scanlist(FacilitySearchType.Ndb, [ndb('AA', 47, 8), ndb('AB', 47, 8.1), ndb('ABC', 47, 8.2), ndb('ABD', 47, 8.3)]);
        const abc = ICAO.value('N', 'K1', '', 'ABC');
        list.sync(abc);
        await managerJob(list);

        expect((await step(list, abc, -1))?.ident).toBe('AB');
    });
});

// 3-21 (SUP is one of the scanned types): a user waypoint made after the start is in the SUP scan list
describe('FacilityLoaderScanlist of the user waypoints', () => {
    const user = (ident: string, lat: number) => ({
        icao: '', icaoStruct: ICAO.value('U', 'XX', '', ident), name: '', lat, lon: 8, region: 'XX', city: '',
        isTemporary: false, userFacilityType: UserFacilityType.LAT_LONG,
    }) as unknown as Facility;

    it('scans to a user waypoint added after the list was built', async () => {
        clearStatic(KLNFacilityRepository, 'INSTANCE', false);
        const bus = new EventBus();
        const repo = KLNFacilityRepository.getRepository(bus);
        repo.add(user('USRA', 47));
        const loader = new KLNFacilityLoader(new MemoryFacilityClient([]) as unknown as ActualFacilityClient, repo);
        const list = new FacilityLoaderScanlist(FacilitySearchType.User, loader, bus);
        await list.init();
        await managerJob(list);

        repo.add(user('USRB', 47.1));
        await managerJob(list);

        expect((await list.getNext(ICAO.value('U', 'XX', '', 'USRA'), 1))?.ident).toBe('USRB');
    });
});

// The guide says only that a faster turn gives larger steps. At the top speed the list jumps to the first waypoint of the
// next (or, counterclockwise, the current or previous) first letter: the code's own rule (getNextFromIndex).
describe('FacilityLoaderScanlist at the top scan speed (characterization)', () => {
    const world = () => [airport('KAAA', 47, 8), airport('KAAB', 47.1, 8), airport('LAAA', 47.2, 8), airport('LBBB', 47.3, 8), airport('MAAA', 47.4, 8)];

    it('jumps clockwise to the first waypoint of the next letter', async () => {
        const list = await scanlist(FacilitySearchType.Airport, world());

        expect((await list.getNext(ICAO.value('A', '', '', 'KAAA'), MAX_SCROLL_SPEED))?.ident).toBe('LAAA');
    });

    it('jumps counterclockwise to the first waypoint of the letter', async () => {
        const list = await scanlist(FacilitySearchType.Airport, world());

        expect((await list.getNext(ICAO.value('A', '', '', 'LBBB'), -MAX_SCROLL_SPEED))?.ident).toBe('LAAA');
    });
});
