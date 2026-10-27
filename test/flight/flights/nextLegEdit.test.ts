import {describe, expect, it} from 'vitest';
import {Facility} from '@microsoft/msfs-sdk';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {airport, vor} from '../../harness/navdata/builders';
import {savedFlightplan} from '../../harness/storage';
import {angleBetween, courseDeg, crossTrackNm, distanceNm, LatLon, pointFrom} from '../../harness/flight/geo';
import {turnStackLength} from '../../harness/readers';
import {deleteLeg, insertLeg} from '../../harness/flightplan';
import {Pilot} from '../../harness/flight/pilots';
import {TurnPlan} from '../../../kln90b/data/flightplan/ActiveWaypoint';

const DEG = Math.PI / 180;

const GS = 120;
/** The standard-rate bank atan(GS / 362.1) limited to 25°, the bank the turn and the roll-in are calculated for */
const bankDeg = (gs: number) => Math.min(Math.atan(gs / 362.1) / DEG, 25);
/** The roll-in the sim adds to the lead: the bank reached at 5°/s, flown at the ground speed. 0.122 NM at 120 kt */
const rollInNm = (gs: number) => bankDeg(gs) / 5 * gs / 3600;
/**
 * The uncapped lead r·tan(θ/2), with r = V² / (11.26 · tan(bank)) ft (V in knots, the pilot's formula): r is 0.635 NM at
 * 120 kt. None of the turns here reaches the caps of 60 s of ground speed or half the inbound leg
 */
const leadNm = (gs: number, turnDeg: number) => gs ** 2 / (11.26 * Math.tan(bankDeg(gs) * DEG)) / 6076.12 * Math.tan(turnDeg / 2 * DEG);
/** The turn point: the along-track distance before the waypoint at which the turn of the turn plan starts */
const turnPoint = (turnDeg: number) => leadNm(GS, turnDeg) + rollInNm(GS);
/** The decision point: 20 s of ground speed before the turn point, where the alert of the turn plan starts (4-8) */
const decisionPoint = (turnDeg: number) => turnPoint(turnDeg) + GS * 20 / 3600;
/** One calculation tick (1 s) of flight */
const TICK_NM = GS / 3600;
/** The along-track distance measured at the GPS position the last calculation used: the planar measure's tolerance */
const GPS_TOLERANCE_NM = 0.005;

const TP_90 = turnPoint(90);
const TP_30 = turnPoint(30);

const ABC_POS: LatLon = {lat: 47.5, lon: 8.9};

/** The distance before ABC along the inbound course 090, measured in the plane (negative past ABC) */
const alongBefore = (pos: LatLon) => -distanceNm(ABC_POS, pos) * Math.cos((courseDeg(ABC_POS, pos) - 90) * DEG);
/** alongBefore at the GPS position the unit's last calculation used */
const gpsAlongBefore = (flight: Flight) => alongBefore(flight.unit.props.sensors.in.gps.coords);

/**
 * The world of bisectorSequencing.test.ts: KAAA 28 NM west of ABC, so the leg arrives at ABC on 090, and KBBB 15 NM from
 * ABC on `kbbbCourse` (000 by default, a 90° left turn), KCCC 15 NM from KBBB on 090, so that ABC to KCCC is about 045.
 * Two spare waypoints for the edits: SPR 15 NM from ABC on 120 (a 30° right turn instead, whose turn point is closer to
 * ABC) and SPB 15 NM from ABC on 210 (a 120° right turn instead, whose lead is longer). FPL 0 is KAAA ABC KBBB, with KCCC
 * at its end when `withKccc`. The aircraft starts at `start` (12 NM before ABC on the inbound course by default) on
 * `trackTrue`, flown by `pilot` (the coupled autopilot if not given)
 */
