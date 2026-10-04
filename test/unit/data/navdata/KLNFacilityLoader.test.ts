import {beforeEach, describe, expect, it} from 'vitest';
import {EventBus, FacilitySearchType} from '@microsoft/msfs-sdk';
import {ActualFacilityClient, KLNFacilityLoader} from '../../../../kln90b/data/navdata/KLNFacilityLoader';
import {KLNFacilityRepository} from '../../../../kln90b/data/navdata/KLNFacilityRepository';
import {MemoryFacilityClient} from '../../../harness/navdata/MemoryFacilityClient';
import {vor} from '../../../harness/navdata/builders';
import {clearStatic} from '../../../harness/singletons';

beforeEach(() => clearStatic(KLNFacilityRepository, 'INSTANCE', false));

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
});
