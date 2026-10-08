import {describe, expect, it, vi} from 'vitest';
import {Facility} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../../harness/boot';
import {airport, intersection, vor} from '../../../harness/navdata/builders';
import {dtWorld} from '../../../harness/fixtures';
import {pointFrom} from '../../../harness/flight/geo';
import {savedFlightplan} from '../../../harness/storage';
import {Screen} from '../../../harness/render/screen';

describe('D/T 3 page', () => {
    it('shows the same DIS and DTK for a leg that repeats the previous waypoint (#27, dbb01bf)', async () => {
        // 4-12: D/T 3 shows DIS and DTK per waypoint of FPL 0; the KLN 89 trainer repeats the values for a repeated waypoint
        const kaaa = airport('KAAA', 47.6, 8.0);
        const abc = vor('ABC', 47.4, 8.0);
        const def = intersection('DEF', 47.2, 8.0);
        const kbbb = airport('KBBB', 47.0, 8.0);
        const unit = await bootUnit({
            facilities: [kaaa, abc, def, kbbb], position: {lat: 47.5, lon: 8.0}, magvar: 0,
            storage: savedFlightplan(0, [kaaa, abc, def, def, kbbb]),
        });
        await settle(unit);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(1); // Precondition: ABC is active

        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.selectPage('R', 'D/T 3');
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.errors).toEqual([]);
        const screen = Screen.read();
        expect(screen.status().left).toBe('FPL 0');
        expect(screen.status().right).toBe('D/T 3');
        // The distances accumulate along the legs, 0.1 degree of latitude is 6.0108 NM: 6, 18 (twice, the repeated DEF), 30.
        // KAAA lies behind the active leg and has no values
        expect(screen.rows('R')).toEqual([
            'DIS     DTK',
            '           ',
            '  6    180°',
            ' 18    180°',
            ' 18    180°',
            ' 30    180°',
        ]);
        // A zero-length leg would give a NaN heading, which the SDK reports with console.error
        expect(unit.consoleErrors).toEqual([]);
    });
});

// A plan with turns, built on dtWorld(): KAAA and the VOR ABC (0.5 degree north of it), DEF 30 NM from ABC on the true
// course 045.3 and KBBB 30 NM from DEF on 120.2 (pointFrom places a point on the initial course, so these are the legs'
// DTKs at their start). With 5 degrees of easterly variation the magnetic DTKs are 355 (the leg KAAA to ABC, true north),
// 040.3 and 115.2, whole degrees whatever the rounding. The aircraft stands 0.1 degree north of KAAA on the first leg, at
// 120 kt due north: ABC 24.04 NM away (0.4 degree of latitude, 60.108 NM a degree on the unit's sphere), DEF 54.04 NM,
// KBBB 84.04 NM.
function dtkWorld() {
    const {kaaa, abc} = dtWorld();
    const d = pointFrom(abc, 45.3, 30);
    const def = intersection('DEF', d.lat, d.lon);
    const b = pointFrom(def, 120.2, 30);
    const kbbb = airport('KBBB', b.lat, b.lon);
    return {kaaa, abc, def, kbbb, legs: [kaaa, abc, def, kbbb] as Facility[]};
}

async function bootMoving(): Promise<HeadlessUnit> {
    const {legs} = dtkWorld();
    const unit = await bootUnit({
        facilities: legs, position: {lat: 47.1, lon: 10.0}, magvar: 5,
        storage: {...savedFlightplan(0, legs), ...savedFlightplan(3, legs)},
    });
    await settle(unit);
    await moveAircraft(unit, {lat: 47.1, lon: 10.0}, {groundspeedKt: 120, trackTrue: 0});
    return unit;
}

async function show(unit: HeadlessUnit, left: 'FPL 0' | 'FPL 3' | 'NAV 2' | 'NAV 3'): Promise<string[]> {
    await unit.panel.selectPage('L', left);
    await unit.panel.selectPage('R', 'D/T 3');
    await vi.advanceTimersByTimeAsync(1000);
    return Screen.read().rows('R');
}

describe('D/T 3 page, distances and magnetic DTKs', () => {
    // 4-12, figure 4-51: beside FPL 0 the distances as on D/T 1 and the DTK of each waypoint's leg; 5-44: magnetic
    it('shows the distance and the magnetic DTK of each waypoint beside FPL 0 (4-12, 5-44)', async () => {
        const unit = await bootMoving();

        expect(await show(unit, 'FPL 0')).toEqual([
            'DIS     DTK',
            '           ',
            ' 24    355°',
            ' 54    040°',
            ' 84    115°',
            '           ',
        ]);
    });

    // 4-12: beside any flight plan page; beside a numbered plan the distances count from its first waypoint (as on D/T 1):
    // 30.05, 60.05 and 90.05 NM
    it('shows the distance from the first waypoint and the DTK beside a numbered plan (4-12)', async () => {
        const unit = await bootMoving();

        expect(await show(unit, 'FPL 3')).toEqual([
            'DIS     DTK',
            '           ',
            ' 30    355°',
            ' 60    040°',
            ' 90    115°',
            '           ',
        ]);
    });

    // 4-12, figure 4-52: beside any other page, the active and the NEXT waypoint (not the last, unlike D/T 1 and D/T 2)
    it('shows the active and the next waypoint beside a page that is not a flight plan (4-12)', async () => {
        const unit = await bootMoving();

        expect(await show(unit, 'NAV 2')).toEqual([
            ' › 2 ABC   ',
            'DIS    24nm',
            'DTK    355°',
            '   3 DEF   ',
            'DIS    54nm',
            'DTK    040°',
        ]);
    });
});

