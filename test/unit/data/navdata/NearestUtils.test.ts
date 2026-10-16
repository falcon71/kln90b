import {beforeEach, describe, expect, it} from 'vitest';
import {EventBus, VorClass, VorType} from '@microsoft/msfs-sdk';
import {ActualFacilityClient, KLNFacilityLoader} from '../../../../kln90b/data/navdata/KLNFacilityLoader';
import {KLNFacilityRepository} from '../../../../kln90b/data/navdata/KLNFacilityRepository';
import {NearestUtils} from '../../../../kln90b/data/navdata/NearestUtils';
import {MemoryFacilityClient} from '../../../harness/navdata/MemoryFacilityClient';
import {vor} from '../../../harness/navdata/builders';
import {clearStatic} from '../../../harness/singletons';

beforeEach(() => clearStatic(KLNFacilityRepository, 'INSTANCE', false));

// 3-8, 3-32: NAV 2 shows the nearest low or high altitude VOR. The session merges the nearest database VOR with the
// nearest repository VOR that its masks take (#128). That is a VOR of low altitude class and VOR type in region XX here;
// no loader creates one, because a real user VOR has the class Unknown and never reaches NAV 2. The answer is the nearer
// of the two, not the one the session reported last (code contract, characterization, #204)
describe('NearestUtils.getNearestLowHighVor, the nearer of a database and a repository VOR (characterization, #204)', () => {
    async function setup(dbvLat: number) {
        const repo = KLNFacilityRepository.getRepository(new EventBus());
        const loader = new KLNFacilityLoader(new MemoryFacilityClient([vor('DBV', dbvLat, 8.0)]) as unknown as ActualFacilityClient, repo);
        const utils = new NearestUtils(loader);
        await utils.init();
        return {repo, utils};
    }

    // QQV is 0.2 degrees (12 NM) north of the aircraft at 47.0 N 8.0 E
    const qqv = () => vor('QQV', 47.2, 8.0, {region: 'XX', vorClass: VorClass.LowAlt, type: VorType.VOR});

    it('answers a nearer database VOR over a repository VOR added later', async () => {
        const {repo, utils} = await setup(47.1);
        expect((await utils.getNearestLowHighVor(47.0, 8.0))?.icaoStruct.ident).toBe('DBV'); // precondition
        repo.add(qqv());

        expect((await utils.getNearestLowHighVor(47.0, 8.0))?.icaoStruct.ident).toBe('DBV');
    });

    // The sibling of the test above: the same steps, the repository VOR the nearer one
    it('answers a nearer repository VOR over a database VOR found earlier', async () => {
        const {repo, utils} = await setup(47.3);
        expect((await utils.getNearestLowHighVor(47.0, 8.0))?.icaoStruct.ident).toBe('DBV'); // precondition
        repo.add(qqv());

        expect((await utils.getNearestLowHighVor(47.0, 8.0))?.icaoStruct.ident).toBe('QQV');
    });
});
