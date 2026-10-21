import {describe, expect, it} from 'vitest';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {airport, vor} from '../../harness/navdata/builders';
import {savedFlightplan} from '../../harness/storage';
import {angleBetween, courseDeg, crossTrackNm, distanceNm, LatLon, pointFrom} from '../../harness/flight/geo';
import {turnStackLength} from '../../harness/readers';
import {ManualPilot, Pilot, scriptedPath} from '../../harness/flight/pilots';
import {TurnPlan} from '../../../kln90b/data/flightplan/ActiveWaypoint';

const DEG = Math.PI / 180;

const GS = 239;
/** The inbound course at WWW and the course of the next leg, a 120° left turn */
const INBOUND = 65;
const NEXT = 305;

/**
 * The standard-rate bank atan(GS / 362.1) limited to 25°, the bank the turn and the roll-in are calculated for: 25° at
 * 239 kt
 */
const bankDeg = (gs: number) => Math.min(Math.atan(gs / 362.1) / DEG, 25);
/** The roll-in the sim adds to the lead: the bank reached at 5°/s, flown at the ground speed. 0.332 NM at 239 kt */
const rollInNm = (gs: number) => bankDeg(gs) / 5 * gs / 3600;
/**
 * The uncapped lead r·tan(θ/2), with r = V² / (11.26 · tan(bank)) ft (V in knots, the pilot's formula): 1.79 NM at 239 kt,
 * so 3.10 NM for 120°
 */
const leadNm = (gs: number, turnDeg: number) => gs ** 2 / (11.26 * Math.tan(bankDeg(gs) * DEG)) / 6076.12 * Math.tan(turnDeg / 2 * DEG);

/** The turn point: the along-track distance before WWW at which the turn of the turn plan starts */
const TP = leadNm(GS, 120) + rollInNm(GS);
/** The decision point: 20 s of ground speed before the turn point */
const DP = TP + GS * 20 / 3600;
/** One calculation tick (1 s) of flight */
const TICK_NM = GS / 3600;
/** The aircraft's position against the GPS position the calculation used */
const POSITION_TOLERANCE_NM = 0.02;
/**
 * The along-track distance measured at the GPS position the last calculation used, which the sensors read first in each
 * calculation tick and keep until the next: its tolerance is that of the planar measure only
 */
const GPS_TOLERANCE_NM = 0.003;

const W_POS: LatLon = {lat: 47.5, lon: 8.9};

/**
 * The point `alongBeforeNm` before WWW along the inbound leg (negative past it) and `xtkRightNm` to the right of the leg
 * (negative to the left, the inside of the turn)
 */
function at(alongBeforeNm: number, xtkRightNm: number): LatLon {
    const onLeg = alongBeforeNm >= 0 ? pointFrom(W_POS, INBOUND + 180, alongBeforeNm) : pointFrom(W_POS, INBOUND, -alongBeforeNm);
    return xtkRightNm === 0 ? onLeg : pointFrom(onLeg, xtkRightNm > 0 ? INBOUND + 90 : INBOUND - 90, Math.abs(xtkRightNm));
}

/** The distance before WWW along the inbound course, measured in the plane (negative past WWW) */
const alongBefore = (pos: LatLon) => -distanceNm(W_POS, pos) * Math.cos((courseDeg(W_POS, pos) - INBOUND) * DEG);
/** alongBefore at the GPS position the unit's last calculation used */
const gpsAlongBefore = (flight: Flight) => alongBefore(flight.unit.props.sensors.in.gps.coords);
/** The cross track to the inbound leg, positive right of it (the outside of the turn) */
const xtkRight = (pos: LatLon) => crossTrackNm(pos, W_POS, INBOUND);
/**
 * Past the bisector of the turn at WWW: the line through WWW on 275/095 (m ± 90 with m = 065 - 120 / 2 = 005). The
 * inbound leg lies on its left seen along 275, the next leg on its right
 */
const pastBisector = (pos: LatLon) => crossTrackNm(pos, W_POS, 275) > 0;

