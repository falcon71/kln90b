import {describe, expect, it, vi} from 'vitest';
import {Facility} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../../harness/boot';
import {standardRoute} from '../../../harness/fixtures';
import {NO_OBS, panelXml} from '../../../harness/panelXml';
import {activeIdent, fplIdents} from '../../../harness/readers';
import {bootOnStandardRoute} from '../../../harness/worldBoot';
import {intersection, vor} from '../../../harness/navdata/builders';
import {savedFlightplan} from '../../../harness/storage';
import {Screen} from '../../../harness/render/screen';
import {courseDeg, crossTrackNm, finalCourseDeg, pointBefore, pointFrom} from '../../../harness/flight/geo';
import {NavMode} from '../../../../kln90b/data/VolatileMemory';

const {kaaa, abc, kbbb} = standardRoute();

/** Plan KAAA, ABC, KBBB, ABC active, OBS mode; with `obs` the external indicator is on that course */
async function planInObs(position: { lat: number; lon: number }, o: { obs?: number, panelXml?: string, abc?: Facility } = {}): Promise<HeadlessUnit> {
    const wpt = o.abc ?? abc;
    const unit = await bootUnit({facilities: [kaaa, wpt, kbbb], position, panelXml: o.panelXml, storage: savedFlightplan(0, [kaaa, wpt, kbbb])});
    await settle(unit);
    if (o.obs !== undefined) unit.env.sim.set('Nav OBS:1', 'degrees', o.obs);
    await unit.panel.obsMode();
    await vi.advanceTimersByTimeAsync(2000);
    expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_OBS);
    return unit;
}

/**
 * DCT from FPL 0 with the cursor on KBBB; ACTIVATE with a second DCT press when asked. `beforeEnt` runs right before
 * the ENT, with no calculation tick between the two
 */
async function directToKbbbFromFpl0(unit: HeadlessUnit, activate: boolean, beforeEnt?: () => void) {
    await unit.panel.selectPage('L', 'FPL 0');
    await unit.panel.cursor('L');
    await unit.panel.outer('L', 2); // KBBB
    await unit.panel.dct();
    if (activate) await unit.panel.dct();
    expect(Screen.read().rows('L')[0]).toBe(activate ? 'ACTIVATE:  ' : 'DIRECT TO: ');
    beforeEnt?.();
    await unit.panel.ent();
    await vi.advanceTimersByTimeAsync(2000);
}

describe('ACTIVATE in OBS mode (5-37)', () => {
    // 5-37 (5.9.7) steps 2 and 3: ACTIVATE makes the waypoint active and leaves the selected course alone. ObsSource 0,
    // so that the course is the unit's own and an external indicator cannot set it back
    it('makes the waypoint active and keeps the OBS course', async () => {
        const position = pointBefore(kaaa, abc, 5);
        const unit = await planInObs(position, {panelXml: panelXml(NO_OBS)});
        const nav = unit.props.memory.navPage;
        const obsBefore = unit.props.modeController.getObsMag(); // The DTK of the leg to ABC, about 051
        expect(Math.abs(obsBefore - courseDeg(position, kbbb))).toBeGreaterThan(5); // So a direct course to KBBB cannot match

        await directToKbbbFromFpl0(unit, true);

        expect(activeIdent(unit)).toBe('KBBB');
        expect(unit.props.modeController.getObsMag()).toBe(obsBefore);
        expect(nav.navmode).toBe(NavMode.ENR_OBS);
    });

    /** OBS 050 through ABC, 5 NM before ABC, then ACTIVATE to KBBB from the FPL 0 page; the hand deviation from 050 through KBBB */
    async function activateKbbbOnCourse50() {
        const position = pointBefore(kaaa, abc, 5);
        const unit = await planInObs(position, {obs: 50});
        const expected = crossTrackNm(position, kbbb, 50);
        expect(expected).toBeCloseTo(24.5, 0); // Far from zero, so a recentered bar cannot match

        await directToKbbbFromFpl0(unit, true);
        return {unit, nav: unit.props.memory.navPage, expected};
    }

    // 5-37 (5.9.7) step 2: the setup of the test below. The same flow makes KBBB active and keeps the mode, so the test
    // below depends only on the deviation
    it('ACTIVATE with OBS 050 makes KBBB active and keeps ENR-OBS (the setup of #154)', async () => {
        const {unit, nav} = await activateKbbbOnCourse50();

        expect(activeIdent(unit)).toBe('KBBB');
        expect(nav.navmode).toBe(NavMode.ENR_OBS);
        expect(unit.props.modeController.getObsMag()).toBe(50);
    });

    // 5-37 (5.9.7) step 3: the D-bar is not recentered, the deviation is from the 050 course through KBBB; checked in the
    // KLN 89 trainer, 2026-10-14 (course 045 kept, Fly L 37.5 NM after ACTIVATE)
    it('does not recenter the deviation: it is measured from the OBS course through the new waypoint (#154)', async () => {
        const {nav, expected} = await activateKbbbOnCourse50();

        expect(Math.abs(nav.xtkToActive! - expected)).toBeLessThan(0.05);
    });
});

