import {describe, expect, it, vi} from 'vitest';
import {bootUnit, settle} from '../../../harness/boot';
import {airport, vor} from '../../../harness/navdata/builders';
import {savedFlightplan} from '../../../harness/storage';
import {activeIdent} from '../../../harness/readers';
import {NavMode} from '../../../../kln90b/data/VolatileMemory';

const kaaa = airport('KAAA', 47.0, 8.0);
const abc = vor('ABC', 47.2, 8.0);
const kbbb = airport('KBBB', 47.4, 8.0);

// 3415417 (#67): a plan can hold the same waypoint twice (a missed approach to the IAF, for example). Switching to OBS
// replaces the active leg by a direct-to from a synthetic waypoint (ModeController.setObs), and that direct-to must
// stay on the occurrence of the waypoint that was active, not jump to the first one with the same ICAO.
describe('OBS mode on the second occurrence of a waypoint (3415417, #67)', () => {
    // Held elsewhere: OBS on a plan of KAAA twice (ActiveWaypoint.test.ts) and the DCT to the second ABC (#43,
    // DirectToPage.test.ts). The OBS entry on the second occurrence of a waypoint was not.
    async function directToSecondAbc() {
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb], position: {lat: 47.1, lon: 8.0}, storage: savedFlightplan(0, [kaaa, abc, kbbb, abc, kbbb]),
        });
        await settle(unit);
        const aw = unit.props.memory.navPage.activeWaypoint;
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 3); // The second ABC, by count
        await unit.panel.dct();
        await unit.panel.ent();
        await unit.panel.cursor('L');
        await vi.advanceTimersByTimeAsync(1000);
        expect(aw.getActiveFplIdx()).toBe(3); // Precondition, the same as the #43 test
        return {unit, aw};
    }

    // 5-36: switching to OBS keeps the active waypoint
    it('keeps the second occurrence active, with the plan behind it (#67)', async () => {
        const {unit, aw} = await directToSecondAbc();
        // An external course of 0 is the stored one, so setObs would return early (#122) and replace nothing
        unit.env.sim.set('Nav OBS:1', 'degrees', 90);

        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_OBS);
        expect(aw.getActiveFplIdx()).toBe(3);
        expect(activeIdent(unit)).toBe('ABC');
        expect(aw.getFutureLegs().map(l => l.wpt.icaoStruct.ident)).toEqual(['ABC', 'KBBB']);
        expect(unit.errors).toEqual([]);
    });
});
