import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {airport, intersection} from '../../../harness/navdata/builders';
import {dtWorld} from '../../../harness/fixtures';
import {savedFlightplan} from '../../../harness/storage';
import {bootOnDtWorld} from '../../../harness/worldBoot';
import {Screen} from '../../../harness/render/screen';

// The world of the D/T tests is dtWorld(): KAAA, the VOR ABC, the intersection DEF and KBBB along 10 E, half a degree of
// latitude apart. On the unit's sphere (radius 6378100 m) a degree of latitude is 60.108 NM. The aircraft stands 0.1
// degree north of KAAA on the leg to ABC, at 120 kt due north, so ABC is 24.04 NM away (12.0 min), DEF 54.10 NM (27.1 min)
// and KBBB 84.15 NM (42.1 min).

async function show(unit: HeadlessUnit, left: 'FPL 0' | 'FPL 3' | 'NAV 2'): Promise<string[]> {
    await unit.panel.selectPage('L', left);
    return unit.panel.show('R', 'D/T 1');
}

describe('D/T 1 page', () => {
    // 4-11, figure 4-43: with FPL 0 on the left, each row beside a waypoint shows the distance from the present position
    // along the plan and the ETE in hours:minutes; KAAA lies behind the active leg and has none. The rows line up with
    // the rows of FPL 0 (its first row is the empty top row here, then KAAA)
    it('shows the cumulative distance and ETE of each waypoint beside FPL 0 (4-11)', async () => {
        const {kaaa, abc, def, kbbb} = dtWorld();
        const unit = await bootOnDtWorld();

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
        const unit = await bootOnDtWorld();

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
        const unit = await bootOnDtWorld();

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
        const unit = await bootOnDtWorld({facilities: [kaaa, abc, def, kbbb, kccc]});
        await unit.panel.directTo('KCCC', {waitMs: 2000});
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

    // 4-11, figure 4-44: during a Direct To to a waypoint that is not in FPL 0, D/T 1 is blank beside FPL 0
    it('is blank beside FPL 0 during a Direct To to a waypoint outside the plan (4-11, #296)', async () => {
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

    // 4-11: a Direct To to the first waypoint of FPL 0 makes leg 1 the active one, and every row from there on shows
    // its distance. The aircraft at rest 6.0 NM north of KAAA: KAAA, ABC, DEF and KBBB are 6.0, 36.1, 66.1 and 96.2 NM
    // away (0.1 degree of latitude is 6.01 NM, each further 0.5 degree 30.05 NM)
    it('shows the distances beside FPL 0 during a Direct To to its first waypoint (4-11)', async () => {
        const unit = await bootOnDtWorld({moving: false});
        await unit.panel.directTo('KAAA', {waitMs: 2000});

        const rows = await show(unit, 'FPL 0');
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(0);
        expect(rows[0]).toBe('DIS     ETE');
        expect(rows.slice(1, 5).map(r => r.slice(0, 4))).toEqual(['  6 ', ' 36 ', ' 66 ', ' 96 ']);
    });

    // 4-16, figure 4-56: until the unit is ready to navigate there is no active leg, and the distances beside FPL 0 are dashes. Not to be
    // confused with a Direct To outside the plan, which shows nothing (the test above)
    it('shows dashes beside the waypoints of FPL 0 before the unit navigates (4-16, figure 4-56)', async () => {
        const {kaaa, abc} = dtWorld();
        const unit = await bootUnit({
            facilities: [kaaa, abc], position: {lat: 47.1, lon: 10.0}, coldGps: true, storage: savedFlightplan(0, [kaaa, abc]),
        });

        const rows = await show(unit, 'FPL 0');
        expect(rows[0]).toBe('DIS     ETE');
        expect(rows.slice(1, 3).map(r => r.slice(0, 4))).toEqual(['----', '----']);
    });

    // 4-11 (hours:minutes), 5-7 and the KLN 89 trainer (2026-10-07): a duration never shows 60 minutes. DEF is 119.2 NM
    // ahead at 120 kt, 59.6 min, which the unit rounds to the next whole hour (5-7; the hour rolls over, so the minutes
    // run from 00 to 59)
    it('never shows 60 minutes (4-11, 5-7, #223)', async () => {
        const {kaaa, abc} = dtWorld();
        const def = intersection('DEF', 47.1 + 119.2 / 60.108, 10.0);
        const unit = await bootOnDtWorld({legs: [kaaa, abc, def]});

        const rows = await show(unit, 'FPL 0');
        expect(rows[3].slice(0, 4)).toBe('119 '); // precondition: DEF is in the third row
        expect(rows[3]).toBe('119    1:00');
    });
});

describe('D/T 1 page (characterization)', () => {
    // The cells beside the distances of the test in 4-11/4-12 above: the aircraft at rest, so the times have no ground speed
    // to come from. The DTK of KAAA is the Direct To course from the aircraft, 6 NM north of it, the others lie due north
    it('characterization: shows the full rows beside FPL 0 during a Direct To to its first waypoint', async () => {
        const unit = await bootOnDtWorld({moving: false});
        await unit.panel.directTo('KAAA', {waitMs: 2000});

        expect((await show(unit, 'FPL 0')).slice(1, 5)).toEqual(['  6   --:--', ' 36   --:--', ' 66   --:--', ' 96   --:--']);
    });

    // The aircraft at rest: the distances are there, the ETEs have no ground speed to come from
    it('shows the distances and no ETEs beside FPL 0 with the aircraft at rest', async () => {
        const {kaaa, abc, def, kbbb} = dtWorld();
        const unit = await bootOnDtWorld({moving: false});

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

    // The FPL 0 case of the same state is held in the spec tests above (4-16, figure 4-56)
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
