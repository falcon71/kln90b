import {describe, expect, it} from 'vitest';
import {Facility, GeoPoint} from '@microsoft/msfs-sdk';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {vor} from '../../harness/navdata/builders';
import {standardRoute} from '../../harness/fixtures';
import {savedFlightplan} from '../../harness/storage';
import {angleBetween, courseDeg, crossTrackNm, distanceNm, finalCourseDeg, pointBefore, pointFrom} from '../../harness/flight/geo';
import {turnStackLength} from '../../harness/readers';

/** The standard world of the proof flight: KAAA - ABC - KBBB, with the aircraft 3 NM before ABC on the first leg */
async function flyToward(plan: (kaaa: Facility, abc: Facility, kbbb: Facility, world: World) => Facility[], storage: Record<string, unknown>) {
    const {kaaa, abc, kbbb} = standardRoute();
    const world = new World({magvar: 0}).add(kaaa, abc, kbbb);
    const legs = plan(kaaa, abc, kbbb, world);
    const leg1 = finalCourseDeg(kaaa, abc);
    const start = pointBefore(kaaa, abc, 3);
    const flight = await Flight.start({
        world, storage: {...savedFlightplan(0, legs), ...storage},
        aircraft: {lat: start.lat, lon: start.lon, altitudeFt: 3000, groundspeedKt: 120, trackTrue: leg1},
    });
    return {flight, kaaa, abc, kbbb, world};
}

const withoutRepeats = (values: number[]) => values.filter((v, i) => i === 0 || v !== values[i - 1]);

// Spec: the KLN 89 trainer sequences through consecutive identical waypoints and overflies the duplicate instead of
// anticipating the turn (the comment at the anticipation condition in NavCalculator.ts, added by dbb01bf); 3364def is
// the fix of the error. The Pilot's Guide has no page for it. Turn anticipation is off here so that only the #19 path
// is under test: with it on, the guard of #27 (dbb01bf) keeps the flight out of the code that would fail first.
// #23 (the same fix for a STAR with a repeated fix) needs procedures, which the harness navdata does not have yet.
describe('consecutive identical waypoints sequence without an error (#19)', () => {
    it('sequences through both ABC legs to KBBB, with a finite DTK (#19)', async () => {
        const {flight, abc, kbbb} = await flyToward((kaaa, abc, kbbb) => [kaaa, abc, abc, kbbb], {turnAnticipation: false});
        const activeIdx = () => flight.unit.props.memory.navPage.activeWaypoint.getActiveFplIdx();
        // The idents of FPL legs 1 and 2 are both ABC, so the plan index tells them apart
        const indices: number[] = [];
        flight.monitor('active leg index', f => {
            indices.push(f.unit.props.memory.navPage.activeWaypoint.getActiveFplIdx());
            const dtk = f.nav.dtkTrue;
            return dtk === null || Number.isFinite(dtk) || `DTK ${dtk}`;
        });

        await flight.flyUntil(() => activeIdx() === 3, {timeout: 150, description: 'sequenced through both ABC legs to KBBB'});
        await flight.fly(2);

        // #407: the leg of no length between the copies is passed in the calculation that sequences the first one, so
        // the second copy (index 2) is never the active waypoint of a calculation. Before, it was for one calculation,
        // the lag of the values behind the sequencing; the same calculation is the design's call (2026-10-27, Review
        // Focus 1), not flown in the trainer
        expect(withoutRepeats(indices)).toEqual([1, 3]);
        expect(flight.nav.activeIdent).toBe('KBBB');
        expect(angleBetween(flight.nav.dtkTrue, courseDeg(abc, kbbb))).toBeLessThan(1);
    });

    // #22: a REF waypoint on top of a plan waypoint, two facilities at the same coordinates (the guard compares
    // coordinates, not idents)
    it('sequences through two different facilities at the same coordinates (#22)', async () => {
        const abd = vor('ABD', 47.5, 8.9);
        const {flight, abc, kbbb} = await flyToward((kaaa, abc, kbbb, world) => {
            world.add(abd);
            return [kaaa, abc, abd, kbbb];
        }, {turnAnticipation: false});
        const idents: string[] = [];
        flight.monitor('active ident', f => {
            idents.push(f.nav.activeIdent ?? '-');
            const dtk = f.nav.dtkTrue;
            return dtk === null || Number.isFinite(dtk) || `DTK ${dtk}`;
        });

        await flight.flyUntilActive('KBBB', {timeout: 150});
        await flight.fly(2);

        // #407: ABD, the leg of no length, is passed in the calculation that sequences ABC (the design's call, 2026-10-27;
        // see the previous test)
        expect(idents.filter((v, i) => i === 0 || v !== idents[i - 1])).toEqual(['ABC', 'KBBB']);
        expect(angleBetween(flight.nav.dtkTrue, courseDeg(abc, kbbb))).toBeLessThan(1);
    });
});

