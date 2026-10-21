import {describe, expect, it} from 'vitest';
import {Facility} from '@microsoft/msfs-sdk';
import {LVAR_ROLL_COMMAND} from '../../../kln90b/LVars';
import {Flight} from '../../harness/flight/Flight';
import {ManualPilot} from '../../harness/flight/pilots';
import {World} from '../../harness/flight/World';
import {airport, vor} from '../../harness/navdata/builders';
import {standardRoute} from '../../harness/fixtures';
import {savedFlightplan} from '../../harness/storage';
import {angleBetween, courseDeg, crossTrackNm, distanceNm, EARTH_RADIUS_NM, finalCourseDeg, LatLon, norm360, pointBefore, pointFrom} from '../../harness/flight/geo';

/**
 * How the roll steering flies the situations of section 6 of the roll steering design
 * (docs/superpowers/specs/2026-10-19-roll-steering-design.md), measured against a target leg with the coupled autopilot.
 * The harness aircraft rolls at 5°/s and banks at most 25° (its defaults).
 */
interface Metrics {
    /**
     * The sign of the first L:KLN90B_RollCommand of at least 2° after the start event: 1 left, -1 right (the LVar's
     * sign), 0 none
     */
    firstBankSign: 1 | -1 | 0;
    /**
     * Sign changes between successive commands of at least 2° given while the track is more than 90° off the target
     * course
     */
    reversals: number;
    /** The largest cross track on the far side after the first crossing of the target leg; 0 without a crossing */
    overshootNm: number;
    /** The largest |XTK| from the capture to the end; 0 without a capture */
    maxXtkEstablishedNm: number;
    /** Seconds from the start event to the first |XTK| below 0.1 NM; null when that never happens within the scenario */
    captureS: number | null;
}

/** The leg a scenario is measured against: the great circle through `through` on the true course `courseTrue` there */
interface Target {
    through: LatLon;
    courseTrue: number;
}

interface Scenario {
    /** Boots the unit and flies up to the start event (the placement, the DTK switch of a turn, the Direct To) */
    start: () => Promise<{ flight: Flight; target: Target; fallback?: boolean }>;
    /** Seconds flown after the start event */
    durationS: number;
}

interface Sample {
    t: number;
    roll: number;
    xtkNm: number;
    trackTrue: number;
    /** The unit's DTK, the course the trainer record compares the track with */
    dtkTrue: number | null;
}

const roll = (flight: Flight) => flight.sim.get(LVAR_ROLL_COMMAND, 'degrees');

/**
 * Flies a scenario and measures it. One sample at the start event and one after each second: the roll command is
 * calculated once a second, so each sample holds a command of its own. The command at the start event is the first one
 * after it: for a turn the one of the calculation that switched the DTK (roll steering runs after NavCalculator in the
 * same tick), for a placement the one calculated with the true track at the end of the run-up (`place`), for the Direct
 * To that of the leg flown before, below 2°. The cross track is measured with flight/geo.ts, positive right of the target
 * leg; the track is compared with the target course at `through`, which differs from the local course by less than a
 * degree within the scenarios' distances.
 */
async function flyScenario(s: Scenario): Promise<{ metrics: Metrics; samples: Sample[]; courseTrue: number; fallback?: boolean }> {
    const {flight, target, fallback} = await s.start();
    const samples: Sample[] = [];
    const record = (t: number) => samples.push({
        t, roll: roll(flight), xtkNm: crossTrackNm(flight.aircraft, target.through, target.courseTrue), trackTrue: flight.aircraft.trackTrue,
        dtkTrue: flight.nav.dtkTrue,
    });
    record(0);
    for (let t = 1; t <= s.durationS; t++) {
        await flight.fly(1);
        record(t);
    }
    return {metrics: metricsOf(samples, target.courseTrue), samples, courseTrue: target.courseTrue, fallback};
}

function metricsOf(samples: Sample[], courseTrue: number): Metrics {
    const commands = samples.filter(s => Math.abs(s.roll) >= 2);
    const first = commands[0];
    const firstBankSign = first === undefined ? 0 : first.roll > 0 ? 1 : -1;

    const turningAway = commands.filter(s => angleBetween(s.trackTrue, courseTrue) > 90);
    let reversals = 0;
    for (let i = 1; i < turningAway.length; i++) {
        if (Math.sign(turningAway[i].roll) !== Math.sign(turningAway[i - 1].roll)) reversals++;
    }

    // The side the aircraft starts on is that of the first sample at least 0.01 NM off the leg, so that a start exactly
    // on the leg takes the side it first moves to
    const startIdx = samples.findIndex(s => Math.abs(s.xtkNm) >= 0.01);
    let overshootNm = 0;
    if (startIdx >= 0) {
        const side = Math.sign(samples[startIdx].xtkNm);
        const crossIdx = samples.findIndex((s, i) => i > startIdx && Math.sign(s.xtkNm) === -side);
        if (crossIdx >= 0) overshootNm = Math.max(...samples.slice(crossIdx).map(s => -side * s.xtkNm));
    }

    const captureIdx = samples.findIndex(s => Math.abs(s.xtkNm) < 0.1);
    const captureS = captureIdx < 0 ? null : samples[captureIdx].t;
    const maxXtkEstablishedNm = captureIdx < 0 ? 0 : Math.max(...samples.slice(captureIdx).map(s => Math.abs(s.xtkNm)));

    return {firstBankSign, reversals, overshootNm, maxXtkEstablishedNm, captureS};
}

