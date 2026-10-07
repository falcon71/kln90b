import {describe, expect, it, vi} from 'vitest';
import {BoundaryType} from '@microsoft/msfs-sdk';
import {bootUnit, settle} from '../../../harness/boot';
import {standardRoute} from '../../../harness/fixtures';
import {pointFrom} from '../../../harness/flight/geo';
import {airspace} from '../../../harness/navdata/airspaces';
import {airport} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';
import {savedFlightplan} from '../../../harness/storage';

describe('TRI 6 page (characterization)', () => {
    it('shows the ESA of FPL 0 (characterization)', async () => {
        const {kaaa, abc, kbbb} = standardRoute();
        const unit = await bootUnit({facilities: [kaaa, abc, kbbb], storage: savedFlightplan(0, [kaaa, abc, kbbb])});
        await settle(unit);
        await unit.panel.selectPage('L', 'TRI 6');
        await vi.advanceTimersByTimeAsync(2000); // The airspace search is asynchronous
        expect(unit.errors).toEqual([]);
        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          "FP 0       
          ESA 11400ft
                     
                     
                     
                     "
        `);
    });

    it('shows only the plan number for a plan of one waypoint (characterization)', async () => {
        const kaaa = airport('KAAA', 47.0, 8.0);
        const unit = await bootUnit({facilities: [kaaa], storage: savedFlightplan(0, [kaaa])});
        await settle(unit);
        await unit.panel.selectPage('L', 'TRI 6');
        await vi.advanceTimersByTimeAsync(2000);
        expect(Screen.read().rows('L')).toEqual(['FP 0       ', '           ', '           ', '           ', '           ', '           ']);
    });
});

describe('TRI 6 page (5-6)', () => {
    // 5-6, step 4 and figures 5-19 and 5-20: after a plan is selected on TRI 5, TRI 6 shows the same plan. FPL 3 lies
    // far from FPL 0 and starts inside a restricted area (the route search finds only such areas, #102), so the area
    // tells the plans apart
    it('shows the flight plan selected on TRI 5 (5-6)', async () => {
        const {kaaa, abc, kbbb} = standardRoute();
        const kccc = airport('KCCC', 52.0, 4.0);
        const kddd = airport('KDDD', 52.5, 4.0);
        const n = pointFrom(kccc, 0, 2.5).lat;
        const s = pointFrom(kccc, 180, 2.5).lat;
        const e = pointFrom(kccc, 90, 2.5).lon;
        const w = pointFrom(kccc, 270, 2.5).lon;
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb, kccc, kddd], altitudeFt: 0,
            airspaces: [airspace('R-CCC', BoundaryType.Restricted, [[n, w], [n, e], [s, e], [s, w]])],
            storage: {...savedFlightplan(0, [kaaa, abc, kbbb]), ...savedFlightplan(3, [kccc, kddd])},
        });
        await settle(unit);
        await unit.panel.selectPage('L', 'TRI 5');
        await unit.panel.cursor('L');
        await unit.panel.inner('L', 3);
        await unit.panel.cursor('L');
        expect(Screen.read().rows('L')[1]).toBe('KCCC -KDDD '); // The precondition: TRI 5 shows FPL 3

        await unit.panel.selectPage('L', 'TRI 6');
        await vi.advanceTimersByTimeAsync(2000);
        const rows = Screen.read().rows('L');
        expect(rows[0]).toBe('FP 3       ');
        expect(rows[1]).toMatch(/^ESA [ 0-9]{4}[0-9]ft$/);
        expect(rows.slice(2, 4)).toEqual(['R-CCC      ', ' REST      ']);
    });
});