// Spec: the KLN 89 trainer overflies a duplicated waypoint instead of anticipating a turn (fix commit dbb01bf, and the
// comment at the anticipation condition of NavCalculator); the Pilot's Guide 4-8 describes turn anticipation in
// general only. The render half of #27 is in test/render/pages/right/Dt3Page.test.ts.
describe('no turn anticipation into a duplicated waypoint (#27)', () => {
    it('overflies ABC on the first leg, without a turn path, bank or cross track (#27)', async () => {
        const {flight, abc} = await flyToward((kaaa, abc, kbbb) => [kaaa, abc, abc, kbbb], {});
        const activeIdx = () => flight.unit.props.memory.navPage.activeWaypoint.getActiveFplIdx();
        const samples: { turnStackLength: number; bank: number; xtk: number; distToAbc: number }[] = [];
        flight.monitor('approach to the first ABC', f => {
            const xtk = f.nav.xtkNm;
            if (activeIdx() === 1 && xtk !== null) {
                samples.push({turnStackLength: turnStackLength(flight.unit), bank: f.aircraft.bankDeg, xtk, distToAbc: distanceNm(f.aircraft, abc)});
            }
            return true;
        });

        // Past the first ABC the unit goes on past the second at once, to KBBB (#407)
        await flight.flyUntil(() => activeIdx() > 1, {timeout: 150, description: 'first ABC passed'});

        // 3 NM at 120 kt take 90 s, one sample each
        expect(samples.length).toBeGreaterThanOrEqual(80);
        expect(samples.map(s => s.turnStackLength)).toEqual(samples.map(() => 0));
        expect(Math.max(...samples.map(s => Math.abs(s.bank)))).toBeLessThan(0.5);
        expect(Math.max(...samples.map(s => Math.abs(s.xtk)))).toBeLessThan(0.01);
        // One sample every 0.033 NM; the aircraft flew over ABC
        expect(Math.min(...samples.map(s => s.distToAbc))).toBeLessThan(0.05);
    });
});

// #120: with a plan whose only leg has no length, [KAAA, KAAA], sequencing cannot advance and no leg lies before the
// zero-length one. The unit keeps what it can compute (distance, bearing and ETE) and writes all outputs, so the GPS
// SimVars follow the aircraft (public contract, CLAUDE.md "GPS SimVars written when Output.WriteGPSSimVars is set").
// The Pilot's Guide 4-1 does not say what a plan without leg length shows. With a leg before it, the unit navigates on
// that leg's course (test/render/data/navdata/NavCalculator.test.ts).
describe('a plan whose only leg has no length (#120)', () => {
    const recorded: { moved: number; outputLagNm: number | null } = {moved: 0, outputLagNm: null};

    it('flies with KAAA active and the aircraft moving away from its start (#120)', async () => {
        const {kaaa} = standardRoute();
        const world = new World({magvar: 0}).add(kaaa);
        const start = pointFrom(kaaa, 270, 5);
        const flight = await Flight.start({
            world, storage: savedFlightplan(0, [kaaa, kaaa]),
            aircraft: {lat: start.lat, lon: start.lon, altitudeFt: 3000, groundspeedKt: 120, trackTrue: 90},
        });
        await flight.flyUntilActive('KAAA', {timeout: 10});

        await flight.fly(30);

        // 30 s at 120 kt fly 1 NM; the unguided aircraft may curve, so the chord is shorter
        recorded.moved = distanceNm(start, flight.aircraft);
        expect(recorded.moved).toBeGreaterThan(0.5);
        const lat = flight.sim.get('GPS POSITION LAT', 'degrees');
        const lon = flight.sim.get('GPS POSITION LON', 'degrees');
        recorded.outputLagNm = flight.sim.lastWrite('GPS POSITION LAT') === undefined ? null : distanceNm({lat, lon}, flight.aircraft);
    });

    it('keeps the GPS position outputs current while the aircraft moves (#120)', () => {
        expect(recorded.moved).toBeGreaterThan(0.5);
        expect(recorded.outputLagNm).not.toBeNull();
        expect(recorded.outputLagNm!).toBeLessThan(0.1);
    });
});

