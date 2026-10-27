import {describe, expect, it} from 'vitest';
import {bootUnit, settle} from '../../harness/boot';
import {standardRoute} from '../../harness/fixtures';
import {deleteLeg, insertLeg} from '../../harness/flightplan';
import {fplIdents} from '../../harness/readers';
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
        expect(fplIdents(unit)).toEqual(['KAAA', 'ABC', 'KBBB']);
        expect(legs.map(l => l.type)).toEqual([KLNLegType.USER, KLNLegType.USER, KLNLegType.USER]);
        // The other flight plans are untouched
        expect(unit.props.memory.fplPage.flightplans[1].getLegs()).toEqual([]);
    });
});

describe('deleteLeg (harness)', () => {
    it('deletes the leg at the given index from FPL 0 only', async () => {
        const {kaaa, abc, kbbb} = standardRoute();
        const unit = await bootUnit({facilities: [kaaa, abc, kbbb], position: {lat: 47, lon: 8}});
        await settle(unit);
        insertLeg(unit, 0, kaaa);
        insertLeg(unit, 1, abc);
        insertLeg(unit, 2, kbbb);
        unit.props.memory.fplPage.flightplans[1].insertLeg(0, {wpt: abc, type: KLNLegType.USER});

        deleteLeg(unit, 1);

        expect(fplIdents(unit)).toEqual(['KAAA', 'KBBB']);
        expect(fplIdents(unit, 1)).toEqual(['ABC']);
    });
});
