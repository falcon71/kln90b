import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../harness/boot';
import {GeoCircle, GeoPoint} from '@microsoft/msfs-sdk';
import {standardRoute} from '../../harness/fixtures';
import {HEADING_INPUT, panelXml} from '../../harness/panelXml';
import {activeIdent} from '../../harness/readers';
import {RollSteeringController} from '../../../kln90b/services/RollSteeringController';
import {bootOnStandardRoute} from '../../harness/worldBoot';
import {savedFlightplan} from '../../harness/storage';
import {airport} from '../../harness/navdata/builders';
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
// steering only with a heading input; these tests run with HeadingInput on, the case without follows below (#143).
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

// Installation Manual 2-69: without a heading input the unit gives no roll steering, so the command is 0 (#143)
describe('L:KLN90B_RollCommand without a heading input (public contract)', () => {
    it('the setup: HeadingInput is off, ABC is active and the aircraft is 2 NM off the leg at 120 kt', async () => {
        const {unit, abc, mid, dtk} = await onRoute();

        await moveAircraft(unit, pointFrom(mid, dtk + 90, 2), {groundspeedKt: 120, trackTrue: dtk});

        expect(unit.props.planeSettings.input.headingInput).toBe(false);
        expect(activeIdent(unit)).toBe(abc.icaoStruct.ident);
        expect(unit.props.memory.navPage.xtkToActive).toBeCloseTo(2, 1);
        expect(unit.props.sensors.in.gps.groundspeed).toBeCloseTo(120, 6);
    });

    it('is 0 (2-69, #143)', async () => {
        const {unit, mid, dtk} = await onRoute();

        await moveAircraft(unit, pointFrom(mid, dtk + 90, 2), {groundspeedKt: 120, trackTrue: dtk});

        expect(unit.env.sim.lastWrite('L:KLN90B_RollCommand')?.value).toBe(0);
    });

    // GPS COURSE TO STEER is not an output of the real unit (the code adds it), and the default autopilot reads it. The
    // maintainer decided to keep writing it without a heading input (characterization): the 45° intercept course of the
    // leg, as in SensorsOut.test.ts
    it('still writes GPS COURSE TO STEER, the intercept course (characterization, #143)', async () => {
        const {unit, mid, dtk} = await onRoute();

        await moveAircraft(unit, pointFrom(mid, dtk + 90, 2), {groundspeedKt: 120, trackTrue: dtk});

        const cts = unit.env.sim.lastWrite('GPS COURSE TO STEER')!.value as number;
        expect(cts).toBeCloseTo(((dtk - 45 + 360) % 360) * Math.PI / 180, 2);
    });
});

// #100 (its comment of 2026-10-05): far left of the leg on a track parallel to it, case 1 ("on track") of
// RollSteeringController.updateBankAngle takes any negative XTK, and its course to steer DTK - 50 x XTK passes 180 degrees
// off the DTK beyond about 3.6 NM, so the unit banks away from the leg. HeadingInput is on, because the unit gives roll
// steering only with it (2-69, #143).
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

// #373: with a plan whose only leg has no length, [KAAA, KAAA], NavCalculator has no leg before it to navigate on (#120),
// so DTK and XTK are null. The unit then has nothing to steer on and the roll command is 0 (the roll steering design,
// docs/superpowers/specs/2026-10-19-roll-steering-design.md, section 3 and section 5 item 2; the 0 output is an analogy to
// the case without a heading input, Installation Manual 2-69, which is about a missing input, not a missing path). The old
// controller steered on the degenerate path with null coerced to 0. GPS COURSE TO STEER is written as 0 in the same case (see the
// comment on setOutput in RollSteeringController.ts). HeadingInput is on.
describe('L:KLN90B_RollCommand with a plan without a leg before the zero-length one (#373)', () => {
    it('is 0 and GPS COURSE TO STEER 0 with KAAA, KAAA, where there is no DTK (#373)', async () => {
        const kaaa = airport('KAAA', 47.0, 8.0);
        const unit = await bootUnit({
            panelXml: HEADING_INPUT_XML, facilities: [kaaa], storage: savedFlightplan(0, [kaaa, kaaa]),
            position: pointFrom(kaaa, 270, 2),
        });
        await settle(unit);
        // A leftover path would have to be cleared by NavCalculator; the sentinel is the path of an earlier tick
        unit.props.memory.navPage.steeringPath = GeoCircle.createGreatCircle(new GeoPoint(0, 0), new GeoPoint(0, 1));

        await moveAircraft(unit, pointFrom(kaaa, 270, 2), {groundspeedKt: 120, trackTrue: 90});

        const nav = unit.props.memory.navPage;
        expect(nav.desiredTrack).toBeNull();
        expect(nav.xtkToActive).toBeNull();
        expect(nav.steeringPath).toBeNull();
        expect(unit.errors).toEqual([]); // a controller that reads the missing path fails with an exception, caught by the tick
        expect(unit.props.planeSettings.input.headingInput).toBe(true);
        expect(unit.env.sim.lastWrite('L:KLN90B_RollCommand')?.value).toBe(0);
        expect(unit.env.sim.lastWrite('GPS COURSE TO STEER')?.value).toBe(0);
    });
});

