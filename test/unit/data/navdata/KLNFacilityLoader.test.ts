import {beforeEach, describe, expect, it} from 'vitest';
import {
    AirportFacility, BitFlags, EventBus, Facility, FacilitySearchType, FacilityType, ICAO, IcaoValue, NearestAirportFilteredSearchSession,
    NearestIcaoSearchSessionDataType, NearestSearchSession, RunwaySurfaceType, UnitType, UserFacility,
    UserFacilityType,
} from '@microsoft/msfs-sdk';
import {ActualFacilityClient, KLNFacilityLoader} from '../../../../kln90b/data/navdata/KLNFacilityLoader';
import {KLNFacilityRepository} from '../../../../kln90b/data/navdata/KLNFacilityRepository';
import {MemoryFacilityClient} from '../../../harness/navdata/MemoryFacilityClient';
import {airport, intersection, ndb, vor} from '../../../harness/navdata/builders';
import {clearStatic} from '../../../harness/singletons';

beforeEach(() => clearStatic(KLNFacilityRepository, 'INSTANCE', false));

/** A fresh repository on its own bus, and a loader over it and the given database facilities */
function setup(database: Facility[], user: Facility[] = []): { repo: KLNFacilityRepository, loader: KLNFacilityLoader } {
    const repo = KLNFacilityRepository.getRepository(new EventBus());
    user.forEach(f => repo.add(f));
    const loader = new KLNFacilityLoader(new MemoryFacilityClient(database) as unknown as ActualFacilityClient, repo);
    return {repo, loader};
}

/** A user airport (region XX), with the builder's runway options */
const userAirport = (ident: string, lat: number, lon: number, opts: Parameters<typeof airport>[3] = {}): Facility => {
    const fac = airport(ident, lat, lon, opts);
    const icaoStruct = ICAO.value('A', 'XX', '', ident);
    return {...fac, icaoStruct, icao: ICAO.valueToStringV1(icaoStruct), region: 'XX'};
};

/** A supplemental waypoint (region XX) */
const sup = (ident: string, lat: number, lon: number): UserFacility => ({
    icao: '', icaoStruct: ICAO.value('U', 'XX', '', ident), name: '', lat, lon, region: 'XX', city: '',
    isTemporary: false, userFacilityType: UserFacilityType.LAT_LONG,
} as unknown as UserFacility);

/** "ABC V XX": ident, ICAO type letter and region, so a result list reads as what the pilot would see */
const describeIcao = (icao: IcaoValue) => `${icao.ident} ${icao.type} ${icao.region}`.trim();

