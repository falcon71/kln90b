import {describe, expect, it} from 'vitest';
import {FacilityClient, IcaoValue, NearestSearchResults, UnitType, VorFacility} from '@microsoft/msfs-sdk';
import {NearestVorSearch, VorSearchSession} from '../../../../kln90b/data/navdata/NearestVorSearch';
import {vor} from '../../../harness/navdata/builders';

/** Lets every promise chain that can run without a timer run to its end */
async function flush(): Promise<void> {
    for (let i = 0; i < 50; i++) await Promise.resolve();
}

// NEA is 0.1 degrees (6 NM), FAR 0.5 degrees (30 NM) north of 47.0 N 8.0 E
const nea = () => vor('NEA', 47.1, 8.0);
const far = () => vor('FAR', 47.5, 8.0);

type Diff = { added?: VorFacility[], removed?: VorFacility[] };

/**
 * A session that answers its searches with the diffs given, one per search, in order. With `held`, a search answers
 * only when the test calls the `answer` it left in `pending`; a diff that is an Error rejects the search.
 */
function fakeSession(diffs: (Diff | Error)[], held = false) {
    const searches: { lat: number, lon: number, radius: number, maxItems: number }[] = [];
    const pending: (() => void)[] = [];
    const session = {
        searchNearest(lat: number, lon: number, radius: number, maxItems: number): Promise<NearestSearchResults<IcaoValue, IcaoValue>> {
            searches.push({lat, lon, radius, maxItems});
            const diff = diffs.shift() ?? {};
            return new Promise((resolve, reject) => {
                const answer = () => diff instanceof Error ? reject(diff) : resolve({
                    sessionId: 1, searchId: searches.length,
                    added: (diff.added ?? []).map(f => f.icaoStruct),
                    removed: (diff.removed ?? []).map(f => f.icaoStruct),
                });
                if (held) pending.push(answer); else answer();
            });
        },
    };
    return {session: session as unknown as VorSearchSession, searches, pending};
}

/** A facility client that loads the facilities given by ident and answers null for every other one */
function loader(...facilities: VorFacility[]): FacilityClient {
    return {
        tryGetFacility: async (_type: unknown, icao: IcaoValue) => facilities.find(f => f.icaoStruct.ident === icao.ident) ?? null,
    } as unknown as FacilityClient;
}

// Code contract (characterization, #204): the nearest search session reports only what was added to and removed from its
// result, and it merges the nearest VOR of the database with the nearest user VOR
describe('NearestVorSearch (characterization, #204)', () => {
    it('answers the nearest of the results, not the one added last', async () => {
        const {session} = fakeSession([{added: [nea(), far()]}]);

        const found = await new NearestVorSearch(loader(nea(), far()), session, 200).search(47.0, 8.0);

        expect(found?.icaoStruct.ident).toBe('NEA');
    });

    it('keeps the results of an earlier search', async () => {
        const {session} = fakeSession([{added: [nea()]}, {added: [far()]}]);
        const search = new NearestVorSearch(loader(nea(), far()), session, 200);
        expect((await search.search(47.0, 8.0))?.icaoStruct.ident).toBe('NEA'); // precondition

        expect((await search.search(47.0, 8.0))?.icaoStruct.ident).toBe('NEA');
    });

    it('drops a VOR the session removed', async () => {
        const {session} = fakeSession([{added: [nea(), far()]}, {removed: [nea()]}]);
        const search = new NearestVorSearch(loader(nea(), far()), session, 200);
        expect((await search.search(47.0, 8.0))?.icaoStruct.ident).toBe('NEA'); // precondition

        expect((await search.search(47.0, 8.0))?.icaoStruct.ident).toBe('FAR');
    });

    it('answers null without a result', async () => {
        const {session} = fakeSession([{}]);

        expect(await new NearestVorSearch(loader(), session, 200).search(47.0, 8.0)).toBeNull();
    });

    // The database can fail to load a VOR its search found (KLNFacilityLoader answers null for it, #95)
    it('skips a VOR that cannot be loaded', async () => {
        const {session} = fakeSession([{added: [nea(), far()]}]);

        expect((await new NearestVorSearch(loader(far()), session, 200).search(47.0, 8.0))?.icaoStruct.ident).toBe('FAR');
    });

    it('searches at the position asked, within the radius in meters, for one VOR', async () => {
        const {session, searches} = fakeSession([{}]);

        await new NearestVorSearch(loader(), session, 200).search(46.5, 7.5);

        expect(searches).toEqual([{lat: 46.5, lon: 7.5, radius: UnitType.NMILE.convertTo(200, UnitType.METER), maxItems: 1}]);
    });

    // The diffs must apply in the order the searches were made
    it('starts a search only when the one before it answered', async () => {
        const {session, searches, pending} = fakeSession([{added: [nea()]}, {removed: [nea()], added: [far()]}], true);
        const search = new NearestVorSearch(loader(nea(), far()), session, 200);

        const first = search.search(47.0, 8.0);
        const second = search.search(47.0, 8.0);
        await flush();
        expect(searches.length).toBe(1);
        pending[0]();
        await flush();
        expect(searches.length).toBe(2);
        pending[1]();

        expect((await first)?.icaoStruct.ident).toBe('NEA');
        expect((await second)?.icaoStruct.ident).toBe('FAR');
    });

    it('rejects the call of a failed search and answers the next call', async () => {
        const {session} = fakeSession([new Error('nearest search failed'), {added: [nea()]}]);
        const search = new NearestVorSearch(loader(nea()), session, 200);

        const failed = search.search(47.0, 8.0);
        const next = search.search(47.0, 8.0);

        await expect(failed).rejects.toThrow('nearest search failed');
        expect((await next)?.icaoStruct.ident).toBe('NEA');
    });
});