describe('D/T 3 page, the DTK of the active waypoint', () => {
    // dtWorld(), magnetic variation 0: the aircraft 0.1 degree of longitude (4.1 NM) east of the first leg KAAA to ABC, at
    // its middle. The leg's DTK is 000; the bearing to ABC is about 345
    async function bootOffCourse(): Promise<HeadlessUnit> {
        const {kaaa, abc, def} = dtWorld();
        const unit = await bootUnit({
            facilities: [kaaa, abc, def], position: {lat: 47.25, lon: 10.1}, storage: savedFlightplan(0, [kaaa, abc, def]),
        });
        await settle(unit);
        await moveAircraft(unit, {lat: 47.25, lon: 10.1}, {groundspeedKt: 120, trackTrue: 0});
        return unit;
    }

    // The setup sibling of the pins: off course, NAV 3 shows the leg's DTK 000 and FLY L (3-32, 3-33)
    it('is off course on the first leg (3-32, 3-33)', async () => {
        const unit = await bootOffCourse();
        await show(unit, 'NAV 3');

        expect(Screen.read().rows('L')[1]).toBe('DTK    000°');
        expect(Screen.read().rows('L')[3]).toMatch(/^FLY L/);
    });

    // 4-12: the DTK belongs to the leg, a great-circle course from one waypoint to the next; Appendix A draws DTK as the
    // course from the from waypoint to the to waypoint, apart from BRG. Checked in the KLN 89 trainer, 2026-10-07 (T23): 3 NM off course, FPL 0
    // shows the leg DTK (5) beside the active waypoint while NAV 1 shows a bearing of 12. Off course the code shows the
    // bearing to the active waypoint. Figures 4-51 and 4-52 (one flight state) show 063 and 064 for the active waypoint,
    // which do not settle it
    it.fails('shows the leg DTK of the active waypoint beside FPL 0 (4-12, Appendix A, #297)', async () => {
        const unit = await bootOffCourse();

        // 15.03 NM north and 4.07 NM east of the aircraft: 15.6 NM to ABC
        expect((await show(unit, 'FPL 0'))[2]).toBe(' 16    000°');
    });

    it.fails('shows the leg DTK of the active waypoint beside another page (4-12, Appendix A, #297)', async () => {
        const unit = await bootOffCourse();

        expect((await show(unit, 'NAV 2'))[2]).toBe('DTK    000°');
    });

    /** A Direct To KCCC, an airport outside FPL 0 */
    async function directToOutsidePlan(): Promise<HeadlessUnit> {
        const {kaaa, abc, def, kbbb} = dtWorld();
        const unit = await bootUnit({
            facilities: [kaaa, abc, def, kbbb, airport('KCCC', 47.1, 10.5)], position: {lat: 47.1, lon: 10.0},
            storage: savedFlightplan(0, [kaaa, abc, def, kbbb]),
        });
        await settle(unit);
        await moveAircraft(unit, {lat: 47.1, lon: 10.0}, {groundspeedKt: 120, trackTrue: 0});
        await unit.panel.dct();
        await unit.panel.enterIdent('L', 'KCCC');
        await unit.panel.ent(); // the APT 1 confirmation
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(2000);
        await show(unit, 'FPL 0');
        return unit;
    }

    // The setup sibling of the pin below: 4-12 says D/T 3 uses the distances of D/T 1, so it keeps its titles beside FPL 0
    // during a Direct To outside the plan (4-11, figure 4-44)
    it('keeps its titles beside FPL 0 during a Direct To to a waypoint outside the plan (4-12)', async () => {
        const unit = await directToOutsidePlan();

        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(-1);
        expect(Screen.read().status().left).toBe('FPL 0');
        expect(Screen.read().rows('R')[0]).toBe('DIS     DTK');
    });

    // 4-12: the distances are those of D/T 1, which is blank beside FPL 0 during a Direct To to a waypoint outside the
    // plan (4-11, figure 4-44), and so are the DTKs. The code shows dashes beside every waypoint
    it.fails('is blank beside FPL 0 during a Direct To to a waypoint outside the plan (4-12, #296)', async () => {
        await directToOutsidePlan();

        expect(Screen.read().rows('R')).toEqual([
            'DIS     DTK',
            '           ',
            '           ',
            '           ',
            '           ',
            '           ',
        ]);
    });
});

describe('D/T 3 page (characterization)', () => {
    // The aircraft at rest on the first leg of the plan with turns
    it('shows the distances and DTKs beside FPL 0 with the aircraft at rest', async () => {
        const {legs} = dtkWorld();
        const unit = await bootUnit({
            facilities: legs, position: {lat: 47.1, lon: 10.0}, magvar: 5, storage: savedFlightplan(0, legs),
        });
        await settle(unit);

        expect(await show(unit, 'FPL 0')).toMatchInlineSnapshot(`
          [
            "DIS     DTK",
            "           ",
            " 24    355°",
            " 54    040°",
            " 84    115°",
            "           ",
          ]
        `);
    });

    it('shows dashes beside NAV 2 before the GPS has a fix', async () => {
        const {legs} = dtkWorld();
        const unit = await bootUnit({
            facilities: legs, position: {lat: 47.1, lon: 10.0}, coldGps: true, storage: savedFlightplan(0, legs),
        });

        expect(await show(unit, 'NAV 2')).toMatchInlineSnapshot(`
          [
            "           ",
            "DIS  ----nm",
            "DTK    ---°",
            "           ",
            "           ",
            "           ",
          ]
        `);
    });
});