describe('KLNFacilityLoader.searchByIdentWithIcaoStructs', () => {
    // 3-21: scanning visits the waypoints in alphanumeric order, and the scan list is built from these search results.
    // The user waypoints (region XX) come from the repository and the others from the sim database; the two lists
    // have to be merged into one sorted list. The unit's searches always use a prefix of at least one character
    // (the scan list starts with the characters 0 to Z).
    it('merges user waypoints and database facilities in ident order (e1e75d0)', async () => {
        const repo = KLNFacilityRepository.getRepository(new EventBus());
        repo.add(vor('AAA', 47, 8, {region: 'XX'}));
        repo.add(vor('AAC', 47.1, 8, {region: 'XX'}));
        const loader = new KLNFacilityLoader(new MemoryFacilityClient([vor('AAB', 47.2, 8)]) as unknown as ActualFacilityClient, repo);

        const results = await loader.searchByIdentWithIcaoStructs(FacilitySearchType.Vor, 'A', 100);

        expect(results.map(icao => icao.ident)).toEqual(['AAA', 'AAB', 'AAC']);
        expect(results.map(icao => icao.region)).toEqual(['XX', 'K1', 'XX']);
    });

    // 3-21: numbers are lower in order than letters, so K98 comes before KAAF. The merged list keeps that order
    // across both sources.
    it('puts numbers before letters across user and database waypoints (3-21)', async () => {
        const {loader} = setup(
            [airport('KAAB', 47, 8), airport('K99', 47, 8)],
            [userAirport('KAAF', 47, 8), userAirport('K98', 47, 8)],
        );

        const results = await loader.searchByIdentWithIcaoStructs(FacilitySearchType.Airport, 'K', 100);

        expect(results.map(describeIcao)).toEqual(['K98 A XX', 'K99 A', 'KAAB A', 'KAAF A XX']);
    });

    // 3-21: each waypoint type page scans its own type (step 1 selects APT, VOR, NDB, INT or SUP). The user waypoints
    // of the other types stay out of a type's list. FacilitySearchType.All is the search of the waypoint entry, which
    // takes an identifier of any type (3-14).
    describe('a user waypoint of each type', () => {
        const user = () => [
            userAirport('ABA', 47, 8),
            vor('ABV', 47, 8, {region: 'XX'}),
            ndb('ABN', 47, 8, {region: 'XX'}),
            intersection('ABI', 47, 8, {region: 'XX'}),
            sup('ABS', 47, 8),
        ];

        it.each([
            ['Airport', FacilitySearchType.Airport, ['ABA']],
            ['Vor', FacilitySearchType.Vor, ['ABV']],
            ['Ndb', FacilitySearchType.Ndb, ['ABN']],
            ['Intersection', FacilitySearchType.Intersection, ['ABI']],
            ['User', FacilitySearchType.User, ['ABS']],
            ['All', FacilitySearchType.All, ['ABA', 'ABI', 'ABN', 'ABS', 'ABV']],
        ])('is found only by the search of its type: %s (3-21, 3-14)', async (_name, type, idents) => {
            const {loader} = setup([], user());

            const results = await loader.searchByIdentWithIcaoStructs(type, 'AB', 100);

            expect(results.map(icao => icao.ident)).toEqual(idents);
        });
    });

    // 3-14, 3-21: the search offers the waypoints that begin with the characters entered so far
    it('finds a user waypoint by the start of its ident, not by a match inside it (3-14)', async () => {
        const {loader} = setup([], [sup('XAB', 47, 8), sup('AB', 47, 8), sup('ABC', 47, 8), sup('A', 47, 8)]);

        const results = await loader.searchByIdentWithIcaoStructs(FacilitySearchType.User, 'AB', 100);

        expect(results.map(icao => icao.ident)).toEqual(['AB', 'ABC']);
    });

    // The database answers at most maxItems, the repository adds every match on top. The waypoint entry asks for one
    // result (WaypointEditor.onCharChanged) and the scan list for a block; both take what comes.
    it('returns every user waypoint match beyond maxItems (characterization)', async () => {
        const {loader} = setup([vor('ABA', 47, 8), vor('ABB', 47, 8)], [vor('ABC', 47, 8, {region: 'XX'}), vor('ABD', 47, 8, {region: 'XX'})]);

        const results = await loader.searchByIdentWithIcaoStructs(FacilitySearchType.Vor, 'AB', 1);

        expect(results.map(describeIcao)).toEqual(['ABA V K1', 'ABC V XX', 'ABD V XX']);
    });
});

describe('KLNFacilityLoader.findNearestFacilitiesByIdent', () => {
    // 3-15: the Duplicate Waypoint page lists every waypoint with the entered identifier, the one closest to the
    // aircraft first. A user waypoint with the identifier of a database waypoint of another type is one of them.
    // Distances from N47 E8 along the meridian: the user VOR 6 NM, the NDB 30 NM, the intersection 120 NM.
    it('lists every waypoint with exactly that ident from both sources, nearest first (3-15)', async () => {
        const {loader} = setup(
            [ndb('D', 47.5, 8), intersection('D', 49, 8), vor('DA', 47.01, 8)],
            [vor('D', 47.1, 8, {region: 'XX'})],
        );

        const found = await loader.findNearestFacilitiesByIdent(FacilitySearchType.All, 'D', 47, 8, 99);

        expect(found.map(f => describeIcao(f.icaoStruct))).toEqual(['D V XX', 'D N K1', 'D W K1']);
    });

    // Same rule with the user waypoint farthest away, so that the order of the two sources cannot give the answer, and
    // with one waypoint south of the aircraft, so that the answer is the distance from the aircraft and not the
    // latitude or the distance from 0/0. Distances from N47 E8: the database intersection 12 NM north, the database VOR
    // 60 NM south, the user NDB 120 NM north.
    it('orders waypoints with the same ident by their distance from the aircraft, north or south (3-15)', async () => {
        const {loader} = setup(
            [vor('D', 46, 8), intersection('D', 47.2, 8)],
            [ndb('D', 49, 8, {region: 'XX'})],
        );

        const found = await loader.findNearestFacilitiesByIdent(FacilitySearchType.All, 'D', 47, 8, 99);

        expect(found.map(f => describeIcao(f.icaoStruct))).toEqual(['D W K1', 'D V K1', 'D N XX']);
    });

    it('finds nothing for an ident that only begins another ident (3-15)', async () => {
        const {loader} = setup([vor('DA', 47.01, 8)], [sup('DB', 47, 8)]);

        expect(await loader.findNearestFacilitiesByIdent(FacilitySearchType.All, 'D', 47, 8, 99)).toEqual([]);
    });
});

