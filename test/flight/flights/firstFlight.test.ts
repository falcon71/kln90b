import {describe, expect, it} from 'vitest';
import {GeoPoint, UnitType} from '@microsoft/msfs-sdk';
import {Flight, nmBefore} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {airport, vor} from '../../harness/navdata/builders';
import {courseDeg, distanceNm, norm360} from '../../harness/flight/geo';

describe('first flight', () => {
    it('flies KAAA - ABC - KBBB with the coupled autopilot', async () => {
        // performance.now is the wall clock: startFakeClock does not fake it
        const t0 = performance.now();
        const kaaa = airport('KAAA', 47.0, 8.0, {elevationFt: 1400});
        const abc = vor('ABC', 47.5, 8.9);
        const kbbb = airport('KBBB', 48.2, 9.2, {elevationFt: 1500});
        const world = new World({magvar: 0}).add(kaaa, abc, kbbb);

        // Start on the first leg, 10 NM before ABC
        const leg1 = courseDeg(kaaa, abc);
        const start = new GeoPoint(abc.lat, abc.lon).offset(norm360(leg1 + 180), UnitType.NMILE.convertTo(10, UnitType.GA_RADIAN));
        const flight = await Flight.start({world, aircraft: {lat: start.lat, lon: start.lon, altitudeFt: 3000, groundspeedKt: 120, trackTrue: leg1}});

        await flight.panel.appendToFpl0(['KAAA', 'ABC', 'KBBB']);
        await flight.flyUntil(() => flight.nav.activeIdent === 'ABC', {timeout: 30, description: 'ABC active'});

        let alertOnAt: number | null = null;
        let lastSequence = flight.t;
        flight.monitor('waypoint alert before the turn', f => {
            if (alertOnAt === null && f.sim.get('L:KLN90B_WptLight', 'bool')) alertOnAt = f.t;
            return true;
        });
        flight.monitor('on course outside turns', f => {
            const n = f.nav;
            if (n.activeIdent === null || n.xtkNm === null || n.distNm === null) return true;
            if (n.distNm <= 3 || f.t - lastSequence < 120) return true;
            return Math.abs(n.xtkNm) < 0.3 || `XTK ${n.xtkNm.toFixed(2)} NM`;
        });

        // 4-8: turn anticipation starts the turn before the waypoint, and DTK switches to the next leg right then
        const leg2 = courseDeg(abc, kbbb);
        const angleTo = (a: number | null, b: number) => a === null ? 180 : Math.abs(((a - b + 540) % 360) - 180);
        await flight.flyUntil(() => flight.nav.activeIdent !== 'ABC' || angleTo(flight.nav.dtkTrue, leg2) < 1, {timeout: 15 * 60, description: 'start of the turn at ABC'});
        expect(flight.nav.activeIdent).toBe('ABC');
        // A standard-rate turn at 120 kt banks 18.3° (KLNNavmath.bankeAngleForStandardTurn), a radius R of 0.63 NM.
        // Through 35° it needs R·tan(35°/2) = 0.20 NM before ABC; a turn started closer cannot join the next leg.
        // The unit adds 0.12 NM to roll into the bank at 5°/s, so about 0.32 NM; 0.45 leaves room for one calc tick.
        const distAtTurnStart = distanceNm(flight.aircraft, abc);
        expect(distAtTurnStart).toBeGreaterThan(0.2);
        expect(distAtTurnStart).toBeLessThan(0.45);
        // 4-8: the alert starts about 20 s before the turn (WPT_ALERT_WITH_TURN_ANTI) and stays on through it.
        // The monitor samples once per second.
        expect(flight.sim.get('L:KLN90B_WptLight', 'bool')).toBe(1);
        expect(alertOnAt).not.toBeNull();
        const alertLead = flight.t - alertOnAt!;
        expect(alertLead).toBeGreaterThan(10);
        expect(alertLead).toBeLessThan(30);

        await flight.flyUntil(() => flight.nav.activeIdent === 'KBBB', {timeout: 60, description: 'sequencing to KBBB'});
        lastSequence = flight.t;
        // 4-8: the leg sequences after the midpoint of the turn, the point of the turn closest to ABC. A turn of radius
        // 0.63 NM through 35° passes R·(1/cos(35°/2) - 1) = 0.03 NM from ABC; one calc tick (0.033 NM) and the 250 ms
        // poll of flyUntil (0.008 NM) add to it, about 0.07 NM at most.
        const distAtSequencing = distanceNm(flight.aircraft, abc);
        expect(distAtSequencing).toBeLessThan(0.1);
        expect(flight.sim.get('GPS WP NEXT ID', 'string')).toBe('KBBB');

        await flight.fly(150);
        await flight.jump(nmBefore('KBBB', 10));
        // Tolerances of 0.04 NM: one 1 Hz calc tick of staleness at 120 kt (0.033 NM)
        expect(Math.abs(flight.nav.distNm! - distanceNm(flight.aircraft, kbbb))).toBeLessThan(0.04);
        await flight.flyUntil(() => flight.nav.distNm !== null && flight.nav.distNm <= 5, {timeout: 10 * 60, description: '5 NM to KBBB'});

        const independentDis = distanceNm(flight.aircraft, kbbb);
        expect(Math.abs(flight.nav.distNm! - independentDis)).toBeLessThan(0.04);
        expect(Math.abs(flight.sim.get('GPS WP DISTANCE', 'nautical miles') - independentDis)).toBeLessThan(0.04);
        // The aircraft is on the great circle ABC - KBBB, so the course from it to KBBB is the DTK of the leg there
        expect(angleTo(flight.nav.dtkTrue, courseDeg(flight.aircraft, kbbb))).toBeLessThan(0.05);

        // 3-31: NAV 1 shows FROM, the active arrow and TO, then DIS with one decimal below 100 NM (DistanceDisplay(4))
        await flight.panel.selectPage('L', 'NAV 1');
        // Calc and display ticks fall due together once a second, and then the display tick runs first and shows the
        // previous calculation. Fly display ticks until one passes without a calculation, so the screen is current.
        for (let i = 0, before = flight.nav.distNm; ; i++, before = flight.nav.distNm) {
            await flight.fly(0.25);
            if (flight.nav.distNm === before) break;
            if (i > 4) throw new Error('DIS changed in every display tick');
        }
        const nav1 = flight.screen.half('L').split('\n');
        expect(nav1[0]).toBe('ABC  ›KBBB ');
        expect(nav1[2]).toBe(`DIS  ${flight.nav.distNm!.toFixed(1).padStart(4)}nm`);

        const wallMs = performance.now() - t0;
        console.warn(`[flight-speed] ${flight.t.toFixed(0)} simulated s in ${(wallMs / 1000).toFixed(1)} s wall (${(flight.t / (wallMs / 1000)).toFixed(0)}x)`);
    });
});
