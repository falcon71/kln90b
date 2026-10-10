import {describe, expect, it, vi} from 'vitest';
import {BoundaryType} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {airspace} from '../../../harness/navdata/airspaces';
import {airport} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';

// A right triangle whose bounding box (46.8 to 47.2 N, 7.8 to 8.2 E) holds a point the triangle does not. The
// hypotenuse runs from (47.2, 8.2) to (46.8, 7.8): lat = lon + 39.0, and the interior is above it. Both points are
// 0.2 degrees (more than 10 NM) off the hypotenuse, so no rounding decides which side they are on.
const TRI: [number, number][] = [[47.2, 7.8], [47.2, 8.2], [46.8, 7.8]];
const INSIDE = {lat: 47.1, lon: 7.9}; // hypotenuse at 46.9 there: inside
const IN_BOX_ONLY = {lat: 46.9, lon: 8.1}; // hypotenuse at 47.1 there: in the box, outside the triangle

/** The Class B triangle and the given airports, with APT 1 shown on the right */
async function bootWithAirports(...facilities: ReturnType<typeof airport>[]): Promise<HeadlessUnit> {
    const unit = await bootUnit({
        facilities, position: {lat: 47.0, lon: 8.0}, altitudeFt: 0,
        airspaces: [airspace('TEST CLASS B', BoundaryType.ClassB, TRI)],
    });
    await settle(unit);
    await unit.panel.selectPage('R', 'APT 1');
    return unit;
}

/**
 * Shows the airport on APT 1 by entering its ident and returns the airport type row (row 3). The clock advances
 * before the read, because the airspace search is asynchronous. The cursor ends off.
 */
async function typeRowAfterEntering(unit: HeadlessUnit, ident: string): Promise<string> {
    await unit.panel.cursor('R');
    await unit.panel.enterIdent('R', ident);
    await unit.panel.ent();
    await vi.advanceTimersByTimeAsync(2000);
    await unit.panel.cursor('R');
    const rows = Screen.read().rows('R');
    expect(rows[0].trim()).toBe(ident); // the airport was shown
    return rows[3];
}

describe('NearestUtils.getAirspaces tests the polygon, not the bounding box (133f4d8)', () => {
    describe('OTH 2', () => {
        async function oth2At(position: { lat: number; lon: number }): Promise<string[]> {
            const unit = await bootUnit({
                position, altitudeFt: 0,
                airspaces: [airspace('TEST CENTER', BoundaryType.Center, TRI, {frequencyMHz: 118.55})],
            });
            await settle(unit);
            // The page loads its Center in its constructor
            const rows = await unit.panel.show('L', 'OTH 2', {waitMs: 2000});
            expect(unit.errors).toEqual([]);
            return rows;
        }

        // 3-52: OTH 2 names the Center for the aircraft's present position and its frequency
        it('names the Center for a position inside the triangle', async () => {
            expect((await oth2At(INSIDE)).slice(0, 3)).toEqual(['TEST CENTER', 'CTR        ', '     118.55']);
        });

        // The text outside any Center is the unit's own (Oth2Page cites a video); the guide shows only the inside case,
        // so this is a characterization of the text. The claim under test is that a position in the box but outside the
        // shape gets no Center.
        it('names no Center for a position in the bounding box outside the triangle (characterization of the text)', async () => {
            expect((await oth2At(IN_BOX_ONLY)).slice(0, 2)).toEqual(['OUTSIDE    ', 'ARTCC      ']);
        });
    });

    describe('APT 1 airport type', () => {
        // 3-42: the airport type row shows CL B if the airport underlies the outer boundary of a Class B airspace
        it('shows CL B for an airport inside the triangle', async () => {
            const unit = await bootWithAirports(airport('KINS', INSIDE.lat, INSIDE.lon));

            expect(await typeRowAfterEntering(unit, 'KINS')).toBe('CL B       ');
        });

        it('shows no airspace type for an airport in the bounding box outside the triangle', async () => {
            const unit = await bootWithAirports(airport('KOUT', IN_BOX_ONLY.lat, IN_BOX_ONLY.lon));

            expect(await typeRowAfterEntering(unit, 'KOUT')).toBe('           ');
        });
    });
});

describe('APT 1 airport type and the airport shown before', () => {
    // 3-42: the airport type row depends on the airport shown and on nothing else. getAirspaces keeps one boundary
    // session and one result map for all its callers, so the airspaces of an earlier search leak into the next (#102).
    // The passing siblings of both pins are the two single-airport tests above (133f4d8).

    // Stale entry: the area found for KINS stays in the map, KOUT's search finds the same area, but it is neither added
    // again nor removed, and the whole map comes back
    it.fails('does not show the type of the airport shown before (#102)', async () => {
        const unit = await bootWithAirports(airport('KINS', INSIDE.lat, INSIDE.lon), airport('KOUT', IN_BOX_ONLY.lat, IN_BOX_ONLY.lon));

        const shown = [await typeRowAfterEntering(unit, 'KINS'), await typeRowAfterEntering(unit, 'KOUT')];

        expect(shown).toEqual(['CL B       ', '           ']);
    });

    // Missed entry: KOUT's search records the area as seen and the polygon check rejects it; the search for ZZIN, which
    // lies inside, then never gets it as added
    it.fails('shows the type of an airport after one in the box only was shown (#102)', async () => {
        const unit = await bootWithAirports(airport('KOUT', IN_BOX_ONLY.lat, IN_BOX_ONLY.lon), airport('ZZIN', INSIDE.lat, INSIDE.lon));

        const shown = [await typeRowAfterEntering(unit, 'KOUT'), await typeRowAfterEntering(unit, 'ZZIN')];

        expect(shown).toEqual(['           ', 'CL B       ']);
    });
});
