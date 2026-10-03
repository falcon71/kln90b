import {describe, expect, it} from 'vitest';
import {GeoPoint, UnitType} from '@microsoft/msfs-sdk';
import {Flight, nmBefore} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {airport, vor} from '../../harness/navdata/builders';
import {courseDeg, distanceNm, finalCourseDeg, norm360} from '../../harness/flight/geo';

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

        let alertSeen = false;
        let lastSequence = flight.t;
        flight.monitor('waypoint alert before sequencing', f => {
            if (f.sim.get('L:KLN90B_WptLight', 'bool')) alertSeen = true;
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
        // About 0.32 NM: the 0.20 NM of a standard-rate turn through 35° at 120 kt plus 0.12 NM to roll into it
        const distAtTurnStart = distanceNm(flight.aircraft, abc);
        expect(distAtTurnStart).toBeGreaterThan(0.1);
        expect(distAtTurnStart).toBeLessThan(2);

        await flight.flyUntil(() => flight.nav.activeIdent === 'KBBB', {timeout: 60, description: 'sequencing to KBBB'});
        lastSequence = flight.t;
        expect(alertSeen).toBe(true);
        // 4-8: the leg sequences after the midpoint of the turn, the point of the turn closest to ABC. A turn of radius
        // 0.63 NM through 35° passes 0.03 NM from ABC; one calc tick (0.03 NM) and the 250 ms poll of flyUntil add to it.
        const distAtSequencing = distanceNm(flight.aircraft, abc);
        expect(distAtSequencing).toBeLessThan(0.15);
        expect(flight.sim.get('GPS WP NEXT ID', 'string')).toBe('KBBB');

        await flight.fly(150);
        await flight.jump(nmBefore('KBBB', 10));
        await flight.flyUntil(() => flight.nav.distNm !== null && flight.nav.distNm <= 5, {timeout: 10 * 60, description: '5 NM to KBBB'});

        // 0.15 NM: one calc tick of lag at 120 kt (0.03 NM) plus the rounding of the displayed and calculated values
        expect(Math.abs(flight.nav.distNm! - distanceNm(flight.aircraft, kbbb))).toBeLessThan(0.15);
        const dtkError = Math.abs(((flight.nav.dtkTrue! - finalCourseDeg(abc, kbbb) + 540) % 360) - 180);
        expect(dtkError).toBeLessThan(1);

        await flight.panel.selectPage('L', 'NAV 1');
        expect(flight.screen.half('L')).toContain('KBBB');

        const wallMs = performance.now() - t0;
        console.warn(`[flight-speed] ${flight.t.toFixed(0)} simulated s in ${(wallMs / 1000).toFixed(1)} s wall (${(flight.t / (wallMs / 1000)).toFixed(0)}x)`);
        expect(wallMs).toBeLessThan(20_000);
    });
});
