import {describe, expect, it} from 'vitest';
import {EventBus, Facility, FacilityClient, FacilitySearchType, ICAO, UserFacilityType} from '@microsoft/msfs-sdk';
import {FacilityLoaderScanlist} from '../../../../kln90b/data/navdata/Scanlist';
import {ActualFacilityClient, KLNFacilityLoader} from '../../../../kln90b/data/navdata/KLNFacilityLoader';
import {KLNFacilityRepository} from '../../../../kln90b/data/navdata/KLNFacilityRepository';
import {MemoryFacilityClient} from '../../../harness/navdata/MemoryFacilityClient';
import {airport, vor} from '../../../harness/navdata/builders';
import {clearStatic} from '../../../harness/singletons';

/** The scan list's private job: the cache is filled in the background and an error there is only a rejection. */
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
