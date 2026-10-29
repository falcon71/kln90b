import {describe, expect, it} from 'vitest';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {airport, vor} from '../../harness/navdata/builders';
import {savedFlightplan} from '../../harness/storage';
import {angleBetween, courseDeg, crossTrackNm, distanceNm, EARTH_RADIUS_NM, LatLon, pointFrom} from '../../harness/flight/geo';
import {turnStackLength} from '../../harness/readers';
import {ManualPilot, Pilot, scriptedPath} from '../../harness/flight/pilots';
import {TurnPlan} from '../../../kln90b/data/flightplan/ActiveWaypoint';
import {turnPlanGate} from '../../../kln90b/data/navdata/NavCalculator';

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
/** The cross track to the inbound leg at the GPS position the unit's last calculation used, positive right of it */
const gpsXtkRight = (flight: Flight) => xtkRight(flight.unit.props.sensors.in.gps.coords);
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
 * The abeam pass starts at ABEAM_PASS[0] and converges at 45° on the line to ABEAM_PASS[1], from 8.5 NM right of the leg:
 * beyond the gate of the turn plan (4.9 NM at 239 kt), so the abeam plan from the first calculation (#438). It turns
 * onto the inbound course ABEAM_PASS_TURN_AT before WWW, and flies on about 1.4 NM right of the leg: above the 1.0 NM
 * below which the abeam plan becomes the turn plan (#439), with a margin for the roll-out
 */
const ABEAM_PASS: LatLon[] = [at(9.75, 8.5), at(4.25, 3.0)];
/** Where the abeam pass turns from its converging course onto the inbound course, before WWW */
const ABEAM_PASS_TURN_AT = 3.2;

/**
 * The abeam pass, then onto the next leg: flies INBOUND - 45 until ABEAM_PASS_TURN_AT before WWW (with `converge`, the
 * default; INBOUND throughout without), then INBOUND, and from the abeam line of WWW on `next` (NEXT by default),
 * banking as trackPilot does. The switch to `next` is kept, because flying a next leg that turns back takes the aircraft
 * back across that abeam line
 */
function onToNextPilot(next = NEXT, converge = true): Pilot {
    let onNext = false;
    return {
        commandedBank: ({aircraft}) => {
            const along = alongBefore(aircraft);
            onNext ||= along <= 0;
            return bankToward(aircraft.trackTrue, onNext ? next : converge && along > ABEAM_PASS_TURN_AT ? INBOUND - 45 : INBOUND);
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
 * aircraft starts at `path[0]` at `gs` (239 kt by default) toward `path[1]`. `pilot` flies it, a scripted path through
 * the rest of `path` if not given
 */
async function boot(path: LatLon[], pilot?: Pilot, next = NEXT, kbbbNm = 20, kbbbTurn = 40, gs = GS) {
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
        aircraft: {lat: path[0].lat, lon: path[0].lon, altitudeFt: 3000, groundspeedKt: gs, trackTrue: courseDeg(path[0], path[1])},
    });
    await flight.flyUntil(() => flight.nav.activeIdent !== null, {timeout: 30, description: 'a waypoint active'});
    expect(flight.nav.activeIdent).toBe('WWW');
    return {flight, aw: flight.unit.props.memory.navPage.activeWaypoint};
}

// #438: the turn plan follows the cross track (checked in the KLN 89 trainer, 2026-10-29, docs/kln89-trainer-record.md;
// the design, docs/superpowers/specs/2026-10-29-turn-plan-decision-design.md, section 3.1). The plan is decided at the
// first calculation of a leg, however far the turn point is, by a gate that grows with the ground speed: the turn plan
// up to 83 s of it and at most 4.9 NM of cross track, the abeam plan beyond. From then on a turn plan becomes the abeam
// plan once the cross track is beyond the gate, and an abeam plan stays. The turn plan's alert starts 20 s of
// along-track closure before the turn point, not with the plan
describe('the turn plan follows the cross track (#438)', () => {
    it('computes the gate as 83 s of ground speed, capped at 4.9 NM and floored at 1.0 NM', () => {
        // The trainer's brackets: lead with 1.30 and abeam with 1.48 NM at 60 kt, lead with 2.7 and abeam with 2.8 at
        // 119 kt, lead with 4.8 and abeam with 5.0 at 239 kt. The floor is the design's call (section 3.1)
        expect(turnPlanGate(60)).toBeCloseTo(1.383, 3);
        expect(turnPlanGate(119)).toBeCloseTo(2.744, 3);
        expect(turnPlanGate(239)).toBeCloseTo(4.9, 3);
        expect(turnPlanGate(20)).toBeCloseTo(1.0, 3);
    });

    it('decides at the first calculation, far before the turn point', async () => {
        // Parallel 4.5 NM right of the leg 20 NM before WWW: within the gate of 4.9 NM at 239 kt, so the turn plan,
        // although off the leg (more than 4.0 NM). The turn point is 3.43 NM before WWW, and its alert is not due
        const {flight, aw} = await boot([at(20, 4.5), at(-20, 4.5)], new ManualPilot());
        expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);
        expect(gpsAlongBefore(flight)).toBeGreaterThan(19);
        expect(flight.nav.waypointAlert).toBe(false);
    });

    it('takes the abeam plan beyond the gate at 239 kt', async () => {
        // 5.3 NM right, beyond the 4.9 NM (the trainer's G50: abeam with 5.0 NM at a leg change at 239 kt)
        const {flight, aw} = await boot([at(20, 5.3), at(-20, 5.3)], new ManualPilot());
        expect(aw.turnPlan).toBe(TurnPlan.AT_ABEAM);
        expect(gpsAlongBefore(flight)).toBeGreaterThan(19);
    });

    // The gate of the calculation's ground speed: 2.744 NM at 119 kt, where the trainer was lead with 2.7 and abeam with
    // 2.8 NM. 2.6 and 2.9 NM keep clear of it by the trainer's bracket
    it.each([
        [2.6, TurnPlan.AT_LEAD],
        [2.9, TurnPlan.AT_ABEAM],
    ])('decides %s NM off the leg at 119 kt by the gate of that speed (KLN 89 trainer, 2026-10-28)', async (xtk, plan) => {
        const {flight, aw} = await boot([at(20, xtk), at(-20, xtk)], new ManualPilot(), NEXT, 20, 40, 119);
        expect(aw.turnPlan).toBe(plan);
        expect(gpsAlongBefore(flight)).toBeGreaterThan(19);
    });

    it('turns a lead plan into an abeam plan once the aircraft is beyond the gate (the drift case, the design\'s call)', async () => {
        // 2.0 NM right 15 NM before WWW on a track 20° right of the leg: the turn plan at first, then diverging 0.023 NM
        // a second, beyond 4.9 NM about 7 NM before WWW, before the turn point. The trainer could not show this: its
        // take-home flying re-intercepts the leg from any offset (docs/kln89-trainer-record.md, 2026-10-29)
        const start = at(15, 2.0);
        const {flight, aw} = await boot([start, pointFrom(start, INBOUND + 20, 30)], new ManualPilot());
        expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);

        // Sampled once a second, at the GPS position each calculation used: the turn plan within the gate, the abeam plan
        // in the first calculation beyond it
        const gate = turnPlanGate(GS);
        const samples: string[] = [];
        let lead = 0;
        let abeam = 0;
        for (let s = 0; gpsXtkRight(flight) < gate + 5 * GS * Math.sin(20 * DEG) / 3600; s++) {
            const xtk = gpsXtkRight(flight);
            samples.push(`${xtk.toFixed(3)}:${aw.turnPlan}`);
            expect(s, samples.join(' ')).toBeLessThan(300);
            if (xtk < gate - GPS_TOLERANCE_NM) {
                expect(aw.turnPlan, samples.join(' ')).toBe(TurnPlan.AT_LEAD);
                lead++;
            } else if (xtk > gate + GPS_TOLERANCE_NM) {
                expect(aw.turnPlan, samples.join(' ')).toBe(TurnPlan.AT_ABEAM);
                abeam++;
            }
            await flight.fly(1);
        }
        expect(lead, samples.join(' ')).toBeGreaterThan(60);
        expect(abeam, samples.join(' ')).toBeGreaterThan(3);
        expect(gpsAlongBefore(flight), 'before the turn point').toBeGreaterThan(TP + 1);
        expect(flight.nav.activeIdent).toBe('WWW');
    });

    it('turns a lead plan into an abeam plan beyond the gate of the ground speed, 2.744 NM at 119 kt (the drift case, the design\'s call)', async () => {
        // The drift case below the cap: at 119 kt the gate is 83 s of the ground speed, 2.744 NM, not the 4.9 NM of
        // 239 kt. 2.0 NM right 10 NM before WWW on a track 20° right of the leg: the turn plan at first, then diverging
        // 0.011 NM a second, beyond 2.744 NM about 8 NM before WWW. The pass ends at 3.3 NM, within 4.0 NM of the leg and
        // far before the turn point of the 120° turn at 119 kt (1.2 NM before WWW)
        const gs = 119;
        const gate = 2.744;
        const start = at(10, 2.0);
        const {flight, aw} = await boot([start, pointFrom(start, INBOUND + 20, 30)], new ManualPilot(), NEXT, 20, 40, gs);
        expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);

        // Sampled once a second, at the GPS position each calculation used: the turn plan within the gate, the abeam plan
        // in the first calculation beyond it
        const samples: string[] = [];
        let lead = 0;
        let abeam = 0;
        for (let s = 0; gpsXtkRight(flight) < 3.3; s++) {
            const xtk = gpsXtkRight(flight);
            samples.push(`${xtk.toFixed(3)}:${aw.turnPlan}`);
            expect(s, samples.join(' ')).toBeLessThan(300);
            if (xtk < gate - GPS_TOLERANCE_NM) {
                expect(aw.turnPlan, samples.join(' ')).toBe(TurnPlan.AT_LEAD);
                lead++;
            } else if (xtk > gate + GPS_TOLERANCE_NM) {
                expect(aw.turnPlan, samples.join(' ')).toBe(TurnPlan.AT_ABEAM);
                abeam++;
            }
            await flight.fly(1);
        }
        expect(lead, samples.join(' ')).toBeGreaterThan(50);
        expect(abeam, samples.join(' ')).toBeGreaterThan(30);
        expect(gpsAlongBefore(flight), 'before the turn point').toBeGreaterThan(5);
        expect(flight.nav.activeIdent).toBe('WWW');
    });

    it('stays abeam between the gate and 1.0 NM', async () => {
        // 5.5 NM right 18 NM before WWW, beyond the gate: the abeam plan. Converging at 30° onto a parallel about 1.5 NM
        // right of the leg: within the gate from about 17 NM before WWW on, and above the 1.0 NM below which the abeam plan
        // becomes the turn plan (#439)
        let onParallel = false;
        const pilot: Pilot = {
            commandedBank: ({aircraft}) => {
                onParallel ||= xtkRight(aircraft) <= 1.75;
                return bankToward(aircraft.trackTrue, onParallel ? INBOUND : INBOUND - 30);
            },
        };
        const start = at(18, 5.5);
        const {flight, aw} = await boot([start, pointFrom(start, INBOUND - 30, 30)], pilot);
        expect(aw.turnPlan).toBe(TurnPlan.AT_ABEAM);

        // Every second up to the turn start: the abeam plan, and no turn at the turn point
        const samples: string[] = [];
        let withinGate = 0;
        for (let s = 0; turnStackLength(flight.unit) === 0 && flight.nav.activeIdent === 'WWW'; s++) {
            const xtk = gpsXtkRight(flight);
            samples.push(`${gpsAlongBefore(flight).toFixed(2)}:${xtk.toFixed(2)}:${aw.turnPlan}`);
            expect(s, samples.join(' ')).toBeLessThan(400);
            expect(aw.turnPlan, samples.join(' ')).toBe(TurnPlan.AT_ABEAM);
            expect(xtk, samples.join(' ')).toBeGreaterThan(1.2);
            if (xtk < turnPlanGate(GS)) withinGate++;
            await flight.fly(1);
        }
        expect(withinGate, 'seconds within the gate').toBeGreaterThan(200);
        // The turn starts at the abeam line, as the turn of no size
        expect(flight.nav.activeIdent).toBe('WWW');
        const startAlong = alongBefore(flight.aircraft);
        expect(startAlong).toBeGreaterThanOrEqual(-0.07);
        expect(startAlong).toBeLessThanOrEqual(0.02);
        expect(aw.turnStack[0].abeamTurnSign).not.toBeNull();
    });

    it('keeps a started lead turn whatever the cross track below 4.0 NM', async () => {
        // A 150° left turn (onto 275) at 119 kt, passed parallel 2.5 NM right of the leg (the outside), within the gate of
        // 2.744 NM: the turn plan. The lead is capped at 60 s of ground speed, 1.98 NM, and the turn point lies 2.10 NM
        // before WWW. Once there the pilot diverges 20° right to 3.3 NM, beyond the gate, then turns left onto 335 toward
        // the leg and crosses the outside bisector ray (080) near WWW, within 4.0 NM throughout
        const gs = 119;
        const tp = Math.min(leadNm(gs, 150), gs * 60 / 3600) + rollInNm(gs);
        let phase = 0;
        const pilot: Pilot = {
            commandedBank: ({aircraft}) => {
                if (phase === 0 && alongBefore(aircraft) <= tp) phase = 1;
                if (phase === 1 && xtkRight(aircraft) >= 3.3) phase = 2;
                return bankToward(aircraft.trackTrue, [INBOUND, INBOUND + 20, INBOUND - 90][phase]);
            },
        };
        const {flight, aw} = await boot([at(12, 2.5), at(-20, 2.5)], pilot, INBOUND - 150 + 360, 20, 40, gs);
        expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);
        await flight.flyUntil(() => aw.ownTurnStarted || flight.nav.activeIdent !== 'WWW', {timeout: 400, description: 'the turn start at WWW'});
        expect(flight.nav.activeIdent).toBe('WWW');

        // Every second from the turn start to the sequencing: the turn and its plan stay
        const samples: string[] = [];
        let maxXtk = 0;
        for (let s = 0; flight.nav.activeIdent === 'WWW'; s++) {
            const xtk = gpsXtkRight(flight);
            maxXtk = Math.max(maxXtk, xtk);
            samples.push(`${xtk.toFixed(2)}:${turnStackLength(flight.unit)}:${aw.turnPlan}`);
            expect(s, samples.join(' ')).toBeLessThan(300);
            expect(Math.abs(xtk), samples.join(' ')).toBeLessThan(4.0);
            expect(aw.ownTurnStarted, samples.join(' ')).toBe(true);
            expect(turnStackLength(flight.unit), samples.join(' ')).toBeGreaterThan(0);
            expect(aw.turnPlan, samples.join(' ')).toBe(TurnPlan.AT_LEAD);
            await flight.fly(1);
        }
        expect(maxXtk, 'precondition: beyond the gate in the turn').toBeGreaterThan(turnPlanGate(gs) + 0.3);
        expect(flight.nav.activeIdent).toBe('KBBB');
    });

    it('starts the lead plan\'s alert 20 s of closure before the turn point, not at the decision', async () => {
        // On 035, converging at 30°, from 4.5 NM right 10 NM before WWW: within the gate, so the turn plan from the first
        // calculation, 1.37 NM right where the alert is due and 0.70 NM at the turn point. 20 s at the closure along the
        // leg, 239 kt × cos 30°, are 1.150 NM, not the 1.328 NM of 20 s at the ground speed (4-8; checked in the KLN 89
        // trainer, 2026-10-29: 20 to 23 s of along-track closure on every lead pass)
        const start = at(10, 4.5);
        const {flight, aw} = await boot([start, pointFrom(start, INBOUND - 30, 30)], trackPilot(-100, INBOUND - 30, INBOUND - 30));
        expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);
        expect(flight.nav.waypointAlert, 'no alert at the decision').toBe(false);

        await flight.flyUntil(() => flight.nav.waypointAlert || turnStackLength(flight.unit) > 0 || flight.nav.activeIdent !== 'WWW', {timeout: 300, description: 'the alert at WWW'});
        expect(flight.nav.activeIdent).toBe('WWW');
        expect(turnStackLength(flight.unit)).toBe(0);
        // Within the calculation tick after the turn point came within 20 s, measured at the GPS position the calculation
        // used
        const closureNm = GS * Math.cos(30 * DEG) / 3600;
        const beforeTurnPoint = gpsAlongBefore(flight) - TP;
        expect(beforeTurnPoint).toBeGreaterThanOrEqual(20 * closureNm - closureNm - GPS_TOLERANCE_NM);
        expect(beforeTurnPoint).toBeLessThanOrEqual(20 * closureNm + GPS_TOLERANCE_NM);

        // It holds up to the turn start at the turn point, and with the turn
        await flight.flyUntil(() => {
            expect(flight.nav.waypointAlert).toBe(true);
            return turnStackLength(flight.unit) > 0 || flight.nav.activeIdent !== 'WWW';
        }, {timeout: 60, description: 'the turn start at WWW'});
        expect(flight.nav.activeIdent).toBe('WWW');
        expect(flight.nav.waypointAlert).toBe(true);
    });

    it('takes the abeam plan in the calculation after a jump beyond the gate onto the same leg (KLN 89 trainer, 2026-10-28, 2026-10-29)', async () => {
        // Parallel 2.0 NM right 18 NM before WWW: the turn plan. A jump to 5.5 NM right of the same leg, beyond the gate
        // of 4.9 NM at 239 kt: the trainer decides again at a SET 1 jump onto the same leg, and here the new cross track
        // gives the abeam plan in the first calculation after the jump, with no hook for the jump
        const {flight, aw} = await boot([at(18, 2.0), at(-20, 2.0)], new ManualPilot());
        expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);
        flight.teleport(at(alongBefore(flight.aircraft), 5.5));
        await flight.fly(1);
        expect(Math.abs(gpsXtkRight(flight) - 5.5), 'precondition: the calculation used the jumped position').toBeLessThan(0.05);
        expect(flight.nav.activeIdent).toBe('WWW');
        expect(aw.turnPlan).toBe(TurnPlan.AT_ABEAM);
    });

    it('keeps a jump closer than the gate on the abeam plan (the design\'s call)', async () => {
        // Parallel 5.5 NM right: the abeam plan. A jump to 3.0 NM right, within the gate: the trainer decides again at a
        // re-initialization of the position, which would give the turn plan, but no trainer pass shows this direction. The
        // emulation keeps the abeam plan until the 1.0 NM check (#439): it is rare in the sim, and covering it needs a hook
        // for the jump (the design, section 3.1)
        const {flight, aw} = await boot([at(18, 5.5), at(-20, 5.5)], new ManualPilot());
        expect(aw.turnPlan).toBe(TurnPlan.AT_ABEAM);
        flight.teleport(at(alongBefore(flight.aircraft), 3.0));
        await flight.fly(3);
        expect(Math.abs(gpsXtkRight(flight) - 3.0), 'precondition: 3.0 NM right').toBeLessThan(0.05);
        expect(aw.turnPlan).toBe(TurnPlan.AT_ABEAM);
    });

    it('keeps a lead plan between 4.0 and 4.9 NM at 239 kt and turns at the lead once back on the leg', async () => {
        // Parallel 4.6 NM right 10 NM before WWW: within the gate but off the leg, the turn plan. From 8 NM before WWW it
        // converges at 20°, back within 4.0 NM about 6.3 NM before WWW and 2.9 NM right at the turn point, where the turn
        // starts (checked in the KLN 89 trainer, 2026-10-28 and 2026-10-29, Y2 and G48: lead with 4.5 and 4.8 NM off the leg)
        const {flight, aw} = await boot([at(10, 4.6), at(-20, 4.6)], trackPilot(8, INBOUND, INBOUND - 20));
        expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);
        let offLegSeconds = 0;
        await flight.flyUntil(() => {
            if (gpsXtkRight(flight) > 4.0) {
                offLegSeconds += 0.25;
                expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);
            }
            return turnStackLength(flight.unit) > 0 || flight.nav.activeIdent !== 'WWW';
        }, {timeout: 300, description: 'the turn start at WWW'});
        expect(offLegSeconds, 'seconds off the leg').toBeGreaterThan(20);
        expect(flight.nav.activeIdent).toBe('WWW');
        const startAlong = alongBefore(flight.aircraft);
        expect(startAlong).toBeGreaterThanOrEqual(TP);
        expect(startAlong).toBeLessThanOrEqual(TP + TICK_NM + 0.05);
        expect(xtkRight(flight.aircraft)).toBeGreaterThan(2.5);
        expect(angleBetween(flight.nav.dtkTrue, NEXT)).toBeLessThan(1);
    });
});

