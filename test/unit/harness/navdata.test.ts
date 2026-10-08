import {describe, expect, it} from 'vitest';
import {EventBus, FacilitySearchType, FacilityType, ICAO, RunwayUtils, UnitType} from '@microsoft/msfs-sdk';
import {airport, intersection, ndb, vor} from '../../harness/navdata/builders';
import {runwayFix} from '../../harness/navdata/procedures';
import {angleDiff} from '../../harness/flight/geo';
import {MemoryFacilityClient} from '../../harness/navdata/MemoryFacilityClient';
import {KLNFacilityLoader, ActualFacilityClient} from '../../../kln90b/data/navdata/KLNFacilityLoader';
import {KLNFacilityRepository} from '../../../kln90b/data/navdata/KLNFacilityRepository';

const abc = vor('ABC', 47.5, 8.9);
const abd = vor('ABD', 48.5, 8.9);
const kaaa = airport('KAAA', 47.0, 8.0);
const client = new MemoryFacilityClient([abc, abd, kaaa]);
const nm = (n: number) => UnitType.NMILE.convertTo(n, UnitType.METER);

describe('MemoryFacilityClient', () => {
    it('resolves known facilities and rejects unknown ones', async () => {
        await expect(client.getFacility(FacilityType.VOR, abc.icaoStruct)).resolves.toBe(abc);
        await expect(client.getFacility(FacilityType.VOR, ICAO.value('V', 'K1', '', 'NOPE'))).rejects.toThrow(/no facility/);
    });

    it('searches by ident prefix and type', async () => {
        const vors = await client.searchByIdentWithIcaoStructs(FacilitySearchType.Vor, 'AB');
        expect(vors.map(i => i.ident)).toEqual(['ABC', 'ABD']);
        const airports = await client.searchByIdentWithIcaoStructs(FacilitySearchType.Airport, 'AB');
        expect(airports).toEqual([]);
    });

    it('reports added and removed facilities between nearest searches', async () => {
        const session = await client.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Vor);
        // ABC is 0.2° (12 NM) north of 47.3N; ABD is 72 NM north
        const first = await session.searchNearest(47.3, 8.9, nm(20), 10);
        expect(first.added.map((i: any) => i.ident)).toEqual(['ABC']);
        const second = await session.searchNearest(48.3, 8.9, nm(20), 10);
        expect(second.added.map((i: any) => i.ident)).toEqual(['ABD']);
        expect(second.removed.map((i: any) => i.ident)).toEqual(['ABC']);
    });

    it('returns ident matches sorted, by prefix only, and capped at maxItems', async () => {
        const unsorted = new MemoryFacilityClient([vor('ABE', 47, 8), vor('ABC', 47, 8), vor('XAB', 47, 8), vor('ABD', 47, 8)]);
        const all = await unsorted.searchByIdentWithIcaoStructs(FacilitySearchType.Vor, 'AB');
        expect(all.map(i => i.ident)).toEqual(['ABC', 'ABD', 'ABE']);
        const capped = await unsorted.searchByIdentWithIcaoStructs(FacilitySearchType.Vor, 'AB', 2);
        expect(capped.map(i => i.ident)).toEqual(['ABC', 'ABD']);
    });

    it('does not repeat facilities that stay in range or have already been removed', async () => {
        const session = await client.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Vor);
        const idents = (list: any[]) => list.map(i => i.ident);
        const c1 = await session.searchNearest(47.3, 8.9, nm(20), 10);
        expect([idents(c1.added), idents(c1.removed)]).toEqual([['ABC'], []]);
        const c2 = await session.searchNearest(47.3, 8.9, nm(20), 10);
        expect([idents(c2.added), idents(c2.removed)]).toEqual([[], []]);
        const c3 = await session.searchNearest(48.3, 8.9, nm(20), 10);
        expect([idents(c3.added), idents(c3.removed)]).toEqual([['ABD'], ['ABC']]);
        const c4 = await session.searchNearest(48.3, 8.9, nm(20), 10);
        expect([idents(c4.added), idents(c4.removed)]).toEqual([[], []]);
    });

    it('keeps a separate nearest search per facility type', async () => {
        const session = await client.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Airport);
        const result = await session.searchNearest(47.0, 8.0, nm(20), 10);
        expect(result.added.map((i: any) => i.ident)).toEqual(['KAAA']);
    });

    it('adds facilities from JSON with a V2 ICAO string', async () => {
        const jsn = vor('JSN', 46, 7);
        const jsonClient = new MemoryFacilityClient();
        jsonClient.addJson([{...jsn, icaoStruct: ICAO.valueToStringV2(jsn.icaoStruct)}]);
        const found = await jsonClient.getFacility(FacilityType.VOR, ICAO.value('V', 'K1', '', 'JSN'));
        expect(found.lat).toBe(46);
    });

    it('serves KLNFacilityLoader', async () => {
        const loader = new KLNFacilityLoader(client as unknown as ActualFacilityClient, KLNFacilityRepository.getRepository(new EventBus()));
        await expect(loader.getFacility(FacilityType.VOR, abc.icaoStruct)).resolves.toBe(abc);
        const session = await loader.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Vor);
        const result = await session.searchNearest(47.3, 8.9, nm(20), 10);
        expect(result.added.map(i => i.ident)).toEqual(['ABC']);
    });
});

describe('builders', () => {
    it('never use the regions the instrument reserves for user and temporary waypoints', () => {
        for (const fac of [airport('KBBB', 1, 2), vor('BBB', 1, 2), ndb('BBB', 1, 2), intersection('BBBBB', 1, 2)]) {
            expect(['XX', 'XY']).not.toContain(fac.region);
            expect(['XX', 'XY']).not.toContain(fac.icaoStruct.region);
        }
    });

    // The SDK reads `direction` as the heading of the first named end, so the label of the end that points to the
    // heading must be the one a pilot expects: a runway of heading 270 is 27 to the west and 09 to the east
    describe('runway ends', () => {
        const ends = (heading: number) => RunwayUtils.getOneWayRunwaysFromAirport(airport('KXXX', 47, 8, {runwayHeading: heading}))
            .map(r => [r.designation, Math.round(r.course)]);

        it.each([
            [270, 90, '09-27', [['09', 90], ['27', 270]]],
            [360, 180, '18-36', [['18', 180], ['36', 0]]],
            [90, 90, '09-27', [['09', 90], ['27', 270]]],
            [180, 180, '18-36', [['18', 180], ['36', 0]]],
            [200, 20, '02-20', [['02', 20], ['20', 200]]],
        ])('a heading of %i is stored as direction %i of runway %s', (heading, direction, designation, oneWay) => {
            const apt = airport('KXXX', 47, 8, {runwayHeading: heading});

            expect(apt.runways).toHaveLength(1);
            expect(apt.runways[0].direction).toBe(direction);
            expect(apt.runways[0].designation).toBe(designation);
            expect(ends(heading)).toEqual(oneWay);
        });

        it('resolves both ends as runway fixes, the end the heading points to with that course', () => {
            const apt = airport('KXXX', 47, 8, {runwayHeading: 270});

            const r27 = runwayFix(apt, '27');
            const r09 = runwayFix(apt, '09');

            // The threshold of 27 is the east end of the runway (an aircraft lands on it flying west), that of 09 the west end
            expect(r27.lon).toBeGreaterThan(8);
            expect(r09.lon).toBeLessThan(8);
            expect(angleDiff(RunwayUtils.getOneWayRunwaysFromAirport(apt).find(r => r.designation === '27')!.course, 270)).toBeCloseTo(0, 6);
        });
    });
});
