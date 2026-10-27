import {describe, expect, it} from 'vitest';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {airport, vor} from '../../harness/navdata/builders';
import {savedFlightplan} from '../../harness/storage';
import {angleBetween, courseDeg, crossTrackNm, distanceNm, EARTH_RADIUS_NM, LatLon, pointFrom} from '../../harness/flight/geo';
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
        commandedBank: ({aircraft}) => bankToward(aircraft.trackTrue, alongBefore(aircraft) > turnAtAlongNm ? first : second),
    };
}

/** The bank of trackPilot toward the true course `target`: 3° per degree of track error, at most 25° */
function bankToward(trackTrue: number, target: number): number {
    const diff = ((target - trackTrue + 540) % 360) - 180;
    return Math.max(-25, Math.min(25, 3 * diff));
}

/**
 * The 3.5 NM pass of the abeam plan, then onto the next leg: flies INBOUND - 45 until 2.8 NM before WWW (with `converge`,
 * the default; INBOUND throughout without), then INBOUND, and from the abeam line of WWW on `next` (NEXT by default),
 * banking as trackPilot does. The switch to `next` is kept, because flying a next leg that turns back takes the aircraft
 * back across that abeam line
 */
function onToNextPilot(next = NEXT, converge = true): Pilot {
    let onNext = false;
    return {
        commandedBank: ({aircraft}) => {
            const along = alongBefore(aircraft);
            onNext ||= along <= 0;
            return bankToward(aircraft.trackTrue, onNext ? next : converge && along > 2.8 ? INBOUND - 45 : INBOUND);
        },
    };
}

/**
 * The along-track distance past WWW on the next leg (NEXT), measured in the plane: 0 on the abeam line of WWW on that
 * leg, positive past it
 */
const alongPastOnNext = (pos: LatLon) => distanceNm(W_POS, pos) * Math.cos((courseDeg(W_POS, pos) - NEXT) * DEG);

/**
 * KAAA - WWW - KBBB - KCCC: the 30 NM inbound leg arrives at WWW on 065, the leg to KBBB leaves on `next` (305 by
 * default, a 120° left turn) and is `kbbbNm` long (20 NM by default), and KBBB has a turn of its own onto KCCC,
 * `kbbbTurn` (40° right by default, negative to the left), so that its turn anticipation reads the turn plan too. The
 * aircraft starts at `path[0]` at 239 kt toward `path[1]`. `pilot` flies it, a scripted path through the rest of `path`
 * if not given
 */
