import {describe, expect, it} from 'vitest';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {airport, vor} from '../../harness/navdata/builders';
import {savedFlightplan} from '../../harness/storage';
import {angleBetween, courseDeg, finalCourseDeg, pointBefore, pointFrom} from '../../harness/flight/geo';

describe('a turn close to 180° at a waypoint (#76)', () => {
    // Spec: the KLN 89 trainer takes the next leg at once when the turn anticipation distance exceeds the distance to
    // the waypoint (fix commit e7cc3ca, and the comment in the turn-start block of NavCalculator). The Pilot's Guide
    // 4-8 and 4-9 do not cover this case. The first leg (10 NM) is shorter than the anticipation distance of a 175°
    // turn at 120 kt, so the turn can never be flown ahead of ABC.
    it('sequences to the next leg at once and then keeps one DTK, TO flag and active waypoint (#76)', async () => {
        const a = airport('KAAA', 47.0, 8.0);
        const b0 = pointFrom(a, 90, 10);
        const b = vor('ABC', b0.lat, b0.lon);
        const c0 = pointFrom(b, 265, 12);
        const c = airport('KBBB', c0.lat, c0.lon);
        const world = new World({magvar: 0}).add(a, b, c);
        const leg1 = finalCourseDeg(a, b);
        const leg2 = courseDeg(b, c);
        // A 175° right turn. At 120 kt the standard-rate radius is about 0.63 NM, so the anticipation R·tan(87.5°) is
        // about 14.4 NM, more than the 10 NM leg.
        const start = pointBefore(a, b, 7);
        const flight = await Flight.start({
            world, storage: savedFlightplan(0, [a, b, c]),
            aircraft: {lat: start.lat, lon: start.lon, altitudeFt: 3000, groundspeedKt: 120, trackTrue: leg1},
        });

        const samples: { ident: string | null; dtk: number | null; toFrom: 'TO' | 'FROM' | null; xtk: number | null; turnStackLength: number }[] = [];
        for (let s = 0; s < 60; s++) {
            await flight.fly(1);
            const n = flight.nav;
            // ActiveWaypoint replaces its turnStack array when it sequences, so read the field fresh each time
            const turnStackLength = flight.unit.props.memory.navPage.activeWaypoint.turnStack.length;
            samples.push({ident: n.activeIdent, dtk: n.dtkTrue, toFrom: n.toFrom, xtk: n.xtkNm, turnStackLength});
        }

        // The unit sequences on the first calculation ticks, so from the sixth sample on KBBB is active, flying TO it
        const settled = samples.slice(5);
        expect(settled.map(s => s.ident)).toEqual(settled.map(() => 'KBBB'));
        expect(settled.map(s => s.toFrom)).toEqual(settled.map(() => 'TO'));
        // Every DTK is one of the two leg courses, it switches at most once and never goes back to the first leg
        const legOf = (dtk: number | null) => angleBetween(dtk, leg1) < 1 ? 1 : angleBetween(dtk, leg2) < 1 ? 2 : 0;
        const legs = samples.map(s => legOf(s.dtk));
        expect(legs.filter(l => l === 0)).toEqual([]);
        let switches = 0;
        for (let i = 1; i < legs.length; i++) if (legs[i] !== legs[i - 1]) switches++;
        expect(switches).toBeLessThanOrEqual(1);
        expect(legs.lastIndexOf(1)).toBeLessThan(legs.indexOf(2));
        expect(legs[legs.length - 1]).toBe(2);

        // No turn path is ever started: the unit took the next leg at once instead of anticipating a turn it cannot fly
        expect(samples.map(s => s.turnStackLength)).toEqual(samples.map(() => 0));
        // The cross track moves continuously: the aircraft covers 0.033 NM per second at 120 kt, so one second can
        // change it by far less than 0.05 NM. A jump is a full-scale CDI kick, the HSI symptom of #76.
        const onLeg2 = samples.slice(legs.indexOf(2));
        const xtkSteps = onLeg2.slice(1).map((s, i) => Math.abs(s.xtk! - onLeg2[i].xtk!));
        expect(onLeg2.every(s => s.xtk !== null)).toBe(true);
        expect(Math.max(...xtkSteps)).toBeLessThan(0.05);
    });
});