async function boot(o: { withKccc?: boolean; kbbbCourse?: number; start?: LatLon; trackTrue?: number; pilot?: Pilot } = {}) {
    const abc = vor('ABC', ABC_POS.lat, ABC_POS.lon);
    const a0 = pointFrom(ABC_POS, 270, 28);
    const kaaa = airport('KAAA', a0.lat, a0.lon);
    const b0 = pointFrom(ABC_POS, o.kbbbCourse ?? 0, 15);
    const kbbb = airport('KBBB', b0.lat, b0.lon);
    const c0 = pointFrom(b0, 90, 15);
    const kccc = airport('KCCC', c0.lat, c0.lon);
    const r0 = pointFrom(ABC_POS, 120, 15);
    const spr = airport('SPR', r0.lat, r0.lon);
    const s0 = pointFrom(ABC_POS, 210, 15);
    const spb = airport('SPB', s0.lat, s0.lon);
    const world = new World({magvar: 0}).add(kaaa, abc, kbbb, kccc, spr, spb);
    const plan: Facility[] = o.withKccc === false ? [kaaa, abc, kbbb] : [kaaa, abc, kbbb, kccc];
    const start = o.start ?? pointFrom(ABC_POS, 270, 12);
    const flight = await Flight.start({
        world, storage: savedFlightplan(0, plan), pilot: o.pilot,
        aircraft: {lat: start.lat, lon: start.lon, altitudeFt: 3000, groundspeedKt: GS, trackTrue: o.trackTrue ?? 90},
    });
    await flight.flyUntil(() => flight.nav.activeIdent !== null, {timeout: 30, description: 'a waypoint active'});
    expect(flight.nav.activeIdent).toBe('ABC');
    return {flight, aw: flight.unit.props.memory.navPage.activeWaypoint, kccc, spr, spb};
}

/** Flies until the turn at ABC has started (it is on the turn stack), then `seconds` more */
async function flyIntoTurn(flight: Flight, seconds: number): Promise<void> {
    await flight.flyUntil(() => turnStackLength(flight.unit) > 0 || flight.nav.activeIdent !== 'ABC', {timeout: 600, description: 'the turn start at ABC'});
    expect(flight.nav.activeIdent).toBe('ABC');
    await flight.fly(seconds);
}

/**
 * Flies until the next turn at ABC starts and expects it at the turn point `tp`: within the tick ahead, measured at the
 * aircraft's position, with the tolerance of offCourseSequencing.test.ts
 */
async function expectTurnStartAt(flight: Flight, tp: number): Promise<void> {
    await flight.flyUntil(() => turnStackLength(flight.unit) > 0 || flight.nav.activeIdent !== 'ABC', {timeout: 120, description: 'the new turn start at ABC'});
    expect(flight.nav.activeIdent).toBe('ABC');
    const startAlong = alongBefore(flight.aircraft);
    expect(startAlong).toBeGreaterThanOrEqual(tp);
    expect(startAlong).toBeLessThanOrEqual(tp + TICK_NM + 0.02);
}

