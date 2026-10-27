import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../harness/boot';
import {GeoCircle, GeoPoint, UnitType} from '@microsoft/msfs-sdk';
import {standardRoute} from '../../harness/fixtures';
import {HEADING_INPUT, NO_OBS, panelXml} from '../../harness/panelXml';
import {activeIdent} from '../../harness/readers';
import {RollSteeringController} from '../../../kln90b/services/RollSteeringController';
import {TurnStackEntry} from '../../../kln90b/data/flightplan/ActiveWaypoint';
import {bootOnStandardRoute} from '../../harness/worldBoot';
import {savedFlightplan} from '../../harness/storage';
import {airport, vor} from '../../harness/navdata/builders';
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

    // The wiki range is +-30; the command now peaks at MAX_BANK_ANGLE, 25 degrees (the roll steering design,
    // docs/superpowers/specs/2026-10-19-roll-steering-design.md, sections 4B and 8). 0.3 NM right of the course, flying
    // straight at the leg at 200 kt: L = 200 x 30 / 3600 = 1.67 NM, the intercept atan(0.3 / 1.67) = 10.2 degrees, so the
    // course to steer is DTK - 10.2 and lies 79.8 degrees right of the track (DTK - 90); 1.25 x 79.8 is more than 25
    it('is 25 degrees, the cap, when more is needed to join the leg', async () => {
        const {unit, mid, dtk} = await onRoute(HEADING_INPUT_XML);

        await moveAircraft(unit, pointFrom(mid, dtk + 90, 0.3), {groundspeedKt: 200, trackTrue: (dtk + 270) % 360});

        // Flying at the leg from its right with the course ahead and to the right: the turn onto it is a right bank, and
        // the cap is the value
        expect(roll(unit)).toBeCloseTo(-25, 6);
    });

    // The roll steering design, section 4B: 2 NM right at 120 kt, L = 1 NM and atan(2 / 1) = 63.4 degrees, so the 45
    // degree cap holds (from far off the intercept builds up to about 45 degrees and does not exceed it, checked in the
    // KLN 89 trainer, 2026-10-19, parallel starts). The course to steer is DTK - 45, and 1.25 x 45 is capped at 25
    it('is 25 degrees on a 45 degree intercept', async () => {
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

    // GPS COURSE TO STEER is not an output of the real unit (the code adds it). The maintainer held it at 0 in the sim
    // on 2026-10-19 and the default autopilot still tracked the flight plan perfectly, so the sim's autopilot does not
    // read it. Without a heading input it is 0 like the roll command, 2 NM off the leg too (the maintainer's decision,
    // 2026-10-19, reversing the #143 exemption)
    it('writes GPS COURSE TO STEER as 0 without a heading input (#143)', async () => {
        const {unit, mid, dtk} = await onRoute();

        await moveAircraft(unit, pointFrom(mid, dtk + 90, 2), {groundspeedKt: 120, trackTrue: dtk});

        expect(unit.env.sim.lastWrite('GPS COURSE TO STEER')!.value).toBe(0);
    });

    // Without a heading input the unit calculates no command, so it keeps no turn latch either (the roll steering design,
    // section 4B step 6): when an aircraft switches the input back on at runtime (L:KLN90B_HeadingInput, #368), the first
    // command starts fresh. 0.3 NM right of the leg with the leg behind, the track error is about 163 degrees, beyond the
    // latch angle, so with the input on the latch is set; switched off, it goes
    it('keeps no turn latch without a heading input (#143)', async () => {
        const {unit, mid, dtk} = await onRoute(HEADING_INPUT_XML);
        await moveAircraft(unit, pointFrom(mid, dtk + 90, 0.3), {groundspeedKt: 120, trackTrue: (dtk + 180) % 360});
        expect(unit.props.memory.navPage.rollSteeringLatch?.turn).toBe('right'); // Precondition: latched with the input on

        unit.env.sim.set('L:KLN90B_HeadingInput', 'bool', 0);
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.props.planeSettings.input.headingInput).toBe(false);
        expect(unit.props.memory.navPage.rollSteeringLatch).toBeNull();
    });
});