// #373: NavPageState.steeringPath is the path XTK is measured on (NavCalculator) and null where there is none. The
// sentinel is a path left by an earlier tick; each state below has to clear it.
describe('NavPageState.steeringPath (#373)', () => {
    const sentinel = () => GeoCircle.createGreatCircle(new GeoPoint(0, 0), new GeoPoint(0, 1));

    it('is the leg KAAA to ABC on the standard route, the path of its XTK (#373)', async () => {
        const {unit, kaaa, abc, mid} = await onRoute(HEADING_INPUT_XML);

        await moveAircraft(unit, pointFrom(mid, courseDeg(mid, abc) + 90, 2), {groundspeedKt: 120});

        const path = unit.props.memory.navPage.steeringPath!;
        expect(path).not.toBeNull();
        // Both ends lie on the path, and the aircraft is 2 NM off it
        expect(path.distance(new GeoPoint(kaaa.lat, kaaa.lon))).toBeLessThan(1e-6);
        expect(path.distance(new GeoPoint(abc.lat, abc.lon))).toBeLessThan(1e-6);
        expect(Math.abs(unit.props.memory.navPage.xtkToActive!)).toBeCloseTo(2, 1);
    });

    it('is null without a flight plan (#373)', async () => {
        const unit = await bootUnit({panelXml: HEADING_INPUT_XML});
        await settle(unit);
        unit.props.memory.navPage.steeringPath = sentinel();

        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.props.memory.navPage.steeringPath).toBeNull();
    });

    it('is null during the self-test, which has its own roll command (#373)', async () => {
        const {unit} = await onRoute(HEADING_INPUT_XML);
        unit.props.memory.navPage.steeringPath = sentinel();
        unit.props.memory.navPage.isSelfTestActive = true;

        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.props.memory.navPage.steeringPath).toBeNull();
    });
});

// #373: the controller steers on NavPageState.steeringPath and not on the path of the from leg (the roll steering design,
// docs/superpowers/specs/2026-10-19-roll-steering-design.md, section 5 item 2). NavCalculator rewrites the field every
// tick, so the test sets it and ticks a controller itself. The aircraft is 0.3 NM right of the leg flying at it at 200 kt,
// where the real path gives the -30 degree cap (case 4 of updateBankAngle, as in the test above). A path whose
// intersections with the aircraft's track lie more than 100 NM away leaves only the 45 degree intercept (case 2): 25
// degrees of bank and the course to steer 45 degrees from the DTK. Task 5 replaces the algorithm and may update the
// literals; what must stay is that the output follows the field.
describe('RollSteeringController steers on NavPageState.steeringPath (#373)', () => {
    it('banks 25 degrees on the 45 degree intercept when the path is out of reach, where the leg gives 30 (#373)', async () => {
        const {unit, mid, dtk} = await onRoute(HEADING_INPUT_XML);
        await moveAircraft(unit, pointFrom(mid, dtk + 90, 0.3), {groundspeedKt: 200, trackTrue: (dtk + 270) % 360});
        const nav = unit.props.memory.navPage;
        expect(roll(unit)).toBeCloseTo(-30, 6); // Precondition: the leg itself gives the cap
        nav.steeringPath = GeoCircle.createGreatCircle(new GeoPoint(0, 100), new GeoPoint(1, 100)); // a meridian 100 degrees east

        new RollSteeringController(unit.props.sensors, unit.props.memory, unit.props.planeSettings).tick();

        expect(roll(unit)).toBeCloseTo(-25, 6);
        // XTK is positive: the intercept course is 45 degrees left of the DTK
        const cts = (unit.env.sim.lastWrite('GPS COURSE TO STEER')!.value as number) * 180 / Math.PI;
        expect(Math.abs(angleDiff(cts, nav.desiredTrack! - 45))).toBeLessThan(0.01);
    });
});