// #373: on a final leg whose end repeats the waypoint before it, [KAAA, ABC, ABC], the unit keeps navigating on the course
// of the leg before it (#120, checked in the KLN 89 trainer, 2026-10-14), so XTK follows the extended course. Roll
// steering follows XTK and without a path it gives no command (the roll steering design, docs/superpowers/specs/2026-10-19-roll-steering-design.md,
// section 3 and section 5 item 2). The coupled autopilot flies the roll command of the unit.
describe('roll steering on a final leg that repeats the waypoint before it (#373)', () => {
    it('turns back onto the extended course past ABC and holds it (#373)', async () => {
        const {flight, kaaa, abc} = await flyToward((kaaa, abc) => [kaaa, abc, abc], {});
        const course = finalCourseDeg(kaaa, abc);
        const activeIdx = () => flight.unit.props.memory.navPage.activeWaypoint.getActiveFplIdx();
        await flight.flyUntil(() => activeIdx() === 2 && distanceNm(flight.aircraft, abc) > 1, {timeout: 150, description: 'past ABC on the leg ABC to ABC'});

        // The path the unit steers on is the one XTK is measured on: the great circle KAAA to ABC, not the path of the leg
        // ABC to ABC, which has no center
        const path = flight.unit.props.memory.navPage.steeringPath!;
        expect(path).not.toBeNull();
        expect(Number.isFinite(path.center[0])).toBe(true);
        expect(path.distance(new GeoPoint(abc.lat, abc.lon))).toBeLessThan(1e-6);
        expect(angleBetween(path.bearingAt(new GeoPoint(abc.lat, abc.lon)), course)).toBeLessThan(0.5);

        // Displaced 1 NM right of the extended course, flying the course's track; the aircraft is set directly, because
        // Flight.jump moves along the aircraft's track only
        const onCourse = pointFrom(abc, course, 4);
        const displaced = pointFrom(onCourse, course + 90, 1);
        Object.assign(flight.aircraft, {lat: displaced.lat, lon: displaced.lon, trackTrue: course, bankDeg: 0});
        flight.aircraft.writeTo(flight.sim, 0);
        expect(crossTrackNm(flight.aircraft, abc, course)).toBeGreaterThan(0.9);
        const rolls: number[] = [];
        const lateOffsets: number[] = [];
        const t0 = flight.t;
        flight.monitor('roll and offset after the displacement', f => {
            rolls.push(f.sim.get('L:KLN90B_RollCommand', 'degrees'));
            if (f.t - t0 > 180) lateOffsets.push(Math.abs(crossTrackNm(f.aircraft, abc, course)));
            return true;
        });

        await flight.fly(240);

        // L:KLN90B_RollCommand is positive for a left bank, toward the course
        expect(rolls.find(r => Math.abs(r) >= 2)).toBeGreaterThan(0);
        expect(lateOffsets.length).toBeGreaterThanOrEqual(55);
        expect(Math.max(...lateOffsets)).toBeLessThan(0.1);
    });
});
