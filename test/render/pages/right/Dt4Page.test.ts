import {describe, expect, it, vi} from 'vitest';
import {Facility} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../../harness/boot';
import {airport} from '../../../harness/navdata/builders';
import {dtWorld} from '../../../harness/fixtures';
import {savedFlightplan} from '../../../harness/storage';
import {Screen} from '../../../harness/render/screen';

// The world of the D/T tests is dtWorld() (see Dt1Page.test.ts): along 10 E, the aircraft 0.1 degree north of KAAA at 120
// kt due north; KBBB, the last waypoint, 84.15 NM away (42.1 min). The fake clock starts at 12:00:00 UTC (DEFAULT_START)
// and the ground speed is above 30 kt from the first seconds, so DEP is 12:00 with the default SET 4 (RUN WHEN GS > 30KT).

async function bootMoving(legs: Facility[], facilities: Facility[] = legs): Promise<HeadlessUnit> {
    const unit = await bootUnit({facilities, position: {lat: 47.1, lon: 10.0}, storage: savedFlightplan(0, legs)});
    await settle(unit);
    await moveAircraft(unit, {lat: 47.1, lon: 10.0}, {groundspeedKt: 120, trackTrue: 0});
    return unit;
}

async function show(unit: HeadlessUnit, left: 'FPL 0' | 'NAV 2'): Promise<string[]> {
    await unit.panel.selectPage('L', left);
    await unit.panel.selectPage('R', 'D/T 4');
    await vi.advanceTimersByTimeAsync(1000);
    return Screen.read().rows('R');
}