describe('KLNFacilityLoader.getFacility', () => {
    // A user waypoint and a database waypoint may share ident and type (a user VOR ABC and the database VOR ABC, for
    // example after a database update brings a new VOR). They are two waypoints: the region XX in the ICAO keeps them apart.
    it('gets a user waypoint and a database waypoint with the same ident and type each by its own ICAO (characterization)', async () => {
        const user = vor('ABC', 47, 8, {region: 'XX'});
        const {loader} = setup([vor('ABC', 48, 9)], [user]);

        const fromRepo = await loader.getFacility(FacilityType.VOR, ICAO.value('V', 'XX', '', 'ABC'));
        const fromDatabase = await loader.getFacility(FacilityType.VOR, ICAO.value('V', 'K1', '', 'ABC'));

        expect(fromRepo).toBe(user);
        expect([fromDatabase.lat, fromDatabase.lon]).toEqual([48, 9]);
    });

    it('answers a list of facilities of several types from both sources in the order asked (characterization)', async () => {
        const user = vor('ABC', 47, 8, {region: 'XX'});
        const known = vor('ABC', 48, 9);
        const beacon = ndb('NDB', 47, 8);
        const {loader} = setup([known, beacon], [user]);

        const result = await loader.getFacilities([beacon.icaoStruct, known.icaoStruct, user.icaoStruct]);

        expect(result).toEqual([beacon, known, user]);
    });

    it('answers a known facility from either source (characterization)', async () => {
        const user = vor('ABC', 47, 8, {region: 'XX'});
        const beacon = ndb('NDB', 47, 8);
        const {loader} = setup([beacon], [user]);

        await expect(loader.tryGetFacility(FacilityType.NDB, beacon.icaoStruct)).resolves.toEqual(beacon);
        await expect(loader.tryGetFacility(FacilityType.VOR, user.icaoStruct)).resolves.toBe(user);
    });

    it('rejects a facility that is in neither source (characterization)', async () => {
        const {loader} = setup([vor('ABC', 48, 9)]);

        await expect(loader.getFacility(FacilityType.VOR, ICAO.value('V', 'K1', '', 'NONE'))).rejects.toThrow();
    });

    // The FacilityClient interface the SDK's FlightPathCalculator calls (WTFlightplanSync) promises null for a facility
    // that cannot be retrieved, and getFacilities a null in its place. KLNFacilityLoader passes the rejection of the
    // database through instead, so one unknown fix fails the whole batch. Two pins, one for each method, so that a fix
    // of one shows; the passing siblings are the two characterizations above that answer known facilities.
    it.fails('tryGetFacility answers null for a facility that is in neither source (#NEW-1-1)', async () => {
        const {loader} = setup([vor('ABC', 48, 9)]);

        await expect(loader.tryGetFacility(FacilityType.VOR, ICAO.value('V', 'K1', '', 'NONE'))).resolves.toBeNull();
    });

    it.fails('getFacilities answers null in the place of a facility that is in neither source (#NEW-1-1)', async () => {
        const beacon = ndb('NDB', 47, 8);
        const {loader} = setup([beacon]);

        await expect(loader.getFacilities([beacon.icaoStruct, ICAO.value('N', 'K1', '', 'NONE')])).resolves.toEqual([beacon, null]);
    });
});

