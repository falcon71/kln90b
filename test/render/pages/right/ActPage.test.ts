import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {insertLeg} from '../../../harness/flightplan';
import {airport, ndb} from '../../../harness/navdata/builders';
import {readRows, Screen} from '../../../harness/render/screen';

describe('ACT page', () => {
    // 4-10: the ACT page shows the active waypoint, or tells that there is none
    it('refreshes when the flight plan gets an active waypoint (f95d1d7)', async () => {
        const kaaa = airport('KAAA', 47.0, 7.9);
        const kbbb = airport('KBBB', 47.0, 8.3);
        const unit = await bootUnit({facilities: [kaaa, kbbb], position: {lat: 47.0, lon: 8.0}});
        await unit.panel.selectPage('R', 'ACT  ');
        const before = Screen.read().rows('R');
        expect(before[2]).toBe('NO ACTIVE  ');
        expect(before[4]).toBe('WAYPOINT   ');

        insertLeg(unit, 0, kaaa);
        insertLeg(unit, 1, kbbb);
        await vi.advanceTimersByTimeAsync(3000);

        const screen = Screen.read();
        const rows = screen.rows('R');
        expect(rows.join('\n')).not.toContain('NO ACTIVE');
        // The arrow, then the position in the flight plan, the ident and the type of the waypoint
        expect(rows[0].slice(1, 11)).toBe(' 2 KBBB  A');
        expect(screen.status().right).toBe('ACT 1');
    });

    // 4-10: the page follows the active waypoint without a page change
    it('follows the active waypoint when the flight plan changes, and shows NO ACTIVE when there is none (f95d1d7)', async () => {
        const kaaa = airport('KAAA', 47.0, 7.9);
        const kbbb = airport('KBBB', 47.0, 8.3);
        const kccc = airport('KCCC', 47.0, 8.5);
        const unit = await bootUnit({facilities: [kaaa, kbbb, kccc], position: {lat: 47.0, lon: 8.0}});
        await unit.panel.selectPage('R', 'ACT  ');
        insertLeg(unit, 0, kaaa);
        insertLeg(unit, 1, kbbb);
        await vi.advanceTimersByTimeAsync(3000);
        expect(Screen.read().rows('R')[0].slice(1, 11)).toBe(' 2 KBBB  A');

        // A leg in front of the active one moves it to position 3
        insertLeg(unit, 0, kccc);
        await vi.advanceTimersByTimeAsync(3000);
        expect(Screen.read().rows('R')[0].slice(1, 11)).toBe(' 3 KBBB  A');

        // Deleting the active leg makes KAAA the active waypoint
        unit.props.memory.fplPage.flightplans[0].deleteLeg(2);
        await vi.advanceTimersByTimeAsync(3000);
        expect(Screen.read().rows('R')[0].slice(1, 11)).toBe(' 2 KAAA  A');

        // Without legs there is no active waypoint
        const fpl0 = unit.props.memory.fplPage.flightplans[0];
        while (fpl0.getLegs().length > 0) {
            fpl0.deleteLeg(0);
        }
        await vi.advanceTimersByTimeAsync(3000);
        const rows = Screen.read().rows('R');
        expect(rows[2]).toBe('NO ACTIVE  ');
        expect(rows[4]).toBe('WAYPOINT   ');
    });

    // 4-10: the type letter is on the right of the first row
    it.fails('shows the type letter of an NDB inside the half page (#115)', async () => {
        const kaaa = airport('KAAA', 47.0, 7.9);
        const abc = ndb('ABC', 47.0, 8.3);
        const unit = await bootUnit({facilities: [kaaa, abc], position: {lat: 47.0, lon: 8.0}});
        await unit.panel.selectPage('R', 'ACT  ');
        insertLeg(unit, 0, kaaa);
        insertLeg(unit, 1, abc);
        await vi.advanceTimersByTimeAsync(3000);

        // Not Screen.read(): it refuses the type letter past the 11 columns of the half page, which is this bug (#115), so
        // the pin reads the rows of the DOM
        const first = readRows(document.querySelector('.right-page')!).map(r => r.map(c => c.ch).join(''))[0];
        expect(first.length).toBeLessThanOrEqual(11);
        expect(first.trimEnd().endsWith('N')).toBe(true);
    });
});