// ABC with a published variation of 10 E (the sim stores east as negative); KBBB at the world's variation of 0. An OBS
// course of 050 magnetic at ABC is 060 true, so a unit that keeps the true course shows 060 at KBBB, and one that keeps
// the magnetic number lays 050 true through KBBB
const abc10E = vor('ABC', abc.lat, abc.lon, {magneticVariation: -10});

describe('ACTIVATE in OBS mode keeps the true course (checked in the KLN 89 trainer, 2026-10-25, #425)', () => {
    // Checked in the KLN 89 trainer, 2026-10-25 (the second OBS block): ACTIVATE to a waypoint with another variation
    // keeps the true course, lays it through the new waypoint, and the course shown changes by the variation difference.
    // ObsSource 0, so that the course is the unit's own
    it('keeps the true course through KBBB and shows it with the variation of KBBB (checked in the KLN 89 trainer, 2026-10-25, #425)', async () => {
        const position = pointBefore(kaaa, abc, 5);
        const unit = await planInObs(position, {panelXml: panelXml(NO_OBS), abc: abc10E});
        const mc = unit.props.modeController;
        mc.setObsOnUnit(50); // 060 true at ABC
        await vi.advanceTimersByTimeAsync(1000);
        const expected = crossTrackNm(position, kbbb, 60);
        expect(Math.abs(expected - crossTrackNm(position, kbbb, 50))).toBeGreaterThan(1); // A kept magnetic 050 cannot match

        await directToKbbbFromFpl0(unit, true);

        expect(activeIdent(unit)).toBe('KBBB');
        expect(Math.abs(mc.getObsTrue() - 60)).toBeLessThan(1e-6);
        expect(Math.abs(unit.props.memory.navPage.xtkToActive! - expected)).toBeLessThan(0.05);
        expect(Math.abs(mc.getObsMag() - 60)).toBeLessThan(1e-6); // KBBB at 0°
    });
});

