import {describe, expect, it} from 'vitest';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {airport, vor} from '../../harness/navdata/builders';
import {savedFlightplan} from '../../harness/storage';
import {angleBetween, courseDeg, distanceNm, finalCourseDeg, pointBefore, pointFrom} from '../../harness/flight/geo';
import {turnStackLength} from '../../harness/readers';

describe('a turn close to 180° at a waypoint (#76, #404)', () => {
    // Checked in the KLN 89 trainer, 2026-10-20 (docs/kln89-trainer-record.md): the lead r·tan(θ/2) is capped at 60 s of
    // ground speed and at half the inbound leg, and the capped turn is flown; the waypoint is not skipped (#404). This
    // replaces the #76 rule of e7cc3ca, which took the next leg at once when the uncapped lead exceeded the distance to the
    // waypoint. The Pilot's Guide 4-8 and 4-9 do not cover this case. Here the uncapped lead of the 175° turn at 120 kt
    // (0.63 NM × tan(87.5°), about 14.4 NM) is longer than the 10 NM leg; the cap is 60 s of 120 kt, 2.0 NM (half the leg
    // is 5 NM). The sim adds the roll-in on top (NavCalculator).
    it('starts the capped turn 2.0 NM before ABC plus the roll-in, flies it, and keeps one DTK switch and a smooth XTK (#76, #404)', async () => {
        const a = airport('KAAA', 47.0, 8.0);
        const b0 = pointFrom(a, 90, 10);
        const b = vor('ABC', b0.lat, b0.lon);
        const c0 = pointFrom(b, 265, 12);
        const c = airport('KBBB', c0.lat, c0.lon);
        const world = new World({magvar: 0}).add(a, b, c);
        const leg1 = finalCourseDeg(a, b);
        const leg2 = courseDeg(b, c);
        const start = pointBefore(a, b, 7);
        const flight = await Flight.start({
            world, storage: savedFlightplan(0, [a, b, c]),
            aircraft: {lat: start.lat, lon: start.lon, altitudeFt: 3000, groundspeedKt: 120, trackTrue: leg1},
        });
        await flight.flyUntil(() => flight.nav.activeIdent !== null, {timeout: 30, description: 'a waypoint active'});
        await flight.fly(1);
        expect(flight.nav.activeIdent).toBe('ABC');

        // The turn starts (the unit puts it on the turn stack) at the capped lead plus the roll-in: the standard-rate bank
        // atan(120 / 362.1) = 18.3° reached at 5°/s, 0.122 NM at 120 kt. It is due within the calculation tick before,
        // 0.033 NM at 120 kt, and the aircraft's position is that of the calculation within a display tick, 0.02 NM
        const rollIn = Math.atan(120 / 362.1) * 180 / Math.PI / 5 * 120 / 3600;
        await flight.flyUntil(() => flight.nav.activeIdent !== 'ABC' || turnStackLength(flight.unit) > 0, {timeout: 300, description: 'start of the turn at ABC'});
        expect(flight.nav.activeIdent).toBe('ABC');
        const distAtTurnStart = distanceNm(flight.aircraft, b);
        expect(distAtTurnStart).toBeGreaterThanOrEqual(2.0 + rollIn - 0.02);
        expect(distAtTurnStart).toBeLessThanOrEqual(2.0 + rollIn + 0.033 + 0.02);
        expect(rollIn).toBeCloseTo(0.122, 3);

        const samples: { ident: string | null; dtk: number | null; toFrom: 'TO' | 'FROM' | null; xtk: number | null }[] = [];
        for (let s = 0; s < 120; s++) {
            await flight.fly(1);
            const n = flight.nav;
            samples.push({ident: n.activeIdent, dtk: n.dtkTrue, toFrom: n.toFrom, xtk: n.xtkNm});
        }

        // The turn is flown: ABC is sequenced during it, and KBBB stays active from then on. KBBB is flown TO from the
        // calculation after the sequencing on; the sequencing calculation itself still shows the TO/FROM it computed
        // for ABC before it sequenced, FROM once ABC is abeam
        const kbbbFrom = samples.findIndex(s => s.ident === 'KBBB');
        expect(kbbbFrom).toBeGreaterThan(0);
        const onKbbb = samples.slice(kbbbFrom);
        expect(onKbbb.map(s => s.ident)).toEqual(onKbbb.map(() => 'KBBB'));
        expect(onKbbb.slice(1).map(s => s.toFrom)).toEqual(onKbbb.slice(1).map(() => 'TO'));
        // Every DTK is one of the two leg courses, it switches at most once and never goes back to the first leg
        const legOf = (dtk: number | null) => angleBetween(dtk, leg1) < 1 ? 1 : angleBetween(dtk, leg2) < 1 ? 2 : 0;
        const legs = samples.map(s => legOf(s.dtk));
        expect(legs.filter(l => l === 0)).toEqual([]);
        let switches = 0;
        for (let i = 1; i < legs.length; i++) if (legs[i] !== legs[i - 1]) switches++;
        expect(switches).toBeLessThanOrEqual(1);
        expect(legs[legs.length - 1]).toBe(2);

        // The cross track moves continuously: the aircraft covers 0.033 NM per second at 120 kt, so one second can
        // change it by far less than 0.05 NM. A jump is a full-scale CDI kick, the HSI symptom of #76.
        const onLeg2 = samples.slice(legs.indexOf(2));
        const xtkSteps = onLeg2.slice(1).map((s, i) => Math.abs(s.xtk! - onLeg2[i].xtk!));
        expect(onLeg2.every(s => s.xtk !== null)).toBe(true);
        expect(Math.max(...xtkSteps)).toBeLessThan(0.05);
    });
});
