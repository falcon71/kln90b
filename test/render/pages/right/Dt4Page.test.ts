import {describe, expect, it, vi} from 'vitest';
import {Facility} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {airport} from '../../../harness/navdata/builders';
import {dtWorld} from '../../../harness/fixtures';
import {savedFlightplan} from '../../../harness/storage';
import {bootOnDtWorld} from '../../../harness/worldBoot';
import {panelXml} from '../../../harness/panelXml';
import {Screen} from '../../../harness/render/screen';
import {activeIdent, fplIdents} from '../../../harness/readers';

// The world of the D/T tests is dtWorld() (see Dt1Page.test.ts): along 10 E, the aircraft 0.1 degree north of KAAA at 120
// kt due north; KBBB, the last waypoint, 84.15 NM away (42.1 min). The fake clock starts at 12:00:00 UTC (DEFAULT_START)
// and the ground speed is above 30 kt from the first seconds, so DEP is 12:00 with the default SET 4 (RUN WHEN GS > 30KT).

// FPL 0 only: D/T 4 shows the same beside FPL 0 and NAV 2 and has no FPL 3 case
async function bootMoving(legs: Facility[], facilities: Facility[] = legs): Promise<HeadlessUnit> {
    return bootOnDtWorld({legs, facilities, fpl3: false});
}

async function show(unit: HeadlessUnit, left: 'FPL 0' | 'NAV 2'): Promise<string[]> {
    await unit.panel.selectPage('L', left);
    return unit.panel.show('R', 'D/T 4');
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

        // Ten simulated minutes with every tick running: the 5 s default timeout is too short on a busy machine, hence
        // the 30 s one below (test/README.md, Long render tests need their own timeout)
        await vi.advanceTimersByTimeAsync(600_000);

        const rows = Screen.read().rows('R');
        expect(rows[2]).toBe('TIME  12:10');
        expect(rows[4]).toBe('FLT     :10');
    }, 30_000);

    // 4-13: with RUN WHEN GS > 30KT, FLT does not run below 30 kt: after ten minutes at rest TIME has moved on, FLT and
    // DEP have not
    it('does not count the flight time below 30 kt (4-13)', async () => {
        const {kaaa, abc, def, kbbb} = dtWorld();
        const unit = await bootOnDtWorld({legs: [kaaa, abc, def, kbbb], moving: false, fpl3: false});
        await show(unit, 'FPL 0');

        // Ten simulated minutes with every tick running, with the 30 s timeout below (as in the test above)
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
        await unit.panel.directTo('KCCC', {waitMs: 2000});
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
    // shows the Direct To symbol in the first two cells, right before the destination ident, during a Direct To off the
    // plan. FPL 0 holds a plan here (#298)
    it('shows the Direct To symbol before a Direct To destination off the plan (photo 0283863.jpg, #298)', async () => {
        const unit = await directToOutsidePlan();

        expect(fplIdents(unit, 0)).toEqual(['KAAA', 'ABC', 'DEF', 'KBBB']); // precondition: FPL 0 holds its plan
        expect(Screen.read().rows('R')[0]).toBe('d›KCCC  UTC');
    });

    // 4-13, 5-7 and the KLN 89 trainer (2026-10-07): a duration never shows 60 minutes. KBBB is 119.2 NM ahead at 120
    // kt, 59.6 min, which the unit rounds to the next whole hour (5-7; the hour rolls over, so the minutes run from 00
    // to 59)
    it('never shows 60 minutes (4-13, #223)', async () => {
        const {kaaa, abc} = dtWorld();
        const kbbb = airport('KBBB', 47.1 + 119.2 / 60.108, 10.0);
        const unit = await bootMoving([kaaa, abc, kbbb]);

        const rows = await show(unit, 'FPL 0');
        expect(rows[0]).toBe('  KBBB  UTC'); // precondition
        expect(rows[5]).toBe('ETE    1:00');
    });
});