// The indicator rules are the 90B's: 5-37 has ACTIVATE keep the selected course, which with an indicator the unit reads
// is the indicator's; 5-35 has the unit slew an indicator it drives (#261); an indicator that did not move must not
// re-lay the course every second (#122)
describe('OBS mode with an indicator the unit reads (5-35, 5-37, #122, #261)', () => {
    const position = pointBefore(kaaa, abc, 5);

    // 5-37 (5.9.7): ACTIVATE keeps the selected course, here the one on the non-driven indicator (ObsSource 1,
    // ObsTarget 0): it still shows 050, so the unit takes 050 at KBBB. This passes before #425 too: the indicator wins
    // either way
    it('takes the course of a read, non-driven indicator after ACTIVATE (5-37, #425)', async () => {
        const unit = await planInObs(position, {obs: 50, abc: abc10E});
        const mc = unit.props.modeController;
        expect(Math.abs(mc.getObsTrue() - 60)).toBeLessThan(1e-6); // Precondition: 050 at ABC is 060 true

        await directToKbbbFromFpl0(unit, true);

        expect(activeIdent(unit)).toBe('KBBB');
        expect(Math.abs(mc.getObsMag() - 50)).toBeLessThan(1e-6);
        expect(Math.abs(unit.props.memory.navPage.xtkToActive! - crossTrackNm(position, kbbb, 50))).toBeLessThan(0.05);
    });

    // 5-35, 5-37: with an indicator the unit reads and drives (ObsSource 1, ObsTarget 1) ACTIVATE keeps the true course,
    // and the indicator is slewed to the new magnetic course at once. The indicator is turned to 045 right before the
    // ENT, with no calculation tick between: the unit's course is written over it at the ACTIVATE, and the 045 is not read
    // back over the course at the next tick (#261)
    it('keeps the true course and slews an indicator it reads and drives after ACTIVATE (5-35, 5-37, #261, #425)', async () => {
        const unit = await planInObs(position, {obs: 50, panelXml: panelXml({'Output.ObsTarget': 1}), abc: abc10E});
        unit.env.sim.applyObsKeyEvents = true;
        const mc = unit.props.modeController;
        mc.setObsOnUnit(50);
        await vi.advanceTimersByTimeAsync(1000);
        expect(Math.abs(mc.getObsTrue() - 60)).toBeLessThan(1e-6); // Preconditions: 050 at ABC, 060 true
        expect(unit.env.sim.get('Nav OBS:1', 'degrees')).toBeCloseTo(50, 6);

        await directToKbbbFromFpl0(unit, true, () => unit.env.sim.set('Nav OBS:1', 'degrees', 45));

        expect(Math.abs(mc.getObsTrue() - 60)).toBeLessThan(1e-6);
        expect(Math.abs(unit.env.sim.get('Nav OBS:1', 'degrees') - 60)).toBeLessThan(0.5);
        expect(Math.abs(unit.props.memory.navPage.xtkToActive! - crossTrackNm(position, kbbb, 60))).toBeLessThan(0.05);
    });

    // #122: the indicator is read every second, and a course that did not change must not be laid again. ABC has a
    // published variation of 14.04 E, for which 050 converted to true and back is not exactly 050 (5.7e-14 off), so a
    // comparison that is not exact enough would re-lay the course every second. This passes before #425 too: the
    // course was held magnetic and compared exactly
    it('does not lay the course again while a read indicator does not move (#122)', async () => {
        const abcOdd = vor('ABC', abc.lat, abc.lon, {magneticVariation: -14.04});
        const unit = await planInObs(position, {obs: 50, abc: abcOdd});
        const aw = unit.props.memory.navPage.activeWaypoint;
        const toIndex = vi.spyOn(aw, 'directToFlightplanIndex');
        const to = vi.spyOn(aw, 'directTo');

        await vi.advanceTimersByTimeAsync(5000);

        expect(toIndex).not.toHaveBeenCalled();
        expect(to).not.toHaveBeenCalled();
        expect(Math.abs(unit.props.modeController.getObsMag() - 50)).toBeLessThan(1e-6);
    });
});

/**
 * FPL 0 KAAA - EEE, EEE 150 NM east of KAAA. The aircraft is 100 NM before EEE and 5 NM north of the leg. In OBS mode
 * (ObsSource 0, so that the course is the unit's own), D-> EEE and ENT, then 1 s. With `obs` the unit instead reads a
 * non-driven indicator that is on that course. With `driven` it reads and drives the indicator (ObsSource 1, ObsTarget 1) and
 * the sim keeps the whole degree it is sent (#427).
 */