/** Seconds the aircraft flies wings level before it reaches the point it is placed at */
const RUN_UP_S = 2;

/**
 * Puts the aircraft at a point with a track. Flight.jump moves along the track only, so the aircraft is set directly,
 * as in duplicateWaypoint.test.ts (#373). The unit takes the GPS track from two successive positions once a second
 * (Gps.ts), so the first calculation after a displacement sees a track from the old position to the new one, and the
 * command it gives is an artifact of the harness. The aircraft is therefore set RUN_UP_S seconds before the point on
 * the same track and flown there wings level by a ManualPilot; the second calculation has the true track. The coupled
 * autopilot takes over at the point, which is the start event, and the command it finds was calculated with the true
 * track.
 */
async function place(flight: Flight, p: LatLon, trackTrue: number): Promise<void> {
    const autopilot = flight.pilot;
    flight.pilot = new ManualPilot();
    const runUp = pointFrom(p, trackTrue + 180, flight.aircraft.groundspeedKt * RUN_UP_S / 3600);
    Object.assign(flight.aircraft, {lat: runUp.lat, lon: runUp.lon, trackTrue: norm360(trackTrue), bankDeg: 0});
    flight.aircraft.writeTo(flight.sim, 0);
    await flight.fly(RUN_UP_S);
    flight.pilot = autopilot;
}

/**
 * The standard world (KAAA - ABC - KBBB), the aircraft booted on the first leg `beforeAbcNm` before ABC and flown until
 * ABC is active
 */
async function bootOnFirstLeg(beforeAbcNm: number, groundspeedKt: number, extra: Facility[] = []) {
    const {kaaa, abc, kbbb} = standardRoute();
    const world = new World({magvar: 0}).add(kaaa, abc, kbbb, ...extra);
    const base = pointBefore(kaaa, abc, beforeAbcNm);
    const course = courseDeg(base, abc);
    const flight = await Flight.start({
        world, storage: savedFlightplan(0, [kaaa, abc, kbbb]),
        aircraft: {lat: base.lat, lon: base.lon, altitudeFt: 3000, groundspeedKt, trackTrue: course},
    });
    await flight.flyUntilActive('ABC', {timeout: 30});
    return {flight, kaaa, abc, kbbb, base, course};
}

/**
 * Off the first leg of the standard world: `offsetNm` to the side of the leg (positive right) abeam the point
 * `beforeAbcNm` before ABC, on a track `trackOffsetDeg` from the leg's course there (positive right, 180 flies the leg
 * backward). The start event is the placement, the target the leg KAAA - ABC.
 */
function offLeg(o: { beforeAbcNm: number; offsetNm: number; trackOffsetDeg: number; groundspeedKt: number; durationS: number }): Scenario {
    return {
        durationS: o.durationS,
        start: async () => {
            const {flight, kaaa, abc, base, course} = await bootOnFirstLeg(o.beforeAbcNm, o.groundspeedKt);
            await place(flight, pointFrom(base, course + (o.offsetNm >= 0 ? 90 : -90), Math.abs(o.offsetNm)), course + o.trackOffsetDeg);
            return {flight, target: {through: abc, courseTrue: finalCourseDeg(kaaa, abc)}};
        },
    };
}

/**
 * KAAA - ABC - KBBB with legs of 30 NM, arriving at ABC on 050 and turning `turnDeg` there (positive right)
 */
function turnWorld(turnDeg: number) {
    const inbound = 50;
    const abc = vor('ABC', 47.5, 8.9);
    const a = pointFrom(abc, inbound + 180, 30);
    const b = pointFrom(abc, inbound + turnDeg, 30);
    return {kaaa: airport('KAAA', a.lat, a.lon), abc, kbbb: airport('KBBB', b.lat, b.lon)};
}

/**
 * An anticipated turn at ABC: the aircraft starts `startBeforeNm` before ABC, 0.02 NM left of the first leg (as in
 * turnDirection.test.ts: exactly on the leg the side of the cross track is rounding noise), and flies the leg with the
 * coupled autopilot until the DTK switches to the next leg. That switch is the start event, the target the leg
 * ABC - KBBB. `turnDeg` null is the standard world's 34.4° left turn.
 */