/**
 * Flies the true course `first` until the aircraft is `turnAtAlongNm` before WWW, then `second`, banking at most 25°. It
 * holds a course more tightly than scriptedPath, whose roll-out onto a new course takes about a minute
 */
function trackPilot(turnAtAlongNm: number, first: number, second: number): Pilot {
    return {
        commandedBank: ({aircraft}) => {
            const target = alongBefore(aircraft) > turnAtAlongNm ? first : second;
            const diff = ((target - aircraft.trackTrue + 540) % 360) - 180;
            return Math.max(-25, Math.min(25, 3 * diff));
        },
    };
}

/**
 * KAAA - WWW - KBBB - KCCC: the 30 NM inbound leg arrives at WWW on 065, the leg to KBBB leaves on `next` (305 by
 * default, a 120° left turn), and KBBB has a turn of its own onto KCCC, so that its turn anticipation reads the turn plan
 * too. The aircraft starts at `path[0]` at 239 kt toward `path[1]`. `pilot` flies it, a scripted path through the rest of
 * `path` if not given
 */
async function boot(path: LatLon[], pilot?: Pilot, next = NEXT) {
    const w = vor('WWW', W_POS.lat, W_POS.lon);
    const a0 = pointFrom(W_POS, INBOUND + 180, 30);
    const a = airport('KAAA', a0.lat, a0.lon);
    const b0 = pointFrom(W_POS, next, 20);
    const b = airport('KBBB', b0.lat, b0.lon);
    const c0 = pointFrom(b0, next + 40, 20);
    const c = airport('KCCC', c0.lat, c0.lon);
    const world = new World({magvar: 0}).add(a, w, b, c);
    const flight = await Flight.start({
        world, storage: savedFlightplan(0, [a, w, b, c]), pilot: pilot ?? scriptedPath(path.slice(1)),
        aircraft: {lat: path[0].lat, lon: path[0].lon, altitudeFt: 3000, groundspeedKt: GS, trackTrue: courseDeg(path[0], path[1])},
    });
    await flight.flyUntil(() => flight.nav.activeIdent !== null, {timeout: 30, description: 'a waypoint active'});
    expect(flight.nav.activeIdent).toBe('WWW');
    return {flight, aw: flight.unit.props.memory.navPage.activeWaypoint};
}

