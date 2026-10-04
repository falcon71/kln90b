import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {intersection, vor} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';

describe('INT page', () => {
    // 3-14 to 3-15: a reference waypoint is confirmed on its waypoint page, and the second ENT accepts it
    it('takes a REF waypoint through the confirmation page (#72)', async () => {
        const unit = await bootUnit({
            facilities: [intersection('INTA', 47.1, 8.0), vor('ABC', 47.2, 8.0), vor('XYZ', 48.5, 8.0)],
            position: {lat: 47.0, lon: 8.0},
        });
        await unit.panel.selectPage('R', 'INT  ');
        await vi.advanceTimersByTimeAsync(9000); // the REF calculation takes 8 s (REF_CALCULATION_TIME)
        await unit.panel.cursor('R');
        await unit.panel.cursorTo('R', 'ABC'); // the REF field, which shows the nearest VOR
        await unit.panel.enterIdent('R', 'XYZ');

        await unit.panel.ent();

        // The confirmation page offers ENT (the "ent" message of the status line) and shows the VOR page of XYZ
        expect(Screen.read().status().right).toBe('VOR');
        expect(Screen.read().status().mode).toBe('enr-leg ent');

        await unit.panel.ent();

        const screen = Screen.read();
        expect(unit.errors).toEqual([]);
        expect(screen.status().right).toBe('CRSR');
        expect(screen.rows('R')[1]).toBe('REF:  XYZ  ');
    });
});