function anticipatedTurn(o: { turnDeg: number | null; groundspeedKt: number; startBeforeNm: number; durationS: number }): Scenario {
    return {
        durationS: o.durationS,
        start: async () => {
            const {kaaa, abc, kbbb} = o.turnDeg === null ? standardRoute() : turnWorld(o.turnDeg);
            const world = new World({magvar: 0}).add(kaaa, abc, kbbb);
            const onLeg = pointBefore(kaaa, abc, o.startBeforeNm);
            const track = courseDeg(onLeg, abc);
            const start = pointFrom(onLeg, track - 90, 0.02);
            const flight = await Flight.start({
                world, storage: savedFlightplan(0, [kaaa, abc, kbbb]),
                aircraft: {lat: start.lat, lon: start.lon, altitudeFt: 3000, groundspeedKt: o.groundspeedKt, trackTrue: track},
            });
            await flight.flyUntilActive('ABC', {timeout: 30});
            const next = courseDeg(abc, kbbb);
            await flight.flyUntil(() => flight.nav.activeIdent !== 'ABC' || angleBetween(flight.nav.dtkTrue, next) < 1,
                {timeout: 5 * 60, description: 'start of the turn at ABC'});
            // Precondition: the turn is anticipated, the DTK switched while ABC is still active
            expect(flight.nav.activeIdent).toBe('ABC');
            return {flight, target: {through: abc, courseTrue: next}};
        },
    };
}

/**
 * The old RollSteeringController as of 15b5ddd, measured on 2026-10-19 (the appendix of
 * docs/superpowers/specs/2026-10-19-roll-steering-design.md). Distances are rounded to 0.001 NM.
 */
const BASELINE: Record<string, Metrics> = {
    // Banks away first (+25 left), then weaves and settles parallel 7.2 NM left: on the left of the leg the old on-track
    // case applies (xtk < 0.1 without abs), and DTK - 50 x XTK comes back to the DTK at 7.2 NM. It never captures
    S1: {firstBankSign: 1, reversals: 0, overshootNm: 0, maxXtkEstablishedNm: 0, captureS: null},
    S2: {firstBankSign: 1, reversals: 0, overshootNm: 0.005, maxXtkEstablishedNm: 0.090, captureS: 218},
    S3: {firstBankSign: 1, reversals: 0, overshootNm: 0.034, maxXtkEstablishedNm: 0.088, captureS: 60},
    S4: {firstBankSign: 1, reversals: 0, overshootNm: 0.005, maxXtkEstablishedNm: 0.087, captureS: 27},
    S5: {firstBankSign: 1, reversals: 0, overshootNm: 0, maxXtkEstablishedNm: 0.099, captureS: 77},
    // One continuous right turn across the leg; the capture is the pass through it, so the maximum after it is the
    // overshoot
    S6: {firstBankSign: -1, reversals: 0, overshootNm: 0.603, maxXtkEstablishedNm: 0.603, captureS: 16},
    // Right 1 s, left 4 s, right 11 s, then a full left turn; the start is on the leg, so the capture is at once
    S7: {firstBankSign: -1, reversals: 3, overshootNm: 0.154, maxXtkEstablishedNm: 0.745, captureS: 0},
    // +4 at the DTK switch, then -12.5 to -13 (wrong way) for 3 s before the left turn: the #100 bank of
    // turnDirection.test.ts, which these metrics do not see (the first command is left, and the turn is less than 90°)
    S8a: {firstBankSign: 1, reversals: 0, overshootNm: 0.089, maxXtkEstablishedNm: 0.089, captureS: 5},
    // +8.6 at the DTK switch and +30 for 2 s, then -14 to -17 (wrong way) for 7 s; the aircraft flies on past ABC and
    // turns once KBBB is active, which makes the overshoot (the same metrics miss the wrong-way bank as in S8a)
    S8b: {firstBankSign: 1, reversals: 0, overshootNm: 0.421, maxXtkEstablishedNm: 0.421, captureS: 12},
    S8c: {firstBankSign: -1, reversals: 0, overshootNm: 0, maxXtkEstablishedNm: 0.084, captureS: 24},
    S8d: {firstBankSign: -1, reversals: 0, overshootNm: 0.240, maxXtkEstablishedNm: 0.240, captureS: 35},
    S8e: {firstBankSign: 1, reversals: 0, overshootNm: 0.003, maxXtkEstablishedNm: 0.094, captureS: 46},
    S8f: {firstBankSign: 1, reversals: 0, overshootNm: 0.031, maxXtkEstablishedNm: 0.085, captureS: 67},
    // The Direct To starts on its leg, so the capture is at once and the maximum after it is the swing of the turn
    S9: {firstBankSign: -1, reversals: 0, overshootNm: 0, maxXtkEstablishedNm: 0.779, captureS: 0},
    // At the DTK switch the next leg's course (200) lies 165° left of the track (005): the turn at ABC is to the right,
    // the shorter way from the track to the left. The command starts left (+29.7) and changes direction four times
    // before a left turn onto the leg
    S10: {firstBankSign: 1, reversals: 4, overshootNm: 0.238, maxXtkEstablishedNm: 0.238, captureS: 45},
};