// #439: the passes below fly a 150° left turn (onto 275) at 119 kt, the turn of the started-lead-turn test above. The lead
// is capped at 60 s of ground speed, 1.98 NM, and flown on the tighter circle tangent to both legs; the turn point lies
// 2.10 NM before WWW and the gate is 2.744 NM
const GS_439 = 119;
const NEXT_439 = INBOUND - 150 + 360;
const LEAD_439 = Math.min(leadNm(GS_439, 150), GS_439 * 60 / 3600);
const TP_439 = LEAD_439 + rollInNm(GS_439);
const TICK_439 = GS_439 / 3600;
/** The along-track closure of one calculation on a track 20° to the leg */
const CLOSURE_439 = TICK_439 * Math.cos(20 * DEG);
/** The radius of the capped turn: the circle tangent to both legs LEAD_439 from WWW */
const RADIUS_439 = LEAD_439 / Math.tan(75 * DEG);
/** The center of that circle: RADIUS_439 left of the inbound leg, LEAD_439 before WWW */
const CENTER_439 = pointFrom(at(LEAD_439, 0), INBOUND - 90, RADIUS_439);

/**
 * The converging pass of #439: from 4.3 NM right of the leg, beyond the gate of 2.744 NM, so the abeam plan from the first
 * calculation (#438), on a straight track 20° toward the leg (045) that comes to 1.0 NM right `crossAlong` before WWW.
 * The cross track falls by 0.011 NM and the along-track distance by 0.031 NM a calculation. `pilot` flies it, the straight
 * track throughout if not given
 */
