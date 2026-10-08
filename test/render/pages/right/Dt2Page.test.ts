import {describe, expect, it, vi} from 'vitest';
import {Facility} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../../harness/boot';
import {airport} from '../../../harness/navdata/builders';
import {dtWorld} from '../../../harness/fixtures';
import {savedFlightplan, storedSetting} from '../../../harness/storage';
import {Screen} from '../../../harness/render/screen';

// The world of the D/T tests is dtWorld() (see Dt1Page.test.ts): along 10 E, the aircraft 0.1 degree north of KAAA at 120
// kt due north; ABC 24.04 NM (12.0 min), DEF 54.10 NM (27.1 min), KBBB 84.15 NM (42.1 min). The fake clock starts at
// 12:00:00 UTC (DEFAULT_START), and the page is read a few seconds later, so the ETAs are 12:12, 12:27 and 12:42.

/** Boots 0.1 degree north of KAAA with FPL 0 and FPL 3 stored; with `moving` the aircraft flies due north at 120 kt */
async function bootOnWorld(moving: boolean, extra: Facility[] = []): Promise<HeadlessUnit> {
    const {kaaa, abc, def, kbbb} = dtWorld();
    const legs: Facility[] = [kaaa, abc, def, kbbb];
    const unit = await bootUnit({
        facilities: [...legs, ...extra], position: {lat: 47.1, lon: 10.0},
        storage: {...savedFlightplan(0, legs), ...savedFlightplan(3, legs)},
    });
    await settle(unit);
    if (moving) {
        await moveAircraft(unit, {lat: 47.1, lon: 10.0}, {groundspeedKt: 120, trackTrue: 0});
    }
    return unit;
}

const bootMoving = () => bootOnWorld(true);

async function show(unit: HeadlessUnit, left: 'FPL 0' | 'FPL 3' | 'NAV 2'): Promise<string[]> {
    await unit.panel.selectPage('L', left);
    await unit.panel.selectPage('R', 'D/T 2');
    await vi.advanceTimersByTimeAsync(1000);
    return Screen.read().rows('R');
}

describe('D/T 2 page', () => {
    // 4-12, figure 4-47: beside FPL 0 the distances as on D/T 1 and the ETA of each waypoint, the time zone at the top right
    it('shows the distance and ETA of each waypoint beside FPL 0 (4-12)', async () => {
        const unit = await bootMoving();

        expect(await show(unit, 'FPL 0')).toEqual([
            'DIS     UTC',
            '           ',
            ' 24   12:12',
            ' 54   12:27',
            ' 84   12:42',
            '           ',
        ]);
    });

    // 4-12, figure 4-48: the right cursor goes to the time zone and the inner knob selects another one; the change applies
    // to the other pages that show a time (D/T 4). GST is three hours behind UTC (the zone after UTC in the list)
    it('changes the time zone of the ETAs and of the whole unit with the right cursor (4-12)', async () => {
        const unit = await bootMoving();
        await show(unit, 'FPL 0');

        await unit.panel.cursor('R');
        await unit.panel.inner('R', 1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('R').slice(0, 3)).toEqual(['DIS     GST', '           ', ' 24   09:12']);
        await unit.panel.cursor('R');
        await unit.panel.selectPage('R', 'D/T 4');
        expect(Screen.read().rows('R')[0].slice(8)).toBe('GST');
        expect(Screen.read().rows('R')[2]).toBe('TIME  09:00');
        await vi.advanceTimersByTimeAsync(2000);
        expect(storedSetting(unit, 'timezone')).toBe(1);
    });

    // 4-12, figure 4-49: beside a numbered plan, no ETAs
    it('shows no ETA beside a numbered plan (4-12)', async () => {
        const unit = await bootMoving();

        expect(await show(unit, 'FPL 3')).toEqual([
            'DIS     UTC',
            '           ',
            ' 30        ',
            ' 60        ',
            ' 90        ',
            '           ',
        ]);
    });

    // 4-12, figure 4-50: beside any other page, the active and the last waypoint, each with DIS and the ETA with its zone
    it('shows the active and the last waypoint beside a page that is not a flight plan (4-12)', async () => {
        const unit = await bootMoving();

        expect(await show(unit, 'NAV 2')).toEqual([
            ' › 2 ABC   ',
            'DIS    24nm',
            '   12:12UTC',
            '   4 KBBB  ',
            'DIS    84nm',
            '   12:42UTC',
        ]);
    });

    /** A Direct To KCCC, an airport outside FPL 0, from the DIRECT TO page; FPL 0 then shown on the left */
    async function directToOutsidePlan(): Promise<HeadlessUnit> {
        const unit = await bootOnWorld(true, [airport('KCCC', 47.1, 10.5)]);
        await unit.panel.dct();
        await unit.panel.enterIdent('L', 'KCCC');
        await unit.panel.ent(); // the APT 1 confirmation
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(2000);
        await show(unit, 'FPL 0');
        return unit;
    }

    // The setup sibling of the pin below: 4-12 says D/T 2 uses the distances of D/T 1, so it keeps its titles beside FPL 0
    // during a Direct To outside the plan (4-11, figure 4-44)
    it('keeps its titles beside FPL 0 during a Direct To to a waypoint outside the plan (4-12)', async () => {
        const unit = await directToOutsidePlan();

        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(-1);
        expect(Screen.read().status().left).toBe('FPL 0');
        expect(Screen.read().rows('R')[0]).toBe('DIS     UTC');
    });

    // 4-12: the distances are those of D/T 1, which is blank beside FPL 0 during a Direct To to a waypoint outside the
    // plan (4-11, figure 4-44), and so are the ETAs. The code shows ---- and --:-- beside every waypoint
    it.fails('is blank beside FPL 0 during a Direct To to a waypoint outside the plan (4-12, #NEW-5-6)', async () => {
        await directToOutsidePlan();

        expect(Screen.read().rows('R')).toEqual([
            'DIS     UTC',
            '           ',
            '           ',
            '           ',
            '           ',
            '           ',
        ]);
    });
});

describe('D/T 2 page (characterization)', () => {
    // The aircraft at rest: the distances are there, the ETAs have no ground speed to come from
    it('shows the distances and no ETAs beside FPL 0 with the aircraft at rest', async () => {
        const unit = await bootOnWorld(false);

        expect(await show(unit, 'FPL 0')).toMatchInlineSnapshot(`
          [
            "DIS     UTC",
            "           ",
            " 24   --:--",
            " 54   --:--",
            " 84   --:--",
            "           ",
          ]
        `);
    });

    it('shows dashes beside NAV 2 before the GPS has a fix', async () => {
        const {kaaa, abc} = dtWorld();
        const unit = await bootUnit({
            facilities: [kaaa, abc], position: {lat: 47.1, lon: 10.0}, coldGps: true, storage: savedFlightplan(0, [kaaa, abc]),
        });

        expect(await show(unit, 'NAV 2')).toMatchInlineSnapshot(`
          [
            "           ",
            "DIS  ----nm",
            "   --:--UTC",
            "           ",
            "           ",
            "           ",
          ]
        `);
    });
});