/**
 * #404: S8f's lead is capped at 60 s of ground speed, 4.0 NM instead of R tan(75°) = 6.7 NM, and its turn circle is the
 * tighter one tangent to both legs at that lead (radius 1.07 NM), the trainer's (checked in the KLN 89 trainer,
 * 2026-10-20, docs/kln89-trainer-record.md). The harness aircraft cannot fly it at 25° of bank (its radius at 240 kt is
 * 1.79 NM), so it overshoots the next leg by design, geometrically by about (6.7 - 4.3) NM × sin(150°) = 1.2 NM. These
 * bounds, measured on 2026-10-21 (1.268 NM for both) and rounded up to 0.001 NM, replace the baseline's overshoot
 * (0.031 NM) and maximum XTK once established (0.085 NM) for it; the qualitative checks are unchanged. The capped 150°
 * turns at 120 kt (S8e, S10, S11) stay within the baseline's bounds
 */
const CAPPED_TURN_BOUNDS: Record<string, Pick<Metrics, 'overshootNm' | 'maxXtkEstablishedNm'>> = {
    S8f: {overshootNm: 1.269, maxXtkEstablishedNm: 1.269},
};

/**
 * The largest angle between the track and the unit's DTK while the aircraft closes on the leg (|XTK| falling) before the
 * capture: the intercept angle flown. The DTK is the local course of the leg; the target course at ABC differs from it by
 * up to half a degree in the scenarios that start 35 NM before ABC
 */
function maxInterceptDeg(samples: Sample[]): number {
    const captureIdx = samples.findIndex(s => Math.abs(s.xtkNm) < 0.1);
    const end = captureIdx < 0 ? samples.length : captureIdx;
    let max = 0;
    for (let i = 1; i < end; i++) {
        if (Math.abs(samples[i].xtkNm) < Math.abs(samples[i - 1].xtkNm)) max = Math.max(max, angleBetween(samples[i].trackTrue, samples[i].dtkTrue!));
    }
    return max;
}

/** Seconds from the first sample with |XTK| at or below `fromNm` to the first at or below half of it; null if either is missing */
function halvingTimeS(samples: Sample[], fromNm: number): number | null {
    const from = samples.find(s => Math.abs(s.xtkNm) <= fromNm);
    const half = samples.find(s => Math.abs(s.xtkNm) <= fromNm / 2);
    return from === undefined || half === undefined ? null : half.t - from.t;
}

/**
 * The commands of at least 2° against the direction `turnSign` (1 left, -1 right, the LVar's sign) from the start event
 * until the track is first within 10° of the target course
 */
function wrongWayCommands(samples: Sample[], courseTrue: number, turnSign: 1 | -1): number[] {
    const endIdx = samples.findIndex(s => angleBetween(s.trackTrue, courseTrue) < 10);
    return samples.slice(0, endIdx < 0 ? samples.length : endIdx).filter(s => Math.abs(s.roll) >= 2 && Math.sign(s.roll) === -turnSign).map(s => s.roll);
}

/**
 * S9: a Direct To a waypoint 10 NM away, 120° right of the track. The aircraft is put back on the first leg of the
 * standard world, established, and enters the Direct To with the front panel. The start event is the Direct To becoming
 * active, the target its leg from where the unit started it.
 */
function directTo120Right(durationS: number): Scenario {
    return {
        durationS,
        start: async () => {
            const {kaaa, abc} = standardRoute();
            const p = pointBefore(kaaa, abc, 40);
            const course = courseDeg(p, abc);
            const w = pointFrom(p, course + 120, 10);
            const dto = vor('DTO', w.lat, w.lon);
            const {flight} = await bootOnFirstLeg(40, 120, [dto]);
            await place(flight, p, course);
            await flight.panel.directTo('DTO', {waitMs: 0});
            await flight.flyUntilActive('DTO', {timeout: 5});
            const origin = flight.unit.props.memory.navPage.activeWaypoint.getFromWpt()!;
            return {flight, target: {through: dto, courseTrue: finalCourseDeg(origin, dto)}};
        },
    };
}

/**
 * #404: the lead of the 150° turns at 120 kt (S10, S11), capped at 60 s of ground speed (120 kt × 60 s = 2.0 NM; the
 * uncapped 0.64 NM × tan(75°) = 2.4 NM is longer), and the radius of the circle tangent to both legs at that lead
 * (checked in the KLN 89 trainer, 2026-10-20)
 */
const CAPPED_150_LEAD_NM = 120 * 60 / 3600;
const CAPPED_150_RADIUS_NM = CAPPED_150_LEAD_NM / Math.tan(75 * Math.PI / 180);

