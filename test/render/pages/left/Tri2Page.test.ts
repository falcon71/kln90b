import {describe, expect, it, vi} from 'vitest';
import {BoundaryFacility, BoundaryType} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {pointFrom} from '../../../harness/flight/geo';
import {airspace} from '../../../harness/navdata/airspaces';
import {airport} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';

// The aircraft is at KAAA; KBBB lies 40 NM due north. The areas below all hold the present position, because the
// route search only finds such areas (#102, pinned in AirspacesAlongRoute.test.ts).
const POS = {lat: 47.0, lon: 8.0};

/** A restricted area of 5 NM by 5 NM around the present position */
function areaAtPosition(name: string): BoundaryFacility {
    const n = pointFrom(POS, 0, 2.5).lat;
    const s = pointFrom(POS, 180, 2.5).lat;
    const e = pointFrom(POS, 90, 2.5).lon;
    const w = pointFrom(POS, 270, 2.5).lon;
    return airspace(name, BoundaryType.Restricted, [[n, w], [n, e], [s, e], [s, w]]);
}

/** Boots, enters KBBB on TRI 1 (cursor, ident, ENT, ENT, cursor off) and selects TRI 2 */
async function tri2After1(areas: BoundaryFacility[]): Promise<HeadlessUnit> {
    const kbbbPos = pointFrom(POS, 0, 40);
    const unit = await bootUnit({
        facilities: [airport('KAAA', POS.lat, POS.lon), airport('KBBB', kbbbPos.lat, kbbbPos.lon)],
        position: POS, altitudeFt: 0, airspaces: areas,
    });
    await settle(unit);
    await unit.panel.selectPage('L', 'TRI 1');
    await unit.panel.cursor('L');
    await unit.panel.type('L', 'KBBB');
    await unit.panel.ent();
    await unit.panel.ent();
    await unit.panel.cursor('L');
    await unit.panel.selectPage('L', 'TRI 2');
    await vi.advanceTimersByTimeAsync(2000); // The airspace search is asynchronous
    return unit;
}

describe('TRI 2 page (characterization)', () => {
    it('shows the ESA and one restricted area from the present position to KBBB (characterization)', async () => {
        const unit = await tri2After1([areaAtPosition('R-ONE')]);
        expect(unit.errors).toEqual([]);
        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          "P.POS-KBBB 
          ESA 11400ft
          R-ONE      
           REST      
                     
                     "
        `);
    });
});

describe('TRI 2 page (5-4)', () => {
    // 5-4, step 11 and figure 5-11: TRI 2 is the second half of the TRI 1 trip; it shows the waypoint entered on TRI 1
    // and the minimum enroute safe altitude in the form ESA nnnnnft
    it('shows the waypoint entered on TRI 1 and an ESA line (5-4)', async () => {
        await tri2After1([]);
        const rows = Screen.read().rows('L');
        expect(rows[0]).toBe('P.POS-KBBB ');
        expect(rows[1]).toMatch(/^ESA [ 0-9]{4}[0-9]ft$/);
        expect(rows.slice(2)).toEqual(['           ', '           ', '           ', '           ']);
    });

    // 5-4, step 11: when the areas do not fit on one page there are several TRI 2 pages, shown as TRI+2. Three areas
    // take six rows besides the ESA line, one more than the five rows of a page
    it('spreads three areas over two pages named TRI+2, turned with the inner knob (5-4)', async () => {
        const unit = await tri2After1([areaAtPosition('R-ONE'), areaAtPosition('R-TWO'), areaAtPosition('R-THREE')]);
        const first = Screen.read();
        expect(first.status().left).toBe('TRI+2');
        const firstRows = first.rows('L');

        await unit.panel.inner('L', 1);
        const second = Screen.read();
        expect(second.status().left).toBe('TRI+2');
        const secondRows = second.rows('L');

        expect(firstRows[1]).toMatch(/^ESA /);
        // Name rows, then type rows; the order of areas at the same distance is not the subject
        const names = [firstRows[2], firstRows[4], secondRows[1]].map(r => r.trim()).sort();
        expect(names).toEqual(['R-ONE', 'R-THREE', 'R-TWO']);
        expect([firstRows[3], firstRows[5], secondRows[2]]).toEqual([' REST      ', ' REST      ', ' REST      ']);
        expect(secondRows.slice(3)).toEqual(['           ', '           ', '           ']);
    });
});