describe('D/T 4 page (characterization)', () => {
    // While the last leg of FPL 0 is active, its waypoint is the destination and the active waypoint: only the arrow
    // (maintainer ruling, #298)
    it('shows the arrow before the destination while the last leg is active (characterization, #298)', async () => {
        const {kaaa, abc, def, kbbb} = dtWorld();
        const unit = await bootMoving([kaaa, kbbb], [kaaa, abc, def, kbbb]); // the first leg is the last leg
        expect(activeIdent(unit)).toBe('KBBB'); // precondition

        expect((await show(unit, 'FPL 0'))[0]).toBe(' ›KBBB  UTC');
    });

    // A Direct To to the last waypoint of FPL 0 shows the Direct To symbol, as off the plan (maintainer ruling, #298)
    it('shows the Direct To symbol after a Direct To to the last waypoint (characterization, #298)', async () => {
        const {kaaa, abc, def, kbbb} = dtWorld();
        const unit = await bootMoving([kaaa, abc, def, kbbb]);
        await unit.panel.directTo('KBBB', {waitMs: 2000});

        expect((await show(unit, 'FPL 0'))[0]).toBe('d›KBBB  UTC');
    });

    // A Direct To to a middle waypoint: the destination stays the last waypoint, which is not active (#298)
    it('shows blanks before the destination after a Direct To to a middle waypoint (characterization, #298)', async () => {
        const {kaaa, abc, def, kbbb} = dtWorld();
        const unit = await bootMoving([kaaa, abc, def, kbbb]);
        await unit.panel.directTo('ABC', {waitMs: 2000});

        expect((await show(unit, 'FPL 0'))[0]).toBe('  KBBB  UTC');
    });

    // The destination is twice in FPL 0 and its first copy is active: the arrow compares plan indices (maintainer
    // ruling, #298)
    it('shows no arrow before the destination while its first copy is active (characterization, #298)', async () => {
        // A loop, so that the first KBBB is no 180 degree reversal: that turn's anticipation would sequence past it at
        // once (turn anticipation is uncapped, as on the real unit)
        const {kaaa, abc, kbbb} = dtWorld();
        const kccc = airport('KCCC', 48.0, 10.5);
        const unit = await bootMoving([kaaa, kbbb, kccc, abc, kbbb], [kaaa, abc, kbbb, kccc]);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(1); // precondition: the first KBBB

        expect((await show(unit, 'FPL 0'))[0]).toBe('  KBBB  UTC');
    });

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

// 4-13: with SET 4 on RUN WHEN POWER IS ON, the timers follow the power and ignore the ground speed: DEP holds the
// clock time of the power-on and FLT counts from it. Every test here stands still, so the default RUN WHEN GS > 30KT
// would count nothing
// The GPS advances its time in place without a fix and in take-home mode (#171): the cases at the end, and Timers.test.ts
describe('D/T 4 page with RUN WHEN POWER IS ON (4-13)', () => {
    /** hh:mm of the simulated UTC clock, read from the fake Date and not from the unit */
    const utcNow = () => new Date(Date.now()).toISOString().slice(11, 16);

    /** D/T 4 on the right beside NAV 2, the left page every power-on shows (3-8) */
    const dt4 = (unit: HeadlessUnit): Promise<string[]> => unit.panel.show('R', 'D/T 4');

    // 4-13: a power cycle starts DEP and FLT anew. Switched on at 12:00 (the boot), off at 12:10 and on again at 12:12:
    // five minutes after that DEP reads 12:12 and FLT :05, not 12:00 and :15
    it('shows the time of the last power-on as DEP and the time since then as FLT, at rest (4-13)', async () => {
        const unit = await bootUnit({position: {lat: 47.1, lon: 10.0}, storage: {flightTimer: true}});
        await settle(unit);
        // Ten simulated minutes, then the power cycle and five more below: the 30 s timeout at the end of the test
        await vi.advanceTimersByTimeAsync(10 * 60_000);

        await unit.panel.powerCycle({offSeconds: 120});
        const poweredOn = Date.now();
        expect(utcNow()).toBe('12:12'); // Precondition: the power-on time
        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(poweredOn + 5 * 60_000 - Date.now()); // five minutes after the power-on

        const rows = await dt4(unit);
        expect(rows[1]).toBe('DEP   12:12');
        expect(rows[2]).toBe('TIME  12:17');
        expect(rows[4]).toBe('FLT     :05');
    }, 30_000);

    /** D/T 4 beside NAV 2 after the unit has run for five minutes */
    async function dt4AfterFiveMinutes(unit: HeadlessUnit): Promise<string[]> {
        await settle(unit);
        await vi.advanceTimersByTimeAsync(5 * 60_000);
        await unit.panel.selectPage('L', 'NAV 2');
        return dt4(unit);
    }

    // 4-13: DEP is the time power was applied. A cold start without a fix (REAL acquisition takes minutes) has the GPS
    // advance its own clock until the first fix; DEP must not run with it
    it('keeps the power-on time as DEP through the first fix of a cold start (4-13, #171)', async () => {
        const unit = await bootUnit({position: {lat: 47.1, lon: 10.0}, storage: {flightTimer: true, fastGpsAcquisition: false}, coldGps: true});
        expect(unit.props.sensors.in.gps.isValid()).toBe(false); // Precondition: no fix at the power-on

        const rows = await dt4AfterFiveMinutes(unit);

        expect(unit.props.sensors.in.gps.isValid()).toBe(true); // Precondition: the first fix has come since
        expect(utcNow()).not.toBe('12:00'); // Precondition: the clock has moved on
        expect(rows[1]).toBe('DEP   12:00');
        expect(rows[2]).toBe(`TIME  ${utcNow()}`);
    }, 30_000);

    // 4-13: the same in take-home mode, where the GPS has no fix at all and advances its clock all the time
    it('keeps the power-on time as DEP in take-home mode (4-13, #171)', async () => {
        const unit = await bootUnit({
            position: {lat: 47.1, lon: 10.0}, storage: {flightTimer: true}, panelXml: panelXml({TakeHomeMode: true}),
        });

        const rows = await dt4AfterFiveMinutes(unit);

        expect(utcNow()).not.toBe('12:00'); // Precondition: the clock has moved on
        expect(rows[1]).toBe('DEP   12:00');
        expect(rows[2]).toBe(`TIME  ${utcNow()}`);
    }, 30_000);
});