async function longDirectToEee(o: { obs?: number, driven?: boolean } = {}) {
    const eeePos = pointFrom(kaaa, 90, 150);
    const eee = intersection('EEE', eeePos.lat, eeePos.lon);
    const onLeg = pointBefore(kaaa, eee, 100);
    const position = pointFrom(onLeg, courseDeg(onLeg, eee) - 90, 5);
    const unit = await bootUnit({facilities: [kaaa, eee], position, panelXml: o.driven ? panelXml({'Input.ObsSource': 1, 'Output.ObsTarget': 1}) : o.obs === undefined ? panelXml(NO_OBS) : undefined, storage: savedFlightplan(0, [kaaa, eee])});
    await settle(unit);
    if (o.driven) unit.env.sim.applyObsKeyEvents = true;
    if (o.obs !== undefined) unit.env.sim.set('Nav OBS:1', 'degrees', o.obs);
    await unit.panel.obsMode();
    await vi.advanceTimersByTimeAsync(2000);
    const nav = unit.props.memory.navPage;
    expect(nav.navmode).toBe(NavMode.ENR_OBS);

    await unit.panel.selectPage('R', 'CTR 1'); // So DCT pre-fills the active waypoint (3-27 rule 4)
    await unit.panel.dct();
    await unit.panel.ent();
    await vi.advanceTimersByTimeAsync(1000);
    return {unit, nav, position, eee};
}

