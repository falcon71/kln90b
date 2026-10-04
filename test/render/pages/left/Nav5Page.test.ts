import {describe, expect, it, vi} from 'vitest';
import {bootUnit, settle} from '../../../harness/boot';
import {airport, vor} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';
import {savedFlightplan} from '../../../harness/storage';

describe('NAV 5 page', () => {
    // The same waypoint twice in a row (#19, #8) gives a flight plan leg without length, and the map projects it to
    // two identical points. Drawing it threw before the map skipped such legs (9f0b7e1).
    it('draws FPL 0 with the same waypoint twice in a row without an error (#8 9f0b7e1, characterization)', async () => {
        const kaaa = airport('KAAA', 46, 7);
        const abc = vor('ABC', 46.05, 7.05);
        const kbbb = airport('KBBB', 46.1, 7.1);
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb],
            position: {lat: 46, lon: 7},
            storage: savedFlightplan(0, [kaaa, abc, abc, kbbb]),
        });
        // The FPL activates at the first calculation tick with a GPS fix
        await settle(unit);
        await unit.panel.selectPage('L', 'NAV 5');
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.props.memory.navPage.activeWaypoint.getFutureLegs().map(l => l.wpt.icaoStruct.ident)).toEqual(['ABC', 'ABC', 'KBBB']);
        expect(unit.errors).toEqual([]);
        expect(Screen.read().status().left).toBe('NAV 5');
    });
});
