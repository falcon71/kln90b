import {describe, expect, it} from 'vitest';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {airport, vor} from '../../harness/navdata/builders';
import {standardRoute} from '../../harness/fixtures';
import {savedFlightplan} from '../../harness/storage';
import {angleBetween, courseDeg, crossTrackNm, distanceNm, finalCourseDeg, pointBefore, pointFrom} from '../../harness/flight/geo';
import {turnStackLength} from '../../harness/readers';
import {ManualPilot} from '../../harness/flight/pilots';

const DEG = Math.PI / 180;

/**
 * The distance the sim adds on top of the lead so that the aircraft is banked when the turn begins (NavCalculator, the
 * roll-in), derived here from its definition: the standard-rate bank atan(GS / 362.1) limited to 25°, reached at
 * 5°/s, flown at the ground speed. 0.332 NM at 239 kt (25° in 5 s), 0.120 NM at 119 kt (18.2° in 3.6 s)
 */
function rollInNm(groundspeedKt: number): number {
    const bank = Math.min(Math.atan(groundspeedKt / 362.1) / DEG, 25);
    return bank / 5 * groundspeedKt / 3600;
}

/** One calculation tick (1 s) of flight at the ground speed: the unit starts the turn within the tick before it is due */
const tickNm = (groundspeedKt: number) => groundspeedKt / 3600;

/** The rounding of the aircraft's position against the GPS position the calculation used: a display tick of flight */
const POSITION_TOLERANCE_NM = 0.02;

/**
 * Flies until the unit starts the turn at `ident` (it puts the turn on the turn stack) or `ident` is no longer active,
 * and returns the straight distance from the aircraft to `wpt` then. The DTK is calculated before the sequencing in the
 * calculation tick, so it shows the next leg from the following calculation on: the function checks that one second
 * later the DTK is `nextCourse`, with `ident` still active.
 */
async function flyToTurnStart(flight: Flight, ident: string, wpt: { lat: number; lon: number }, nextCourse: number, timeout: number): Promise<number> {
    expect(turnStackLength(flight.unit), 'no turn on the stack before the turn at ' + ident).toBe(0);
    await flight.flyUntil(() => flight.nav.activeIdent !== ident || turnStackLength(flight.unit) > 0,
        {timeout, description: `start of the turn at ${ident}`});
    const dist = distanceNm(flight.aircraft, wpt);
    expect(flight.nav.activeIdent, 'active at the turn start').toBe(ident);
    await flight.fly(1);
    expect(flight.nav.activeIdent, 'active one second after the turn start').toBe(ident);
    expect(angleBetween(flight.nav.dtkTrue, nextCourse), 'DTK on the next leg one second after the turn start').toBeLessThan(1);
    return dist;
}

/**
 * Where the Direct To entry starts, so that it is active about 0.15 NM before ABC: the entry takes a few display ticks
 * of flight at 120 kt (0.033 NM per second)
 */
const ENTRY_START_NM = 0.19;

/**
 * A 28 NM leg arriving at ABC on 090 and a right turn of `turnDeg` there onto the leg to KBBB, flown at 239 kt from 12 NM
 * before ABC. 12 NM before ABC the turn is not due yet, so ABC is the waypoint the plan activates. `next` is the course
 * of the next leg at ABC
 */
async function bootBeforeCappedTurn(turnDeg: number) {
    const w = vor('ABC', 47.5, 8.9);
    const a0 = pointFrom(w, 270, 28);
    const a = airport('KAAA', a0.lat, a0.lon);
    const c0 = pointFrom(w, 90 + turnDeg, 20);
    const c = airport('KBBB', c0.lat, c0.lon);
    const world = new World({magvar: 0}).add(a, w, c);
    const start = pointBefore(a, w, 12);
    const flight = await Flight.start({
        world, storage: savedFlightplan(0, [a, w, c]),
        aircraft: {lat: start.lat, lon: start.lon, altitudeFt: 3000, groundspeedKt: 239, trackTrue: courseDeg(start, w)},
    });
    await flight.flyUntil(() => flight.nav.activeIdent !== null, {timeout: 30, description: 'a waypoint active'});
    await flight.fly(1);
    expect(flight.nav.activeIdent).toBe('ABC');
    return {flight, w, next: courseDeg(w, c)};
}