describe('Direct To in OBS mode (5-37)', () => {
    const offLeg = pointFrom(pointBefore(kaaa, abc, 10), 141, 3); // 3 NM right of KAAA - ABC
    // ABC with a published variation of 10 E (the sim stores east as negative), so that the magnetic course the unit shows
    // is the true course minus 10: the direct course at ABC from offLeg is 034.3 true, so 024.3 magnetic. At a variation of 0 a
    // unit that mixes up true and magnetic, or the sign of the variation, would pass
    const abcE = vor('ABC', abc.lat, abc.lon, {magneticVariation: -10});

    // 5-37 (5.9.6): the direct-to selects the OBS that leads from the present position to the waypoint when the unit
    // is not the displayed source (ObsSource 0: the unit cannot read the indicator). The course is the one of the direct
    // path at ABC (#370), which differs from the initial course by 0.1 degrees over this short path
    it('sets the OBS to the course from the present position and centers the deviation', async () => {
        const unit = await planInObs(offLeg, {panelXml: panelXml(NO_OBS), abc: abcE});
        const nav = unit.props.memory.navPage;
        await unit.panel.selectPage('R', 'CTR 1'); // So DCT pre-fills the active waypoint (3-27 rule 4)

        await unit.panel.dct();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        expect(courseDeg(offLeg, abc)).toBeCloseTo(34.2, 1);
        expect(Math.abs(unit.props.modeController.getObsMag() - (finalCourseDeg(offLeg, abc) - 10))).toBeLessThan(0.05); // 024.3 magnetic: the course at ABC, 0.1 above the initial one
        expect(Math.abs(nav.xtkToActive!)).toBeLessThan(0.05);
    });

    // 5-37 (5.9.6): the setup of the test below. The direct-to makes EEE active as a direct-to and keeps ENR-OBS
    it('makes EEE active as a direct-to and keeps ENR-OBS on a long direct course (the setup of #370)', async () => {
        const {unit, nav} = await longDirectToEee();

        expect(activeIdent(unit)).toBe('EEE');
        expect(nav.activeWaypoint.isDctNavigation()).toBe(true);
        expect(nav.navmode).toBe(NavMode.ENR_OBS);
    });

    // 5-37 (the Direct To selects the course from the present position to the waypoint and centers the deviation);
    // checked in the KLN 89 trainer, 2026-10-25 (the course set is the direct path's course at the waypoint). #370: the
    // direct path crosses the meridians, so its course at EEE (095.54 true here) is not the one at the aircraft (093.76
    // true). The course is laid through EEE, so a course taken at the aircraft left the deviation at about -3.11 NM
    // instead of 0
    it('centers the deviation after a long Direct To in OBS mode (5-37, #370)', async () => {
        const {nav} = await longDirectToEee();

        expect(Math.abs(nav.xtkToActive!)).toBeLessThan(0.1);
    });

    // 5-37; checked in the KLN 89 trainer, 2026-10-25 (the course set is the direct path's course at the waypoint)
    it('sets the course of the direct path at EEE (5-37, #370)', async () => {
        const {unit, position, eee} = await longDirectToEee();

        expect(Math.abs(unit.props.modeController.getObsMag() - finalCourseDeg(position, eee))).toBeLessThan(0.05); // 095.54, variation 0; the initial bearing would be 093.76
    });

    // 5-37 (5.9.6) and C-1: the CRS message tells the course set, which is the direct path's course at the waypoint
    it('shows CRS with the course at the waypoint after a long direct to (5-37, C-1, #370)', async () => {
        await longDirectToEee({obs: 50});

        expect(Screen.read().status().mode).toBe('d› CRS 096°'); // 095.54 rounded; the initial bearing would give 094
    });

    // 5-37 (5.9.6) and C-1: on a non-driven indicator that shows the unit, the status line tells the course to set
    it('shows CRS with the direct course when the unit reads a non-driven indicator', async () => {
        const unit = await planInObs(offLeg, {obs: 50, abc: abcE});
        await unit.panel.selectPage('R', 'CTR 1');

        await unit.panel.dct();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);

        expect(Screen.read().status().mode).toBe('d› CRS 024°'); // 034.3 true less the variation of 10 E
    });

    // 5-37 (5.9.6): a driven indicator (ObsTarget 1, VOR 1) is slewed to the direct course, with no message
    it('slews a driven indicator to the direct course without a CRS message', async () => {
        const unit = await planInObs(offLeg, {panelXml: panelXml({...NO_OBS, 'Output.ObsTarget': 1}), abc: abcE});
        await unit.panel.selectPage('R', 'CTR 1');

        await unit.panel.dct();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);

        expect(Screen.read().status().mode).not.toMatch(/CRS/);
        const vor1 = unit.env.sim.keyEvents.filter(k => k.name === 'K:VOR1_SET');
        expect(Math.abs(vor1[vor1.length - 1].value - (courseDeg(offLeg, abc) - 10))).toBeLessThan(0.5); // 024 magnetic
    });

    // 5-37 (5.9.6): with an indicator the unit reads and drives (ObsSource 1, ObsTarget 1) the direct course is set and
    // the indicator slewed to it; the indicator's old course (120) must not come back at the next tick (#261)
    it('keeps the direct course and slews an indicator it reads and drives (5-37, #261)', async () => {
        const unit = await planInObs(offLeg, {obs: 120, panelXml: panelXml({'Output.ObsTarget': 1}), abc: abcE});
        unit.env.sim.applyObsKeyEvents = true;
        const nav = unit.props.memory.navPage;
        await unit.panel.selectPage('R', 'CTR 1');

        await unit.panel.dct();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(2000);

        expect(Math.abs(unit.props.modeController.getObsMag() - (finalCourseDeg(offLeg, abc) - 10))).toBeLessThan(0.05); // 024.3 magnetic: the course at ABC, 0.1 above the initial one
        expect(Math.abs(unit.env.sim.get('Nav OBS:1', 'degrees') - (courseDeg(offLeg, abc) - 10))).toBeLessThan(0.5);
        expect(Math.abs(nav.xtkToActive!)).toBeLessThan(0.05);
    });

    // #426: with the aircraft parked exactly on ABC there is no direct path to it and no course along one, so the Direct
    // To keeps the OBS course; before, the course became NaN, which a knob click could not recover
    it('keeps the OBS course with the aircraft exactly on the waypoint (#426)', async () => {
        const unit = await planInObs(offLeg, {panelXml: panelXml(NO_OBS), abc: abcE});
        unit.props.modeController.setObsOnUnit(50);
        await moveAircraft(unit, {lat: abc.lat, lon: abc.lon}, {groundspeedKt: 0, trackTrue: 0});
        expect(activeIdent(unit)).toBe('ABC'); // Precondition: OBS mode does not sequence
        await unit.panel.selectPage('R', 'CTR 1');

        await unit.panel.dct();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);

        expect(unit.props.memory.navPage.activeWaypoint.isDctNavigation()).toBe(true);
        expect(unit.props.modeController.getObsMag()).toBeCloseTo(50, 6);
        expect(Screen.read().status().mode).toBe('d› CRS 050°');
        expect(unit.errors).toEqual([]);
    });
});

