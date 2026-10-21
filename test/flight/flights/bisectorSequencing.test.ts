import {describe, expect, it} from 'vitest';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {airport, vor} from '../../harness/navdata/builders';
import {savedFlightplan} from '../../harness/storage';
import {angleBetween, courseDeg, crossTrackNm, distanceNm, LatLon, pointBefore, pointFrom} from '../../harness/flight/geo';
import {turnStackLength} from '../../harness/readers';
import {ManualPilot, Pilot} from '../../harness/flight/pilots';

const DEG = Math.PI / 180;

/**
 * A 28 NM leg from KAAA arriving at ABC on 090 and a turn there onto the 20 NM leg to KBBB on `nextCourse` (true, at
 * ABC). The aircraft starts `startNmBefore` before ABC, `insideNm` to the side the turn goes to (left for a left turn),
 * on the inbound course, flown by `pilot` (the coupled autopilot if not given)
 */
async function bootBeforeTurn(o: { nextCourse: number; groundspeedKt: number; startNmBefore: number; insideNm?: number; pilot?: Pilot }) {
    const w = abcPosition();
    const onLeg = pointFrom(w, 270, o.startNmBefore);
    const inbound = courseDeg(onLeg, w);
    const left = angleDiffSigned(90, o.nextCourse) < 0;
    const start = pointFrom(onLeg, inbound + (left ? -90 : 90), o.insideNm ?? 0);
    const booted = await bootBeforeTurnAt(start, inbound, o.groundspeedKt, o.nextCourse, o.pilot);
    await booted.flight.fly(1);
    expect(booted.flight.nav.activeIdent).toBe('ABC');
    return booted;
}

/** Where ABC is */
const abcPosition = (): LatLon => ({lat: 47.5, lon: 8.9});

/** The signed difference b - a in (-180, 180] */
function angleDiffSigned(a: number, b: number): number {
    return ((b - a + 540) % 360) - 180;
}

/** The distance before ABC along the inbound course 090, measured in the plane (negative past ABC) */
function alongBeforeNm(w: LatLon, pos: LatLon): number {
    return -distanceNm(w, pos) * Math.cos((courseDeg(w, pos) - 90) * DEG);
}

