import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../harness/boot';
import {standardRoute} from '../../harness/fixtures';
import {HEADING_INPUT, panelXml} from '../../harness/panelXml';
import {activeIdent} from '../../harness/readers';
import {bootOnStandardRoute} from '../../harness/worldBoot';
import {angleDiff, courseDeg, pointBefore, pointFrom} from '../../harness/flight/geo';

const HEADING_INPUT_XML = panelXml(HEADING_INPUT);

const roll = (unit: HeadlessUnit): number => unit.env.sim.get('L:KLN90B_RollCommand', 'degrees');

/** FPL 0 is KAAA, ABC, KBBB and the aircraft stands at KAAA; ABC is active after the settle */
async function onRoute(xml?: string) {
    const {kaaa, abc} = standardRoute();
    const unit = await bootOnStandardRoute({panelXml: xml, magvar: 0});
    // 10 NM before ABC, on the course of the leg
    const mid = pointBefore(kaaa, abc, 10);
    return {unit, kaaa, abc, mid, dtk: courseDeg(mid, abc)};
}

// Public contract: the Autopilot wiki page and the doc comment of LVAR_ROLL_COMMAND in LVars.ts: the roll command is in
// degrees, a left bank is positive and a right bank negative. The Installation Manual (2-69) lets the unit give roll
// steering only with a heading input; these tests run with HeadingInput on, the case without is pinned below (#143).
describe('L:KLN90B_RollCommand (public contract)', () => {
    it('is written as 0 without a flight plan', async () => {
        const unit = await bootUnit({panelXml: HEADING_INPUT_XML});
        await settle(unit);

        // lastWrite: an unset LVar reads 0 as well
        expect(unit.env.sim.lastWrite('L:KLN90B_RollCommand')?.value).toBe(0);
    });

    // Installation Manual 2-70: roll steering needs a ground speed (the page names no threshold). The aircraft is 2 NM off
    // the leg, where it would bank if it moved
    it('is 0 without ground speed, off the leg (2-70)', async () => {
        const {unit, mid, dtk} = await onRoute(HEADING_INPUT_XML);

        await moveAircraft(unit, pointFrom(mid, dtk + 90, 2), {groundspeedKt: 0});

        expect(activeIdent(unit)).toBe('ABC');
        expect(unit.env.sim.lastWrite('L:KLN90B_RollCommand')?.value).toBe(0);
    });

    // The leg lies to the left of an aircraft that is right of the course (looking along it), so the bank is left
    it('is positive, a left bank, when the leg is to the left', async () => {
        const {unit, mid, dtk} = await onRoute(HEADING_INPUT_XML);

        await moveAircraft(unit, pointFrom(mid, dtk + 90, 2), {groundspeedKt: 120, trackTrue: dtk});

        expect(roll(unit)).toBeGreaterThan(0);
    });

    it('is negative, a right bank, when the leg is to the right', async () => {
        const {unit, mid, dtk} = await onRoute(HEADING_INPUT_XML);

        await moveAircraft(unit, pointFrom(mid, dtk - 90, 2), {groundspeedKt: 120, trackTrue: dtk});

        expect(roll(unit)).toBeLessThan(0);
    });

    // Autopilot wiki: at most 30 degrees once the aircraft is in range of the leg. 0.3 NM right of the course, flying
    // straight at the leg at 200 kt, needs more than that, so the cap decides
    it('is -30 degrees, the cap, when more is needed to join the leg', async () => {
        const {unit, mid, dtk} = await onRoute(HEADING_INPUT_XML);

        await moveAircraft(unit, pointFrom(mid, dtk + 90, 0.3), {groundspeedKt: 200, trackTrue: (dtk + 270) % 360});

        // Flying at the leg from its right with the course ahead and to the right: the turn onto it is a right bank, and
        // the cap is the value
        expect(roll(unit)).toBeCloseTo(-30, 6);
    });

    // The wiki names no value for the intercept of a far leg; the code banks 25 degrees (MAX_BANK_ANGLE)
    it('is 25 degrees on a 45 degree intercept (characterization)', async () => {
        const {unit, mid, dtk} = await onRoute(HEADING_INPUT_XML);

        await moveAircraft(unit, pointFrom(mid, dtk + 90, 2), {groundspeedKt: 120, trackTrue: dtk});

        expect(roll(unit)).toBeCloseTo(25, 6);
    });
});