// #408: when the leg after the active waypoint changes while the active leg stays the same, the unit computes the turn
// again for the new geometry (checked in the KLN 89 trainer, 2026-10-27, docs/kln89-trainer-record.md and
// docs/kln89-trainer-data/2026-10-27/report.md, sections 4 to 8). The rule is the maintainer's rule (c) of the design,
// docs/superpowers/specs/2026-10-27-sequencing-406-407-408-design.md, section 2.3: a started turn of the waypoint's own
// is dropped, a plan to turn at the lead is decided again, a plan to turn at the abeam line is kept, and an edit further
// down the plan changes nothing
describe('an edit of the leg after the active waypoint (#408)', () => {
    it('derives the turn points of the turns at 120 kt', () => {
        // r 0.635 NM and the roll-in 0.122 NM, so that a wrong derivation above cannot move both sides
        expect(leadNm(GS, 90)).toBeCloseTo(0.635, 3);
        expect(rollInNm(GS)).toBeCloseTo(0.122, 3);
        expect(TP_90).toBeCloseTo(0.757, 3);
        expect(TP_30).toBeCloseTo(0.292, 3);
        expect(turnPoint(120)).toBeCloseTo(1.222, 3);
        expect(decisionPoint(30)).toBeCloseTo(0.959, 3);
    });

    it('starts the turn at the new lead when the next leg is changed before the turn (KLN 89 trainer, 2026-10-27, a3, a4)', async () => {
        const {flight, aw, spr} = await boot();
        await flight.flyUntil(() => alongBefore(flight.aircraft) <= 1.3, {timeout: 600, description: '1.3 NM before ABC'});
        // Preconditions: the alert of the 90° turn is on (its decision point is 1.42 NM before ABC), no turn has started
        expect(flight.nav.waypointAlert).toBe(true);
        expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);
        expect(turnStackLength(flight.unit)).toBe(0);

        insertLeg(flight.unit, 2, spr);
        await flight.fly(1);
        // The new turn point is about 1.0 NM away, 30 s at 120 kt: more than the 20 s of the alert, which pauses (a3, a4)
        expect(flight.nav.activeIdent).toBe('ABC');
        expect(flight.nav.waypointAlert).toBe(false);
        expect(turnStackLength(flight.unit)).toBe(0);

        // It comes back at the new decision point, within the calculation tick after it, measured at the GPS position
        await flight.flyUntil(() => flight.nav.waypointAlert || turnStackLength(flight.unit) > 0, {timeout: 60, description: 'the alert at ABC again'});
        expect(turnStackLength(flight.unit)).toBe(0);
        const alertAlong = gpsAlongBefore(flight);
        expect(alertAlong).toBeGreaterThanOrEqual(decisionPoint(30) - TICK_NM - GPS_TOLERANCE_NM);
        expect(alertAlong).toBeLessThanOrEqual(decisionPoint(30) + GPS_TOLERANCE_NM);

        // The old lead does nothing: the turn starts at the 30° turn point, not at the 90° one
        await expectTurnStartAt(flight, TP_30);
        expect(angleBetween(flight.nav.dtkTrue, 120)).toBeLessThan(1);
    });

    it('drops a started turn and starts the new one when the next leg is changed in the turn (KLN 89 trainer, 2026-10-27, a2, a5)', async () => {
        const {flight, aw, spr} = await boot();
        await flyIntoTurn(flight, 2);
        // Preconditions: 2 s into the 90° turn, still outside SPR's turn point
        expect(aw.ownTurnStarted).toBe(true);
        expect(alongBefore(flight.aircraft)).toBeGreaterThan(TP_30 + 2 * TICK_NM);
        expect(angleBetween(flight.nav.dtkTrue, 0)).toBeLessThan(1);

        insertLeg(flight.unit, 2, spr);
        await flight.fly(1);
        // The DTK goes back to the inbound course (a2: in the first display frame after the edit)
        expect(angleBetween(flight.nav.dtkTrue, 90)).toBeLessThan(1);
        expect(aw.ownTurnStarted).toBe(false);
        expect(turnStackLength(flight.unit)).toBe(0);

        await expectTurnStartAt(flight, TP_30);

        // ABC is sequenced at the bisector of the new turn, the line through ABC on 015/195 halfway between 090 and 120
        // (a2: at the new turn's bisector, not the old one's). The middle of a 30° turn lies 0.02 NM from ABC, so the
        // bearing from ABC says little there; the calculation that sequences is the first past that line, so its GPS
        // position is at most a tick of flight past it, the aircraft crossing it at about a right angle
        await flight.flyUntil(() => flight.nav.activeIdent !== 'ABC', {timeout: 60, description: 'ABC sequenced'});
        expect(flight.nav.activeIdent).toBe('SPR');
        const past = crossTrackNm(flight.unit.props.sensors.in.gps.coords, ABC_POS, 15);
        expect(past).toBeGreaterThanOrEqual(-GPS_TOLERANCE_NM);
        expect(past).toBeLessThanOrEqual(TICK_NM + GPS_TOLERANCE_NM);
    });

    it('deletes the next waypoint in the turn: the leg after it becomes the next leg (KLN 89 trainer, 2026-10-27, a5)', async () => {
        const {flight, aw, kccc} = await boot();
        const nextCourse = courseDeg(ABC_POS, kccc);
        const turn = angleBetween(nextCourse, 90);
        expect(Math.abs(turn - 45)).toBeLessThan(2); // Precondition: about a 45° left turn to KCCC
        await flyIntoTurn(flight, 2);
        expect(aw.ownTurnStarted).toBe(true);
        expect(alongBefore(flight.aircraft)).toBeGreaterThan(turnPoint(turn) + 2 * TICK_NM);

        deleteLeg(flight.unit, 2);
        await flight.fly(1);
        expect(angleBetween(flight.nav.dtkTrue, 90)).toBeLessThan(1);
        expect(turnStackLength(flight.unit)).toBe(0);

        await expectTurnStartAt(flight, turnPoint(turn));
        expect(angleBetween(flight.nav.dtkTrue, nextCourse)).toBeLessThan(1);
        await flight.flyUntil(() => flight.nav.activeIdent !== 'ABC', {timeout: 60, description: 'ABC sequenced'});
        expect(flight.nav.activeIdent).toBe('KCCC');
    });

    it('cancels the turn when the active waypoint becomes the last one (KLN 89 trainer, 2026-10-27, a9)', async () => {
        const {flight, aw} = await boot({withKccc: false});
        await flyIntoTurn(flight, 2);
        expect(aw.ownTurnStarted).toBe(true);

        deleteLeg(flight.unit, 2);
        await flight.fly(1);
        expect(turnStackLength(flight.unit)).toBe(0);
        expect(angleBetween(flight.nav.dtkTrue, 90)).toBeLessThan(1);
        // ABC is about 0.69 NM away, 21 s: the alert of a waypoint without a turn starts 15 s before it (#372)
        expect(flight.nav.waypointAlert).toBe(false);

        // The alert of a waypoint without a turn, 15 s of ground speed before ABC: 0.5 NM, measured at the GPS position
        await flight.flyUntil(() => flight.nav.waypointAlert || flight.nav.activeIdent !== 'ABC', {timeout: 60, description: 'the alert at ABC'});
        expect(flight.nav.activeIdent).toBe('ABC');
        const alertDist = distanceNm(flight.unit.props.sensors.in.gps.coords, ABC_POS);
        expect(alertDist).toBeGreaterThanOrEqual(15 * TICK_NM - TICK_NM - GPS_TOLERANCE_NM);
        expect(alertDist).toBeLessThanOrEqual(15 * TICK_NM + GPS_TOLERANCE_NM);
        expect(turnStackLength(flight.unit)).toBe(0);

        // No sequencing: past ABC it stays the active waypoint, and the alert ends there (a9: ending abeam of it)
        await flight.flyUntil(() => alongBefore(flight.aircraft) < -0.5, {timeout: 60, description: 'past ABC'});
        expect(flight.nav.activeIdent).toBe('ABC');
        expect(flight.nav.toFrom).toBe('FROM');
        expect(flight.nav.waypointAlert).toBe(false);
    });

    // The design, Review Focus 5: the following leg is the same instance, so no turn state changes
    it('keeps the turn when a leg further down is changed (KLN 89 trainer, 2026-10-27, a7)', async () => {
        const {flight, aw} = await boot();
        await flyIntoTurn(flight, 0);
        // On the turn circle, past the roll-in, and 2 s into it: the circle lasts about 30 s, so nothing of it ends in
        // the calculations below
        await flight.flyUntil(() => turnStackLength(flight.unit) === 1, {timeout: 10, description: 'the roll-in ended'});
        await flight.fly(2);
        expect(flight.nav.activeIdent).toBe('ABC');
        expect(aw.ownTurnStarted).toBe(true);
        const entries = [...aw.turnStack];

        deleteLeg(flight.unit, 3);
        await flight.fly(1);
        expect(turnStackLength(flight.unit)).toBe(entries.length);
        entries.forEach((entry, i) => expect(aw.turnStack[i]).toBe(entry));
        expect(aw.ownTurnStarted).toBe(true);
        expect(angleBetween(flight.nav.dtkTrue, 0)).toBeLessThan(1);
        expect(flight.nav.activeIdent).toBe('ABC');
    });

    // The ruling on the brief: the original next leg and the inserted one both turn right (KBBB on 150, a 60° turn, SPB
    // on 210, a 120° turn), and the aircraft passes ABC north of the inbound leg, outside both turns, as in a8 (132° right,
    // then 150° right). It converges at 80° to the leg, 3.5 NM north of it at the decision point of the 60° turn (1.16 NM
    // before ABC), above the 2.8 NM of the turn plan: the abeam plan. At 0.8 NM before ABC it turns onto the inbound course
    // about 1.5 NM north of the leg, and SPB is inserted there: inside SPB's turn point (1.22 NM) and below the 2.8 NM, so
    // that a plan decided again at the edit would turn at once (a8: 1.7 NM off, al 0.70)
    it('keeps the abeam plan when the next leg is changed (KLN 89 trainer, 2026-10-27, a8, a16)', async () => {
        const {flight, aw, spb, spr} = await bootAbeamPass();

        await flight.flyUntil(() => alongBefore(flight.aircraft) <= ABEAM_TURN_AT - 0.02, {timeout: 120, description: '0.8 NM before ABC'});
        const xtkNorth = -crossTrackNm(flight.aircraft, ABC_POS, 90);
        expect(xtkNorth, 'north of the leg, below 1.7 NM at the edit').toBeLessThan(1.7);
        expect(xtkNorth).toBeGreaterThan(0.5);
        expect(alongBefore(flight.aircraft)).toBeLessThan(turnPoint(120));
        expect(turnStackLength(flight.unit)).toBe(0);

        insertLeg(flight.unit, 2, spb);
        await flight.fly(1);
        expect(aw.turnPlan).toBe(TurnPlan.AT_ABEAM);

        // No turn on the stack until the abeam line; it starts within one calculation of it
        await flight.flyUntil(() => turnStackLength(flight.unit) > 0 || flight.nav.activeIdent !== 'ABC', {timeout: 120, description: 'the turn start at ABC'});
        expect(flight.nav.activeIdent).toBe('ABC');
        const abeamAlong = alongBefore(flight.aircraft);
        expect(abeamAlong).toBeGreaterThanOrEqual(-0.07);
        expect(abeamAlong).toBeLessThanOrEqual(0.02);
        expect(angleBetween(flight.nav.dtkTrue, 210)).toBeLessThan(1);

        // Sequenced at the bisector of the 090 to 210 turn, the line on 060/240, here on its outside ray 060 (a8: at the
        // bisector of the new turn)
        await flight.flyUntil(() => flight.nav.activeIdent !== 'ABC', {timeout: 120, description: 'ABC sequenced'});
        expect(flight.nav.activeIdent).toBe('SPB');
        expect(angleBetween(courseDeg(ABC_POS, flight.aircraft), 60)).toBeLessThan(3);

        // The abeam turn became the run-out of ABC on the leg to SPB (#406), a leftover of the previous waypoint and not
        // SPB's own turn: an edit of the leg after SPB keeps it, and the alert with it (the design, section 2.3; the
        // design's call, not flown in the trainer). This pilot flies on along 090, away from the abeam line of ABC on
        // that leg, so the run-out lasts until the aircraft is 4.0 NM from the leg, more than a minute
        expect(turnStackLength(flight.unit)).toBe(1);
        const runOut = aw.turnStack[0];
        expect(runOut.isRunOut).toBe(true);
        insertLeg(flight.unit, 3, spr);
        await flight.fly(1);
        expect(flight.nav.activeIdent).toBe('SPB');
        expect(turnStackLength(flight.unit)).toBe(1);
        expect(aw.turnStack[0]).toBe(runOut);
        expect(flight.nav.waypointAlert).toBe(true);
    });

    // The design, section 2.3: an abeam turn that had already started is the waypoint's own turn and is dropped with it.
    // It starts again in the same calculation onto the new next leg, because the plan is still the abeam plan and the
    // aircraft is past the abeam line (the design's call; a8 and a16 edited before the abeam line). The pass of the test
    // above without the early edit: SPB is inserted 2 s past the abeam line, before the aircraft (about 1.1 NM north of
    // the leg, on 090) reaches the bisector of the 60° turn, the ray 030 about 0.6 NM past the abeam line
    it("starts an abeam turn that had started again onto the new next leg (the design's call, not flown in the trainer)", async () => {
        const {flight, aw, spb} = await bootAbeamPass();
        await flight.flyUntil(() => turnStackLength(flight.unit) > 0 || flight.nav.activeIdent !== 'ABC', {timeout: 300, description: 'the abeam turn at ABC'});
        expect(flight.nav.activeIdent).toBe('ABC');
        expect(Math.abs(alongBefore(flight.aircraft))).toBeLessThan(0.07); // Precondition: at the abeam line
        await flight.fly(2);
        // Preconditions: the abeam turn onto the leg to KBBB, on the inbound side of the 030/210 bisector
        expect(flight.nav.activeIdent).toBe('ABC');
        expect(turnStackLength(flight.unit)).toBe(1);
        const oldAbeam = aw.turnStack[0];
        expect(oldAbeam.abeamTurnSign).not.toBeNull();
        expect(angleBetween(flight.nav.dtkTrue, 150)).toBeLessThan(1);
        expect(crossTrackNm(flight.aircraft, ABC_POS, 30)).toBeLessThan(-0.2);

        insertLeg(flight.unit, 2, spb);
        await flight.fly(1);
        expect(flight.nav.activeIdent).toBe('ABC');
        expect(aw.turnPlan).toBe(TurnPlan.AT_ABEAM);
        expect(turnStackLength(flight.unit)).toBe(1);
        expect(aw.turnStack[0]).not.toBe(oldAbeam);
        expect(aw.turnStack[0].abeamTurnSign).toBe(-1); // FLY R: the turn of no size goes right, onto 210
        expect(angleBetween(flight.nav.dtkTrue, 210)).toBeLessThan(1);
        // XTK of the abeam turn: the distance to ABC, with the sign of the right turn
        expect(Math.abs(flight.nav.xtkNm! + distanceNm(flight.aircraft, ABC_POS))).toBeLessThan(0.05);

        // Sequenced on the outside ray 060 of the 090 to 210 bisector, and the run-out is the one onto the leg to SPB:
        // its DTK is 210
        await flight.flyUntil(() => flight.nav.activeIdent !== 'ABC', {timeout: 120, description: 'ABC sequenced'});
        expect(flight.nav.activeIdent).toBe('SPB');
        expect(angleBetween(courseDeg(ABC_POS, flight.aircraft), 60)).toBeLessThan(3);
        expect(turnStackLength(flight.unit)).toBe(1);
        expect(aw.turnStack[0].isRunOut).toBe(true);
        expect(angleBetween(flight.nav.dtkTrue, 210)).toBeLessThan(1);
    });

    // The design, Review Focus 4: a Direct To to a waypoint of FPL 0 takes the same rule as the FPL 0 leg
    it('applies the same rule to a Direct To to an FPL 0 waypoint (the design\'s call, not flown in the trainer)', async () => {
        const {flight, aw, spr} = await boot();
        await flight.flyUntil(() => alongBefore(flight.aircraft) <= 3, {timeout: 600, description: '3 NM before ABC'});
        await flight.panel.directTo('ABC');
        expect(aw.isDctNavigation()).toBe(true); // Preconditions: a Direct To, and ABC is the plan's ABC
        expect(aw.getActiveFplIdx()).toBe(1);
        // From the inbound course, so the Direct To course is the inbound course too
        expect(angleBetween(flight.nav.dtkTrue, 90)).toBeLessThan(1);

        await flyIntoTurn(flight, 2);
        expect(aw.ownTurnStarted).toBe(true);
        expect(angleBetween(flight.nav.dtkTrue, 0)).toBeLessThan(1);

        insertLeg(flight.unit, 2, spr);
        await flight.fly(1);
        expect(angleBetween(flight.nav.dtkTrue, 90)).toBeLessThan(1);
        expect(aw.ownTurnStarted).toBe(false);
        expect(turnStackLength(flight.unit)).toBe(0);
        expect(aw.isDctNavigation()).toBe(true);

        await expectTurnStartAt(flight, TP_30);
    });
});

