import {describe, expect, it} from 'vitest';
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

    // The fill job reads lastIcao again when it starts its second half, so a scan from another waypoint while the
    // first fill still runs makes it start behind that waypoint: KAAB is never searched and the scan KAAA to KAAB is lost.
    // In the sim this needs a scan from an ident-only ICAO (a typed ident, WaypointPage.tsx:156).
    it.fails('keeps every waypoint when a scan starts during the first fill (#108)', async () => {
        const list = new FacilityLoaderScanlist(FacilitySearchType.Airport, airports() as unknown as FacilityClient, new EventBus());
        await list.init();
        await list.getNext(ICAO.value('A', '', '', 'KAAB'), 1);
        await managerJob(list);
        expect((await list.getNext(ICAO.value('A', '', '', 'KAAA'), 1))?.ident).toBe('KAAB');
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

    // The index takes the first search result of each letter as it comes (rebuildIndex), while the cache sorts by
    // ident and then by full ICAO. With the K2 VOR returned first, the start of the list is behind the K1 VOR that
    // the sorted list starts with. The test database returns equal idents in insertion order; what the sim returns
    // for equal idents is not known.
    it.fails('starts at the first of two VORs with the same ident in list order (#105)', async () => {
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