async function bootConvergingPass(crossAlong: number, pilot?: Pilot) {
    const start = at(crossAlong + 3.3 / Math.tan(20 * DEG), 4.3);
    const booted = await boot([start, pointFrom(start, INBOUND - 20, 30)], pilot ?? trackPilot(-100, INBOUND - 20, INBOUND - 20), NEXT_439, 20, 40, GS_439);
    expect(gpsXtkRight(booted.flight), 'precondition: beyond the gate at the first calculation').toBeGreaterThan(turnPlanGate(GS_439) + 0.3);
    expect(booted.aw.turnPlan).toBe(TurnPlan.AT_ABEAM);
    return booted;
}

/** The state after one calculation, at the GPS position it used */
interface CalcSample {
    t: number;
    along: number;
    xtk: number;
    plan: TurnPlan | null;
    started: boolean;
    alert: boolean;
    ident: string | null;
}

/**
 * Flies one calculation at a time and samples each, until `done` holds for a sample (which is the last one), at most `max`
 * calculations
 */
async function sampleCalcs(flight: Flight, done: (s: CalcSample) => boolean, max: number): Promise<CalcSample[]> {
    const aw = flight.unit.props.memory.navPage.activeWaypoint;
    const samples: CalcSample[] = [];
    for (; ;) {
        await flight.fly(1);
        const s: CalcSample = {
            t: flight.t, along: gpsAlongBefore(flight), xtk: gpsXtkRight(flight), plan: aw.turnPlan,
            started: aw.ownTurnStarted, alert: flight.nav.waypointAlert, ident: flight.nav.activeIdent,
        };
        samples.push(s);
        if (done(s)) return samples;
        expect(samples.length, describeSamples(samples)).toBeLessThan(max);
    }
}

const describeSamples = (samples: CalcSample[]) =>
    samples.map(s => `${s.along.toFixed(2)}:${s.xtk.toFixed(3)}:${s.plan}:${s.started ? 'T' : '-'}:${s.alert ? 'A' : '-'}`).join(' ');

/**
 * The first sample at or after `from` whose calculation runs the check of the abeam plan, every 12 s, with the check
 * phase set to `phase` before the first sample: sample i is the calculation i + 1 after that, and the check runs where
 * the seconds since the last check come to 12
 */
function nextCheck(phase: number, from: number): number {
    let i = from;
    while ((phase + i + 1) % 12 !== 0) i++;
    return i;
}

/** The distance of the GPS position the last calculation used to the circle of the capped 150° turn at WWW */
const distToTurnCircle = (flight: Flight) => Math.abs(distanceNm(flight.unit.props.sensors.in.gps.coords, CENTER_439) - RADIUS_439);