/**
 * S10: turn anticipation starting on a 45° intercept more than one turn radius inside the turn (the fallback of section
 * 4A). A 150° right turn at ABC at 120 kt. Its lead, R tan(75°) = 2.4 NM with the standard-rate radius R = 0.64 NM
 * (3°/s at 120 kt), is capped at 60 s of ground speed, 2.0 NM (#404), so the turn starts about 2.1 NM from ABC on the
 * tighter circle tangent to both legs at the lead, of radius 2.0 NM / tan(75°) = 0.54 NM (checked in the KLN 89 trainer,
 * 2026-10-20). The aircraft is put on a 005 track (the inbound 050 less 45°, closing from the right, the inside of the
 * turn) aimed at the point 2.0 NM right of the leg and 1.5 NM before ABC, 2.5 NM from it, and placed 2 NM before that
 * point. Both the old controller (its far-away branch) and the new law (atan(XTK / 1 NM) is more than 45° there) hold
 * the 45° intercept from the right while the aircraft is far off, so the turn starts with the aircraft about 2 NM inside
 * the inbound leg, outside the turn circle on its far side by more than its radius. The start event is the DTK switch, the target the leg ABC - KBBB. `fallback` reports whether
 * NavCalculator steers on the next leg at the start event (the roll steering design, section 4A).
 */
function turnStartOnInterceptInside(durationS: number): Scenario {
    return {
        durationS,
        start: async () => {
            const {kaaa, abc, kbbb} = turnWorld(150);
            const world = new World({magvar: 0}).add(kaaa, abc, kbbb);
            const inbound = finalCourseDeg(kaaa, abc);
            const boot = pointBefore(kaaa, abc, 10);
            const flight = await Flight.start({
                world, storage: savedFlightplan(0, [kaaa, abc, kbbb]),
                aircraft: {lat: boot.lat, lon: boot.lon, altitudeFt: 3000, groundspeedKt: 120, trackTrue: courseDeg(boot, abc)},
            });
            await flight.flyUntilActive('ABC', {timeout: 30});
            const aim = pointFrom(pointBefore(kaaa, abc, 1.5), inbound + 90, 2.0);
            const track = inbound - 45;
            await place(flight, pointFrom(aim, track + 180, 2.0), track);
            const next = courseDeg(abc, kbbb);
            await flight.flyUntil(() => angleBetween(flight.nav.dtkTrue, next) < 1,
                {timeout: 120, description: 'start of the turn at ABC'});
            // #375: a turn is sequenced where the aircraft passes its bisector (checked in the KLN 89 trainer, 2026-10-20,
            // docs/kln89-trainer-record.md), a state armed by the turn start. 2 NM inside the turn the aircraft is past the
            // bisector when the turn starts, so ABC is sequenced in that calculation; the turn stays on the stack and is
            // flown, and the roll steering checks below are unchanged
            expect(flight.nav.activeIdent).toBe('KBBB');
            expect(flight.unit.props.memory.navPage.activeWaypoint.turnStack.length).toBeGreaterThan(0);
            // Preconditions: still on the 45° intercept, and farther from the turn circle than its radius. The circle is
            // derived here from the lead capped at 60 s of ground speed, 120 kt × 60 s = 2.0 NM (#404): tangent to the
            // inbound leg 2.0 NM before ABC, of radius 2.0 NM / tan(75°), its center that radius to the right
            expect(angleBetween(flight.aircraft.trackTrue, track)).toBeLessThan(2);
            const r = CAPPED_150_RADIUS_NM;
            const center = pointFrom(pointBefore(kaaa, abc, CAPPED_150_LEAD_NM), inbound + 90, r);
            expect(Math.abs(distanceNm(flight.aircraft, center) - r)).toBeGreaterThan(r);
            const nav = flight.unit.props.memory.navPage;
            const turn = nav.activeWaypoint.turnStack[0];
            const fallback = turn.steerOnPathForDtk && nav.steeringPath === turn.pathForDtk;
            return {flight, target: {through: abc, courseTrue: next}, fallback};
        },
    };
}

/**
 * S11: an anticipated 150° right turn at ABC at 120 kt, started with the aircraft inside the turn. The aircraft is put
 * parallel to the inbound leg 0.5 NM to its right (the inside of the turn), 0.1 NM before the start of the turn plus 6 s
 * of flight, and flown with the coupled autopilot until the DTK switches. The law closes on the leg meanwhile, so at the
 * switch the aircraft is about 0.4 NM inside: inside the turn circle (of radius 0.54 NM, capped as for S10) near its
 * start, less than one radius from it (no fallback). The start event is the DTK switch, the target the leg ABC - KBBB. `xtkInsideNm` is the cross track to the
 * inbound leg at the switch (positive right, the inside).
 */