// The 90B's own rule, not a trainer check: the sim keeps the course it is sent as a whole degree, rounded half up (the
// maintainer's sim check, 2026-10-25, #427). With an indicator the unit reads and drives, the unit holds the fraction
// itself, so the whole degree that comes back is its own course, not a turn of the indicator by the pilot. A read-only
// indicator is not driven, so what it shows is always the pilot's
describe('the whole-degree echo of an OBS indicator (the 90B, #427)', () => {
    // The long Direct To of #370: the course at EEE is 095.54, which the sim keeps as 96. Read back as a turn, the course
    // snapped to 96 and the deviation was about 0.8 NM
    it('keeps a course with a fraction and the deviation centered while the indicator shows the whole degree (#427)', async () => {
        const {unit, nav, position, eee} = await longDirectToEee({driven: true});
        await vi.advanceTimersByTimeAsync(2000);

        expect(Math.abs(unit.props.modeController.getObsMag() - finalCourseDeg(position, eee))).toBeLessThan(1e-6); // 095.54, variation 0
        expect(unit.env.sim.get('Nav OBS:1', 'degrees')).toBe(96);
        expect(Math.abs(nav.xtkToActive!)).toBeLessThan(0.05);
    });

    // A value that is not the echo of the course sent is a turn by the pilot, and it is taken. This passes before the fix
    // too: 097 differs from the course and from the whole degree of the course sent
    it('still takes a turn of the indicator to another course (#427)', async () => {
        const {unit} = await longDirectToEee({driven: true});
        await vi.advanceTimersByTimeAsync(2000);

        unit.env.sim.set('Nav OBS:1', 'degrees', 97);
        await vi.advanceTimersByTimeAsync(2000);

        expect(Math.abs(unit.props.modeController.getObsMag() - 97)).toBeLessThan(1e-6);
    });

    // The sim rounds half up: a course of exactly 100.5 comes back as 101, which is not a turn
    it('does not take the echo of a course at the half degree as a turn (#427)', async () => {
        const {unit} = await longDirectToEee({driven: true});

        unit.props.modeController.setObsOnUnit(100.5);
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.env.sim.get('Nav OBS:1', 'degrees')).toBe(101);
        expect(Math.abs(unit.props.modeController.getObsMag() - 100.5)).toBeLessThan(1e-6);
    });

    // The echo rule is for a driven indicator only. A read-only one (ObsSource 1, ObsTarget 0) shows what the pilot dialed,
    // so a pilot who turns it to 101 while the unit holds 100.5 has turned the course. This passes before the fix too: it
    // pins that the rule does not leak onto the read-only path
    it('takes a turn of a read-only indicator to the whole degree of the course the unit holds (#427)', async () => {
        const {unit} = await longDirectToEee({obs: 50});
        const mc = unit.props.modeController;

        mc.setObsOnUnit(100.5);
        unit.env.sim.set('Nav OBS:1', 'degrees', 101); // No calculation tick between: the pilot turned it right after
        await vi.advanceTimersByTimeAsync(2000);

        expect(Math.abs(mc.getObsMag() - 101)).toBeLessThan(1e-6);
    });

    // The sim reads 359.7 back as 000, the same direction as the unit's course, one degree rounded away across north
    it('does not take the echo of a course at north as a turn (#427)', async () => {
        const {unit} = await longDirectToEee({driven: true});

        unit.props.modeController.setObsOnUnit(359.7);
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.env.sim.get('Nav OBS:1', 'degrees')).toBe(0);
        expect(Math.abs(unit.props.modeController.getObsMag() - 359.7)).toBeLessThan(1e-6);
    });
});