// #439: on the abeam plan the unit flies the normal turn once the cross track to the inbound leg is below 1.0 NM, at a
// check that runs every 11 to 12 s whatever the leg (checked in the KLN 89 trainer, 2026-10-28, P1 to P3, r1 to r5, a13
// to a16, and 2026-10-29 at 239 kt; docs/kln89-trainer-record.md; the design,
// docs/superpowers/specs/2026-10-29-turn-plan-decision-design.md, section 3.2). The plan then becomes the turn plan: past
// the turn point the turn circle starts at once, before it at the turn point. Above 1.0 NM, and once the turn of no size
// has started, the abeam plan stays. The period of 12 s is the design's call within the trainer's 11 to 12
describe('the abeam plan switches to the normal turn (#439)', () => {
    it('starts the normal turn within one check period once the cross track is below 1.0 NM, past the turn point', async () => {
        // Below 1.0 NM 1.0 NM before WWW, 1.1 NM past the turn point: the switch comes at most 11 calculations later, at
        // most 0.34 NM on, before the abeam line
        const {flight, aw} = await bootConvergingPass(1.0);
        const samples = await sampleCalcs(flight, s => s.started || s.ident !== 'WWW', 600);
        const log = describeSamples(samples);
        const below = samples.findIndex(s => Math.abs(s.xtk) < 1.0);
        const start = samples.length - 1;
        expect(below, log).toBeGreaterThanOrEqual(0);
        // The abeam plan up to the first calculation below 1.0 NM
        samples.slice(0, below).forEach(s => expect(s.plan, log).toBe(TurnPlan.AT_ABEAM));
        expect(samples[start].ident, log).toBe('WWW');
        expect(start - below, log).toBeLessThanOrEqual(11);
        // The turn starts in the calculation of the switch, at once
        expect(samples[start - 1].plan, log).toBe(TurnPlan.AT_ABEAM);
        // Past the turn point and before the abeam line
        expect(samples[start].along, log).toBeLessThan(TP_439 - 0.5);
        expect(samples[start].along, log).toBeGreaterThan(0.3);
        // The turn plan's turn: a circle, not the turn of no size, with the alert on and the DTK of the next leg
        expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);
        expect(turnStackLength(flight.unit)).toBeGreaterThan(0);
        expect(aw.turnStack.every(e => e.abeamTurnSign === null)).toBe(true);
        expect(flight.nav.waypointAlert).toBe(true);
        expect(angleBetween(flight.nav.dtkTrue, NEXT_439)).toBeLessThan(1);

        // From the calculation after the start, once the roll-in behind the aircraft is off the stack, XTK is the distance
        // to the arc, not to WWW (line 2 the distance to the arc, checked in the KLN 89 trainer, 2026-10-28)
        let apart = 0;
        for (let s = 0; s < 10; s++) {
            await flight.fly(1);
            expect(flight.nav.activeIdent).toBe('WWW');
            expect(flight.nav.waypointAlert).toBe(true);
            const arc = distToTurnCircle(flight);
            const toWww = distanceNm(flight.unit.props.sensors.in.gps.coords, W_POS);
            expect(Math.abs(Math.abs(flight.nav.xtkNm!) - arc), `${flight.nav.xtkNm} arc ${arc} WWW ${toWww}`).toBeLessThan(0.02);
            apart = Math.max(apart, Math.abs(arc - toWww));
        }
        expect(apart, 'precondition: the arc and WWW are told apart').toBeGreaterThan(0.2);
    });

    // The passes are identical up to the check phase set before their calculations, which places the switch before the
    // point 20 s of closure before the turn point in one and after it in the other
    it.each([
        ['at 20 s of closure before the turn point, after the switch', 6, true],
        ['at the switch, past the point 20 s of closure before the turn point', 11, false],
    ])('starts the turn at the turn point when the switch comes before it, the alert %s', async (_, phase, switchFirst) => {
        // Below 1.0 NM where the along-track distance to WWW is the lead plus 1.0 NM, 0.88 NM before the turn point: the
        // switch comes at most 0.34 NM later, before the turn point
        const {flight} = await bootConvergingPass(LEAD_439 + 1.0);
        flight.unit.props.memory.navPage.turnPlanCheckPhase = phase;
        const samples = await sampleCalcs(flight, s => s.started || s.ident !== 'WWW', 600);
        const log = describeSamples(samples);
        const below = samples.findIndex(s => Math.abs(s.xtk) < 1.0);
        const switched = samples.findIndex(s => s.plan === TurnPlan.AT_LEAD);
        const within20 = samples.findIndex(s => s.along - TP_439 <= 20 * CLOSURE_439);
        const alert = samples.findIndex(s => s.alert);
        const start = samples.length - 1;
        expect(samples[start].ident, log).toBe('WWW');
        expect(below, log).toBeGreaterThanOrEqual(0);
        expect(switched, `below 1.0 NM at ${below}`).toBe(nextCheck(phase, below));
        expect(samples[switched].along, 'precondition: the switch before the turn point').toBeGreaterThan(TP_439 + 2 * TICK_439);
        if (switchFirst) {
            expect(switched, 'precondition: the switch before the 20 s').toBeLessThan(within20);
        } else {
            expect(switched, 'precondition: the switch after the 20 s').toBeGreaterThan(within20);
        }
        // The alert starts in the later of the two calculations
        expect(alert, log).toBe(Math.max(switched, within20));
        // The turn starts at the turn point, within the calculation tick ahead (NavCalculator starts it a tick early
        // rather than late), as a circle, with the alert on
        expect(samples[start].along, log).toBeGreaterThanOrEqual(TP_439 + TICK_439 - CLOSURE_439 - GPS_TOLERANCE_NM);
        expect(samples[start].along, log).toBeLessThanOrEqual(TP_439 + TICK_439 + GPS_TOLERANCE_NM);
        const aw = flight.unit.props.memory.navPage.activeWaypoint;
        expect(aw.turnStack.every(e => e.abeamTurnSign === null)).toBe(true);
        expect(samples[start].alert).toBe(true);
    });

    it('flies the zero-size turn when the cross track stays at or above 1.0 NM', async () => {
        // The converging pass, onto the inbound course once 1.25 NM right: parallel about 1.2 NM right of the leg, within
        // the gate for several checks
        let onParallel = false;
        const pilot: Pilot = {
            commandedBank: ({aircraft}) => {
                onParallel ||= xtkRight(aircraft) <= 1.25;
                return bankToward(aircraft.trackTrue, onParallel ? INBOUND : INBOUND - 20);
            },
        };
        const {flight, aw} = await bootConvergingPass(2.0, pilot);
        const samples = await sampleCalcs(flight, s => turnStackLength(flight.unit) > 0 || s.ident !== 'WWW', 900);
        const log = describeSamples(samples);
        samples.forEach(s => expect(s.plan, log).toBe(TurnPlan.AT_ABEAM));
        const nearest = Math.min(...samples.map(s => s.xtk));
        expect(nearest, 'precondition: at or above 1.0 NM, with a margin').toBeGreaterThan(1.1);
        expect(nearest, 'precondition: close to 1.0 NM').toBeLessThan(1.3);
        expect(samples.filter(s => s.xtk < turnPlanGate(GS_439)).length, 'precondition: several checks within the gate')
            .toBeGreaterThan(5 * 12);
        // The turn of no size at the abeam line, within one calculation of it
        const last = samples[samples.length - 1];
        expect(last.ident).toBe('WWW');
        expect(last.along, log).toBeGreaterThanOrEqual(-TICK_439 - GPS_TOLERANCE_NM);
        expect(last.along, log).toBeLessThanOrEqual(GPS_TOLERANCE_NM);
        expect(aw.turnStack.map(e => e.abeamTurnSign)).toEqual([1]);
    });

    it('does not switch once the zero-size turn has started', async () => {
        // The pass above, which turns 30° left onto 035 at the abeam line: the cross track to the inbound leg falls below
        // 1.0 NM about 18 s after the turn of no size started, and stays below until WWW is sequenced on the outside
        // bisector ray (080), about 54 s after it started, three checks later (the design, section 3.2; the trainer's T7
        // repeat reached 0.99 NM 1.25 s before its abeam line and flew the turn of no size, checked in the KLN 89 trainer,
        // 2026-10-29)
        let phase = 0;
        const pilot: Pilot = {
            commandedBank: ({aircraft}) => {
                if (phase === 0 && xtkRight(aircraft) <= 1.25) phase = 1;
                if (phase === 1 && alongBefore(aircraft) <= 0) phase = 2;
                return bankToward(aircraft.trackTrue, [INBOUND - 20, INBOUND, INBOUND - 30][phase]);
            },
        };
        const {flight, aw} = await bootConvergingPass(2.0, pilot);
        const before = await sampleCalcs(flight, s => turnStackLength(flight.unit) > 0 || s.ident !== 'WWW', 900);
        expect(before[before.length - 1].ident).toBe('WWW');
        expect(Math.min(...before.map(s => s.xtk)), 'precondition: above 1.0 NM up to the abeam line').toBeGreaterThan(1.1);
        const abeamTurn = aw.turnStack[0];
        expect(abeamTurn.abeamTurnSign).toBe(1);

        // Every calculation up to the sequencing: the turn of no size and the abeam plan stay
        const after = await sampleCalcs(flight, s => {
            if (s.ident === 'WWW') {
                const log = `${s.xtk.toFixed(3)}:${s.plan}`;
                expect(s.plan, log).toBe(TurnPlan.AT_ABEAM);
                expect(aw.turnStack, log).toEqual([abeamTurn]);
                expect(Math.abs(flight.nav.xtkNm! - distanceNm(flight.unit.props.sensors.in.gps.coords, W_POS)), log).toBeLessThan(0.02);
            }
            return s.ident !== 'WWW';
        }, 200);
        expect(after[after.length - 1].ident).toBe('KBBB');
        expect(after.filter(s => s.ident === 'WWW' && s.xtk < 1.0).length, 'precondition: below 1.0 NM for more than two check periods')
            .toBeGreaterThan(24);
    });

    /** The sample of the first calculation below 1.0 NM in the passes below, the same in both */
    const BELOW_439 = 292;
    // Two passes alike up to the check phase, set before their calculations 6 s apart (one unit per test, so a pass each):
    // the switch of each comes at the first check from the first calculation below 1.0 NM on, at most 11 calculations
    // later, so the delays of the two differ by 6 s (the trainer: identical passes switched 4.0, 10.5 and 10.0 s after the
    // first reading below 1.0)
    it.each([
        [0, 7],
        [6, 1],
    ])('checks every 12 s whatever the leg (the check phase set to %s, a switch %s s after the first calculation below 1.0 NM)', async (phase, delay) => {
        const {flight} = await bootConvergingPass(LEAD_439 + 2.0);
        const navPage = flight.unit.props.memory.navPage;
        navPage.turnPlanCheckPhase = phase;
        const samples = await sampleCalcs(flight, s => s.plan === TurnPlan.AT_LEAD || s.ident !== 'WWW', 900);
        const log = describeSamples(samples);
        const below = samples.findIndex(s => Math.abs(s.xtk) < 1.0);
        const switched = samples.length - 1;
        expect(samples[switched].ident, log).toBe('WWW');
        expect(samples[switched].started, 'precondition: switched before the turn point').toBe(false);
        expect(below, 'precondition: the passes alike').toBe(BELOW_439);
        expect(switched, log).toBe(nextCheck(phase, below));
        expect(switched - below).toBe(delay);

        // The check runs on over the sequencing of WWW and the activation of KBBB: a step of one a calculation
        const phases: number[] = [navPage.turnPlanCheckPhase];
        await sampleCalcs(flight, s => {
            phases.push(navPage.turnPlanCheckPhase);
            return s.ident !== 'WWW';
        }, 300);
        await flight.fly(1);
        phases.push(navPage.turnPlanCheckPhase);
        expect(flight.nav.activeIdent).toBe('KBBB');
        phases.slice(1).forEach((p, i) => expect(p, phases.join(' ')).toBe((phases[i] + 1) % 12));
    });

    it('holds the gate at 1.0 NM at 20 kt, so the plan does not toggle', async () => {
        // 20 kt, the ground speed of a taxi (the unit sees only the ground speed), 0.6 NM right of the leg: 83 s of the
        // ground speed are 0.46 NM, below the cross track, but the gate is floored at 1.0 NM (#438, the design's call).
        // Without the floor the plan would turn abeam beyond the gate and back to the turn plan at every check below
        // 1.0 NM (the design, Review Focus 3)
        expect(20 * 83 / 3600).toBeLessThan(0.6);
        const {flight, aw} = await boot([at(5, 0.6), at(-20, 0.6)], new ManualPilot(), NEXT, 20, 40, 20);
        const plans: (TurnPlan | null)[] = [];
        for (let s = 0; s < 60; s++) {
            await flight.fly(1);
            plans.push(aw.turnPlan);
        }
        expect(flight.nav.activeIdent).toBe('WWW');
        expect(Math.abs(gpsXtkRight(flight) - 0.6)).toBeLessThan(0.05);
        expect(plans.every(p => p === TurnPlan.AT_LEAD), plans.join(' ')).toBe(true);
    });
});