function turnStartInside(durationS: number, report: { xtkInsideNm?: number; fallback?: boolean }): Scenario {
    return {
        durationS,
        start: async () => {
            const {kaaa, abc, kbbb} = turnWorld(150);
            const world = new World({magvar: 0}).add(kaaa, abc, kbbb);
            const inbound = finalCourseDeg(kaaa, abc);
            const boot = pointBefore(kaaa, abc, 10);
            const flight = await Flight.start({
                world, storage: savedFlightplan(0, [kaaa, abc, kbbb]),
                aircraft: {lat: boot.lat, lon: boot.lon, altitudeFt: 3000, groundspeedKt: 120, trackTrue: courseDeg(boot, abc)},
            });
            await flight.flyUntilActive('ABC', {timeout: 30});
            // The turn starts at the lead capped at 60 s of ground speed, 2.0 NM before ABC (as for S10), plus the roll-in
            const aim = pointFrom(pointBefore(kaaa, abc, CAPPED_150_LEAD_NM + 0.22), inbound + 90, 0.5);
            await place(flight, pointFrom(aim, inbound + 180, 120 * 6 / 3600), inbound);
            const next = courseDeg(abc, kbbb);
            await flight.flyUntil(() => flight.nav.activeIdent !== 'ABC' || angleBetween(flight.nav.dtkTrue, next) < 1,
                {timeout: 60, description: 'start of the turn at ABC'});
            expect(flight.nav.activeIdent).toBe('ABC');
            report.xtkInsideNm = crossTrackNm(flight.aircraft, abc, inbound);
            report.fallback = flight.unit.props.memory.navPage.activeWaypoint.turnStack[0].steerOnPathForDtk;
            return {flight, target: {through: abc, courseTrue: next}};
        },
    };
}

/** The scenarios of section 6 of the design; S8a to S8f are the anticipated turns */
const SCENARIOS: { id: string; title: string; scenario: Scenario }[] = [
    {id: 'S1', title: 'S1 parallel 5 NM left of the leg at 120 kt', scenario: offLeg({beforeAbcNm: 35, offsetNm: -5, trackOffsetDeg: 0, groundspeedKt: 120, durationS: 600})},
    {id: 'S2', title: 'S2 parallel 5 NM right of the leg at 120 kt', scenario: offLeg({beforeAbcNm: 35, offsetNm: 5, trackOffsetDeg: 0, groundspeedKt: 120, durationS: 600})},
    {id: 'S3', title: 'S3 parallel 2 NM right of the leg at 240 kt', scenario: offLeg({beforeAbcNm: 40, offsetNm: 2, trackOffsetDeg: 0, groundspeedKt: 240, durationS: 400})},
    {id: 'S4', title: 'S4 parallel 0.5 NM right of the leg at 120 kt', scenario: offLeg({beforeAbcNm: 35, offsetNm: 0.5, trackOffsetDeg: 0, groundspeedKt: 120, durationS: 400})},
    {id: 'S5', title: 'S5 converging at 60° from 1.6 NM left at 120 kt', scenario: offLeg({beforeAbcNm: 35, offsetNm: -1.6, trackOffsetDeg: 60, groundspeedKt: 120, durationS: 400})},
    {id: 'S6', title: 'S6 the active leg behind, 0.3 NM right of it at 120 kt', scenario: offLeg({beforeAbcNm: 30, offsetNm: 0.3, trackOffsetDeg: 180, groundspeedKt: 120, durationS: 500})},
    {id: 'S7', title: 'S7 the active leg behind, on it at 120 kt', scenario: offLeg({beforeAbcNm: 30, offsetNm: 0, trackOffsetDeg: 180, groundspeedKt: 120, durationS: 500})},
    {id: 'S8a', title: 'S8a the 34° left turn of the standard route at 120 kt', scenario: anticipatedTurn({turnDeg: null, groundspeedKt: 120, startBeforeNm: 3, durationS: 240})},
    {id: 'S8b', title: 'S8b the 34° left turn of the standard route at 240 kt', scenario: anticipatedTurn({turnDeg: null, groundspeedKt: 240, startBeforeNm: 5, durationS: 300})},
    {id: 'S8c', title: 'S8c a 90° right turn at 120 kt', scenario: anticipatedTurn({turnDeg: 90, groundspeedKt: 120, startBeforeNm: 4, durationS: 240})},
    {id: 'S8d', title: 'S8d a 90° right turn at 240 kt', scenario: anticipatedTurn({turnDeg: 90, groundspeedKt: 240, startBeforeNm: 7, durationS: 300})},
    {id: 'S8e', title: 'S8e a 150° left turn at 120 kt', scenario: anticipatedTurn({turnDeg: -150, groundspeedKt: 120, startBeforeNm: 6, durationS: 240})},
    {id: 'S8f', title: 'S8f a 150° left turn at 240 kt', scenario: anticipatedTurn({turnDeg: -150, groundspeedKt: 240, startBeforeNm: 12, durationS: 300})},
    {id: 'S9', title: 'S9 a Direct To 10 NM away, 120° right of the track at 120 kt', scenario: directTo120Right(240)},
    {id: 'S10', title: 'S10 a 150° right turn starting on a 45° intercept more than one turn radius inside it at 120 kt', scenario: turnStartOnInterceptInside(300)},
];

/**
 * The overshoot that counts as none: numerical noise of an asymptotic join (the roll steering design, section 6
 * (amended 2026-10-19))
 */
const OVERSHOOT_TOLERANCE_NM = 0.001;
/** The capture band of the metrics: |XTK| below 0.1 NM */
const CAPTURE_NM = 0.1;

