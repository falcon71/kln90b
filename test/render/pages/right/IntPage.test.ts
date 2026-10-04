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
        // The right page of a fresh unit is SUP, and INT is one step back. selectPage only turns the knob forward and would
        // pass the NDB page, which Screen cannot read (#115)
        await unit.panel.outer('R', -1);
        await vi.advanceTimersByTimeAsync(9000); // the REF calculation takes 8 s (REF_CALCULATION_TIME)
        await unit.panel.cursor('R');
        await unit.panel.outer('R', 5);
        await unit.panel.type('R', 'XYZ');

        await unit.panel.ent();

        // The confirmation page offers ENT (the "ent" message of the status line) and shows the VOR page of XYZ
        expect(Screen.read().rightName()).toBe('VOR  ');
        expect(Screen.read().row(6).slice(6, 17)).toBe('enr-leg ent');

        await unit.panel.ent();

        const screen = Screen.read();
        expect(unit.errors).toEqual([]);
        expect(screen.rightName()).toBe('CRSR ');
        expect(screen.half('R').split('\n')[1]).toBe('REF:  XYZ  ');
    });
});
