import {describe, expect, it, vi} from 'vitest';
import {bootUnit, moveAircraft, settle} from '../../harness/boot';
import {approachWorld} from '../../harness/fixtures';
import {savedFlightplan} from '../../harness/storage';
import {KLNFixType} from '../../../kln90b/data/flightplan/Flightplan';
import {NavMode} from '../../../kln90b/data/VolatileMemory';

describe('approachWorld (harness)', () => {
    async function loaded(nmNorth: number) {
        const w = approachWorld();
        const unit = await bootUnit({
            facilities: w.facilities, position: w.north(nmNorth),
            storage: {...savedFlightplan(0, [w.enraa, w.kprc]), turnAnticipation: false},
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        return {w, unit};
    }

    it('loads the approach into FPL 0 with its IAF, FAF and MAP', async () => {
        const {unit} = await loaded(20);
        const legs = unit.props.memory.fplPage.flightplans[0].getLegs();
        expect(legs.map(l => l.wpt.icaoStruct.ident)).toEqual(['ENRAA', 'IAFAA', 'IFAAA', 'FAFAA', 'SDFAA', 'MAPAA', 'KPRC']);
        expect(legs.map(l => l.fixType)).toEqual([undefined, KLNFixType.IAF, undefined, KLNFixType.FAF, undefined, KLNFixType.MAP, undefined]);
    });

    it('reaches APR within 2 NM of the FAF on the final course', async () => {
        const {w, unit} = await loaded(7.5);   // 2.5 NM before FAFAA, inside 30 NM: armed
        await vi.advanceTimersByTimeAsync(31_000);
        await moveAircraft(unit, w.north(6.5), {groundspeedKt: 120, trackTrue: 180});
        await vi.advanceTimersByTimeAsync(1000);
        expect(unit.props.memory.navPage.navmode).toBe(NavMode.APR_LEG);
    });
});