describe('KLNFacilityLoader nearest search sessions', () => {
    const RADIUS_M = UnitType.NMILE.convertTo(200, UnitType.METER);

    /** The idents added and removed by one search */
    async function search(session: NearestSearchSession<IcaoValue, IcaoValue>): Promise<{ added: string[], removed: string[] }> {
        const r = await session.searchNearest(47, 8, RADIUS_M, 10);
        return {added: r.added.map(i => i.ident).sort(), removed: r.removed.map(i => i.ident).sort()};
    }

    // 5-45: the nearest functions work with user-defined waypoints (the page says so for a unit without a database
    // cartridge), so a user VOR belongs in the nearest VOR list next to the database VORs.
    it('merges user waypoints into the nearest VOR list (5-45)', async () => {
        const {loader} = setup([vor('DBV', 47.1, 8)], [vor('USV', 47.2, 8, {region: 'XX'})]);
        const session = await loader.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Vor);

        expect(await search(session)).toEqual({added: ['DBV', 'USV'], removed: []});
    });

    it('reports a deleted user VOR as removed (characterization)', async () => {
        const {repo, loader} = setup([], [vor('USV', 47.2, 8, {region: 'XX'})]);
        const session = await loader.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Vor);
        expect(await search(session)).toEqual({added: ['USV'], removed: []});
        expect(await search(session)).toEqual({added: [], removed: []});

        repo.remove(ICAO.value('V', 'XX', '', 'USV'));

        expect(await search(session)).toEqual({added: [], removed: ['USV']});
    });

    // 3-22, 3-23: only airports with a runway of at least the SET 3 length qualify, and with HRD only hard runways.
    // A user airport created on APT 1 has an unknown runway (Apt1Page stores a length of -10 m). The pages do not say
    // what the nearest list does with it; the last test below records what the code does.
    // setExtendedAirportFilters takes the length in meters (the SET 3 value converted by NearestList).
    describe('the SET 3 criteria on user airports', () => {
        const hardMask = BitFlags.union(BitFlags.createFlag(RunwaySurfaceType.Asphalt), BitFlags.createFlag(RunwaySurfaceType.Concrete));
        const hardSoftMask = BitFlags.union(hardMask, BitFlags.createFlag(RunwaySurfaceType.Grass));
        const m = (ft: number) => UnitType.FOOT.convertTo(ft, UnitType.METER);
        const userAirports = () => [
            userAirport('UHRD', 47.1, 8, {runwayLengthFt: 3000, surface: RunwaySurfaceType.Asphalt}),
            userAirport('USFT', 47.2, 8, {runwayLengthFt: 3000, surface: RunwaySurfaceType.Grass}),
            userAirport('USHT', 47.3, 8, {runwayLengthFt: 1900, surface: RunwaySurfaceType.Asphalt}),
            unknownRunway('UNEW', 47.4, 8),
        ];

        /** The runway a user airport gets on APT 1 before APT 3 sets one (Apt1Page.buildAirportFacility) */
        function unknownRunway(ident: string, lat: number, lon: number): AirportFacility {
            const apt = userAirport(ident, lat, lon) as AirportFacility;
            return {...apt, runways: [{...apt.runways[0], length: -10, surface: RunwaySurfaceType.WrightFlyerTrack}]};
        }

        async function airportsFound(surfaceMask: number, minLengthFt: number): Promise<string[]> {
            const {loader} = setup([], userAirports());
            const session = await loader.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Airport) as unknown as NearestAirportFilteredSearchSession<NearestIcaoSearchSessionDataType.Struct>;
            session.setExtendedAirportFilters(surfaceMask, ~0, 3, m(minLengthFt));
            return (await search(session as unknown as NearestSearchSession<IcaoValue, IcaoValue>)).added;
        }

        it('HRD 2000 ft keeps only the hard runway of 3000 ft (3-23)', async () => {
            expect(await airportsFound(hardMask, 2000)).toEqual(['UHRD']);
        });

        it('HRD SFT 2000 ft adds the soft runway of 3000 ft (3-23)', async () => {
            expect(await airportsFound(hardSoftMask, 2000)).toEqual(['UHRD', 'USFT']);
        });

        it('HRD 1800 ft adds the hard runway of 1900 ft (3-22)', async () => {
            expect(await airportsFound(hardMask, 1800)).toEqual(['UHRD', 'USHT']);
        });

        it('HRD SFT 1000 ft leaves out the airport with an unknown runway (characterization)', async () => {
            expect(await airportsFound(hardSoftMask, 1000)).toEqual(['UHRD', 'USFT', 'USHT']);
        });
    });
});
