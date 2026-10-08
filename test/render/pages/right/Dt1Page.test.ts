import {describe, expect, it, vi} from 'vitest';
import {Facility} from '@microsoft/msfs-sdk';
import {bootUnit, BootOptions, HeadlessUnit, moveAircraft, settle} from '../../../harness/boot';
import {airport, intersection} from '../../../harness/navdata/builders';
import {dtWorld} from '../../../harness/fixtures';
import {savedFlightplan} from '../../../harness/storage';
import {Screen} from '../../../harness/render/screen';

// The world of the D/T tests is dtWorld(): KAAA, the VOR ABC, the intersection DEF and KBBB along 10 E, half a degree of
// latitude apart. On the unit's sphere (radius 6378100 m) a degree of latitude is 60.108 NM. The aircraft stands 0.1
// degree north of KAAA on the leg to ABC, at 120 kt due north, so ABC is 24.04 NM away (12.0 min), DEF 54.10 NM (27.1 min)
// and KBBB 84.15 NM (42.1 min).

/** Boots 0.1 degree north of KAAA with FPL 0 and FPL 3 stored; with `moving` the aircraft flies due north at 120 kt */
async function bootOnWorld(legs: Facility[], facilities: Facility[], moving: boolean, extra: Partial<BootOptions> = {}): Promise<HeadlessUnit> {
    const unit = await bootUnit({
        facilities, position: {lat: 47.1, lon: 10.0},
        storage: {...savedFlightplan(0, legs), ...savedFlightplan(3, legs)}, ...extra,
    });
    await settle(unit);
    if (moving) {
        await moveAircraft(unit, {lat: 47.1, lon: 10.0}, {groundspeedKt: 120, trackTrue: 0});
    }
    return unit;
}

async function bootMoving(legs: Facility[], facilities: Facility[] = legs): Promise<HeadlessUnit> {
    return bootOnWorld(legs, facilities, true);
}

async function show(unit: HeadlessUnit, left: 'FPL 0' | 'FPL 3' | 'NAV 2'): Promise<string[]> {
    await unit.panel.selectPage('L', left);
    await unit.panel.selectPage('R', 'D/T 1');
    await vi.advanceTimersByTimeAsync(1000);
    return Screen.read().rows('R');
}