/** Where the abeam pass turns from its converging course onto the inbound course, before ABC */
const ABEAM_TURN_AT = 0.8;

/**
 * The abeam pass of the ruling on the brief: FPL 0 is KAAA ABC KBBB with KBBB on 150 from ABC (a 60° right turn). The
 * aircraft converges on 170, 80° to the leg, on the line that is 3.5 NM north of it at the decision point of that turn
 * (1.16 NM before ABC), 12 NM north of the leg at the start, and turns onto the inbound course 090 at ABEAM_TURN_AT. It
 * returns once the abeam plan is decided, with the cross track there checked
 */
async function bootAbeamPass() {
    const course = 170;
    const dp = decisionPoint(60);
    const startNorth = 12;
    const startAlong = dp + (startNorth - 3.5) * Math.tan(10 * DEG);
    const start = pointFrom(pointFrom(ABC_POS, 270, startAlong), 0, startNorth);
    const booted = await boot({withKccc: false, kbbbCourse: 150, start, trackTrue: course, pilot: trackPilot(ABEAM_TURN_AT, course, 90)});
    const {flight, aw} = booted;
    await flight.flyUntil(() => alongBefore(flight.aircraft) <= dp, {timeout: 600, description: 'the decision point of ABC'});
    await flight.fly(1);
    expect(Math.abs(crossTrackNm(flight.aircraft, ABC_POS, 90) + 3.5), 'about 3.5 NM north at the decision').toBeLessThan(0.15);
    expect(aw.turnPlan).toBe(TurnPlan.AT_ABEAM);
    return booted;
}

/**
 * Flies the true course `first` until the aircraft is `turnAtAlongNm` before ABC, then `second`, banking at most 25°
 * (the trackPilot of offCourseSequencing.test.ts)
 */
function trackPilot(turnAtAlongNm: number, first: number, second: number): Pilot {
    return {
        commandedBank: ({aircraft}) => bankToward(aircraft.trackTrue, alongBefore(aircraft) > turnAtAlongNm ? first : second),
    };
}

/** The bank of trackPilot toward the true course `target`: 3° per degree of track error, at most 25° */
function bankToward(trackTrue: number, target: number): number {
    const diff = ((target - trackTrue + 540) % 360) - 180;
    return Math.max(-25, Math.min(25, 3 * diff));
}