describe('D/T 4 page', () => {
    // 4-13, figure 4-53: the destination and the time zone, DEP, TIME, ETA, FLT and ETE, in the same format whatever the
    // left page shows
    it('shows the times of the flight in the same format beside FPL 0 and beside NAV 2 (4-13)', async () => {
        const {kaaa, abc, def, kbbb} = dtWorld();
        const unit = await bootMoving([kaaa, abc, def, kbbb]);
        const expected = [
            '  KBBB  UTC',
            'DEP   12:00',
            'TIME  12:00',
            'ETA   12:42',
            'FLT     :00',
            'ETE     :42',
        ];

        expect(await show(unit, 'FPL 0')).toEqual(expected);
        expect(await show(unit, 'NAV 2')).toEqual(expected);
    });

    // 4-13: with RUN WHEN GS > 30KT, FLT is the time above 30 kt; ten minutes at 120 kt read :10, and TIME runs on
    it('counts the flight time above 30 kt (4-13)', async () => {
        const {kaaa, abc, def, kbbb} = dtWorld();
        const unit = await bootMoving([kaaa, abc, def, kbbb]);
        await show(unit, 'FPL 0');

        await vi.advanceTimersByTimeAsync(600_000);

        const rows = Screen.read().rows('R');
        expect(rows[2]).toBe('TIME  12:10');
        expect(rows[4]).toBe('FLT     :10');
    }, 30_000);

    // 4-13: with RUN WHEN GS > 30KT, FLT does not run below 30 kt: after ten minutes at rest TIME has moved on, FLT and
    // DEP have not
    it('does not count the flight time below 30 kt (4-13)', async () => {
        const {kaaa, abc, def, kbbb} = dtWorld();
        const unit = await bootUnit({
            facilities: [kaaa, abc, def, kbbb], position: {lat: 47.1, lon: 10.0}, storage: savedFlightplan(0, [kaaa, abc, def, kbbb]),
        });
        await settle(unit);
        await show(unit, 'FPL 0');

        await vi.advanceTimersByTimeAsync(600_000);

        const rows = Screen.read().rows('R');
        expect(rows[1]).toBe('DEP   --:--');
        expect(rows[2]).toBe('TIME  12:10');
        expect(rows[4]).toBe('FLT     :00');
    }, 30_000);

    // 4-13: the time zone changes with the right cursor and the inner knob; GST is three hours behind UTC
    it('changes the time zone with the right cursor (4-13)', async () => {
        const {kaaa, abc, def, kbbb} = dtWorld();
        const unit = await bootMoving([kaaa, abc, def, kbbb]);
        await show(unit, 'FPL 0');

        await unit.panel.cursor('R');
        await unit.panel.inner('R', 1);
        await vi.advanceTimersByTimeAsync(1000);

        const rows = Screen.read().rows('R');
        expect(rows[0].slice(8)).toBe('GST');
        expect(rows[1]).toBe('DEP   09:00');
        expect(rows[2]).toBe('TIME  09:00');
        expect(rows[3]).toBe('ETA   09:42');
    });

    /** A Direct To KCCC, an airport outside FPL 0 0.5 degree of longitude east (20.3 NM, 10.1 min at 120 kt) */
    async function directToOutsidePlan(): Promise<HeadlessUnit> {
        const {kaaa, abc, def, kbbb} = dtWorld();
        const kccc = airport('KCCC', 47.1, 10.5);
        const unit = await bootMoving([kaaa, abc, def, kbbb], [kaaa, abc, def, kbbb, kccc]);
        await unit.panel.dct();
        await unit.panel.enterIdent('L', 'KCCC');
        await unit.panel.ent(); // the APT 1 confirmation
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(2000);
        await show(unit, 'FPL 0');
        return unit;
    }

    // 4-13: the destination is the destination of the flight; during a Direct To outside the plan that is the Direct To
    // waypoint, as a photo of a real unit shows (reference-photos-index.md, 0283863.jpg: CYTF with the ETE of the Direct
    // To). The setup sibling of the pin below
    it('shows the Direct To waypoint outside the plan as the destination (4-13)', async () => {
        const unit = await directToOutsidePlan();

        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(-1); // precondition: outside FPL 0
        const rows = Screen.read().rows('R');
        expect(rows[0].slice(2, 6)).toBe('KCCC');
        expect(rows[5]).toBe('ETE     :10');
    });

    // A photo of a real unit (reference-photos-index.md, 0283863.jpg; low resolution, but the row reads clearly in a crop)
    // shows the Direct To symbol in the first two cells, right before the destination ident. The code leaves the two cells
    // blank
    it.fails('shows the Direct To symbol before a Direct To destination (photo 0283863.jpg, #NEW-5-8)', async () => {
        await directToOutsidePlan();

        expect(Screen.read().rows('R')[0]).toBe('d›KCCC  UTC');
    });

    // 4-13 and the KLN 89 trainer (2026-10-07): a duration never shows 60 minutes. KBBB is 119.2 NM ahead at 120 kt,
    // 59.6 min, which ETE shows as :60. Either the next whole hour or :59 is accepted, as in the other #223 pins
    it.fails('never shows 60 minutes (4-13, #223)', async () => {
        const {kaaa, abc} = dtWorld();
        const kbbb = airport('KBBB', 47.1 + 119.2 / 60.108, 10.0);
        const unit = await bootMoving([kaaa, abc, kbbb]);

        const rows = await show(unit, 'FPL 0');
        expect(rows[0]).toBe('  KBBB  UTC'); // precondition
        expect(['ETE    1:00', 'ETE     :59']).toContain(rows[5]);
    });
});

describe('D/T 4 page (characterization)', () => {
    it('shows dashes and no destination before the GPS has a fix', async () => {
        const {kaaa, abc} = dtWorld();
        const unit = await bootUnit({
            facilities: [kaaa, abc], position: {lat: 47.1, lon: 10.0}, coldGps: true, storage: savedFlightplan(0, [kaaa, abc]),
        });

        expect(await show(unit, 'NAV 2')).toMatchInlineSnapshot(`
          [
            "        UTC",
            "DEP   --:--",
            "TIME  12:00",
            "ETA   --:--",
            "FLT     :00",
            "ETE   --:--",
          ]
        `);
    });
});
