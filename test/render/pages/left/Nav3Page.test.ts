import {describe, expect, it, vi} from 'vitest';
import {bootUnit, settle} from '../../../harness/boot';
import {airport, vor} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';
import {savedFlightplan} from '../../../harness/storage';

describe('NAV 3 page', () => {
    // The same waypoint twice in a row (#19, #8) gives a route leg without length. The ESA is the highest MSA along the
    // rest of the route, so the page asks the MSA service for that leg too. 16800 is the value the shipped MSA grid gives
    // for this route (KAAA is at 46N 7E), copied once from the screen: characterization of the grid data.
    it('shows the ESA with the same waypoint twice in FPL 0 and raises no error (#8 4cbe2b5) (characterization)', async () => {
        const kaaa = airport('KAAA', 46, 7);
        const abc = vor('ABC', 47, 8);
        const kbbb = airport('KBBB', 48, 9);
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb],
            position: {lat: 46, lon: 7},
            storage: savedFlightplan(0, [kaaa, abc, abc, kbbb]),
        });
        // The FPL activates at the first calculation tick with a GPS fix
        await settle(unit);
        await unit.panel.selectPage('L', 'NAV 3');
        await vi.advanceTimersByTimeAsync(2000);

        // KAAA is the FROM waypoint and ABC the active one, followed by the duplicate and KBBB
        const activeWaypoint = unit.props.memory.navPage.activeWaypoint;
        expect(activeWaypoint.getActiveWpt()?.icaoStruct.ident).toBe('ABC');
        expect(activeWaypoint.getFutureLegs().map(l => l.wpt.icaoStruct.ident)).toEqual(['ABC', 'ABC', 'KBBB']);

        expect(unit.errors).toEqual([]);
        const rows = Screen.read().rows('L');
        expect(rows[0]).toBe('KAAA ›ABC  ');
        expect(rows[5]).toBe('ESA 16800ft');
    });
});