// The CRS message is the 90B's own (5-37). The KLN 89 trainer (2026-10-07) shows the OBS course at north as 000, never
// 360; that rule is applied to the course in this message by analogy
describe('Direct To in OBS mode, the CRS message at north (characterization)', () => {
    const offLeg = pointFrom(pointBefore(kaaa, abc, 10), 141, 3); // 3 NM right of KAAA - ABC

    // #263: the direct course is 034.3 true; with a variation of 34.6 east at ABC it is 359.7 magnetic, which the CRS
    // message shows as 000
    it('characterization: shows a direct course of 359.7 in the CRS message as 000 (#263)', async () => {
        const variation = finalCourseDeg(offLeg, abc) + 0.3; // the direct course at ABC minus this is 359.7
        const abcNorth = vor('ABC', abc.lat, abc.lon, {magneticVariation: -variation});
        const unit = await planInObs(offLeg, {obs: 50, abc: abcNorth});
        await unit.panel.selectPage('R', 'CTR 1');

        await unit.panel.dct();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);

        expect(Screen.read().status().mode).toBe('d› CRS 000°');
    });
});

describe('the left side after a direct-to from FPL 0 (#82)', () => {
    /** FPL 0 KAAA, ABC, KBBB; the cursor on ABC, DCT, and the ENT that approves the waypoint page: the direct-to is made */
    async function directToAbcFromFpl0() {
        const unit = await bootOnStandardRoute({position: pointBefore(kaaa, abc, 20)});
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 1); // ABC
        await unit.panel.dct();
        await unit.panel.ent(); // Approves the VOR page: the direct-to is made
        return unit;
    }
    const planRows = () => Screen.read().rows('L').slice(1, 4).map(r => r.slice(2, 8));

    // 4-11 step 4: the setup of the test below. The direct-to is made and FPL 0 is unchanged
    it('makes the direct-to to ABC and leaves FPL 0 at KAAA, ABC, KBBB (the setup of #82)', async () => {
        const unit = await directToAbcFromFpl0();
        await vi.advanceTimersByTimeAsync(1000);

        const aw = unit.props.memory.navPage.activeWaypoint;
        expect(aw.isDctNavigation()).toBe(true);
        expect(activeIdent(unit)).toBe('ABC');
        expect(fplIdents(unit, 0)).toEqual(['KAAA', 'ABC', 'KBBB']);
        expect(planRows()).toEqual(['1:KAAA', '2:ABC ', '3:KBBB']);
    });

    // 4-11 step 4 and figure 4-42: after the approval the left page shows FPL 0 with its page name, i.e. the cursor is
    // off. With the cursor left on the selected row, the next ENT inserted a blank waypoint ahead of it (#82)
    it('does not insert a blank waypoint at an ENT after the direct-to (#82)', async () => {
        const unit = await directToAbcFromFpl0();

        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().status().left).toBe('FPL 0');
        expect(planRows()).toEqual(['1:KAAA', '2:ABC ', '3:KBBB']);
    });

    // 3-29 and 4-11: D->, CLR, ENT from FPL 0 with the cursor on cancels the direct-to. The left page comes back with
    // the cursor off as after an approval, so the next ENT does not insert a blank waypoint either (#82)
    it('turns the cursor off when the direct-to is cancelled from FPL 0 (3-29, #82)', async () => {
        const unit = await directToAbcFromFpl0();
        await unit.panel.cursor('L');
        await unit.panel.cursorTo('L', 'ABC');
        await unit.panel.dct();
        await unit.panel.clr();
        await unit.panel.ent(); // Cancels the direct-to
        expect(unit.props.memory.navPage.activeWaypoint.isDctNavigation()).toBe(false); // Precondition

        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().status().left).toBe('FPL 0');
        expect(planRows()).toEqual(['1:KAAA', '2:ABC ', '3:KBBB']);
    });
});