// The turn start off course within 4.0 NM of the leg (checked in the KLN 89 trainer, 2026-10-20,
// docs/kln89-trainer-data/2026-10-20/report-turn-start.md): about 20 s before the turn point the unit decides once where
// the turn will start, and keeps that decision until the active waypoint changes. Up to about 2.8 NM of cross track then
// it starts the turn where the along-track distance to the waypoint is the lead (the turn plan), farther off it waits for
// the abeam line and turns there on a turn of no size (the abeam plan). The gate is known to about 0.1 NM, so the tests
// keep clear of it: 2.0 and 3.5 NM
describe('the turn start off course on the leg (#157)', () => {
    it('derives the turn point and the decision point of the 120° turn at 239 kt', () => {
        // The literals of the brief, so that a wrong derivation above cannot move both sides: L 3.10, roll-in 0.332
        expect(leadNm(GS, 120)).toBeCloseTo(3.10, 2);
        expect(rollInNm(GS)).toBeCloseTo(0.332, 3);
        expect(TP).toBeCloseTo(3.43, 2);
        expect(DP).toBeCloseTo(4.76, 2);
    });

    it('takes the turn plan at 2.0 NM off course and starts the turn at the lead distance along the track (KLN 89 trainer, 2026-10-20)', async () => {
        // Converging at 45° from 7 NM right (the outside of the turn), 2.0 NM right at the decision point, then parallel
        // 1.5 NM right of the leg. The trainer's T3 and T8 turned at T with 1.1 to 1.2 NM of cross track, outside
        const {flight, aw} = await boot([at(9.75, 7.0), at(4.25, 1.5), at(-20, 1.5)]);

        // The alert starts at the decision. It is asserted as an along-track distance: on a converging track the
        // seconds before the turn stretch (the trainer's T14)
        await flight.flyUntil(() => flight.nav.waypointAlert || flight.nav.activeIdent !== 'WWW', {timeout: 300, description: 'the alert at WWW'});
        expect(flight.nav.activeIdent).toBe('WWW');
        const alertAlong = alongBefore(flight.aircraft);
        expect(alertAlong).toBeGreaterThanOrEqual(DP - 0.07);
        expect(alertAlong).toBeLessThanOrEqual(DP + 0.02);
        expect(Math.abs(xtkRight(flight.aircraft) - 2.0), 'about 2.0 NM right at the decision').toBeLessThan(0.1);
        expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);
        expect(turnStackLength(flight.unit)).toBe(0);

        // The turn starts (it goes onto the turn stack) at the along-track distance TP, 1.5 NM off the leg. The DTK
        // follows one calculation later: it is calculated before the turn start in the tick
        await flight.flyUntil(() => turnStackLength(flight.unit) > 0 || flight.nav.activeIdent !== 'WWW', {timeout: 120, description: 'the turn start at WWW'});
        expect(flight.nav.activeIdent).toBe('WWW');
        const startAlong = alongBefore(flight.aircraft);
        expect(startAlong).toBeGreaterThanOrEqual(TP);
        expect(startAlong).toBeLessThanOrEqual(TP + TICK_NM + 0.05);
        expect(Math.abs(xtkRight(flight.aircraft))).toBeGreaterThan(1.0);
        await flight.fly(1);
        expect(flight.nav.activeIdent).toBe('WWW');
        expect(angleBetween(flight.nav.dtkTrue, NEXT)).toBeLessThan(1);

        // WWW is sequenced past the bisector. The plan belongs to WWW: KBBB, 20 NM away, starts undecided, and once the
        // turn at WWW has left the stack (the aircraft flies on, away from the leg to KBBB, until it is 4.0 NM off it)
        // there is no alert for KBBB
        await flight.flyUntil(() => flight.nav.activeIdent !== 'WWW', {timeout: 120, description: 'WWW sequenced'});
        expect(flight.nav.activeIdent).toBe('KBBB');
        expect(pastBisector(flight.aircraft)).toBe(true);
        expect(aw.turnPlan).toBeNull();
        await flight.flyUntil(() => turnStackLength(flight.unit) === 0, {timeout: 300, description: 'the turn at WWW left the stack'});
        await flight.fly(1);
        expect(flight.nav.activeIdent).toBe('KBBB');
        expect(aw.turnPlan).toBeNull();
        expect(flight.nav.waypointAlert).toBe(false);
    });

    it('takes the abeam plan at 3.5 NM off course and keeps it although the cross track falls (KLN 89 trainer, 2026-10-20)', async () => {
        // Converging at 45° from 8.5 NM right, 3.5 NM right at the decision point, then turning at 2.8 NM before WWW onto
        // the inbound course, about 0.9 NM right of the leg: far below the gate, as in the trainer's T7, T11 and T13
        // (0.7 to 0.9 NM before the abeam line), which still waited for the abeam line. The turn comes early enough for
        // the aircraft to be on the parallel at the alert, which the 15 s are measured on
        const {flight, aw} = await boot([at(9.75, 8.5), at(4.25, 3.0)], trackPilot(2.8, INBOUND - 45, INBOUND));
        const dtkOnInbound = () => angleBetween(flight.nav.dtkTrue, INBOUND) < 1;

        await flight.flyUntil(() => alongBefore(flight.aircraft) <= DP || flight.nav.activeIdent !== 'WWW', {timeout: 300, description: 'the decision point of WWW'});
        expect(Math.abs(xtkRight(flight.aircraft) - 3.5), 'about 3.5 NM right at the decision').toBeLessThan(0.1);

        // No alert at the decision point, and none along the leg to the abeam alert
        await flight.flyUntil(() => alongBefore(flight.aircraft) <= 4.0 || flight.nav.activeIdent !== 'WWW', {timeout: 60, description: '4.0 NM before WWW'});
        expect(flight.nav.waypointAlert).toBe(false);
        expect(aw.turnPlan).toBe(TurnPlan.AT_ABEAM);

        // The alert starts 15 s before the abeam line at the along-track closure: 0.996 NM at 239 kt on the parallel
        let dtkSwitchedEarly = false;
        await flight.flyUntil(() => {
            dtkSwitchedEarly ||= !dtkOnInbound();
            return flight.nav.waypointAlert || flight.nav.activeIdent !== 'WWW';
        }, {timeout: 120, description: 'the alert at WWW'});
        expect(flight.nav.activeIdent).toBe('WWW');
        // Within the calculation tick after the along-track distance came within 15 s, measured at the GPS position the
        // calculation used: (15 - 1) s to 15 s of flight before the abeam line on the parallel
        const alertAlong = gpsAlongBefore(flight);
        expect(alertAlong).toBeGreaterThanOrEqual(15 * TICK_NM - TICK_NM - GPS_TOLERANCE_NM);
        expect(alertAlong).toBeLessThanOrEqual(15 * TICK_NM + GPS_TOLERANCE_NM);
        expect(Math.abs(xtkRight(flight.aircraft)), 'well below the gate at the alert').toBeLessThan(1.0);

        // The turn starts at the abeam line, within one calculation of it. It is measured where the turn goes onto the
        // stack: the DTK follows one calculation later, because it is calculated before the turn start in the tick
        await flight.flyUntil(() => {
            dtkSwitchedEarly ||= !dtkOnInbound();
            return turnStackLength(flight.unit) > 0 || flight.nav.activeIdent !== 'WWW';
        }, {timeout: 60, description: 'the turn start at WWW'});
        expect(flight.nav.activeIdent).toBe('WWW');
        expect(dtkSwitchedEarly, 'the DTK stays on the inbound leg up to the abeam line').toBe(false);
        const startAlong = alongBefore(flight.aircraft);
        expect(startAlong).toBeGreaterThanOrEqual(-0.07);
        expect(startAlong).toBeLessThanOrEqual(0.02);
        // Roll steering steers on the next leg at once: the aircraft is farther from a turn of no size than its radius
        const navPage = flight.unit.props.memory.navPage;
        expect(navPage.steeringPath).toBe(aw.turnStack[0].pathForDtk);

        // The abeam turn has no size: XTK is the distance to WWW, FLY L for the left turn, and the DTK is the next leg's,
        // up to the sequencing at the outside bisector ray 095 (the trainer's run C sequenced at 096 to 101). Sampled once
        // a second from one second after the turn start
        const samples: string[] = [];
        for (let s = 0; s < 60 && flight.nav.activeIdent === 'WWW'; s++) {
            await flight.fly(1);
            if (flight.nav.activeIdent !== 'WWW') break;
            const nav = flight.nav;
            const dist = distanceNm(flight.aircraft, W_POS);
            samples.push(`${nav.xtkNm?.toFixed(3)}:${dist.toFixed(3)}:${nav.dtkTrue?.toFixed(0)}`);
            expect(nav.xtkNm!, samples.join(' ')).toBeGreaterThan(0);
            expect(Math.abs(nav.xtkNm! - dist), samples.join(' ')).toBeLessThan(0.02);
            expect(angleBetween(nav.dtkTrue, NEXT), samples.join(' ')).toBeLessThan(1);
        }
        expect(samples.length, 'some seconds of the abeam turn').toBeGreaterThan(3);
        await flight.flyUntil(() => flight.nav.activeIdent !== 'WWW', {timeout: 5, description: 'WWW sequenced'});
        expect(flight.nav.activeIdent).toBe('KBBB');
        expect(angleBetween(courseDeg(W_POS, flight.aircraft), 95)).toBeLessThan(3);
        // The abeam turn is dropped with WWW: KBBB has nothing on the stack and no alert
        expect(turnStackLength(flight.unit)).toBe(0);
        await flight.fly(1);
        expect(flight.nav.waypointAlert).toBe(false);
    });

    it('times the abeam alert by the closure along the leg on a converging track (KLN 89 trainer, 2026-10-20)', async () => {
        // A straight 30° convergence on 035, 3.5 NM right at the decision point and 0.75 NM right at the abeam line. 15 s
        // at the closure along the leg, 239 kt × cos 30°, are 0.862 NM: the alert starts there, not at the 0.996 NM of
        // 15 s at the ground speed
        const start = at(9.75, 3.5 + (9.75 - DP) * Math.tan(30 * DEG));
        const {flight, aw} = await boot([start, at(0, 0)], trackPilot(-100, INBOUND - 30, INBOUND - 30));
        await flight.flyUntil(() => flight.nav.waypointAlert || flight.nav.activeIdent !== 'WWW', {timeout: 300, description: 'the alert at WWW'});
        expect(flight.nav.activeIdent).toBe('WWW');
        expect(aw.turnPlan).toBe(TurnPlan.AT_ABEAM);
        const closureNm = GS * Math.cos(30 * DEG) / 3600;
        // Measured at the GPS position the calculation used, as in the previous test
        const alertAlong = gpsAlongBefore(flight);
        expect(alertAlong).toBeGreaterThanOrEqual(15 * closureNm - closureNm - GPS_TOLERANCE_NM);
        expect(alertAlong).toBeLessThanOrEqual(15 * closureNm + GPS_TOLERANCE_NM);
    });

    it('gives the abeam turn of a right turn the FLY R sign', async () => {
        // The 120° turn to the right instead (onto 185), passed on its outside, 3.5 NM left of the leg at the decision
        // point and 0.9 NM left at the abeam line: XTK is minus the distance to WWW
        const {flight} = await boot([at(9.75, -8.5), at(4.25, -3.0)], trackPilot(2.8, INBOUND + 45, INBOUND), INBOUND + 120);
        await flight.flyUntil(() => turnStackLength(flight.unit) > 0 || flight.nav.activeIdent !== 'WWW', {timeout: 300, description: 'the turn start at WWW'});
        expect(flight.nav.activeIdent).toBe('WWW');
        expect(alongBefore(flight.aircraft), 'at the abeam line').toBeLessThanOrEqual(0.02);
        await flight.fly(1);
        expect(flight.nav.activeIdent).toBe('WWW');
        expect(flight.nav.xtkNm!).toBeLessThan(0);
        expect(Math.abs(flight.nav.xtkNm! + distanceNm(flight.aircraft, W_POS))).toBeLessThan(0.02);
    });

    it('arms the bisector of the turn plan only once its turn has started (the design, section 3.3)', async () => {
        // A 150° left turn (onto 275) at 239 kt, passed parallel 2.0 NM inside: the turn plan. The lead is capped at 60 s,
        // 3.98 NM, so the turn point is 4.31 NM and the decision point 5.64 NM before WWW. The inside bisector ray (260)
        // lies a · tan 15° from the leg, 1.51 NM at the decision point and 1.16 NM at the turn point, so the aircraft is
        // past it from 7.5 NM before WWW on: WWW is sequenced where the turn starts, not at the decision
        const lead = GS * 60 / 3600;
        const tp = lead + rollInNm(GS);
        expect(lead).toBeLessThan(leadNm(GS, 150)); // Precondition: capped
        const {flight, aw} = await boot([at(12, -2.0), at(-20, -2.0)], trackPilot(-100, INBOUND, INBOUND), INBOUND - 150 + 360);
        await flight.flyUntil(() => aw.turnPlan !== null || flight.nav.activeIdent !== 'WWW', {timeout: 300, description: 'the decision at WWW'});
        expect(flight.nav.activeIdent).toBe('WWW');
        expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);

        await flight.flyUntil(() => flight.nav.activeIdent !== 'WWW', {timeout: 120, description: 'WWW sequenced'});
        expect(flight.nav.activeIdent).toBe('KBBB');
        const along = gpsAlongBefore(flight);
        expect(along).toBeGreaterThanOrEqual(tp - GPS_TOLERANCE_NM);
        expect(along).toBeLessThanOrEqual(tp + TICK_NM + GPS_TOLERANCE_NM);
        // The turn was started: it is on the stack and flown onto the leg to KBBB
        expect(turnStackLength(flight.unit)).toBeGreaterThan(0);
    });

    it('sequences on the abeam plan on the inside past the bisector, before the abeam line (the maintainer\'s lead\'s call)', async () => {
        // The previous on the inside: 3.5 NM left at the decision point. The inside bisector ray (275) is only 2.75 NM
        // from the leg there (4.76 · tan 30°), so the aircraft is already past the bisector when the abeam plan arms the
        // test, and WWW is sequenced at once at the decision (the design, section 3.3: the test is a state; not observed
        // in the trainer, whose one inside pass, T2, took the turn plan). The exact mirror of the previous, converging
        // from 8.5 NM left, cannot be flown: it starts past the bisector, closer to the leg to KBBB, so the plan would
        // activate KBBB. Parallel 3.5 NM left from 12 NM before WWW, on the inbound side of the bisector until 6.1 NM
        // before WWW, where the plan is not decided yet
        const {flight} = await boot([at(12, -3.5), at(-20, -3.5)]);
        let dtkSwitchedEarly = false;
        await flight.flyUntil(() => {
            dtkSwitchedEarly ||= angleBetween(flight.nav.dtkTrue, INBOUND) >= 1;
            return flight.nav.activeIdent !== 'WWW';
        }, {timeout: 300, description: 'WWW sequenced'});
        expect(flight.nav.activeIdent).toBe('KBBB');
        expect(dtkSwitchedEarly, 'no DTK switch before the sequencing').toBe(false);
        const along = alongBefore(flight.aircraft);
        expect(along, 'before the abeam line').toBeGreaterThan(0);
        expect(pastBisector(flight.aircraft)).toBe(true);
        // At the decision point, within one tick
        expect(along).toBeGreaterThanOrEqual(DP - TICK_NM - POSITION_TOLERANCE_NM);
        expect(along).toBeLessThanOrEqual(DP + 0.02);
        expect(Math.abs(xtkRight(flight.aircraft) + 3.5)).toBeLessThan(0.1);
    });

    it('decides at once when a Direct To is made past the decision point', async () => {
        // Wings level on the inbound leg. The plan's own turn at WWW starts at 3.43 NM; the Direct To WWW entered about
        // 2.6 NM before WWW replaces it. The Direct To leg starts where it is activated, so its lead is half of it
        // (#404), and it has no cross track: the turn plan is taken in the first calculation of the Direct To, which is
        // past the decision point of that leg, and its turn starts at that leg's turn point
        const start = at(8, 0);
        const {flight, aw} = await boot([start, W_POS], new ManualPilot());
        await flight.flyUntil(() => alongBefore(flight.aircraft) <= 2.7, {timeout: 120, description: '2.7 NM before WWW'});
        await flight.panel.directTo('WWW', {waitMs: 0});
        await flight.flyUntil(() => aw.isDctNavigation(), {timeout: 5, description: 'the Direct To active'});
        const legNm = distanceNm(aw.getFromWpt()!, W_POS);
        const tpDct = legNm / 2 + rollInNm(GS);
        const dpDct = tpDct + GS * 20 / 3600;
        // Preconditions: activated inside that leg's decision point and outside its turn point
        expect(legNm).toBeLessThan(dpDct - 0.3);
        expect(legNm).toBeGreaterThan(tpDct + 0.5);

        await flight.fly(1);
        expect(flight.nav.activeIdent).toBe('WWW');
        expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);
        expect(flight.nav.waypointAlert).toBe(true);
        expect(turnStackLength(flight.unit)).toBe(0);

        await flight.flyUntil(() => turnStackLength(flight.unit) > 0 || flight.nav.activeIdent !== 'WWW', {timeout: 60, description: 'the turn start at WWW'});
        expect(flight.nav.activeIdent).toBe('WWW');
        const startAlong = alongBefore(flight.aircraft);
        expect(startAlong).toBeGreaterThanOrEqual(tpDct - POSITION_TOLERANCE_NM);
        expect(startAlong).toBeLessThanOrEqual(tpDct + TICK_NM + POSITION_TOLERANCE_NM);
    });
});
