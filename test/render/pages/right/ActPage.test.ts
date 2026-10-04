import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {airport, ndb} from '../../../harness/navdata/builders';
import {readRows, Screen} from '../../../harness/render/screen';
import {KLNLegType} from '../../../../kln90b/data/flightplan/Flightplan';
import {insertLegIntoFpl} from '../../../../kln90b/services/FlightplanUtils';
import {Facility} from '@microsoft/msfs-sdk';

/**
 * The rows of the right page as the DOM has them. Screen.read() refuses a row wider than the 11 columns of a half page,
 * and the first row of an ACT page is wider (see the pin below).
 */
function rightRows(): string[] {
    return readRows(document.querySelector('.right-page')!).map(r => r.map(c => c.ch).join(''));
}

function statusLine(): string {
    return readRows(document.querySelector('.statusline')!)[0].map(c => c.ch).join('');
}

function append(unit: HeadlessUnit, wpt: Facility, idx: number): void {
    const fpl0 = unit.props.memory.fplPage.flightplans[0];
    insertLegIntoFpl(fpl0, unit.props.memory.navPage, idx, {wpt, type: KLNLegType.USER});
}

describe('ACT page', () => {
    // 4-10: the ACT page shows the active waypoint, or tells that there is none
    it('refreshes when the flight plan gets an active waypoint (f95d1d7)', async () => {
        const kaaa = airport('KAAA', 47.0, 7.9);
        const kbbb = airport('KBBB', 47.0, 8.3);
        const unit = await bootUnit({facilities: [kaaa, kbbb], position: {lat: 47.0, lon: 8.0}});
        await unit.panel.selectPage('R', 'ACT  ');
        const before = Screen.read().half('R').split('\n');
        expect(before[2]).toBe('NO ACTIVE  ');
        expect(before[4]).toBe('WAYPOINT   ');

        append(unit, kaaa, 0);
        append(unit, kbbb, 1);
        await vi.advanceTimersByTimeAsync(3000);

        const rows = rightRows();
        expect(rows.join('\n')).not.toContain('NO ACTIVE');
        // The arrow, then the position in the flight plan, the ident and the type of the waypoint
        expect(rows[0].slice(1, 11)).toBe(' 2 KBBB  A');
        expect(statusLine().slice(18, 23)).toBe('ACT 1');
    });

    // 4-10: the page follows the active waypoint without a page change
    it('follows the active waypoint when the flight plan changes, and shows NO ACTIVE when there is none (f95d1d7)', async () => {
        const kaaa = airport('KAAA', 47.0, 7.9);
        const kbbb = airport('KBBB', 47.0, 8.3);
        const kccc = airport('KCCC', 47.0, 8.5);
        const unit = await bootUnit({facilities: [kaaa, kbbb, kccc], position: {lat: 47.0, lon: 8.0}});
        await unit.panel.selectPage('R', 'ACT  ');
        append(unit, kaaa, 0);
        append(unit, kbbb, 1);
        await vi.advanceTimersByTimeAsync(3000);
        expect(rightRows()[0].slice(1, 11)).toBe(' 2 KBBB  A');

        // A leg in front of the active one moves it to position 3
        append(unit, kccc, 0);
        await vi.advanceTimersByTimeAsync(3000);
        expect(rightRows()[0].slice(1, 11)).toBe(' 3 KBBB  A');

        // Deleting the active leg makes KAAA the active waypoint
        unit.props.memory.fplPage.flightplans[0].deleteLeg(2);
        await vi.advanceTimersByTimeAsync(3000);
        expect(rightRows()[0].slice(1, 11)).toBe(' 2 KAAA  A');

        // Without legs there is no active waypoint
        const fpl0 = unit.props.memory.fplPage.flightplans[0];
        while (fpl0.getLegs().length > 0) {
            fpl0.deleteLeg(0);
        }
        await vi.advanceTimersByTimeAsync(3000);
        const rows = Screen.read().half('R').split('\n');
        expect(rows[2]).toBe('NO ACTIVE  ');
        expect(rows[4]).toBe('WAYPOINT   ');
    });

    // 4-10: the type letter is on the right of the first row
    it.fails('shows the type letter of an NDB inside the half page (#NEW-6-2)', async () => {
        const kaaa = airport('KAAA', 47.0, 7.9);
        const abc = ndb('ABC', 47.0, 8.3);
        const unit = await bootUnit({facilities: [kaaa, abc], position: {lat: 47.0, lon: 8.0}});
        await unit.panel.selectPage('R', 'ACT  ');
        append(unit, kaaa, 0);
        append(unit, abc, 1);
        await vi.advanceTimersByTimeAsync(3000);

        const first = rightRows()[0];
        expect(first.length).toBeLessThanOrEqual(11);
        expect(first.trimEnd().endsWith('N')).toBe(true);
    });
});
