import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {insertLeg} from '../../../harness/flightplan';
import {airport, intersection, vor} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';


describe('waypoint confirmation page', () => {
    // 3-14: the confirmation page shows the waypoint as the waypoint page does (the ACT page is the one with a position
    // in the flight plan in front of the ident)
    it('opened from the ACT page has the layout of the waypoint page (8045b29)', async () => {
        const kaaa = airport('KAAA', 47.0, 7.9);
        const inta = intersection('INTA', 47.1, 8.0);
        const unit = await bootUnit({
            facilities: [kaaa, inta, vor('ABC', 47.2, 8.0), vor('XYZ', 48.5, 8.0)],
            position: {lat: 47.0, lon: 8.0},
        });

        // The plain VOR page of XYZ
        await unit.panel.selectPage('R', 'VOR  ');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'XYZ');
        const plainRow0 = Screen.read().rows('R')[0];
        expect(plainRow0).toBe(' XYZ D     ');
        await unit.panel.cursor('R');

        // Then to ACT, with INTA as the active waypoint
        await unit.panel.selectPage('R', 'ACT  ');
        insertLeg(unit, 0, kaaa);
        insertLeg(unit, 1, inta);
        await vi.advanceTimersByTimeAsync(3000);
        expect(Screen.read().rows('R')[0]).toBe('› 2 INTA I ');
        await unit.panel.cursor('R');
        await vi.advanceTimersByTimeAsync(9000);
        await unit.panel.enterIdent('R', 'XYZ');
        await unit.panel.ent();

        // The confirmation page is the VOR page of XYZ, without the position in the flight plan of the ACT page
        expect(Screen.read().rows('R')[0]).toBe(plainRow0);
        expect(Screen.read().rows('R')[0]).not.toContain(' 2 ');
        expect(unit.errors).toEqual([]);
    });
});