describe('D/T 1 page', () => {
    // 4-11, figure 4-43: with FPL 0 on the left, each row beside a waypoint shows the distance from the present position
    // along the plan and the ETE in hours:minutes; KAAA lies behind the active leg and has none. The rows line up with
    // the rows of FPL 0 (its first row is the empty top row here, then KAAA)
    it('shows the cumulative distance and ETE of each waypoint beside FPL 0 (4-11)', async () => {
        const {kaaa, abc, def, kbbb} = dtWorld();
        const unit = await bootMoving([kaaa, abc, def, kbbb]);

        expect(await show(unit, 'FPL 0')).toEqual([
            'DIS     ETE',
            '           ',
            ' 24     :12',
            ' 54     :27',
            ' 84     :42',
            '           ',
        ]);
        expect(Screen.read().rows('L')[2]).toBe('À 2:ABC    '); // precondition: the rows line up
    });

    // 4-11, figure 4-45: beside a numbered plan the distances count from its first waypoint, 30.05, 60.11 and 90.16 NM,
    // and there are no ETEs
    it('shows the distances from the first waypoint and no ETE beside a numbered plan (4-11)', async () => {
        const {kaaa, abc, def, kbbb} = dtWorld();
        const unit = await bootMoving([kaaa, abc, def, kbbb]);

        expect(await show(unit, 'FPL 3')).toEqual([
            'DIS     ETE',
            '           ',
            ' 30        ',
            ' 60        ',
            ' 90        ',
            '           ',
        ]);
    });

    // 4-12, figure 4-46 and a photo of a real unit (reference-photos-index.md, image3-2-scaled.jpeg): beside any other
    // page, the active waypoint with the arrow and its number, then the last waypoint of the plan, each with DIS and ETE
    it('shows the active and the last waypoint beside a page that is not a flight plan (4-12)', async () => {
        const {kaaa, abc, def, kbbb} = dtWorld();
        const unit = await bootMoving([kaaa, abc, def, kbbb]);

        expect(await show(unit, 'NAV 2')).toEqual([
            ' › 2 ABC   ',
            'DIS    24nm',
            'ETE     :12',
            '   4 KBBB  ',
            'DIS    84nm',
            'ETE     :42',
        ]);
    });

    /** A Direct To KCCC, an airport outside FPL 0, from the DIRECT TO page; FPL 0 then shown on the left */
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

    // The setup sibling of the pin below: a Direct To outside FPL 0 with FPL 0 on the left keeps the column titles
    // (4-11, figure 4-44)
    it('keeps its titles beside FPL 0 during a Direct To to a waypoint outside the plan (4-11)', async () => {
        const unit = await directToOutsidePlan();

        expect(unit.props.memory.navPage.activeWaypoint.isDctNavigation()).toBe(true);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(-1);
        expect(Screen.read().status().left).toBe('FPL 0');
        expect(Screen.read().rows('R')[0]).toBe('DIS     ETE');
    });

    // 4-11, figure 4-44: during a Direct To to a waypoint that is not in FPL 0, D/T 1 is blank beside FPL 0. The code
    // shows ---- and --:-- beside every waypoint (shouldDistanceBeVisible compares the leg with an active index of -1)
    it.fails('is blank beside FPL 0 during a Direct To to a waypoint outside the plan (4-11, #296)', async () => {
        await directToOutsidePlan();

        expect(Screen.read().rows('R')).toEqual([
            'DIS     ETE',
            '           ',
            '           ',
            '           ',
            '           ',
            '           ',
        ]);
    });

    // 4-11 (hours:minutes), 5-7 and the KLN 89 trainer (2026-10-07): a duration never shows 60 minutes. DEF is 119.2 NM
    // ahead at 120 kt, 59.6 min, which the page shows as :60. Either the next whole hour or :59 is accepted, as in the
    // other #223 pins
    it.fails('never shows 60 minutes (4-11, 5-7, #223)', async () => {
        const {kaaa, abc} = dtWorld();
        const def = intersection('DEF', 47.1 + 119.2 / 60.108, 10.0);
        const unit = await bootMoving([kaaa, abc, def]);

        const rows = await show(unit, 'FPL 0');
        expect(rows[3].slice(0, 4)).toBe('119 '); // precondition: DEF is in the third row
        expect(['119    1:00', '119     :59']).toContain(rows[3]);
    });
});

describe('D/T 1 page (characterization)', () => {
    // The aircraft at rest: the distances are there, the ETEs have no ground speed to come from
    it('shows the distances and no ETEs beside FPL 0 with the aircraft at rest', async () => {
        const {kaaa, abc, def, kbbb} = dtWorld();
        const unit = await bootOnWorld([kaaa, abc, def, kbbb], [kaaa, abc, def, kbbb], false);

        expect(await show(unit, 'FPL 0')).toMatchInlineSnapshot(`
          [
            "DIS     ETE",
            "           ",
            " 24   --:--",
            " 54   --:--",
            " 84   --:--",
            "           ",
          ]
        `);
    });

    // Beside FPL 0 the no-fix state shows ---- and --:-- beside the waypoints, which the fix of #296 may blank as
    // well (no active waypoint either way), so only the page beside NAV 2 is held here
    it('shows dashes beside NAV 2 before the GPS has a fix', async () => {
        const {kaaa, abc} = dtWorld();
        const unit = await bootUnit({
            facilities: [kaaa, abc], position: {lat: 47.1, lon: 10.0}, coldGps: true, storage: savedFlightplan(0, [kaaa, abc]),
        });

        expect(await show(unit, 'NAV 2')).toMatchInlineSnapshot(`
          [
            "           ",
            "DIS  ----nm",
            "ETE   --:--",
            "           ",
            "           ",
            "           ",
          ]
        `);
    });
});
