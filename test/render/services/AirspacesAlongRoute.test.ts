import {describe, expect, it, vi} from 'vitest';
import {BoundaryFacility, BoundaryType} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle} from '../../harness/boot';
import {pointFrom} from '../../harness/flight/geo';
import {airspace} from '../../harness/navdata/airspaces';
import {airport} from '../../harness/navdata/builders';
import {Screen} from '../../harness/render/screen';
import {savedFlightplan} from '../../harness/storage';

// The route runs 40 NM due north from the aircraft's position at 47.0N 8.0E. The unit searches the airspaces along
// a leg from two centers of radius 20 NM, the start and the middle of the leg, and #102 hides what these searches
// miss: an area is listed only if it holds the start of the route.
const POS = {lat: 47.0, lon: 8.0};
const KAAA = airport('KAAA', POS.lat, POS.lon);
const KBBB_POS = pointFrom(POS, 0, 40);
const KBBB = airport('KBBB', KBBB_POS.lat, KBBB_POS.lon);

/** A restricted area of 5 NM by 5 NM, centered alongNm NM along the route (corners from pointFrom) */
function squareAt(name: string, alongNm: number): BoundaryFacility {
    const c = pointFrom(POS, 0, alongNm);
    const n = pointFrom(c, 0, 2.5).lat;
    const s = pointFrom(c, 180, 2.5).lat;
    const e = pointFrom(c, 90, 2.5).lon;
    const w = pointFrom(c, 270, 2.5).lon;
    return airspace(name, BoundaryType.Restricted, [[n, w], [n, e], [s, e], [s, w]]);
}

/** The two rows of the first listed airspace: its name, then its type */
const FIRST_AREA = (name: string) => [name.padEnd(11), ' REST      '];

const bootWith = (areas: BoundaryFacility[], storage?: Record<string, unknown>) => bootUnit({
    facilities: [KAAA, KBBB], position: POS, altitudeFt: 0, airspaces: areas, storage,
});

// Row 0 is the route and row 1 the ESA line (not under test); the airspace follows with its name and type
const areaRows = () => Screen.read().rows('L').slice(2, 4);

/** TRI 2: from the present position to a waypoint, entered with the keyboard */
async function showTri2(unit: HeadlessUnit): Promise<void> {
    await settle(unit);
    await unit.panel.selectPage('L', 'TRI 2');
    await unit.panel.cursor('L');
    await unit.panel.type('L', 'KBBB');
    await unit.panel.ent();
    await unit.panel.ent();
    await vi.advanceTimersByTimeAsync(2000);
    expect(Screen.read().rows('L')[0]).toBe('P.POS-KBBB ');
}

/** TRI 4: from one waypoint to another, entered on TRI 3 */
async function showTri4(unit: HeadlessUnit): Promise<void> {
    await settle(unit);
    await unit.panel.selectPage('L', 'TRI 3');
    await unit.panel.cursor('L');
    await unit.panel.type('L', 'KAAA');
    await unit.panel.ent();
    await unit.panel.ent();
    await unit.panel.type('L', 'KBBB');
    await unit.panel.ent();
    await unit.panel.ent();
    await unit.panel.cursor('L');
    await unit.panel.selectPage('L', 'TRI 4');
    await vi.advanceTimersByTimeAsync(2000);
    expect(Screen.read().rows('L')[0]).toBe('KAAA -KBBB ');
}

/** TRI 6: the route of a flight plan, here FPL 0 */
async function showTri6(unit: HeadlessUnit): Promise<void> {
    await settle(unit);
    await unit.panel.selectPage('L', 'TRI 6');
    await vi.advanceTimersByTimeAsync(2000);
    expect(Screen.read().rows('L')[0]).toBe('FP 0       ');
}

// 5-4 (TRI 2), 5-5 (TRI 4) and 5-6 (TRI 6): the pages list the areas of special use airspace along the route
describe('special use airspaces along the route, TRI 2 (5-4)', () => {
    // The area holds the present position, which is the first search center, so #102 does not hide it
    it('lists an area that holds the start of the route', async () => {
        const unit = await bootWith([squareAt('R-ST', 0)]);

        await showTri2(unit);

        expect(areaRows()).toEqual(FIRST_AREA('R-ST'));
    });

    it.fails('lists an area in the far part of the route (#102)', async () => {
        const unit = await bootWith([squareAt('R-FAR', 32)]);

        await showTri2(unit);

        expect(areaRows()).toEqual(FIRST_AREA('R-FAR'));
    });

    // The area holds the second search center. The first search, from the present position, sees it by its bounding box
    // and rejects it; the shared session then does not offer it again to the search from the middle of the route.
    it.fails('lists an area that holds the middle of the route (#102)', async () => {
        const unit = await bootWith([squareAt('R-MID', 20)]);

        await showTri2(unit);

        expect(areaRows()).toEqual(FIRST_AREA('R-MID'));
    });
});

describe('special use airspaces along the route, TRI 4 (5-5)', () => {
    it('lists an area that holds the start of the route', async () => {
        const unit = await bootWith([squareAt('R-ST', 0)]);

        await showTri4(unit);

        expect(areaRows()).toEqual(FIRST_AREA('R-ST'));
    });

    it.fails('lists an area in the far part of the route (#102)', async () => {
        const unit = await bootWith([squareAt('R-FAR', 32)]);

        await showTri4(unit);

        expect(areaRows()).toEqual(FIRST_AREA('R-FAR'));
    });
});

describe('special use airspaces along the route, TRI 6 (5-6)', () => {
    it('lists an area that holds the start of the route', async () => {
        const unit = await bootWith([squareAt('R-ST', 0)], savedFlightplan(0, [KAAA, KBBB]));

        await showTri6(unit);

        expect(areaRows()).toEqual(FIRST_AREA('R-ST'));
    });

    it.fails('lists an area in the far part of the route (#102)', async () => {
        const unit = await bootWith([squareAt('R-FAR', 32)], savedFlightplan(0, [KAAA, KBBB]));

        await showTri6(unit);

        expect(areaRows()).toEqual(FIRST_AREA('R-FAR'));
    });
});
