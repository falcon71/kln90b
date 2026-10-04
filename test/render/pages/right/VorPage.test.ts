import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {vor} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';

/** The first two rows of the right half page: ident row and name row */
function identAndName(): string[] {
    return Screen.read().rows('R').slice(0, 2);
}

describe('VOR page with duplicate idents (d3228dd)', () => {
    // 3-21: the scan knob steps through every VOR in alphanumeric order. Two VORs share the ident ABC in different
    // regions; neither may be skipped, and the facility the unit picks for a typed ident must be the first of them
    // in the list order (region K1 before K2, the code's own order for equal idents). The names tell them apart.
    it('selects and scans through both VORs with the ident ABC', async () => {
        const unit = await bootUnit({
            // Database order: the K2 VOR comes first, so a search result that is not sorted by region shows ABC SOUTH
            facilities: [
                vor('ABC', 47.3, 8.3, {region: 'K2', name: 'ABC SOUTH', frequencyMHz: 117.0}),
                vor('ABC', 47.2, 8.2, {region: 'K1', name: 'ABC NORTH', frequencyMHz: 116.0}),
                vor('ABD', 47.1, 8.1),
            ],
        });
        await unit.panel.selectPage('R', 'VOR  ');
        await unit.panel.cursor('R');
        // Not enterIdent: the fresh page shows ABC SOUTH, so its first character is an A already, the knobs would leave
        // it alone, and no search would run. The keyboard sets every character, so it makes the unit search for ABC.
        await unit.panel.type('R', 'ABC');
        await unit.panel.cursor('R');
        expect(identAndName()).toEqual([' ABC D     ', 'ABC NORTH  ']);

        await unit.panel.scan();
        await unit.panel.inner('R', 1);
        expect(identAndName()).toEqual([' ABC D     ', 'ABC SOUTH  ']);

        // Another scan step within 350 ms would speed the scan up (WaypointPage SPEEDSTEP)
        await vi.advanceTimersByTimeAsync(400);
        await unit.panel.inner('R', 1);
        expect(identAndName()).toEqual([' ABD D     ', 'ABD        ']);
        expect(unit.errors).toEqual([]);
    });
});