// 4-8 and the trainer record (docs/kln89-trainer-record.md, 2026-10-20): an anticipated turn is sequenced where the
// aircraft crosses the bisector of the turn, the line through the waypoint that halves the angle between the legs. On
// course that is the middle of the turn; for a big turn it lies well before the waypoint (3.2 NM for 171° at 239 kt in
// the trainer). The test is a state, armed once the waypoint's own turn has started (#375)
describe('the sequencing of an anticipated turn at its bisector (#375)', () => {
    it('sequences a 171° turn at 239 kt where the aircraft crosses the bisector, before the waypoint (KLN 89 trainer, 2026-10-20)', async () => {
        // Outbound 279, 171° left. The bisector ray on the inside: 270 + (180 - 171) / 2 = 274.5 (the trainer showed
        // 279.5 for its inbound 095)
        const {flight, w} = await bootBeforeTurn({nextCourse: 279, groundspeedKt: 239, startNmBefore: 12});
        await flight.flyUntil(() => flight.nav.activeIdent !== 'ABC', {timeout: 300, description: 'ABC sequenced'});
        expect(flight.nav.activeIdent).toBe('KBBB');
        const bearing = courseDeg(w, flight.aircraft);
        const before = alongBeforeNm(w, flight.aircraft);
        expect(angleBetween(bearing, 274.5), `bearing ${bearing.toFixed(1)}, ${before.toFixed(2)} NM before ABC`).toBeLessThan(2);
        expect(before, `bearing ${bearing.toFixed(1)}`).toBeGreaterThan(1);
    });

    it('sequences at once when the aircraft is already past the bisector as its turn starts', async () => {
        // Parallel 0.5 NM inside the inbound leg and held wings level: at the turn start (4.3 NM before ABC) the bearing
        // from ABC is 270 + atan(0.5 / 4.3), about 276.6, beyond the bisector ray at 274.5
        const {flight, w} = await bootBeforeTurn({nextCourse: 279, groundspeedKt: 239, startNmBefore: 12, insideNm: 0.5, pilot: new ManualPilot()});
        let dtkSwitch: number | null = null;
        let sequenced: number | null = null;
        for (let s = 0; s < 300 && (dtkSwitch === null || sequenced === null); s++) {
            await flight.fly(1);
            if (dtkSwitch === null && angleBetween(flight.nav.dtkTrue, 279) < 1) dtkSwitch = s;
            if (sequenced === null && flight.nav.activeIdent !== 'ABC') sequenced = s;
        }
        expect(dtkSwitch, 'the DTK switched to the next leg').not.toBeNull();
        expect(sequenced, 'ABC sequenced').not.toBeNull();
        expect(Math.abs(sequenced! - dtkSwitch!), `DTK at ${dtkSwitch} s, sequenced at ${sequenced} s`).toBeLessThanOrEqual(2);
        // Sequenced at the turn start, 4.3 NM before ABC (less the seconds flown since), not near ABC
        expect(alongBeforeNm(w, flight.aircraft)).toBeGreaterThan(3);
    });

    it('keeps the DTK on the next leg when the aircraft cuts the corner of a 150° turn at 300 kt (#375, #404)', async () => {
        // Hand flown: 0.7 NM inside the right turn onto 240, already flying 160 toward the next leg as the turn starts
        // (about 5.4 NM from ABC: the lead is capped at 60 s, 5.0 NM, plus the roll-in). There the aircraft is past the
        // turn's end point along the next leg and its track is within 90° of it, but it is still on the inbound side of
        // the bisector (the line through ABC on 255, halfway between 270 and 240): the turn may end only past the
        // bisector, where ABC is sequenced in the same calculation. A turn that ended while ABC was still active must not
        // be started again either, which flipped the DTK between the two legs every second
        const lead = 300 * 60 / 3600;
        // The point 0.7 NM south of the inbound leg 5.45 NM before ABC, and the start 3 NM before it on 160
        const turnStart = {x: -5.45, y: -0.7};
        const startX = turnStart.x - 3 * Math.sin(160 * DEG);
        const startY = turnStart.y - 3 * Math.cos(160 * DEG);
        const start = pointFrom(abcPosition(), (Math.atan2(startX, startY) / DEG + 360) % 360, Math.hypot(startX, startY));
        const {flight, w} = await bootBeforeTurnAt(start, 160, 300, 240, new ManualPilot());

        await flight.flyUntil(() => flight.nav.activeIdent !== 'ABC' || turnStackLength(flight.unit) > 0, {timeout: 60, description: 'start of the turn at ABC'});
        expect(flight.nav.activeIdent).toBe('ABC');
        // Preconditions at the turn start: on the inbound side of the bisector (right of 255 through ABC), past the end
        // point along the next leg, the track within 90° of the next leg, and within 1 NM of the inbound leg
        const ac = flight.aircraft;
        expect(crossTrackNm(ac, w, 255), 'inbound side of the bisector').toBeGreaterThan(0.2);
        expect(distanceNm(w, ac) * Math.cos((courseDeg(w, ac) - 240) * DEG), 'past the end point along the next leg').toBeGreaterThan(lead);
        expect(angleBetween(ac.trackTrue, 240)).toBeLessThan(90);
        expect(Math.abs(crossTrackNm(ac, w, 90))).toBeLessThan(1);

        // Each second for 30 s from the turn start. The DTK follows the turn start one calculation later
        const samples: { ident: string | null; stack: number; dtk: number | null; side: number }[] = [];
        for (let s = 0; s < 30; s++) {
            await flight.fly(1);
            samples.push({ident: flight.nav.activeIdent, stack: turnStackLength(flight.unit), dtk: flight.nav.dtkTrue, side: crossTrackNm(flight.aircraft, w, 255)});
        }
        const all = JSON.stringify(samples.map(s => `${s.ident}:${s.stack}:${s.dtk?.toFixed(0)}:${s.side.toFixed(2)}`));
        // ABC is sequenced at the bisector, and KBBB stays active
        const kbbbFrom = samples.findIndex(s => s.ident === 'KBBB');
        expect(kbbbFrom, all).toBeGreaterThan(0);
        expect(samples.slice(kbbbFrom).every(s => s.ident === 'KBBB'), all).toBe(true);
        // The turn ended in the calculation that sequenced ABC and is not started again for ABC before the sequencing:
        // KBBB has no turn of ABC's on the stack
        expect(samples.slice(kbbbFrom).every(s => s.stack === 0), all).toBe(true);
        // While ABC is active the turn is on the stack, and the DTK is the next leg's in every second but one. ABC is
        // sequenced at the bisector (KLN 89 trainer, 2026-10-20, docs/kln89-trainer-record.md), and here the turn ends
        // in the calculation that sequences ABC (the aircraft is past the bisector and already past the end
        // point), and that calculation takes the DTK before the sequencing, from the inbound leg: the one-calculation lag
        // of the DTK behind the sequencing, which predates #375
        expect(samples.slice(0, kbbbFrom).every(s => s.stack > 0), all).toBe(true);
        expect(samples.filter(s => angleBetween(s.dtk, 240) >= 1), all).toEqual([samples[kbbbFrom]]);
    });
});

/**
 * The world of bootBeforeTurn, booted with the aircraft at `start` on `trackTrue`
 */
async function bootBeforeTurnAt(start: LatLon, trackTrue: number, groundspeedKt: number, nextCourse: number, pilot?: Pilot) {
    const p = abcPosition();
    const w = vor('ABC', p.lat, p.lon);
    const a0 = pointFrom(w, 270, 28);
    const a = airport('KAAA', a0.lat, a0.lon);
    const c0 = pointFrom(w, nextCourse, 20);
    const c = airport('KBBB', c0.lat, c0.lon);
    const world = new World({magvar: 0}).add(a, w, c);
    const flight = await Flight.start({
        world, storage: savedFlightplan(0, [a, w, c]), pilot,
        aircraft: {lat: start.lat, lon: start.lon, altitudeFt: 3000, groundspeedKt, trackTrue},
    });
    await flight.flyUntil(() => flight.nav.activeIdent !== null, {timeout: 30, description: 'a waypoint active'});
    expect(flight.nav.activeIdent).toBe('ABC');
    return {flight, w};
}
