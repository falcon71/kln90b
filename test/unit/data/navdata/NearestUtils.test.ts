import {beforeEach, describe, expect, it} from 'vitest';
import {EventBus, FacilityType, VorClass, VorType} from '@microsoft/msfs-sdk';
import {ActualFacilityClient, KLNFacilityLoader} from '../../../../kln90b/data/navdata/KLNFacilityLoader';
import {KLNFacilityRepository} from '../../../../kln90b/data/navdata/KLNFacilityRepository';
import {NearestUtils} from '../../../../kln90b/data/navdata/NearestUtils';
import {MemoryFacilityClient} from '../../../harness/navdata/MemoryFacilityClient';
import {vor} from '../../../harness/navdata/builders';
import {clearStatic} from '../../../harness/singletons';

beforeEach(() => clearStatic(KLNFacilityRepository, 'INSTANCE', false));

/** Lets every promise chain that can run without a timer or the gate run to its end */
async function flush(): Promise<void> {
    for (let i = 0; i < 50; i++) await Promise.resolve();
}

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

// Code contract (characterization, #206): the nearest VOR session reports only what was added to and removed from its
// result, so the answers of getNearestVor are built from the diffs in the order the searches were made. Concurrent
// calls (two pages computing a reference, the Center waypoints of CTR 1) must not apply their diffs out of order.
describe('NearestUtils.getNearestVor with concurrent calls (characterization, #206)', () => {
    // QQV is a user VOR 6 NM north of the first position, DBV a database VOR 600 NM away
    const qqv = () => vor('QQV', 47.1, 8.0, {region: 'XX', vorClass: VorClass.Unknown, type: VorType.Unknown});

    async function setup() {
        const repo = KLNFacilityRepository.getRepository(new EventBus());
        const loader = new KLNFacilityLoader(new MemoryFacilityClient([vor('DBV', 57.0, 8.0)]) as unknown as ActualFacilityClient, repo);

        // The load of QQV is read at once, but its answer waits for the gate: the sim database answers when it likes
        let openGate = () => {};
        const gate = new Promise<void>(resolve => openGate = resolve);
        const tryGetFacility = loader.tryGetFacility.bind(loader);
        loader.tryGetFacility = (async (type: FacilityType, icao: any) => {
            const facility = await tryGetFacility(type, icao);
            if (icao.ident === 'QQV') await gate;
            return facility;
        }) as typeof loader.tryGetFacility;

        const utils = new NearestUtils(loader);
        await utils.init();
        return {repo, loader, utils, openGate};
    }

    it('answers each call with the nearest VOR of its position and keeps no VOR that was removed meanwhile', async () => {
        const {repo, utils, openGate} = await setup();
        repo.add(qqv());

        const first = utils.getNearestVor(47.0, 8.0); // finds QQV, whose load waits for the gate
        await flush(); // the first search reaches the load of QQV
        repo.remove(qqv().icaoStruct); // the user deletes QQV
        const second = utils.getNearestVor(47.0, 8.0); // the session reports QQV as removed
        await flush(); // the second search is done, or queued behind the first
        openGate();

        expect((await first)?.icaoStruct.ident).toBe('QQV'); // it was there when the first search ran
        expect((await second)?.icaoStruct.ident).toBe('DBV');
        // QQV is gone for good: a later search must not bring it back from the results the calls left behind
        expect((await utils.getNearestVor(47.0, 8.0))?.icaoStruct.ident).toBe('DBV');
    });

    // The database can fail to load a VOR its search found (KLNFacilityLoader answers null for it): the others still count
    it('skips a VOR that cannot be loaded', async () => {
        const {utils, repo, loader, openGate} = await setup();
        openGate();
        repo.add(qqv());
        const tryGetFacility = loader.tryGetFacility.bind(loader);
        loader.tryGetFacility = (async (type: FacilityType, icao: any) => icao.ident === 'QQV' ? null : tryGetFacility(type, icao)) as typeof loader.tryGetFacility;

        expect((await utils.getNearestVor(47.0, 8.0))?.icaoStruct.ident).toBe('DBV');
    });

    // A search that rejects (the sim's facility database failed) rejects its caller, but it must not stop the searches
    // queued behind it
    it('rejects the call of a failed search and answers the next call', async () => {
        const {utils, openGate} = await setup();
        openGate();
        const session = (utils as any).vorSession;
        const searchNearest = session.searchNearest.bind(session);
        let failures = 0;
        session.searchNearest = (...args: unknown[]) => failures++ === 0 ? Promise.reject(new Error('nearest search failed')) : searchNearest(...args);

        await expect(utils.getNearestVor(47.0, 8.0)).rejects.toThrow('nearest search failed');
        expect((await utils.getNearestVor(47.0, 8.0))?.icaoStruct.ident).toBe('DBV');
    });
});