// The turn start off course within 4.0 NM of the leg (checked in the KLN 89 trainer, 2026-10-20,
// docs/kln89-trainer-data/2026-10-20/report-turn-start.md): on the turn plan the unit starts the turn where the
// along-track distance to the waypoint is the lead, on the abeam plan it waits for the abeam line and turns there on a
// turn of no size. Which plan applies follows the cross track (#438, the tests above): at 239 kt the turn plan up to
// 4.9 NM, and an abeam plan, decided beyond that, kept while the aircraft comes closer. The tests keep clear of the gate
// and stay above the 1.0 NM below which the abeam plan becomes the turn plan (#439)
describe('the turn start off course on the leg (#157)', () => {
    it('derives the turn point of the 120° turn at 239 kt', () => {
        // The literals of the brief, so that a wrong derivation above cannot move both sides: L 3.10, roll-in 0.332
        expect(leadNm(GS, 120)).toBeCloseTo(3.10, 2);
        expect(rollInNm(GS)).toBeCloseTo(0.332, 3);
        expect(TP).toBeCloseTo(3.43, 2);
    });

    it('takes the turn plan within the gate and starts the turn at the lead distance along the track 1.4 NM off course (KLN 89 trainer, 2026-10-20)', async () => {
        // Converging at 30° from 4.5 NM right 12 NM before WWW (the outside of the turn), within the gate: the turn plan
        // from the first calculation. 7.0 NM before WWW it turns onto a parallel about 1.4 NM right of the leg. The
        // trainer's T3 and T8 turned at T with 1.1 to 1.2 NM of cross track, outside
        const start = at(12, 4.5);
        const {flight, aw} = await boot([start, pointFrom(start, INBOUND - 30, 30)], trackPilot(7.0, INBOUND - 30, INBOUND));
        expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);

        // The alert starts 20 s before the turn point at the along-track closure, on the parallel the ground speed
        // (#438): within the calculation tick after the turn point came within 20 s, at the GPS position it used
        await flight.flyUntil(() => flight.nav.waypointAlert || flight.nav.activeIdent !== 'WWW', {timeout: 300, description: 'the alert at WWW'});
        expect(flight.nav.activeIdent).toBe('WWW');
        const beforeTurnPoint = gpsAlongBefore(flight) - TP;
        expect(beforeTurnPoint).toBeGreaterThanOrEqual(20 * TICK_NM - TICK_NM - GPS_TOLERANCE_NM);
        expect(beforeTurnPoint).toBeLessThanOrEqual(20 * TICK_NM + GPS_TOLERANCE_NM);
        expect(Math.abs(xtkRight(flight.aircraft) - 1.4), 'about 1.4 NM right at the alert').toBeLessThan(0.2);
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

        // WWW is sequenced past the bisector. The plan belongs to WWW: the sequencing clears it, and KBBB, 20 NM away,
        // takes its own in its first calculation, by the cross track to its own leg, small there: the turn plan (#438).
        // Once the turn at WWW has left the stack (the aircraft flies on, away from the leg to KBBB, until it is 4.0 NM
        // off it, still within the gate) there is no alert for KBBB
        await flight.flyUntil(() => flight.nav.activeIdent !== 'WWW', {timeout: 120, description: 'WWW sequenced'});
        expect(flight.nav.activeIdent).toBe('KBBB');
        expect(pastBisector(flight.aircraft)).toBe(true);
        expect(aw.turnPlan).toBeNull();
        await flight.flyUntil(() => turnStackLength(flight.unit) === 0, {timeout: 300, description: 'the turn at WWW left the stack'});
        await flight.fly(1);
        expect(flight.nav.activeIdent).toBe('KBBB');
        expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);
        expect(flight.nav.waypointAlert).toBe(false);
    });

    it('takes the abeam plan beyond the gate and keeps it while the cross track falls, above 1.0 NM (KLN 89 trainer, 2026-10-20, 2026-10-28, 2026-10-29)', async () => {
        // The abeam pass: decided on the abeam plan 8.5 NM right in the first calculation, then about 1.4 NM right of the
        // leg on the inbound course, well within the gate. The trainer kept the abeam plan as the cross track fell, and
        // waited for the abeam line, as long as it stayed above 1.0 NM (2026-10-28: without a reading below 1.0 NM the
        // turn of no size came at the abeam line; below 1.0 NM the turn plan, #439). The turn onto the inbound course
        // comes early enough for the aircraft to be on the parallel at the alert, which the 15 s are measured on
        const {flight, aw} = await boot(ABEAM_PASS, trackPilot(ABEAM_PASS_TURN_AT, INBOUND - 45, INBOUND));
        const dtkOnInbound = () => angleBetween(flight.nav.dtkTrue, INBOUND) < 1;
        expect(aw.turnPlan).toBe(TurnPlan.AT_ABEAM);

        // No alert along the leg to the abeam alert, and the abeam plan throughout
        await flight.flyUntil(() => {
            expect(aw.turnPlan).toBe(TurnPlan.AT_ABEAM);
            return alongBefore(flight.aircraft) <= 4.0 || flight.nav.activeIdent !== 'WWW';
        }, {timeout: 300, description: '4.0 NM before WWW'});
        expect(flight.nav.waypointAlert).toBe(false);
        expect(aw.turnPlan).toBe(TurnPlan.AT_ABEAM);

        // The alert starts 15 s before the abeam line at the along-track closure: 0.996 NM at 239 kt on the parallel
        let dtkSwitchedEarly = false;
        await flight.flyUntil(() => {
            dtkSwitchedEarly ||= !dtkOnInbound();
            expect(aw.turnPlan).toBe(TurnPlan.AT_ABEAM);
            return flight.nav.waypointAlert || flight.nav.activeIdent !== 'WWW';
        }, {timeout: 120, description: 'the alert at WWW'});
        expect(flight.nav.activeIdent).toBe('WWW');
        // Within the calculation tick after the along-track distance came within 15 s, measured at the GPS position the
        // calculation used: (15 - 1) s to 15 s of flight before the abeam line on the parallel
        const alertAlong = gpsAlongBefore(flight);
        expect(alertAlong).toBeGreaterThanOrEqual(15 * TICK_NM - TICK_NM - GPS_TOLERANCE_NM);
        expect(alertAlong).toBeLessThanOrEqual(15 * TICK_NM + GPS_TOLERANCE_NM);
        const xtkAtAlert = xtkRight(flight.aircraft);
        expect(xtkAtAlert, 'within the gate at the alert').toBeLessThan(2.0);
        expect(xtkAtAlert, 'above the 1.0 NM of the turn plan (#439), with a margin').toBeGreaterThan(1.2);

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
        const {flight, aw} = await boot(ABEAM_PASS, onToNextPilot());
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
        const {flight, aw} = await boot(ABEAM_PASS, onToNextPilot(), NEXT, kbbbNm, -40);
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
    // a turn of its own: a 30° left turn at WWW onto 035, passed parallel 3.5 NM right of the inbound leg at 119 kt,
    // beyond the gate of 2.744 NM, so that WWW takes the abeam plan; KBBB 0.5 NM on, with a 90° right turn onto 125. From
    // WWW's abeam line the aircraft flies 035 about 3 NM right of the leg to KBBB, the inside of KBBB's turn: KBBB takes
    // the abeam plan too, and the aircraft is past KBBB's inside bisector at once, while WWW's abeam line on the leg to
    // KBBB is still ahead. Kept, the run-out of WWW showed the DTK and XTK of the leg to KBBB with KCCC active. At 239 kt
    // the gate (4.9 NM) lies beyond the 4.0 NM of the leg, so a leg taken this close is never decided on the abeam plan
    // (#438)
    it('drops the run-out when the next waypoint is sequenced without a turn of its own (the design\'s call)', async () => {
        const next = 35;
        const gs = 119;
        const tickNm = gs / 3600;
        const {flight, aw} = await boot([at(10, 3.5), at(-20, 3.5)], onToNextPilot(next, false), next, 0.5, 90, gs);
        await flight.flyUntil(() => flight.nav.activeIdent !== 'WWW', {timeout: 600, description: 'WWW sequenced'});
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
        expect(xtkToKbbbBefore).toBeGreaterThan(turnPlanGate(gs) + 0.1);
        expect(xtkToKbbbBefore).toBeLessThan(4.0 - 0.1);
        // Precondition: WWW's abeam line on the leg to KBBB is more than a tick ahead, so the run-out did not end by itself
        const pos = flight.aircraft;
        expect(distanceNm(W_POS, pos) * Math.cos((courseDeg(W_POS, pos) - next) * DEG)).toBeLessThan(-tickNm - POSITION_TOLERANCE_NM);

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
        const {flight, aw} = await boot(ABEAM_PASS, trackPilot(ABEAM_PASS_TURN_AT, INBOUND - 45, INBOUND));
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
        // A straight 30° convergence on 035, from 7.1 NM right 9.75 NM before WWW, beyond the gate: the abeam plan from the
        // first calculation (#438). 1.5 NM right at the abeam line, above the 1.0 NM of the turn plan (#439). 15 s at the
        // closure along the leg, 239 kt × cos 30°, are 0.862 NM: the alert starts there, not at the 0.996 NM of 15 s at
        // the ground speed
        const start = at(9.75, 1.5 + 9.75 * Math.tan(30 * DEG));
        const {flight, aw} = await boot([start, at(0, 1.5)], trackPilot(-100, INBOUND - 30, INBOUND - 30));
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
        // The 120° turn to the right instead (onto 185), passed on its outside: the abeam pass mirrored, the abeam plan
        // from 8.5 NM left of the leg and about 1.4 NM left at the abeam line. XTK is minus the distance to WWW
        const {flight, aw} = await boot([at(9.75, -8.5), at(4.25, -3.0)], trackPilot(ABEAM_PASS_TURN_AT, INBOUND + 45, INBOUND), INBOUND + 120);
        expect(aw.turnPlan).toBe(TurnPlan.AT_ABEAM);
        await flight.flyUntil(() => turnStackLength(flight.unit) > 0 || flight.nav.activeIdent !== 'WWW', {timeout: 300, description: 'the turn start at WWW'});
        expect(flight.nav.activeIdent).toBe('WWW');
        expect(alongBefore(flight.aircraft), 'at the abeam line').toBeLessThanOrEqual(0.02);
        await flight.fly(1);
        expect(flight.nav.activeIdent).toBe('WWW');
        expect(flight.nav.xtkNm!).toBeLessThan(0);
        expect(Math.abs(flight.nav.xtkNm! + distanceNm(flight.aircraft, W_POS))).toBeLessThan(0.02);
    });

    it('sequences on the turn plan at the inside bisector before the turn point, with no turn (by the rule of the KLN 89 trainer\'s I3\'b, 2026-10-29; #443)', async () => {
        // A 150° left turn (onto 275) at 239 kt, passed parallel 2.0 NM inside, within the gate: the turn plan from the
        // first calculation. The lead is capped at 60 s, 3.98 NM, so the turn point is 4.31 NM before WWW. The inside
        // bisector ray (260) lies a · tan 15° from the leg, so the aircraft crosses it 2.0 / tan 15° = 7.46 NM before WWW,
        // well before the turn point: WWW is sequenced there, with no turn and no alert, by the rule the trainer showed in
        // I3'b (flown at 119 kt, 2.3 NM inside; the 119 kt test below mirrors it)
        const lead = GS * 60 / 3600;
        const tp = lead + rollInNm(GS);
        expect(lead).toBeLessThan(leadNm(GS, 150)); // Precondition: capped
        const {flight, aw} = await boot([at(12, -2.0), at(-20, -2.0)], trackPilot(-100, INBOUND, INBOUND), INBOUND - 150 + 360);
        expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);
        const bisectorAlong = 2.0 / Math.tan(15 * DEG);
        expect(bisectorAlong, 'precondition: the bisector lies before the turn point').toBeGreaterThan(tp + 2);
        expect(gpsAlongBefore(flight), 'precondition: not yet past the bisector').toBeGreaterThan(bisectorAlong + 1);

        let dtkSwitchedEarly = false;
        let alertBefore = false;
        await flight.flyUntil(() => {
            // While WWW is active, including the calculation that sequences it (#407: the DTK of the next leg shows in it)
            alertBefore ||= flight.nav.activeIdent === 'WWW' && flight.nav.waypointAlert;
            dtkSwitchedEarly ||= flight.nav.activeIdent === 'WWW' && angleBetween(flight.nav.dtkTrue, INBOUND) >= 1;
            return flight.nav.activeIdent !== 'WWW';
        }, {timeout: 300, description: 'WWW sequenced'});
        expect(flight.nav.activeIdent).toBe('KBBB');
        // Within one tick of the crossing, at the GPS position the calculation used: the bisector of this position's
        // cross track, which is 2.0 NM left of the leg to within the pilot's accuracy
        const xtk = gpsXtkRight(flight);
        expect(Math.abs(xtk + 2.0)).toBeLessThan(0.15);
        const crossingAlong = -xtk / Math.tan(15 * DEG);
        const along = gpsAlongBefore(flight);
        expect(along).toBeGreaterThanOrEqual(crossingAlong - TICK_NM - GPS_TOLERANCE_NM);
        expect(along).toBeLessThanOrEqual(crossingAlong + GPS_TOLERANCE_NM);
        expect(along, 'before the turn point').toBeGreaterThan(tp + 2);
        expect(turnStackLength(flight.unit), 'no turn').toBe(0);
        expect(alertBefore, 'no alert before the sequencing').toBe(false);
        expect(dtkSwitchedEarly, 'no DTK switch before the sequencing').toBe(false);
        // KBBB's turn point is 20 NM away: still no turn, no alert
        await flight.fly(5);
        expect(flight.nav.activeIdent).toBe('KBBB');
        expect(turnStackLength(flight.unit)).toBe(0);
        expect(flight.nav.waypointAlert).toBe(false);
    });

    it('sequences at 119 kt where an aircraft diverging 60° across the inside bisector of the turn plan crosses it (KLN 89 trainer, 2026-10-29, I3\'b; #443)', async () => {
        // Mirrors I3'b: the 150° left turn at 119 kt, 2.3 NM inside 9 NM before WWW, within the gate of 2.744 NM: the
        // turn plan. The bisector lies 9 · tan 15° = 2.41 NM left of the leg there, so the aircraft starts just before it
        // and, flying 60° left of the leg, crosses it about 8.95 NM before WWW, at 2.4 NM. The lead is capped at 60 s,
        // 1.98 NM, so the turn point lies 2.1 NM before WWW: the crossing is far before it
        const gs = 119;
        const start = at(9.0, -2.3);
        const {flight, aw} = await boot([start, pointFrom(start, INBOUND - 60, 30)], new ManualPilot(), INBOUND - 150 + 360, 20, 40, gs);
        expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);
        const tan15 = Math.tan(15 * DEG);
        expect(-gpsXtkRight(flight), 'precondition: before the bisector').toBeLessThan(gpsAlongBefore(flight) * tan15 - 0.03);

        await flight.flyUntil(() => flight.nav.activeIdent !== 'WWW', {timeout: 60, description: 'WWW sequenced'});
        expect(flight.nav.activeIdent).toBe('KBBB');
        // Within one tick of the crossing, at the GPS position the calculation used: on the bisector ray, 2.4 NM left
        const xtk = -gpsXtkRight(flight);
        const along = gpsAlongBefore(flight);
        const tickNm = gs / 3600;
        expect(xtk - along * tan15, 'past the bisector').toBeGreaterThanOrEqual(-GPS_TOLERANCE_NM);
        expect(xtk - along * tan15, 'within one tick of it').toBeLessThanOrEqual(tickNm * Math.sin(60 * DEG) + tickNm * Math.cos(60 * DEG) * tan15 + GPS_TOLERANCE_NM);
        expect(xtk).toBeLessThan(2.744); // Still the turn plan's range
        expect(turnStackLength(flight.unit), 'no turn').toBe(0);
        expect(flight.nav.waypointAlert).toBe(false);
    });

    it('sequences a 171° turn at the inside bisector crossing, well before the turn point, with no turn (KLN 89 trainer, 2026-10-29, p2_171; #443)', async () => {
        // The trainer's 8S pass at 119 kt: a turn of 171° (left, onto 254) up to which the unit anticipates the turn, passed
        // parallel 0.35 NM inside. The bisector lies 0.35 / tan 4.5° = 4.4 NM before WWW, the lead is capped at 60 s, so the
        // turn point lies 2.1 NM before WWW: sequenced at the crossing, with no turn and no alert
        const gs = 119;
        const tp = gs * 60 / 3600 + rollInNm(gs);
        const {flight, aw} = await boot([at(8, -0.35), at(-20, -0.35)], new ManualPilot(), INBOUND - 171 + 360, 20, 40, gs);
        expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);
        let alertBefore = false;
        await flight.flyUntil(() => {
            alertBefore ||= flight.nav.activeIdent === 'WWW' && flight.nav.waypointAlert;
            return flight.nav.activeIdent !== 'WWW';
        }, {timeout: 120, description: 'WWW sequenced'});
        expect(flight.nav.activeIdent).toBe('KBBB');
        const xtk = gpsXtkRight(flight);
        expect(Math.abs(xtk + 0.35)).toBeLessThan(0.05);
        const crossingAlong = -xtk / Math.tan(4.5 * DEG);
        const tickNm = gs / 3600;
        const along = gpsAlongBefore(flight);
        expect(along).toBeGreaterThanOrEqual(crossingAlong - tickNm - GPS_TOLERANCE_NM);
        expect(along).toBeLessThanOrEqual(crossingAlong + GPS_TOLERANCE_NM);
        expect(along, 'well before the turn point').toBeGreaterThan(tp + 1.5);
        expect(turnStackLength(flight.unit), 'no turn').toBe(0);
        expect(alertBefore, 'no alert before the sequencing').toBe(false);
    });

    it('does not sequence a 176° turn at the inside bisector before its turn point (KLN 89 trainer, 2026-10-29, p1_176; #443, #444)', async () => {
        // Above 175° the unit does not anticipate the turn and does not sequence at the inside bisector: the trainer flew
        // 0.72 NM inside a 176.1° turn to the waypoint. The emulation still flies a lead turn there until #444. The same
        // pass as above on a 176° turn (onto 249), 0.3 NM inside: the bisector lies 0.3 / tan 2° = 8.6 NM before WWW,
        // the turn point 2.1 NM before it. Past the bisector, up to near the turn point, WWW stays active
        const gs = 119;
        const tp = gs * 60 / 3600 + rollInNm(gs);
        const {flight} = await boot([at(9.5, -0.3), at(-20, -0.3)], new ManualPilot(), INBOUND - 176 + 360, 20, 40, gs);
        await flight.flyUntil(() => alongBefore(flight.aircraft) <= tp + 0.5 || flight.nav.activeIdent !== 'WWW', {timeout: 300, description: 'near the turn point'});
        expect(flight.nav.activeIdent).toBe('WWW');
        expect(gpsAlongBefore(flight)).toBeLessThan(8.6 - 1);
        expect(turnStackLength(flight.unit), 'no turn before the turn point').toBe(0);
    });

    it('sequences once in the first calculation after a jump past the inside bisector, within 4.0 NM (#443)', async () => {
        // The 150° left turn at 239 kt, on course 10 NM before WWW with WWW active. A jump (a slew, a position set in the
        // sim) to 3.5 NM inside, 6.0 NM before WWW: before the turn point (4.31 NM), past the bisector, which lies 1.6 NM
        // left of the leg there. The test is a state, so the first calculation sequences WWW, with no turn, and the next
        // leg is not sequenced after it: KBBB's own bisector is 20 NM away
        const {flight} = await boot([at(10, 0), at(-20, 0)], new ManualPilot(), INBOUND - 150 + 360);
        await flight.fly(2);
        expect(flight.nav.activeIdent).toBe('WWW');
        flight.teleport(at(6.0, -3.5));
        await flight.fly(1);
        expect(flight.nav.activeIdent).toBe('KBBB');
        expect(turnStackLength(flight.unit)).toBe(0);
        await flight.fly(10);
        expect(flight.nav.activeIdent).toBe('KBBB');
        expect(turnStackLength(flight.unit)).toBe(0);
    });

    it('sequences on the abeam plan on the inside at the bisector, before the abeam line (KLN 89 trainer, 2026-10-29, I3\'a, I3\'c; #443)', async () => {
        // On the inside, 3.5 NM left of the leg on the abeam plan. At 239 kt the abeam plan needs a cross track beyond the
        // gate of 4.9 NM, beyond the leg's 4.0 NM (#438): from 5.5 NM left 15 NM before WWW the aircraft converges at 20°
        // and flies on parallel 3.5 NM left of the leg from about 9.5 NM before WWW, keeping the abeam plan. WWW is
        // sequenced where the aircraft crosses the inside bisector ray (275), 3.5 / tan 30° = 6.06 NM before WWW, before
        // the abeam line and with no turn, as the trainer did in I3'a and I3'c (2026-10-29: sequenced at the crossing,
        // 12.6 NM out). The exact mirror of the abeam pass, converging from 8.5 NM left, cannot be flown: it starts past
        // the bisector, closer to the leg to KBBB, so the unit would activate KBBB
        let onParallel = false;
        const pilot: Pilot = {
            commandedBank: ({aircraft}) => {
                onParallel ||= xtkRight(aircraft) >= -3.6;
                return bankToward(aircraft.trackTrue, onParallel ? INBOUND : INBOUND + 20);
            },
        };
        const start = at(15, -5.5);
        const {flight, aw} = await boot([start, pointFrom(start, INBOUND + 20, 30)], pilot);
        expect(aw.turnPlan).toBe(TurnPlan.AT_ABEAM);
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
        // Where the aircraft crosses the inside bisector ray, within one tick, measured at the GPS position the calculation
        // used: on the parallel 3.5 NM left, 6.06 NM before WWW
        const xtk = gpsXtkRight(flight);
        expect(Math.abs(xtk + 3.5)).toBeLessThan(0.15);
        const bisectorAlong = -xtk / Math.tan(30 * DEG);
        const gpsAlong = gpsAlongBefore(flight);
        expect(gpsAlong).toBeGreaterThanOrEqual(bisectorAlong - TICK_NM - GPS_TOLERANCE_NM);
        expect(gpsAlong).toBeLessThanOrEqual(bisectorAlong + GPS_TOLERANCE_NM);
    });

    it('decides at the first calculation of the Direct To', async () => {
        // Wings level on the inbound leg. The plan's own turn at WWW starts at 3.43 NM; the Direct To WWW entered about
        // 2.6 NM before WWW replaces it. The Direct To leg starts where it is activated, so its lead is half of it
        // (#404), and it has no cross track: the turn plan is taken in the first calculation of the Direct To (#438),
        // with the alert on, as the turn point is less than 20 s away, and the turn starts at that leg's turn point
        const start = at(8, 0);
        const {flight, aw} = await boot([start, W_POS], new ManualPilot());
        await flight.flyUntil(() => alongBefore(flight.aircraft) <= 2.7, {timeout: 120, description: '2.7 NM before WWW'});
        await flight.panel.directTo('WWW', {waitMs: 0});
        await flight.flyUntil(() => aw.isDctNavigation(), {timeout: 5, description: 'the Direct To active'});
        const legNm = distanceNm(aw.getFromWpt()!, W_POS);
        const tpDct = legNm / 2 + rollInNm(GS);
        // Preconditions: activated within 20 s of that leg's turn point and outside it
        expect(legNm).toBeLessThan(tpDct + 20 * TICK_NM - 0.3);
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

    it('keeps the abeam plan of an aircraft beyond the gate off the leg when it comes back on the leg (R6)', async () => {
        // A 150° right turn (onto 215) at 239 kt, as the trainer's R6: the lead is capped at 60 s, so the turn point is
        // 4.31 NM before WWW. A straight line on the outside, 6.2 NM left 5 NM before WWW (R6's start) and 3.0 NM left at
        // the abeam line (R6's 3.0), converging at atan(3.2 / 5) = 32.6°: 8.8 NM off the leg at the start, beyond the gate
        // of 4.9 NM, so the abeam plan from the first calculation (#438; the 2026-10-29 analysis keeps R6 abeam with its
        // 6.2 NM), back within 4.0 NM 1.56 NM before the abeam line
        const slope = 3.2 / 5;
        const lineXtk = (alongNm: number) => -(3.0 + slope * alongNm);
        const course = INBOUND + Math.atan(slope) / DEG;
        const closureNm = GS * Math.cos(Math.atan(slope)) / 3600;
        const xtkPerTickNm = GS * Math.sin(Math.atan(slope)) / 3600;
        const lead = Math.min(leadNm(GS, 150), GS * 60 / 3600);
        const tp = lead + rollInNm(GS);
        expect(lead).toBeCloseTo(3.983, 3); // The literals of the brief: capped
        expect(rollInNm(GS)).toBeCloseTo(0.332, 3);

        const {flight, aw} = await boot([at(9, lineXtk(9)), at(0, lineXtk(0))], trackPilot(-100, course, course), INBOUND + 150);
        let dtkSwitched = false;
        let secondsWithinTurnPoint = 0;
        const watch = () => {
            // Before the abeam turn: the calculation that starts it shows the next leg's DTK already (#407)
            dtkSwitched ||= flight.nav.activeIdent === 'WWW' && turnStackLength(flight.unit) === 0 && angleBetween(flight.nav.dtkTrue, INBOUND) >= 1;
            if (distanceNm(flight.aircraft, W_POS) < tp) secondsWithinTurnPoint += 0.25;
            // The abeam plan throughout, also within 4.0 NM and the gate
            expect(aw.turnPlan).toBe(TurnPlan.AT_ABEAM);
        };

        // Decided off the leg, beyond the gate, in the first calculation: the abeam plan
        expect(flight.nav.activeIdent).toBe('WWW');
        expect(aw.turnPlan).toBe(TurnPlan.AT_ABEAM);
        expect(gpsXtkRight(flight)).toBeLessThan(-turnPlanGate(GS));

        // The alert off the leg: 36 s before the abeam line at the along-track closure, 4.29 NM off the leg
        await flight.flyUntil(() => {
            watch();
            return flight.nav.waypointAlert || flight.nav.activeIdent !== 'WWW';
        }, {timeout: 300, description: 'the alert off the leg'});
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
        // Parallel 1.0 NM right of the leg, the outside of the 120° left turn: the turn plan. After the DTK switch the
        // pilot banks 25° to the right, away from the turn, on a circle of 1.79 NM: more than 4.0 NM off the leg about
        // 1.8 NM before WWW, and never past the abeam line. At most 4.58 NM off, within the gate of 4.9 NM, so the turn
        // plan stays (#438)
        const pilot = new ManualPilot();
        const {flight, aw} = await boot([at(9.75, 1.0), at(0, 1.0)], pilot);
        await flight.flyUntil(() => turnStackLength(flight.unit) > 0 || flight.nav.activeIdent !== 'WWW', {timeout: 300, description: 'the turn start at WWW'});
        expect(flight.nav.activeIdent).toBe('WWW');
        expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);
        await flight.fly(1);
        expect(angleBetween(flight.nav.dtkTrue, NEXT)).toBeLessThan(1); // Precondition: the turn has started
        pilot.bank = 25;

        // Beyond 4.0 NM: the DTK falls back to the leg's and nothing is on the stack
        await flight.flyUntil(() => xtkRight(flight.aircraft) > 4.1 || flight.nav.activeIdent !== 'WWW', {timeout: 120, description: 'beyond 4.0 NM'});
        let samples = 0;
        let maxXtk = 0;
        while (xtkRight(flight.aircraft) > 4.05) {
            maxXtk = Math.max(maxXtk, xtkRight(flight.aircraft));
            expect(flight.nav.activeIdent).toBe('WWW');
            expect(turnStackLength(flight.unit), `${xtkRight(flight.aircraft).toFixed(2)} NM off the leg`).toBe(0);
            expect(angleBetween(flight.nav.dtkTrue, INBOUND)).toBeLessThan(1);
            expect(alongBefore(flight.aircraft), 'before the abeam line').toBeGreaterThan(0);
            expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);
            samples++;
            await flight.fly(1);
        }
        expect(samples, 'seconds beyond 4.0 NM').toBeGreaterThan(30);
        expect(maxXtk, 'precondition: within the gate').toBeLessThan(turnPlanGate(GS) - 0.1);

        // Back on the leg the turn plan, which is kept, applies again (the design, section 3.2): the circle brings the
        // aircraft back to the turn point on the inbound course, and the turn starts there again
        await flight.flyUntil(() => turnStackLength(flight.unit) > 0 || flight.nav.activeIdent !== 'WWW', {timeout: 120, description: 'the turn started again'});
        expect(flight.nav.activeIdent).toBe('WWW');
        expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);
        expect(Math.abs(gpsXtkRight(flight))).toBeLessThan(4.0);
        expect(gpsAlongBefore(flight)).toBeLessThanOrEqual(TP + TICK_NM + GPS_TOLERANCE_NM);
    });
});
