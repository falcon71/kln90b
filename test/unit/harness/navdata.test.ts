import {describe, expect, it} from 'vitest';
import {EventBus, FacilitySearchType, FacilityType, ICAO, UnitType} from '@microsoft/msfs-sdk';
import {airport, vor} from '../../harness/navdata/builders';
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

    it('serves KLNFacilityLoader', async () => {
        const loader = new KLNFacilityLoader(client as unknown as ActualFacilityClient, KLNFacilityRepository.getRepository(new EventBus()));
        await expect(loader.getFacility(FacilityType.VOR, abc.icaoStruct)).resolves.toBe(abc);
        const session = await loader.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Vor);
        const result = await session.searchNearest(47.3, 8.9, nm(20), 10);
        expect(result.added.map(i => i.ident)).toEqual(['ABC']);
    });
});