async function boot(path: LatLon[], pilot?: Pilot, next = NEXT, kbbbNm = 20, kbbbTurn = 40) {
    const w = vor('WWW', W_POS.lat, W_POS.lon);
    const a0 = pointFrom(W_POS, INBOUND + 180, 30);
    const a = airport('KAAA', a0.lat, a0.lon);
    const b0 = pointFrom(W_POS, next, kbbbNm);
    const b = airport('KBBB', b0.lat, b0.lon);
    const c0 = pointFrom(b0, next + kbbbTurn, 20);
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

        // The turn starts (it goes onto the turn stack) at the along-track distance TP, 1.5 NM off the leg. The DTK is
        // the next leg's in the same calculation (#407, checked in the KLN 89 trainer, 2026-10-27: no lag at any turn
        // start)
        await flight.flyUntil(() => turnStackLength(flight.unit) > 0 || flight.nav.activeIdent !== 'WWW', {timeout: 120, description: 'the turn start at WWW'});
        expect(flight.nav.activeIdent).toBe('WWW');
        const startAlong = alongBefore(flight.aircraft);
        expect(startAlong).toBeGreaterThanOrEqual(TP);
        expect(startAlong).toBeLessThanOrEqual(TP + TICK_NM + 0.05);
        expect(Math.abs(xtkRight(flight.aircraft))).toBeGreaterThan(1.0);
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
        // stack, and the DTK stays on the inbound leg up to the calculation before
        await flight.flyUntil(() => {
            // The calculation that starts the turn shows the next leg's DTK already (#407), so it is not early
            dtkSwitchedEarly ||= turnStackLength(flight.unit) === 0 && !dtkOnInbound();
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
        // from the calculation of the turn start (#407, checked in the KLN 89 trainer, 2026-10-27: no lag at any turn
        // start) up to the sequencing at the outside bisector ray 095 (the trainer's run C sequenced at 096 to 101).
        // Sampled once a second from the turn start
        const samples: string[] = [];
        for (let s = 0; s < 60 && flight.nav.activeIdent === 'WWW'; s++) {
            if (s > 0) await flight.fly(1);
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
        // #406: the abeam turn becomes the run-out of WWW on the leg to KBBB, which keeps the alert on until the aircraft
        // is past the abeam line of WWW on that leg (checked in the KLN 89 trainer, 2026-10-27, docs/kln89-trainer-record.md;
        // this test expected the alert to go off at the sequencing before). This pilot flies on along 065, away from that
        // line, so the run-out ends only once the aircraft is more than 4.0 NM from the leg to KBBB (the design's call,
        // not flown in the trainer)
        expect(turnStackLength(flight.unit)).toBe(1);
        expect(flight.nav.waypointAlert).toBe(true);
        await flight.flyUntil(() => !flight.nav.waypointAlert, {timeout: 120, description: 'the run-out of WWW ended'});
        expect(flight.nav.activeIdent).toBe('KBBB');
        const offNext = Math.abs(crossTrackNm(flight.aircraft, W_POS, NEXT));
        expect(offNext).toBeGreaterThan(4.0 - POSITION_TOLERANCE_NM);
        // Within the calculation after the aircraft went beyond 4.0 NM: on 065 it moves away from the leg on 305 by
        // sin 120° of a tick per calculation
        expect(offNext).toBeLessThan(4.0 + TICK_NM * Math.sin(120 * DEG) + POSITION_TOLERANCE_NM);
        expect(turnStackLength(flight.unit)).toBe(0);
    });

    // #406: after an abeam turn the alert ends where the turn in use ends, the abeam line of the waypoint on the new leg:
    // not at the sequencing, nor at a track angle, a cross track or a time (checked in the KLN 89 trainer, 2026-10-27,
    // docs/kln89-trainer-record.md and kln89-trainer-data/2026-10-27/report.md: the 2026-10-20 runs R2 and R6 re-read,
    // 53 s and 41 s after the sequencing, and run a8). Until then line 2 shows the XTK of the new leg (R6)
    it('keeps the alert after an abeam turn until the aircraft is past the waypoint\'s abeam line on the next leg (KLN 89 trainer, 2026-10-27, R2, R6, a8; #406)', async () => {
        const {flight, aw} = await boot([at(9.75, 8.5), at(4.25, 3.0)], onToNextPilot());
        let planAtWww: TurnPlan | null = null;
        await flight.flyUntil(() => {
            if (flight.nav.activeIdent === 'WWW') planAtWww = aw.turnPlan;
            return flight.nav.activeIdent === 'KBBB';
        }, {timeout: 300, description: 'WWW sequenced'});
        expect(planAtWww, 'precondition: the abeam plan at WWW').toBe(TurnPlan.AT_ABEAM);
        // Precondition: the run-out is on the stack in the calculation that creates it. No geometry ends it there: at the
        // outside bisector the aircraft is as far from the new leg as from the inbound one (at most 4 NM) and projects
        // before the old waypoint's abeam line on the new leg
        expect(turnStackLength(flight.unit)).toBe(1);
        expect(aw.turnStack[0].isRunOut).toBe(true);

        // Sampled once a second from the sequencing until the alert is off. The run-out ends with the abeam line within
        // the tick ahead, as a turn circle ends (the trainer's R2, R6 and a10 ended 0.02 to 0.17 NM before the line): the
        // alert is on while the line is more than a tick ahead, and off in the calculation after that, within one tick
        // before the line or on it
        const samples: string[] = [];
        for (let s = 0; ; s++) {
            const nav = flight.nav;
            const pos = flight.aircraft;
            const along = alongPastOnNext(pos);
            samples.push(`${along.toFixed(3)}:${nav.xtkNm?.toFixed(3)}:${nav.dtkTrue?.toFixed(0)}:${nav.waypointAlert}`);
            if (!nav.waypointAlert) break;
            expect(s, samples.join(' ')).toBeLessThan(120);
            expect(nav.activeIdent).toBe('KBBB');
            expect(along, samples.join(' ')).toBeLessThan(-TICK_NM + POSITION_TOLERANCE_NM);
            // Signed: the XTK of the leg to KBBB, positive right of it (FLY L), where the aircraft comes from (the outside
            // of the left turn at WWW)
            expect(crossTrackNm(pos, W_POS, NEXT), samples.join(' ')).toBeGreaterThan(0);
            expect(Math.abs(nav.xtkNm! - crossTrackNm(pos, W_POS, NEXT)), samples.join(' ')).toBeLessThan(0.02);
            expect(angleBetween(nav.dtkTrue, NEXT), samples.join(' ')).toBeLessThan(1);
            await flight.fly(1);
        }
        const alongAtEnd = alongPastOnNext(flight.aircraft);
        expect(alongAtEnd, samples.join(' ')).toBeGreaterThanOrEqual(-TICK_NM - POSITION_TOLERANCE_NM);
        expect(alongAtEnd, samples.join(' ')).toBeLessThan(POSITION_TOLERANCE_NM);
        expect(samples.length - 1, 'seconds of alert after the sequencing (R6: 41 s, R2: 53 s)').toBeGreaterThanOrEqual(5);
        expect(flight.nav.activeIdent).toBe('KBBB');
        expect(turnStackLength(flight.unit)).toBe(0);
    });

    // The design, Review Focus 2: the leg after WWW is short, so that KBBB's own turn starts while the run-out of WWW is
    // still on the stack. The run-out ends at WWW's abeam line on the leg to KBBB, which lies kbbbNm before KBBB along
    // that leg, within the tick ahead; KBBB's turn starts at its lead plus the roll-in before KBBB, within the tick
    // ahead, and the lead is capped at half the leg. The calculation that starts the turn finds the aircraft at most a
    // tick inside the turn point, so the run-out is still on the stack there, and is replaced, only when the turn point
    // lies more than a tick before WWW's abeam line: kbbbNm / 2 + 0.332 > kbbbNm + 0.066, a leg under 0.53 NM. 0.4 NM,
    // whose turn point lies 0.53 NM before KBBB, 0.13 NM before that line. The turn at KBBB goes 40° left, away from the
    // side the aircraft comes from (about 2 NM right of the leg there): on the inside of a right turn the aircraft is past
    // KBBB's bisector at the turn start, and KBBB would be sequenced in the same calculation
    it('replaces the run-out by the next waypoint\'s own turn, with no gap in the alert (the design\'s call)', async () => {
        const kbbbNm = 0.4;
        const tpKbbb = kbbbNm / 2 + rollInNm(GS);
        expect(kbbbNm / 2).toBeLessThan(leadNm(GS, 40)); // Precondition: the lead is capped at half the leg
        const {flight, aw} = await boot([at(9.75, 8.5), at(4.25, 3.0)], onToNextPilot(), NEXT, kbbbNm, -40);
        await flight.flyUntil(() => flight.nav.activeIdent !== 'WWW', {timeout: 300, description: 'WWW sequenced'});
        expect(flight.nav.activeIdent).toBe('KBBB');

        let runOutBefore = false;
        const samples: string[] = [];
        for (let s = 0; !aw.ownTurnStarted; s++) {
            samples.push(`${alongPastOnNext(flight.aircraft).toFixed(3)}:${turnStackLength(flight.unit)}:${flight.nav.waypointAlert}`);
            expect(s, samples.join(' ')).toBeLessThan(60);
            expect(flight.nav.activeIdent, samples.join(' ')).toBe('KBBB');
            expect(flight.nav.waypointAlert, samples.join(' ')).toBe(true);
            runOutBefore = turnStackLength(flight.unit) === 1 && aw.turnStack[0].isRunOut;
            await flight.fly(1);
        }
        expect(runOutBefore, 'precondition: the run-out on the stack in the calculation before KBBB\'s turn starts').toBe(true);
        // Precondition: the turn started at KBBB's turn point, more than a tick before WWW's abeam line on the leg, where
        // the run-out does not end by itself
        const along = alongPastOnNext(flight.aircraft);
        expect(along, samples.join(' ')).toBeGreaterThanOrEqual(-(tpKbbb + TICK_NM - kbbbNm) - POSITION_TOLERANCE_NM);
        expect(along, samples.join(' ')).toBeLessThan(-(tpKbbb - kbbbNm) + POSITION_TOLERANCE_NM);
        expect(along, samples.join(' ')).toBeLessThan(-TICK_NM - POSITION_TOLERANCE_NM);
        expect(flight.nav.activeIdent).toBe('KBBB');
        expect(flight.nav.waypointAlert).toBe(true);
        expect(turnStackLength(flight.unit)).toBeGreaterThan(0);
        expect(aw.turnStack.every(e => !e.isRunOut), 'nothing of the run-out under the new turn').toBe(true);
    });

    // A run-out stands for the leg that was active when it was made, so the next change of the active waypoint drops it
    // (the design's call, not flown in the trainer). Here the next waypoint is sequenced on its own abeam plan, without
    // a turn of its own: a 30° left turn at WWW onto 035, passed parallel 3.5 NM right of the inbound leg, so that WWW
    // takes the abeam plan; KBBB 0.5 NM on, with a 90° right turn onto 125. From WWW's
    // abeam line the aircraft flies 035 about 3 NM right of the leg to KBBB, the inside of KBBB's turn: KBBB takes the
    // abeam plan too, and the aircraft is past KBBB's inside bisector at once, while WWW's abeam line on the leg to KBBB
    // is still ahead. Kept, the run-out of WWW showed the DTK and XTK of the leg to KBBB with KCCC active
    it('drops the run-out when the next waypoint is sequenced without a turn of its own (the design\'s call)', async () => {
        const next = 35;
        const {flight, aw} = await boot([at(10, 3.5), at(-20, 3.5)], onToNextPilot(next, false), next, 0.5, 90);
        await flight.flyUntil(() => flight.nav.activeIdent !== 'WWW', {timeout: 300, description: 'WWW sequenced'});
        expect(flight.nav.activeIdent).toBe('KBBB');
        expect(aw.turnStack.map(e => e.isRunOut), 'precondition: the run-out of WWW').toEqual([true]);
        let runOutBefore = false;
        let ownTurnBefore = true;
        let xtkToKbbbBefore = NaN;
        await flight.flyUntil(() => {
            if (flight.nav.activeIdent !== 'KBBB') return true;
            runOutBefore = turnStackLength(flight.unit) === 1 && aw.turnStack[0].isRunOut;
            ownTurnBefore = aw.ownTurnStarted;
            xtkToKbbbBefore = crossTrackNm(flight.aircraft, W_POS, next);
            return false;
        }, {timeout: 120, description: 'KBBB sequenced'});
        expect(flight.nav.activeIdent).toBe('KCCC');
        expect(runOutBefore, 'precondition: the run-out on the stack up to the sequencing of KBBB').toBe(true);
        expect(ownTurnBefore, 'precondition: KBBB has no turn of its own').toBe(false);
        // Precondition: on the leg to KBBB, but beyond the gate of the turn plan, so KBBB is decided on the abeam plan in
        // its first calculation, and sequenced there past its inside bisector
        expect(xtkToKbbbBefore).toBeGreaterThan(2.8 + 0.1);
        expect(xtkToKbbbBefore).toBeLessThan(4.0 - 0.1);
        // Precondition: WWW's abeam line on the leg to KBBB is more than a tick ahead, so the run-out did not end by itself
        const pos = flight.aircraft;
        expect(distanceNm(W_POS, pos) * Math.cos((courseDeg(W_POS, pos) - next) * DEG)).toBeLessThan(-TICK_NM - POSITION_TOLERANCE_NM);

        // In the calculation that sequences KBBB: the DTK and the signed XTK of the leg to KCCC, nothing on the stack, and
        // roll steering on that leg (the old leg lies about 3 NM away)
        const kbbb = pointFrom(W_POS, next, 0.5);
        const legCourse = courseDeg(kbbb, pointFrom(kbbb, next + 90, 20));
        const navPage = flight.unit.props.memory.navPage;
        expect(turnStackLength(flight.unit)).toBe(0);
        expect(angleBetween(flight.nav.dtkTrue, legCourse)).toBeLessThan(1);
        expect(Math.abs(flight.nav.xtkNm! - crossTrackNm(pos, kbbb, legCourse))).toBeLessThan(0.02);
        expect(Math.abs(navPage.steeringPath!.distance(pos) * EARTH_RADIUS_NM - crossTrackNm(pos, kbbb, legCourse))).toBeLessThan(0.02);
        // No alert for KCCC, the last waypoint, 20 NM away, from the next calculation on. The calculation of the
        // sequencing still shows the alert KBBB's own branch decided before it sequenced KBBB, as at every sequencing
        await flight.fly(1);
        expect(flight.nav.activeIdent).toBe('KCCC');
        expect(turnStackLength(flight.unit)).toBe(0);
        expect(flight.nav.waypointAlert).toBe(false);
    });

    // The design, Review Focus 3: a Direct To clears the run-out with the rest of the turn stack, and the alert follows
    // the Direct To's own rule: KCCC, the last waypoint, is more than 20 NM away
    it('clears the run-out at a Direct To', async () => {
        const {flight, aw} = await boot([at(9.75, 8.5), at(4.25, 3.0)], trackPilot(2.8, INBOUND - 45, INBOUND));
        await flight.flyUntil(() => flight.nav.activeIdent !== 'WWW', {timeout: 300, description: 'WWW sequenced'});
        expect(flight.nav.activeIdent).toBe('KBBB');
        expect(turnStackLength(flight.unit), 'precondition: the run-out on the stack').toBe(1);
        expect(aw.turnStack[0].isRunOut).toBe(true);

        await flight.panel.directTo('KCCC');
        expect(turnStackLength(flight.unit)).toBe(0);
        expect(flight.nav.activeIdent).toBe('KCCC');
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
            // While WWW is active: the calculation that sequences it shows the DTK of the leg to KBBB already (#407,
            // checked in the KLN 89 trainer, 2026-10-27: no lag at any sequencing)
            dtkSwitchedEarly ||= flight.nav.activeIdent === 'WWW' && angleBetween(flight.nav.dtkTrue, INBOUND) >= 1;
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

/** The cross track to the inbound leg at the GPS position the unit's last calculation used, positive right of it */
const gpsXtkRight = (flight: Flight) => xtkRight(flight.unit.props.sensors.in.gps.coords);

// The sequencing off the leg (checked in the KLN 89 trainer, 2026-10-20,
// docs/kln89-trainer-data/2026-10-20/report-off-course.md): more than 4.0 NM from the active leg the unit anticipates no
// turn and sequences as soon as the next leg's segment is at least as close as the active leg's. On the outside of the
// turn that is the abeam line (the trainer's E, F, R1, R3, R4), on the inside the inside bisector (R7, R8). The alert
// starts 36 s before the abeam line on the outside, and there is none before a sequencing on the inside. The regime is
// evaluated every calculation: in R2 and R6 the off-the-leg alert stopped when the cross track fell to 4.0 NM, and the
// abeam plan's alert started 15 s before the abeam line
describe('the sequencing off the leg (#157)', () => {
    it('sequences at the abeam line when passed 6 NM off the leg on the outside, without a turn (KLN 89 trainer, 2026-10-20)', async () => {
        // Parallel 6.0 NM right of the leg, the outside of the 120° left turn, as the trainer's E (6.9 NM)
        const {flight} = await boot([at(9.75, 6.0), at(-20, 6.0)]);
        let dtkSwitched = false;
        let turnStarted = false;
        const watch = () => {
            dtkSwitched ||= flight.nav.activeIdent === 'WWW' && angleBetween(flight.nav.dtkTrue, INBOUND) >= 1;
            turnStarted ||= flight.nav.activeIdent === 'WWW' && turnStackLength(flight.unit) > 0;
        };

        // The alert starts 36 s before the abeam line on the parallel: within the calculation tick after the along-track
        // distance came within 36 s, measured at the GPS position the calculation used
        await flight.flyUntil(() => {
            watch();
            return flight.nav.waypointAlert || flight.nav.activeIdent !== 'WWW';
        }, {timeout: 300, description: 'the alert at WWW'});
        expect(flight.nav.activeIdent).toBe('WWW');
        const alertAlong = gpsAlongBefore(flight);
        expect(alertAlong).toBeGreaterThanOrEqual(36 * TICK_NM - TICK_NM - GPS_TOLERANCE_NM);
        expect(alertAlong).toBeLessThanOrEqual(36 * TICK_NM + GPS_TOLERANCE_NM);

        // Sequenced at the abeam line, within one calculation of it, with no turn and no DTK switch before
        await flight.flyUntil(() => {
            watch();
            return flight.nav.activeIdent !== 'WWW';
        }, {timeout: 120, description: 'WWW sequenced'});
        expect(flight.nav.activeIdent).toBe('KBBB');
        expect(turnStarted, 'no turn on the stack up to the sequencing').toBe(false);
        expect(dtkSwitched, 'no DTK switch up to the sequencing').toBe(false);
        const along = gpsAlongBefore(flight);
        expect(along).toBeGreaterThanOrEqual(-TICK_NM - GPS_TOLERANCE_NM);
        expect(along).toBeLessThanOrEqual(GPS_TOLERANCE_NM);
        expect(Math.abs(gpsXtkRight(flight) - 6.0)).toBeLessThan(0.1);

        // No alert afterwards (R1: the flashing stopped with the sequencing): KBBB is 20 NM away
        await flight.fly(1);
        expect(flight.nav.activeIdent).toBe('KBBB');
        expect(turnStackLength(flight.unit)).toBe(0);
        expect(flight.nav.waypointAlert).toBe(false);
    });

    it('sequences at the inside bisector when passed 9 NM off the leg on the inside', async () => {
        // Parallel 9.0 NM left of the leg, the inside of the 120° left turn. The inside bisector ray (275) is where both
        // segments are 9.0 NM away: 9 / tan 30° = 15.6 NM before WWW, 18 NM from it (the trainer's R7 sequenced 11 NM from
        // the waypoint). The foot on the leg to KBBB (20 NM) lies on its segment there
        const {flight} = await boot([at(25, -9.0), at(-20, -9.0)]);
        let alerted = false;
        await flight.flyUntil(() => {
            alerted ||= flight.nav.activeIdent === 'WWW' && flight.nav.waypointAlert;
            return flight.nav.activeIdent !== 'WWW';
        }, {timeout: 450, description: 'WWW sequenced'});
        expect(flight.nav.activeIdent).toBe('KBBB');
        expect(angleBetween(courseDeg(W_POS, flight.aircraft), 275)).toBeLessThan(3);
        expect(distanceNm(W_POS, flight.aircraft)).toBeGreaterThan(4);
        expect(Math.abs(xtkRight(flight.aircraft) + 9.0)).toBeLessThan(0.1);
        expect(alerted, 'no alert before the sequencing (R7, R8)').toBe(false);
    });

    it('gives no alert on the inside, also where the inside bisector lies within 36 s of the abeam line (R8)', async () => {
        // A 31° right turn (onto 096), as the trainer's R8, passed parallel 5.0 NM right of the leg, the inside. The inside
        // bisector ray (170.5) is 5 · tan 15.5° = 1.39 NM before the abeam line, 21 s at 239 kt: an alert 36 s before the
        // abeam line would start 15 s before the sequencing. 9 NM inside the 120° turn the bisector comes far earlier
        const bisectorAlong = 5.0 * Math.tan(15.5 * DEG);
        expect(36 * TICK_NM - bisectorAlong).toBeGreaterThan(10 * TICK_NM); // Precondition
        const {flight} = await boot([at(12, 5.0), at(-20, 5.0)], undefined, INBOUND + 31);
        let alerted = false;
        await flight.flyUntil(() => {
            alerted ||= flight.nav.activeIdent === 'WWW' && flight.nav.waypointAlert;
            return flight.nav.activeIdent !== 'WWW';
        }, {timeout: 300, description: 'WWW sequenced'});
        expect(flight.nav.activeIdent).toBe('KBBB');
        expect(angleBetween(courseDeg(W_POS, flight.aircraft), 170.5)).toBeLessThan(3);
        const along = gpsAlongBefore(flight);
        expect(along).toBeGreaterThanOrEqual(bisectorAlong - TICK_NM - 0.02);
        expect(along).toBeLessThanOrEqual(bisectorAlong + 0.02);
        expect(alerted, 'no alert before the sequencing (R7, R8)').toBe(false);
    });

    it('keeps the abeam plan when the aircraft passed the decision point more than 4 NM off the leg (R6)', async () => {
        // A 150° right turn (onto 215) at 239 kt, as the trainer's R6: the lead is capped at 60 s, so the turn point is
        // 4.31 NM and the decision point 5.64 NM before WWW. A straight line on the outside, 6.2 NM left 5 NM before WWW
        // (R6's start) and 3.0 NM left at the abeam line (R6's 3.0), converging at atan(3.2 / 5) = 32.6°: 6.6 NM off the
        // leg at the decision point, back within 4.0 NM 1.56 NM before the abeam line
        const slope = 3.2 / 5;
        const lineXtk = (alongNm: number) => -(3.0 + slope * alongNm);
        const course = INBOUND + Math.atan(slope) / DEG;
        const closureNm = GS * Math.cos(Math.atan(slope)) / 3600;
        const xtkPerTickNm = GS * Math.sin(Math.atan(slope)) / 3600;
        const lead = Math.min(leadNm(GS, 150), GS * 60 / 3600);
        const tp = lead + rollInNm(GS);
        const dp = tp + GS * 20 / 3600;
        expect(lead).toBeCloseTo(3.983, 3); // The literals of the brief: capped
        expect(rollInNm(GS)).toBeCloseTo(0.332, 3);
        expect(-lineXtk(dp)).toBeGreaterThan(4.5); // Precondition: off the leg at the decision point

        const {flight, aw} = await boot([at(9, lineXtk(9)), at(0, lineXtk(0))], trackPilot(-100, course, course), INBOUND + 150);
        let dtkSwitched = false;
        let secondsWithinTurnPoint = 0;
        const watch = () => {
            // Before the abeam turn: the calculation that starts it shows the next leg's DTK already (#407)
            dtkSwitched ||= flight.nav.activeIdent === 'WWW' && turnStackLength(flight.unit) === 0 && angleBetween(flight.nav.dtkTrue, INBOUND) >= 1;
            if (distanceNm(flight.aircraft, W_POS) < tp) secondsWithinTurnPoint += 0.25;
        };

        // Decided off the leg: the abeam plan
        await flight.flyUntil(() => {
            watch();
            return aw.turnPlan !== null || flight.nav.activeIdent !== 'WWW';
        }, {timeout: 300, description: 'the decision at WWW'});
        expect(flight.nav.activeIdent).toBe('WWW');
        expect(aw.turnPlan).toBe(TurnPlan.AT_ABEAM);
        expect(gpsAlongBefore(flight)).toBeLessThanOrEqual(dp + GPS_TOLERANCE_NM);
        expect(gpsXtkRight(flight)).toBeLessThan(-4.0);

        // The alert off the leg: 36 s before the abeam line at the along-track closure, 4.29 NM off the leg
        await flight.flyUntil(() => {
            watch();
            return flight.nav.waypointAlert || flight.nav.activeIdent !== 'WWW';
        }, {timeout: 120, description: 'the alert off the leg'});
        expect(flight.nav.activeIdent).toBe('WWW');
        let along = gpsAlongBefore(flight);
        expect(along).toBeGreaterThanOrEqual(36 * closureNm - closureNm - GPS_TOLERANCE_NM);
        expect(along).toBeLessThanOrEqual(36 * closureNm + GPS_TOLERANCE_NM);
        expect(gpsXtkRight(flight)).toBeLessThan(-4.0);

        // It stops in the calculation that finds the aircraft within 4.0 NM of the leg (R6: at 3.9 NM)
        await flight.flyUntil(() => {
            watch();
            return !flight.nav.waypointAlert || flight.nav.activeIdent !== 'WWW';
        }, {timeout: 60, description: 'the alert off the leg ended'});
        expect(flight.nav.activeIdent).toBe('WWW');
        const xtkAtEnd = -gpsXtkRight(flight);
        expect(xtkAtEnd).toBeLessThanOrEqual(4.0 + GPS_TOLERANCE_NM);
        expect(xtkAtEnd).toBeGreaterThanOrEqual(4.0 - xtkPerTickNm - GPS_TOLERANCE_NM);

        // The abeam plan's alert: 15 s before the abeam line
        await flight.flyUntil(() => {
            watch();
            return flight.nav.waypointAlert || flight.nav.activeIdent !== 'WWW';
        }, {timeout: 60, description: 'the alert of the abeam plan'});
        expect(flight.nav.activeIdent).toBe('WWW');
        along = gpsAlongBefore(flight);
        expect(along).toBeGreaterThanOrEqual(15 * closureNm - closureNm - GPS_TOLERANCE_NM);
        expect(along).toBeLessThanOrEqual(15 * closureNm + GPS_TOLERANCE_NM);

        // The abeam turn at the abeam line, within one calculation of it, although the straight distance was below the
        // turn point for much longer than that
        await flight.flyUntil(() => {
            watch();
            return turnStackLength(flight.unit) > 0 || flight.nav.activeIdent !== 'WWW';
        }, {timeout: 60, description: 'the turn start at WWW'});
        expect(flight.nav.activeIdent).toBe('WWW');
        expect(dtkSwitched, 'no DTK switch before the abeam line').toBe(false);
        expect(secondsWithinTurnPoint).toBeGreaterThan(10);
        along = gpsAlongBefore(flight);
        expect(along).toBeGreaterThanOrEqual(-closureNm - GPS_TOLERANCE_NM);
        expect(along).toBeLessThanOrEqual(GPS_TOLERANCE_NM);
        expect(aw.turnStack[0].abeamTurnSign).toBe(-1);
    });

    it('drops its own turn when the aircraft goes more than 4 NM off the leg', async () => {
        // Parallel 2.0 NM right of the leg, the outside of the 120° left turn: the turn plan. After the DTK switch the
        // pilot banks 25° to the right, away from the turn, on a circle of 1.79 NM: more than 4.0 NM off the leg from
        // about 1.7 NM before WWW on, and never past the abeam line
        const pilot = new ManualPilot();
        const {flight, aw} = await boot([at(9.75, 2.0), at(0, 2.0)], pilot);
        await flight.flyUntil(() => turnStackLength(flight.unit) > 0 || flight.nav.activeIdent !== 'WWW', {timeout: 300, description: 'the turn start at WWW'});
        expect(flight.nav.activeIdent).toBe('WWW');
        expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);
        await flight.fly(1);
        expect(angleBetween(flight.nav.dtkTrue, NEXT)).toBeLessThan(1); // Precondition: the turn has started
        pilot.bank = 25;

        // Beyond 4.0 NM: the DTK falls back to the leg's and nothing is on the stack
        await flight.flyUntil(() => xtkRight(flight.aircraft) > 4.1 || flight.nav.activeIdent !== 'WWW', {timeout: 120, description: 'beyond 4.0 NM'});
        let samples = 0;
        while (xtkRight(flight.aircraft) > 4.05) {
            expect(flight.nav.activeIdent).toBe('WWW');
            expect(turnStackLength(flight.unit), `${xtkRight(flight.aircraft).toFixed(2)} NM off the leg`).toBe(0);
            expect(angleBetween(flight.nav.dtkTrue, INBOUND)).toBeLessThan(1);
            expect(alongBefore(flight.aircraft), 'before the abeam line').toBeGreaterThan(0);
            samples++;
            await flight.fly(1);
        }
        expect(samples, 'seconds beyond 4.0 NM').toBeGreaterThan(30);

        // Back on the leg the turn plan, which is kept, applies again (the design, section 3.2): the circle brings the
        // aircraft back to the turn point on the inbound course, and the turn starts there again
        await flight.flyUntil(() => turnStackLength(flight.unit) > 0 || flight.nav.activeIdent !== 'WWW', {timeout: 120, description: 'the turn started again'});
        expect(flight.nav.activeIdent).toBe('WWW');
        expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);
        expect(Math.abs(gpsXtkRight(flight))).toBeLessThan(4.0);
        expect(gpsAlongBefore(flight)).toBeLessThanOrEqual(TP + TICK_NM + GPS_TOLERANCE_NM);
    });
});