// Checked in the KLN 89 trainer, 2026-10-20 (docs/kln89-trainer-record.md): the turn starts at r·tan(θ/2) before the
// waypoint, capped at 60 s of ground speed and at half the inbound leg, and a capped turn is flown, the waypoint is not
// skipped (#404, which replaces the skip of #76). The sim adds the roll-in on top of the capped lead.
describe('the turn anticipation distance (#404)', () => {
    it('starts a 171° turn at 239 kt 4.0 NM before the waypoint plus the roll-in (KLN 89 trainer, 2026-10-20, #404)', async () => {
        // Uncapped the lead would be 1.79 NM × tan(85.5°), about 22.7 NM; 60 s at 239 kt are 3.983 NM, the trainer's 4.0 NM
        const {flight, w, next} = await bootBeforeCappedTurn(171);
        const dist = await flyToTurnStart(flight, 'ABC', w, next, 300);
        const due = 239 * 60 / 3600 + rollInNm(239);
        expect(dist).toBeGreaterThanOrEqual(due - POSITION_TOLERANCE_NM);
        expect(dist).toBeLessThanOrEqual(due + tickNm(239) + POSITION_TOLERANCE_NM);
        // The literals of the brief, so that a wrong derivation above cannot move both sides: 3.983 + 0.332
        expect(due).toBeCloseTo(3.983 + 0.332, 3);
    });

    it('starts a 171° turn after a 2.0 NM leg at 119 kt 1.0 NM before the waypoint plus the roll-in, and flies it (#404)', async () => {
        // KAAA, BBB and CCC on one great circle arriving at CCC on 090, BBB 2.0 NM before CCC (no turn there), then a 171°
        // right turn at CCC onto the leg to KDDD. Uncapped the lead would be 0.63 NM × tan(85.5°), about 8 NM; 60 s at
        // 119 kt are 1.98 NM; half the 2.0 NM leg is 1.0 NM, the trainer's cap after a short leg
        const cc = vor('CCC', 47.5, 8.9);
        const b0 = pointFrom(cc, 270, 2.0);
        const bb = vor('BBB', b0.lat, b0.lon);
        const a0 = pointFrom(cc, 270, 12);
        const a = airport('KAAA', a0.lat, a0.lon);
        const d0 = pointFrom(cc, 90 + 171, 20);
        const d = airport('KDDD', d0.lat, d0.lon);
        const world = new World({magvar: 0}).add(a, bb, cc, d);
        const start = pointBefore(a, bb, 3);
        const flight = await Flight.start({
            world, storage: savedFlightplan(0, [a, bb, cc, d]),
            aircraft: {lat: start.lat, lon: start.lon, altitudeFt: 3000, groundspeedKt: 119, trackTrue: courseDeg(start, bb)},
        });
        await flight.flyUntilActive('BBB', {timeout: 30});
        await flight.flyUntilActive('CCC', {timeout: 200});
        // The turn of no size at BBB may still be on the stack when CCC becomes active
        await flight.flyUntil(() => turnStackLength(flight.unit) === 0 || flight.nav.activeIdent !== 'CCC', {timeout: 10, description: 'the turn at BBB ended'});

        // CCC stays active at the turn start: the turn is anticipated, not skipped (the #76 rule is gone)
        const next = courseDeg(cc, d);
        const dist = await flyToTurnStart(flight, 'CCC', cc, next, 120);
        const due = 2.0 / 2 + rollInNm(119);
        expect(dist).toBeGreaterThanOrEqual(due - POSITION_TOLERANCE_NM);
        expect(dist).toBeLessThanOrEqual(due + tickNm(119) + POSITION_TOLERANCE_NM);
        expect(due).toBeCloseTo(1.0 + 0.120, 3);

        // And it is flown: KDDD becomes active and the aircraft ends up established on the leg to it
        await flight.flyUntilActive('KDDD', {timeout: 120});
        await flight.flyUntil(() => turnStackLength(flight.unit) === 0, {timeout: 120, description: 'end of the turn at CCC'});
        await flight.flyUntil(() => Math.abs(crossTrackNm(flight.aircraft, cc, next)) < 0.1 && angleBetween(flight.aircraft.trackTrue, next) < 5,
            {timeout: 300, description: 'established on the leg to KDDD'});
        expect(flight.nav.activeIdent).toBe('KDDD');
    });

    it('flies a Direct To activated inside the lead instead of skipping it (#404)', async () => {
        // The standard route's 34° left turn at ABC at 120 kt: lead 0.63 NM × tan(17.2°) = 0.197 NM, roll-in 0.12 NM. A
        // Direct To ABC entered so that it becomes active about 0.15 NM before ABC on the inbound course, inside the
        // uncapped lead itself (the old rule skipped ABC there). The inbound leg of the Direct To is that 0.15 NM, so
        // the lead is half of it and the turn is due at once. The aircraft is held wings level on the inbound course from
        // before the plan's own turn at ABC begins, so the Direct To starts on that course
        const {kaaa, abc, kbbb} = standardRoute();
        const world = new World({magvar: 0}).add(kaaa, abc, kbbb);
        const start = pointBefore(kaaa, abc, 3);
        const flight = await Flight.start({
            world, storage: savedFlightplan(0, [kaaa, abc, kbbb]),
            aircraft: {lat: start.lat, lon: start.lon, altitudeFt: 3000, groundspeedKt: 120, trackTrue: finalCourseDeg(kaaa, abc)},
        });
        await flight.flyUntilActive('ABC', {timeout: 30});
        const aw = flight.unit.props.memory.navPage.activeWaypoint;

        await flight.flyUntil(() => distanceNm(flight.aircraft, abc) <= 0.5, {timeout: 120, description: '0.5 NM before ABC'});
        const autopilot = flight.pilot;
        flight.pilot = new ManualPilot();
        await flight.flyUntil(() => distanceNm(flight.aircraft, abc) <= ENTRY_START_NM, {timeout: 30, description: 'the point to enter the Direct To'});
        await flight.panel.directTo('ABC', {waitMs: 0});
        await flight.flyUntil(() => aw.isDctNavigation(), {timeout: 5, description: 'the Direct To active'});
        flight.pilot = autopilot;
        // Precondition: the Direct To started inside the uncapped lead of 0.197 NM, and ahead of ABC
        const origin = aw.getFromWpt()!;
        const inbound = distanceNm(origin, abc);
        expect(inbound).toBeLessThan(0.197);
        expect(inbound).toBeGreaterThan(0.1);

        // The first calculation of the Direct To starts the turn instead of skipping ABC; the DTK follows with the next
        await flight.fly(1);
        expect(flight.nav.activeIdent).toBe('ABC');
        expect(turnStackLength(flight.unit)).toBeGreaterThan(0);
        await flight.fly(1);
        expect(angleBetween(flight.nav.dtkTrue, courseDeg(abc, kbbb))).toBeLessThan(1);
    });
});

