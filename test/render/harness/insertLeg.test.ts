import {describe, expect, it} from 'vitest';
import {bootUnit, settle} from '../../harness/boot';
import {standardRoute} from '../../harness/fixtures';
import {insertLeg} from '../../harness/flightplan';
import {KLNLegType} from '../../../kln90b/data/flightplan/Flightplan';

describe('insertLeg (harness)', () => {
    it('inserts USER legs into FPL 0 at the given index', async () => {
        const {kaaa, abc, kbbb} = standardRoute();
        const unit = await bootUnit({facilities: [kaaa, abc, kbbb], position: {lat: 47, lon: 8}});
        await settle(unit);

        insertLeg(unit, 0, kaaa);
        insertLeg(unit, 1, kbbb);
        insertLeg(unit, 1, abc);

        const legs = unit.props.memory.fplPage.flightplans[0].getLegs();
        expect(legs.map(l => l.wpt.icaoStruct.ident)).toEqual(['KAAA', 'ABC', 'KBBB']);
        expect(legs.map(l => l.type)).toEqual([KLNLegType.USER, KLNLegType.USER, KLNLegType.USER]);
        // The other flight plans are untouched
        expect(unit.props.memory.fplPage.flightplans[1].getLegs()).toEqual([]);
    });
});
