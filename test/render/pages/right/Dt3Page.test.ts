import {describe, expect, it, vi} from 'vitest';
import {bootUnit, settle} from '../../../harness/boot';
import {airport, intersection, vor} from '../../../harness/navdata/builders';
import {savedFlightplan} from '../../../harness/storage';
import {Screen} from '../../../harness/render/screen';

describe('D/T 3 page', () => {
    it('shows the same DIS and DTK for a leg that repeats the previous waypoint (#27, dbb01bf)', async () => {
        // 4-12: D/T 3 shows DIS and DTK per waypoint of FPL 0; the KLN 89 trainer repeats the values for a repeated waypoint
        const kaaa = airport('KAAA', 47.6, 8.0);
        const abc = vor('ABC', 47.4, 8.0);
        const def = intersection('DEF', 47.2, 8.0);
        const kbbb = airport('KBBB', 47.0, 8.0);
        const unit = await bootUnit({
            facilities: [kaaa, abc, def, kbbb], position: {lat: 47.5, lon: 8.0}, magvar: 0,
            storage: savedFlightplan(0, [kaaa, abc, def, def, kbbb]),
        });
        await settle(unit);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(1); // Precondition: ABC is active

        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.selectPage('R', 'D/T 3');
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.errors).toEqual([]);
        const screen = Screen.read();
        expect(screen.status().left).toBe('FPL 0');
        expect(screen.status().right).toBe('D/T 3');
        // The distances accumulate along the legs, 0.1 degree of latitude is 6.0108 NM: 6, 18 (twice, the repeated DEF), 30.
        // KAAA lies behind the active leg and has no values
        expect(screen.rows('R')).toEqual([
            'DIS     DTK',
            '           ',
            '  6    180°',
            ' 18    180°',
            ' 18    180°',
            ' 30    180°',
        ]);
        // A zero-length leg would give a NaN heading, which the SDK reports with console.error
        expect(unit.consoleErrors).toEqual([]);
    });
});