/**
 * What each scenario must show besides "not worse" (the roll steering design, section 6):
 * - `firstBank`: the first bank toward the path or into the turn (1 left, -1 right); null where either way is toward
 *   the path (S7 starts on the leg with the leg behind, so the side is rounding noise);
 * - `established`: whether the maximum |XTK| after the capture is compared with the baseline; not where the scenario
 *   starts on or crosses the leg (S6, S7, S9), where that maximum is the swing of the turn and not the tracking;
 * - `turn`: the direction of an anticipated turn, against which no command may point until the track is within 10° of
 *   the new course;
 * - `halving`: the |XTK| at which the trainer's halving time is measured, the look-ahead distance L = GS x 30 s halved
 *   (0.5 NM at 120 kt, 1.0 NM at 240 kt)
 */
const EXPECTED: Record<string, { firstBank: 1 | -1 | null; established: boolean; turn?: 1 | -1; halving?: number }> = {
    // The baseline never captured, so it has no maximum XTK once established (its 0 means no capture)
    S1: {firstBank: -1, established: false, halving: 0.5},
    S2: {firstBank: 1, established: true, halving: 0.5},
    S3: {firstBank: 1, established: true, halving: 1.0},
    S4: {firstBank: 1, established: true},
    // Converging at 60° from the left, the 45° cap first takes 15° out of the intercept: a left bank. From a 60°
    // convergence at 1.6 NM the trainer shallowed the intercept and did not cross (checked in the KLN 89 trainer, 2026-10-19)
    S5: {firstBank: 1, established: true},
    S6: {firstBank: -1, established: false},
    S7: {firstBank: null, established: false},
    S8a: {firstBank: 1, established: true, turn: 1},
    S8b: {firstBank: 1, established: true, turn: 1},
    S8c: {firstBank: -1, established: true, turn: -1},
    S8d: {firstBank: -1, established: true, turn: -1},
    S8e: {firstBank: 1, established: true, turn: 1},
    S8f: {firstBank: 1, established: true, turn: 1},
    S9: {firstBank: -1, established: false},
    // The next leg lies to the left of the aircraft (east of it, the leg running 200): the fallback steers on it with a
    // left turn, and the turn toward it is the turn checked
    S10: {firstBank: 1, established: true, turn: 1},
};

// The new control law (RollSteeringLaw.ts) against the old RollSteeringController's BASELINE, flown with the coupled
// autopilot (the roll steering design, docs/superpowers/specs/2026-10-19-roll-steering-design.md, section 6): no turn
// reversal, the first bank toward the path or into the turn, and an overshoot and a maximum XTK once established that are
// no larger than the baseline's. The capture time is not bounded against the baseline (the maintainer's decision,
// 2026-10-19: the trainer's look-ahead joins more slowly), only logged; S1 never captured in the baseline, so there it
// must capture at all.
describe('roll steering flights (#100)', () => {
    for (const {id, title, scenario} of SCENARIOS) {
        it(`${title} (#100)`, async () => {
            const {metrics: m, samples, courseTrue, fallback} = await flyScenario(scenario);
            const b = BASELINE[id];
            const bound = {...b, ...CAPPED_TURN_BOUNDS[id]};
            const e = EXPECTED[id];
            const all = `measured ${JSON.stringify(m)}`;
            // The capture time is only logged (KLN_TEST_LOG=1 shows it): it is judged against the trainer, not the baseline
            console.log(`${id} capture after ${m.captureS} s (the old controller: ${b.captureS} s); ${all}`);

            expect(m.reversals, all).toBe(0);
            // L:KLN90B_RollCommand stays within the 25 degree peak of the design (section 4B, within the +-30 range of
            // LVars.ts and the wiki page Autopilot). The harness aircraft caps its own bank at 25, so only the command
            // shows a breach
            expect(Math.max(...samples.map(s => Math.abs(s.roll))), all).toBeLessThanOrEqual(25);
            if (e.firstBank === null) {
                expect(m.firstBankSign, all).not.toBe(0);
            } else {
                expect(m.firstBankSign, all).toBe(e.firstBank);
            }
            // The roll steering design, section 6 (amended 2026-10-19): 0.001 NM of tolerance, because an asymptotic
            // join can cross a leg by numerical noise (8e-6 NM in S1 and S5) where the baseline is exactly 0
            expect(m.overshootNm, all).toBeLessThanOrEqual(bound.overshootNm + OVERSHOOT_TOLERANCE_NM);
            if (e.established) {
                // The roll steering design, section 6 (amended 2026-10-19): at least the capture band. The first sample
                // under 0.1 NM of an asymptotic join lies just under 0.1 (0.092 to 0.0996 measured), which is no
                // excursion; the bound guards against leaving the capture band after the capture
                expect(m.maxXtkEstablishedNm, all).toBeLessThanOrEqual(Math.max(bound.maxXtkEstablishedNm, CAPTURE_NM));
            }
            if (b.captureS === null) {
                expect(m.captureS, all).not.toBeNull();
            }
            if (e.turn !== undefined) {
                expect(wrongWayCommands(samples, courseTrue, e.turn), all).toEqual([]);
            }
            if (id === 'S10') {
                // The roll steering design, section 4A: farther from the turn circle than its radius at the DTK switch, the
                // unit steers on the next leg
                expect(fallback).toBe(true);
            }
            if (e.halving !== undefined) {
                // Checked in the KLN 89 trainer, 2026-10-19: from far off the intercept builds up to about 45° and does not
                // exceed it, and inside the look-ahead distance the XTK halves in about 27 s at 119 and 239 kt. The design
                // (section 6) asks for an intercept that reaches 40° to 45.5° and a halving in roughly 20 to 35 s
                const intercept = maxInterceptDeg(samples);
                const halving = halvingTimeS(samples, e.halving);
                console.log(`${id} intercept ${intercept.toFixed(1)} deg, XTK halved in ${halving} s`);
                // The roll steering design, section 6 (amended 2026-10-19): S3 checks only the upper bound. The 40° came
                // from the trainer's 3.8 NM start; S3 starts 2 NM off at 240 kt, inside the look-ahead distance (measured
                // 35.3°; S1 and S2 45.0°)
                if (id !== 'S3') {
                    expect(intercept, all).toBeGreaterThanOrEqual(40);
                }
                expect(intercept, all).toBeLessThanOrEqual(45.5);
                expect(halving, all).not.toBeNull();
                // The roll steering design, section 6 (amended 2026-10-19): from 15 s, because the harness autopilot flies
                // a few degrees steeper than the course to steer (measured 19 s in S1 and S2, 16 s in S3)
                expect(halving!, all).toBeGreaterThanOrEqual(15);
                expect(halving!, all).toBeLessThanOrEqual(35);
            }
        });
    }
});

