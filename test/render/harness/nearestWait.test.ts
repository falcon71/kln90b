import {describe, expect, it, vi} from 'vitest';
import {bootUnit, NEAREST_SEARCH_WAIT_MS} from '../../harness/boot';
import {airport} from '../../harness/navdata/builders';

describe('NEAREST_SEARCH_WAIT_MS (harness)', () => {
    // The nearest lists search every 10 s (NearestList.ts), so the wait must leave one search and its result
    it('is long enough for the nearest airport list to hold a facility of the world', async () => {
        const unit = await bootUnit({facilities: [airport('KAAA', 47.1, 8.0)], position: {lat: 47, lon: 8}});
        const list = () => unit.props.nearestLists.aptNearestList.getNearestList().map(n => n.facility.icaoStruct.ident);

        await vi.advanceTimersByTimeAsync(NEAREST_SEARCH_WAIT_MS);

        expect(list()).toEqual(['KAAA']);
    });
});