// #404: a capped turn is tighter than the aircraft can fly at 25° of bank, so the aircraft lags its circle and moves away
// from the circle's end point at first. The turn ends only once the aircraft is past the bisector of the turn and past
// the end point along the next leg, so near 180° (where the start of the turn lies barely before its end point along
// the next leg) it does not end where it starts, and it is not started over and over again either
describe('the end of a capped turn close to 180° (#404)', () => {
    for (const turnDeg of [171, 179]) {
        it(`keeps the DTK on the next leg from the start of a ${turnDeg}° turn at 239 kt until the aircraft is past its end point (#404)`, async () => {
            const {flight, w, next} = await bootBeforeCappedTurn(turnDeg);
            const lead = 239 * 60 / 3600;
            // The end of the turn: the lead past ABC on the next leg. The distance along the next leg that remains to it is
            // measured in the plane, which over these few NM differs from the sphere by far less than the tolerances
            const remainingToEnd = () => {
                const d = distanceNm(w, flight.aircraft);
                return lead - d * Math.cos((courseDeg(w, flight.aircraft) - next) * DEG);
            };

            await flight.flyUntil(() => flight.nav.activeIdent !== 'ABC' || turnStackLength(flight.unit) > 0, {timeout: 300, description: 'start of the turn at ABC'});
            expect(flight.nav.activeIdent).toBe('ABC');
            // Each second from the turn start until the turn has left the stack. The DTK follows the turn start one
            // calculation later (it is calculated before the sequencing), so the first sample is one second in
            const samples: { ident: string | null; dtk: number | null; stack: number; remaining: number }[] = [];
            do {
                await flight.fly(1);
                samples.push({ident: flight.nav.activeIdent, dtk: flight.nav.dtkTrue, stack: turnStackLength(flight.unit), remaining: remainingToEnd()});
                expect(samples.length, 'the turn ends').toBeLessThan(300);
            } while (samples[samples.length - 1].stack > 0);
            const all = JSON.stringify(samples.map(s => `${s.ident}:${s.stack}:${s.dtk?.toFixed(0)}:${s.remaining.toFixed(2)}`));

            // ABC is sequenced while the turn is flown, and KBBB stays active
            const kbbbFrom = samples.findIndex(s => s.ident === 'KBBB');
            expect(kbbbFrom, all).toBeGreaterThan(0);
            expect(samples.slice(kbbbFrom).every(s => s.ident === 'KBBB'), all).toBe(true);
            // The DTK is the next leg's in every second, before and after the sequencing: no flip back to the inbound leg
            expect(samples.filter(s => angleBetween(s.dtk, next) >= 1), all).toEqual([]);
            // The turn leaves the stack once the aircraft is past the end point along the next leg (within the tick before,
            // 0.066 NM at 239 kt, and a display tick of rounding), never before
            const end = samples[samples.length - 1];
            expect(end.remaining, all).toBeLessThanOrEqual(tickNm(239) + POSITION_TOLERANCE_NM);
            expect(end.remaining, all).toBeGreaterThanOrEqual(-POSITION_TOLERANCE_NM);
            expect(samples.slice(0, -1).every(s => s.stack > 0), all).toBe(true);
        });
    }

    it('ends a turn the aircraft leaves by more than 4.0 NM from the next leg (KLN 89 trainer, 2026-10-20, #404)', async () => {
        // The off-the-leg threshold of the trainer record: |XTK| against a fixed 4.0 NM. Hand flown, the aircraft turns
        // away from the 171° right turn (left, to north) once the turn has started, and flies on north, away from the next
        // leg and never past the turn's bisector, so the turn can only end by that distance
        const {flight, w, next} = await bootBeforeCappedTurn(171);
        await flight.flyUntil(() => flight.nav.activeIdent !== 'ABC' || turnStackLength(flight.unit) > 0, {timeout: 300, description: 'start of the turn at ABC'});
        expect(flight.nav.activeIdent).toBe('ABC');
        const pilot = new ManualPilot();
        flight.pilot = pilot;
        pilot.bank = -25;
        await flight.flyUntil(() => angleBetween(flight.aircraft.trackTrue, 0) < 5, {timeout: 120, description: 'heading north'});
        pilot.bank = 0;

        const samples: { offNm: number; stack: number }[] = [];
        do {
            await flight.fly(1);
            samples.push({offNm: Math.abs(crossTrackNm(flight.aircraft, w, next)), stack: turnStackLength(flight.unit)});
            expect(samples.length, 'more than 4.2 NM from the next leg').toBeLessThan(300);
        } while (samples[samples.length - 1].offNm <= 4.2);
        const all = JSON.stringify(samples.map(s => `${s.offNm.toFixed(2)}:${s.stack}`));
        // On the stack while within 4.0 NM (less a display tick of rounding), off it beyond 4.0 NM plus the tick ahead
        // (0.066 NM at 239 kt, flown north at about 81° to the next leg) and the rounding
        expect(samples.filter(s => s.offNm < 4.0 - POSITION_TOLERANCE_NM).every(s => s.stack > 0), all).toBe(true);
        expect(samples.filter(s => s.offNm > 4.0 + tickNm(239) + POSITION_TOLERANCE_NM).every(s => s.stack === 0), all).toBe(true);
        expect(samples.some(s => s.offNm < 4.0 - POSITION_TOLERANCE_NM), all).toBe(true);
    });
});