// The roll steering design, section 4B (amended 2026-10-19): on the circle of an anticipated turn the command never
// banks against the turn. Inside the circle near its start the law alone would steer out to the circle first, a wrong-way
// bank at the start of the turn (#100). The old controller was not measured here, so there is no baseline: the checks are
// those of the anticipated turns S8a to S8f (no reversal, the first bank into the turn, no command against it).
describe('an anticipated turn started inside the turn (#100)', () => {
    it('S11 a 150° right turn starting about 0.4 NM inside the turn at 120 kt gives no command against the turn (#100)', async () => {
        const report: { xtkInsideNm?: number; fallback?: boolean } = {};
        const {metrics: m, samples, courseTrue} = await flyScenario(turnStartInside(240, report));
        const all = `measured ${JSON.stringify(m)}, inside ${report.xtkInsideNm}`;

        // Preconditions: inside the turn by about 0.4 NM at the DTK switch, and steering on the circle (no fallback)
        expect(report.xtkInsideNm!, all).toBeGreaterThan(0.3);
        expect(report.xtkInsideNm!, all).toBeLessThan(0.5);
        expect(report.fallback, all).toBe(false);

        expect(m.reversals, all).toBe(0);
        expect(m.firstBankSign, all).toBe(-1);
        expect(wrongWayCommands(samples, courseTrue, -1), all).toEqual([]);
        expect(Math.max(...samples.map(s => Math.abs(s.roll))), all).toBeLessThanOrEqual(25);
        console.log(`S11 ${all}`);
    });
});

// The roll steering design, section 4A: once the aircraft was farther from the turn circle than its radius, the unit
// steers on the next leg (TurnStackEntry.steerOnPathForDtk) until the turn ends, also when the aircraft comes back within
// one radius of the circle. Flown in S10, where the fallback is taken at the DTK switch
describe('the next-leg fallback of a turn (#100)', () => {
    it('keeps the next-leg fallback once taken until the turn ends', async () => {
        const {flight} = await turnStartOnInterceptInside(0).start();
        const nav = flight.unit.props.memory.navPage;
        const turn = nav.activeWaypoint.turnStack[0];
        // The circle's radius, as for the precondition of S10: the capped circle, 0.54 NM
        const radiusNm = CAPPED_150_RADIUS_NM;
        expect(turn.steerOnPathForDtk).toBe(true);

        // Each second while the turn is on the stack: the flag, the steering path and the distance from the circle
        const seconds: { flag: boolean; onNextLeg: boolean; distNm: number }[] = [];
        while (nav.activeWaypoint.turnStack[0] === turn) {
            seconds.push({
                flag: turn.steerOnPathForDtk,
                onNextLeg: nav.steeringPath === turn.pathForDtk,
                distNm: Math.abs(turn.path.distance(flight.unit.props.sensors.in.gps.coords)) * EARTH_RADIUS_NM,
            });
            expect(seconds.length, 'the turn ends').toBeLessThan(300);
            await flight.fly(1);
        }

        // The aircraft came back within one radius of the circle while the turn was still on the stack, which is when
        // the fallback would end if it were decided anew each second
        expect(seconds.some(s => s.distNm < radiusNm), JSON.stringify(seconds.map(s => s.distNm.toFixed(2)))).toBe(true);
        expect(seconds.every(s => s.flag && s.onNextLeg)).toBe(true);
    });
});