// Installation Manual 2-69: without a heading input the unit gives no roll steering output. RollSteeringController
// ignores Input.HeadingInput and always writes the command.
describe('L:KLN90B_RollCommand without a heading input (public contract)', () => {
    it('the pin setup: HeadingInput is off, ABC is active and the aircraft is 2 NM off the leg at 120 kt', async () => {
        const {unit, abc, mid, dtk} = await onRoute();

        await moveAircraft(unit, pointFrom(mid, dtk + 90, 2), {groundspeedKt: 120, trackTrue: dtk});

        expect(unit.props.planeSettings.input.headingInput).toBe(false);
        expect(activeIdent(unit)).toBe(abc.icaoStruct.ident);
        expect(unit.props.memory.navPage.xtkToActive).toBeCloseTo(2, 1);
        expect(unit.props.sensors.in.gps.groundspeed).toBeCloseTo(120, 6);
    });

    it.fails('is 0 (#143)', async () => {
        const {unit, mid, dtk} = await onRoute();

        await moveAircraft(unit, pointFrom(mid, dtk + 90, 2), {groundspeedKt: 120, trackTrue: dtk});

        expect(unit.env.sim.lastWrite('L:KLN90B_RollCommand')?.value).toBe(0);
    });
});

// #100 (second comment of session 4): far left of the leg on a track parallel to it, case 1 ("on track") of
// RollSteeringController.updateBankAngle takes any negative XTK, and its course to steer DTK - 50 x XTK passes 180 degrees
// off the DTK beyond about 3.6 NM, so the unit banks away from the leg. HeadingInput is on, so the pin survives the
// fix of #143.
describe('L:KLN90B_RollCommand far left of the leg on a parallel track (#100)', () => {
    /** Abeam the point 20 NM before ABC, 5 NM left of the leg KAAA - ABC, flying the leg's course at 120 kt */
    async function farLeftParallel() {
        const {unit, kaaa, abc} = await onRoute(HEADING_INPUT_XML);
        const abeam = pointBefore(kaaa, abc, 20);
        const dtk = courseDeg(abeam, abc);
        await moveAircraft(unit, pointFrom(abeam, dtk - 90, 5), {groundspeedKt: 120, trackTrue: dtk});
        await vi.advanceTimersByTimeAsync(1000);
        return {unit, dtk};
    }

    // The sibling of the pin: the setup works. The heading input is on, ABC is active, the aircraft is 5 NM left of the
    // leg (XTK negative) at 120 kt, with the track of the leg.
    it('the pin setup: 5 NM left of the leg, parallel to it, at 120 kt with HeadingInput on', async () => {
        const {unit, dtk} = await farLeftParallel();
        const nav = unit.props.memory.navPage;

        expect(unit.props.planeSettings.input.headingInput).toBe(true);
        expect(activeIdent(unit)).toBe('ABC');
        expect(nav.xtkToActive).toBeCloseTo(-5, 1);
        expect(nav.desiredTrack).toBeCloseTo(dtk, 0);
        expect(unit.props.sensors.in.gps.groundspeed).toBeCloseTo(120, 6);
        expect(Math.abs(angleDiff(unit.props.sensors.in.gps.trackTrue!, dtk))).toBeLessThan(1);
    });

    // Autopilot wiki: far from the leg the unit turns toward it to a 45 degree intercept, from either side. The leg is to
    // the right, so the bank is right (negative) and the course to steer lies right of the track, less than 90 off it.
    it.fails('banks right, toward the leg (#100)', async () => {
        const {unit, dtk} = await farLeftParallel();

        expect(roll(unit)).toBeLessThan(0);
        const cts = (unit.env.sim.lastWrite('GPS COURSE TO STEER')!.value as number) * 180 / Math.PI;
        const offTrack = angleDiff(cts, dtk);
        expect(offTrack).toBeGreaterThan(0);
        expect(offTrack).toBeLessThan(90);
    });
});