// #100 (its comment of 2026-10-05): far left of the leg on a track parallel to it, case 1 ("on track") of the old
// controller's updateBankAngle took any negative XTK, and its course to steer DTK - 50 x XTK passed 180 degrees off the
// DTK beyond about 3.6 NM, so the unit banked away from the leg. HeadingInput is on, because the unit gives roll
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
    it('banks right, toward the leg (#100)', async () => {
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
// where the leg gives the 25 degree cap to the right (as in the test above). The path set instead is the meridian 10 NM
// west of the aircraft, running north: the aircraft is 10 NM right of it, so the law steers 45 degrees left of 000
// (atan(10 / 1.67) is more than 45), and the bank is 1.25 x the angle from the track to 315, a left bank (section 4B).
describe('RollSteeringController steers on NavPageState.steeringPath (#373)', () => {
    it('steers 45 degrees left of a meridian 10 NM to the left, where the leg gives the right cap (#373)', async () => {
        const {unit, mid, dtk} = await onRoute(HEADING_INPUT_XML);
        const at = pointFrom(mid, dtk + 90, 0.3);
        const track = (dtk + 270) % 360;
        await moveAircraft(unit, at, {groundspeedKt: 200, trackTrue: track});
        const nav = unit.props.memory.navPage;
        expect(roll(unit)).toBeCloseTo(-25, 6); // Precondition: the leg itself gives the right cap
        const west = pointFrom(at, 270, 10);
        nav.steeringPath = GeoCircle.createGreatCircle(new GeoPoint(west.lat, west.lon), new GeoPoint(west.lat + 1, west.lon));

        new RollSteeringController(unit.props.sensors, unit.props.memory, unit.props.planeSettings).tick();

        const cts = (unit.env.sim.lastWrite('GPS COURSE TO STEER')!.value as number) * 180 / Math.PI;
        expect(Math.abs(angleDiff(cts, 315))).toBeLessThan(0.01);
        // The track is about 320.5, so 315 lies about 5.5 degrees to the left: a left bank of 1.25 x that
        expect(roll(unit)).toBeCloseTo(-1.25 * angleDiff(315, track), 1);
        expect(roll(unit)).toBeGreaterThan(0);
    });
});

// #403: in OBS mode NavCalculator sets NavPageState.desiredTrack to null and the XTK is measured to the OBS leg
// (NavPageState.steeringPath). The controller passed that null on as 0, so it steered on a DTK of 000 with the right XTK.
// The expected 45 degree intercept from far off was checked in the KLN 89 trainer, 2026-10-19 (OBS and Leg steering looked
// alike; the intercept builds up to about 45 degrees and does not exceed it, from parallel starts only). The course to
// steer is read from GPS COURSE TO STEER (Output.WriteGPSSimVars defaults to on, KLN90BPlaneSettings.ts), HeadingInput is
// on, and the OBS source is off so that OBS mode starts on the leg's course.

/** On the standard route 10 NM before ABC in OBS mode, then moved to the given side of the OBS course at 120 kt */
async function inObsMode(sideOffsetNm: number, trackOffsetDeg: number) {
    const {unit, mid} = await onRoute(panelXml({...HEADING_INPUT, ...NO_OBS}));
    await unit.panel.obsMode();
    const obsTrue = unit.props.modeController.getObsTrue();
    // sideOffsetNm is positive to the right of the course, trackOffsetDeg positive turns the track right of it
    await moveAircraft(unit, pointFrom(mid, obsTrue + 90, sideOffsetNm), {groundspeedKt: 120, trackTrue: (obsTrue + trackOffsetDeg + 360) % 360});
    await vi.advanceTimersByTimeAsync(1000);
    const cts = (unit.env.sim.lastWrite('GPS COURSE TO STEER')!.value as number) * 180 / Math.PI;
    return {unit, obsTrue, cts};
}

describe('L:KLN90B_RollCommand in OBS mode (#403)', () => {
    // The sibling: the setup works. OBS mode is active on the leg's course (about 051) and the desired track is null.
    it('the setup: OBS mode is active, the OBS course is that of the leg and the desired track is null', async () => {
        const {unit, obsTrue} = await inObsMode(2, 0);
        const nav = unit.props.memory.navPage;

        expect(unit.props.modeController.isObsModeActive()).toBe(true);
        expect(unit.props.planeSettings.input.headingInput).toBe(true);
        expect(obsTrue).toBeGreaterThan(50.5);
        expect(obsTrue).toBeLessThan(51.5);
        expect(nav.desiredTrack).toBeNull();
        expect(nav.xtkToActive).toBeCloseTo(2, 1);
        expect(unit.props.sensors.in.gps.groundspeed).toBeCloseTo(120, 6);
    });

    // Spec: the 45 degree intercept from a parallel start (trainer, 2026-10-19).
    it('banks left and steers 45 degrees left of the course from 2 NM right, parallel (#403)', async () => {
        const {unit, obsTrue, cts} = await inObsMode(2, 0);

        expect(roll(unit)).toBeGreaterThan(0);
        expect(Math.abs(angleDiff(cts, obsTrue) - -45)).toBeLessThan(0.5);
    });

    // The roll steering design, section 4B: 2 NM left at 120 kt, L = 1 NM and atan(2 / 1) is more than 45 degrees, so
    // the course to steer is the OBS course + 45; from a track of OBS + 30 that is 15 degrees to the right. The trainer
    // recorded the 45 degree cap from parallel starts only (2026-10-19)
    it('banks right and steers 45 degrees right of the course from 2 NM left, converging at 30 degrees (#403)', async () => {
        const {unit, obsTrue, cts} = await inObsMode(-2, 30);

        expect(roll(unit)).toBeLessThan(0);
        expect(Math.abs(angleDiff(cts, obsTrue) - 45)).toBeLessThan(0.5);
    });
});

// The trainer recorded parallel starts only, so the track that diverges by 30 degrees, from the left, is not a trainer
// fact: nothing but the old controller's case 2 says 45 degrees there (the track does not meet the leg ahead, so it
// intercepts at 45 degrees). The new law of the roll steering design keeps the value (L = 1 NM at 120 kt, atan(2) is more
// than 45 degrees, so its 45 degree cap holds from any track). The diverging track also avoids the #100 case 1 bug (a
// negative XTK with a track within 10 degrees of the DTK) that a parallel start from the left would hit; a converging 30
// degree start from the left gives the join (course to steer = DTK) in the old controller, whose far-away branch only
// takes a positive XTK.
describe('L:KLN90B_RollCommand in OBS mode, diverging from the left (characterization, #403)', () => {
    it('banks right and steers 45 degrees right of the course from 2 NM left, diverging at 30 degrees (characterization, #403)', async () => {
        const {unit, obsTrue, cts} = await inObsMode(-2, -30);

        expect(roll(unit)).toBeLessThan(0);
        expect(Math.abs(angleDiff(cts, obsTrue) - 45)).toBeLessThan(0.5);
    });
});

// The roll steering design, section 4B step 6: beyond 150 degrees of track error the turn direction is latched on
// NavPageState (RollSteeringLaw.TURN_LATCH_ANGLE). The latch belongs to the path it was chosen on and to the time the unit
// steers. The setup puts the aircraft 0.3 NM right of the leg KAAA - ABC flying it backward at 120 kt: L = 1 NM,
// atan(0.3) = 16.7, so the course to steer is DTK - 16.7, 163.3 degrees right of the track (DTK + 180): the shorter way is
// right, so the latch is right.
describe('the turn latch of L:KLN90B_RollCommand (#100)', () => {
    /** On the standard route with DTO 10 NM from the setup point, 160 degrees left of the reversed track */
    async function latchedRight() {
        const {kaaa, abc} = standardRoute();
        const mid = pointBefore(kaaa, abc, 10);
        const dtk = courseDeg(mid, abc);
        const at = pointFrom(mid, dtk + 90, 0.3);
        const track = (dtk + 180) % 360;
        const dtoAt = pointFrom(at, track - 160, 10);
        const unit = await bootOnStandardRoute({panelXml: HEADING_INPUT_XML, magvar: 0, facilities: [vor('DTO', dtoAt.lat, dtoAt.lon)]});
        await moveAircraft(unit, at, {groundspeedKt: 120, trackTrue: track});
        return {unit, nav: unit.props.memory.navPage, mid, dtk};
    }

    it('the setup: the latch is right and the bank is the right cap', async () => {
        const {unit, nav} = await latchedRight();

        expect(activeIdent(unit)).toBe('ABC');
        expect(nav.rollSteeringLatch?.turn).toBe('right');
        expect(roll(unit)).toBeCloseTo(-25, 6);
    });

    // On the same leg, 0.3 NM left of it with the track DTK + 190: the course to steer is DTK + 16.7, e = 16.7 - 190 =
    // -173.3, still beyond 150 but now the shorter way left. The latch of the same path holds the right turn, so the
    // command stays the right cap (the turn does not reverse while XTK changes sign). The calculation tick would see a
    // track from the jump between the two positions, so the GPS is set and one controller tick is run, as in the #373
    // test above
    it('holds the latched turn on the same path when the shorter way flips', async () => {
        const {unit, nav, mid, dtk} = await latchedRight();
        const gps = unit.props.sensors.in.gps;
        const left = pointFrom(mid, dtk - 90, 0.3);
        gps.coords = new GeoPoint(left.lat, left.lon);
        gps.trackTrue = (dtk + 190) % 360;

        new RollSteeringController(unit.props.sensors, unit.props.memory, unit.props.planeSettings).tick();

        expect(roll(unit)).toBeCloseTo(-25, 6);
        expect(nav.rollSteeringLatch?.turn).toBe('right');
    });

    // A Direct To from the present position to DTO, 160 degrees left of the track: the aircraft is on the new leg, the
    // course to steer is the leg's course and the shorter way is left, and |e| = 160 is beyond the latch angle, so a latch
    // kept from the old leg would turn right. The from leg's path is one object that ActiveWaypoint rewrites for every
    // leg, so the latch must compare the geometry, not the object
    it('a Direct To clears the turn latch of the old path', async () => {
        const {unit, nav} = await latchedRight();

        await unit.panel.directTo('DTO');

        expect(activeIdent(unit)).toBe('DTO');
        expect(roll(unit)).toBeCloseTo(25, 6);
        expect(nav.rollSteeringLatch?.turn).toBe('left');
    });

    it('is 0 below 5 kt and clears the latch', async () => {
        const {unit, nav} = await latchedRight();

        unit.env.sim.set('GROUND VELOCITY', 'knots', 4);
        await vi.advanceTimersByTimeAsync(1000);

        // 2-70: roll steering needs a ground speed
        expect(unit.env.sim.lastWrite('L:KLN90B_RollCommand')?.value).toBe(0);
        // The design, section 4B step 6: without a command the latch is cleared
        expect(nav.rollSteeringLatch).toBeNull();
    });

    it('a power cycle clears the turn latch', async () => {
        const {unit, nav} = await latchedRight();

        await unit.panel.powerCycle();

        expect(nav.rollSteeringLatch).toBeNull();
    });
});

// The roll steering design, sections 4A and 4B (amended 2026-10-19): the rule that never banks against an anticipated
// turn applies on the turn circle only. In the next-leg fallback (TurnStackEntry.steerOnPathForDtk) the steering path is
// the next leg, a great circle, and the law must bank either way on it. NavCalculator rebuilds the stack and the path
// every tick, so the test sets them and ticks a controller itself, as in the #373 test above. The aircraft is 2 NM left
// of the leg, parallel to it, at 120 kt: atan(2 / 1) is capped at 45, the course to steer is DTK + 45 and the bank the
// right cap, -25 (section 4B). A great circle reads as a left turn to FlightPathUtils, so applying the rule there would
// hold that right bank at 0.
describe('the next-leg fallback of an anticipated turn (the roll steering design, sections 4A and 4B, amended)', () => {
    it('banks right toward the next leg, which is no turn circle', async () => {
        const {unit, mid, dtk} = await onRoute(HEADING_INPUT_XML);
        await moveAircraft(unit, pointFrom(mid, dtk - 90, 2), {groundspeedKt: 120, trackTrue: dtk});
        const nav = unit.props.memory.navPage;
        expect(roll(unit)).toBeCloseTo(-25, 6); // Precondition: the leg itself gives the right cap
        const leg = nav.steeringPath!;
        // A left turn circle of 1 NM radius around ABC, with the leg as its next path, in the fallback
        const abc = standardRoute().abc;
        const entry = new TurnStackEntry(GeoCircle.createFromPoint(new GeoPoint(abc.lat, abc.lon), UnitType.NMILE.convertTo(1, UnitType.GA_RADIAN)),
            new GeoPoint(abc.lat, abc.lon), leg);
        entry.steerOnPathForDtk = true;
        nav.activeWaypoint.turnStack.push(entry);

        new RollSteeringController(unit.props.sensors, unit.props.memory, unit.props.planeSettings).tick();

        expect(roll(unit)).toBeCloseTo(-25, 6);
    });

    // #406: after an abeam turn its run-out stays on the stack until the aircraft is past the waypoint's abeam line on
    // the new leg. Its path is the new leg, a great circle, and it is no turn circle either, although it lies at the
    // bottom of the stack. The same setup as the previous test, with the run-out of a left abeam turn at ABC instead
    it('banks right toward the leg during the run-out of an abeam turn, which is no turn circle', async () => {
        const {unit, mid, dtk} = await onRoute(HEADING_INPUT_XML);
        await moveAircraft(unit, pointFrom(mid, dtk - 90, 2), {groundspeedKt: 120, trackTrue: dtk});
        const nav = unit.props.memory.navPage;
        expect(roll(unit)).toBeCloseTo(-25, 6); // Precondition: the leg itself gives the right cap
        const leg = nav.steeringPath!;
        const runOut = TurnStackEntry.runOut(TurnStackEntry.abeamTurn(standardRoute().abc, leg, 'left'));
        expect(runOut.path).toBe(leg); // Precondition: the run-out's path is the path steered on
        nav.activeWaypoint.turnStack.push(runOut);

        new RollSteeringController(unit.props.sensors, unit.props.memory, unit.props.planeSettings).tick();

        expect(roll(unit)).toBeCloseTo(-25, 6);
    });
});
