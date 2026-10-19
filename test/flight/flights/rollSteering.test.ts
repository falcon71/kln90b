import {describe, expect, it} from 'vitest';
import {Facility} from '@microsoft/msfs-sdk';
import {LVAR_ROLL_COMMAND} from '../../../kln90b/LVars';
import {Flight} from '../../harness/flight/Flight';
import {ManualPilot} from '../../harness/flight/pilots';
import {World} from '../../harness/flight/World';
import {airport, vor} from '../../harness/navdata/builders';
import {standardRoute} from '../../harness/fixtures';
import {savedFlightplan} from '../../harness/storage';
import {angleBetween, courseDeg, crossTrackNm, distanceNm, finalCourseDeg, LatLon, norm360, pointBefore, pointFrom} from '../../harness/flight/geo';

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
    start: () => Promise<{ flight: Flight; target: Target }>;
    /** Seconds flown after the start event */
    durationS: number;
}

interface Sample {
    t: number;
    roll: number;
    xtkNm: number;
    trackTrue: number;
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
async function flyScenario(s: Scenario): Promise<Metrics> {
    const {flight, target} = await s.start();
    const samples: Sample[] = [];
    const record = (t: number) => samples.push({
        t, roll: roll(flight), xtkNm: crossTrackNm(flight.aircraft, target.through, target.courseTrue), trackTrue: flight.aircraft.trackTrue,
    });
    record(0);
    for (let t = 1; t <= s.durationS; t++) {
        await flight.fly(1);
        record(t);
    }
    return metricsOf(samples, target.courseTrue);
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

const NM_FLOOR = 0.02;
const S_FLOOR = 2;

/**
 * Each metric against its baseline: firstBankSign and reversals exactly, the distances and the capture time within
 * 10 % of the measured value or 0.02 NM / 2 s, whichever is larger. The failure message carries all measured metrics.
 */
function expectBaseline(m: Metrics, b: Metrics): void {
    const all = `measured ${JSON.stringify(m)}`;
    expect(m.firstBankSign, all).toBe(b.firstBankSign);
    expect(m.reversals, all).toBe(b.reversals);
    const within = (name: string, actual: number, baseline: number, floor: number) =>
        expect(Math.abs(actual - baseline), `${name} ${actual} against ${baseline}; ${all}`).toBeLessThanOrEqual(Math.max(0.1 * Math.abs(baseline), floor));
    within('overshootNm', m.overshootNm, b.overshootNm, NM_FLOOR);
    within('maxXtkEstablishedNm', m.maxXtkEstablishedNm, b.maxXtkEstablishedNm, NM_FLOOR);
    if (b.captureS === null) {
        expect(m.captureS, all).toBeNull();
    } else {
        expect(m.captureS, all).not.toBeNull();
        within('captureS', m.captureS!, b.captureS, S_FLOOR);
    }
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
 * S10: turn anticipation starting on a 45° intercept more than one turn radius inside the turn (the fallback of section
 * 4A). A 150° right turn at ABC at 120 kt. Its anticipation distance is about R tan(75°) = 2.4 NM with the standard-rate
 * radius R = 0.64 NM (3°/s at 120 kt), so the turn starts about 2.5 NM from ABC. The aircraft is put on a 045 track (the
 * inbound 050 less 45°, closing from the right, the inside of the turn) aimed at the point 2.0 NM right of the leg and
 * 1.5 NM before ABC, 2.5 NM from it, and placed 2 NM before that point. The old controller holds a 45° intercept from
 * the right while it is far off (the far-away branch of RollSteeringController), so the turn starts with the aircraft
 * about 2 NM inside the inbound leg, outside the turn circle on its far side by more than R. The start event is the DTK
 * switch, the target the leg ABC - KBBB.
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
            await flight.flyUntil(() => flight.nav.activeIdent !== 'ABC' || angleBetween(flight.nav.dtkTrue, next) < 1,
                {timeout: 120, description: 'start of the turn at ABC'});
            expect(flight.nav.activeIdent).toBe('ABC');
            // Preconditions: still on the 45° intercept, and farther from the turn circle than its radius. The circle is
            // derived here from the standard-rate radius at 120 kt, R = v / (3°/s) = 61.73 m/s / 0.05236 rad/s = 0.64 NM,
            // tangent to the inbound leg R tan(75°) before ABC, its center R to the right
            expect(angleBetween(flight.aircraft.trackTrue, track)).toBeLessThan(2);
            const r = 120 * 1852 / 3600 / (3 * Math.PI / 180) / 1852;
            const center = pointFrom(pointBefore(kaaa, abc, r * Math.tan(75 * Math.PI / 180)), inbound + 90, r);
            expect(Math.abs(distanceNm(flight.aircraft, center) - r)).toBeGreaterThan(r);
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

// Characterization: the old RollSteeringController as of 15b5ddd, measured on 2026-10-19. The literals in BASELINE are
// the measured values; the margins are those of the plan (10 % or 0.02 NM / 2 s, whichever is larger; the sign and the
// reversals exactly). They claim nothing about the real unit: they are the baseline the new control law must not fall
// behind (design section 6, #100).
describe('roll steering baseline flights (characterization, #100)', () => {
    for (const {id, title, scenario} of SCENARIOS) {
        it(`${title} (baseline, characterization, #100)`, async () => {
            expectBaseline(await flyScenario(scenario), BASELINE[id]);
        });
    }
});
