import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {airport, intersection, vor} from '../../../harness/navdata/builders';
import {readRows} from '../../../harness/render/screen';
import {KLNLegType} from '../../../../kln90b/data/flightplan/Flightplan';
import {insertLegIntoFpl} from '../../../../kln90b/services/FlightplanUtils';
import {Facility} from '@microsoft/msfs-sdk';

const rightRows = () => readRows(document.querySelector('.right-page')!).map(r => r.map(c => c.ch).join(''));

function append(unit: HeadlessUnit, wpt: Facility, idx: number): void {
    insertLegIntoFpl(unit.props.memory.fplPage.flightplans[0], unit.props.memory.navPage, idx, {wpt, type: KLNLegType.USER});
}

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

        // The plain VOR page of XYZ: SUP, INT, NDB, VOR in the right page tree, so VOR is three steps back (selectPage
        // would pass the NDB page, which Screen cannot read, #115)
        await unit.panel.outer('R', -3);
        await unit.panel.cursor('R');
        await unit.panel.type('R', 'XYZ');
        const plainRow0 = rightRows()[0];
        expect(plainRow0).toBe(' XYZ D     ');
        await unit.panel.cursor('R');

        // Then to ACT (VOR, NDB, INT, SUP, CTR, REF, ACT), with INTA as the active waypoint
        await unit.panel.outer('R', 6);
        append(unit, kaaa, 0);
        append(unit, inta, 1);
        await vi.advanceTimersByTimeAsync(3000);
        expect(rightRows()[0].slice(0, 11)).toBe('› 2 INTA I');
        await unit.panel.cursor('R');
        await vi.advanceTimersByTimeAsync(9000);
        await unit.panel.type('R', 'XYZ');
        await unit.panel.ent();

        // The confirmation page is the VOR page of XYZ, without the position in the flight plan of the ACT page
        expect(rightRows()[0]).toBe(plainRow0);
        expect(rightRows()[0]).not.toContain(' 2 ');
        expect(unit.errors).toEqual([]);
    });
});
