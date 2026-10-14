import {describe, expect, it} from 'vitest';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {standardRoute} from '../../harness/fixtures';
import {savedFlightplan} from '../../harness/storage';
import {angleBetween, courseDeg, distanceNm, pointBefore} from '../../harness/flight/geo';

// #146: a Direct To a waypoint of FPL 0 that has a following leg is flown like the plan leg: the turn onto the next leg
// is anticipated, the alert comes about 20 s before the turn (4-8), and the plan resumes after the waypoint (4-10).
// Checked in the KLN 89 trainer, 2026-10-14: the DTK switched to the next leg 2.0 NM before the waypoint, the alert came
// 22 to 23 s before that, and the next leg was a plan leg afterwards. A plain Direct To does not anticipate the turn
// (after #372 it alerts about 15 s before the waypoint) and switches only there; the test tells the two apart by the
// DTK switching while ABC is still active.
describe('a Direct To a waypoint of FPL 0 with a following leg (#146)', () => {
    it('anticipates the turn onto the next leg and alerts about 20 s before it (checked in the KLN 89 trainer, 2026-10-14, #146)', async () => {
        const {kaaa, abc, kbbb} = standardRoute();
        const world = new World({magvar: 0}).add(kaaa, abc, kbbb);
        const start = pointBefore(kaaa, abc, 10);
        const flight = await Flight.start({
            world, storage: savedFlightplan(0, [kaaa, abc, kbbb]),
            aircraft: {lat: start.lat, lon: start.lon, altitudeFt: 3000, groundspeedKt: 120, trackTrue: courseDeg(kaaa, abc)},
        });
        await flight.flyUntilActive('ABC', {timeout: 30});
        await flight.panel.directTo('ABC');
        const aw = flight.unit.props.memory.navPage.activeWaypoint;
        expect(aw.isDctNavigation()).toBe(true); // Preconditions: a Direct To, and ABC is the plan's ABC
        expect(aw.getActiveFplIdx()).toBe(1);

        let alertOnAt: number | null = null;
        flight.monitor('waypoint alert before the turn', f => {
            if (alertOnAt === null && f.sim.get('L:KLN90B_WptLight', 'bool')) alertOnAt = f.t;
            return true;
        });

        const leg2 = courseDeg(abc, kbbb);
        await flight.flyUntil(() => flight.nav.activeIdent !== 'ABC' || angleBetween(flight.nav.dtkTrue, leg2) < 1,
            {timeout: 600, description: 'start of the turn at ABC'});
        // The DTK switched while ABC was still active, before ABC: the turn is anticipated (4-8). The bounds are those
        // of firstFlight.test.ts for the same 34° turn at 120 kt (0.20 NM of lead plus up to 0.12 NM to roll in)
        expect(flight.nav.activeIdent).toBe('ABC');
        const distAtTurnStart = distanceNm(flight.aircraft, abc);
        expect(distAtTurnStart).toBeGreaterThan(0.2);
        expect(distAtTurnStart).toBeLessThan(0.45);
        // About 20 s before the turn (the 89: 22 to 23 s). The test tells this apart from a plain Direct To by the DTK
        // switching while ABC is still active (the activeIdent check and the distance bounds above), not by these bounds
        expect(alertOnAt).not.toBeNull();
        const alertLead = flight.t - alertOnAt!;
        expect(alertLead).toBeGreaterThan(15);
        expect(alertLead).toBeLessThan(25);

        // 4-10: the plan resumes: KBBB is the next plan leg, not a Direct To
        await flight.flyUntilActive('KBBB', {timeout: 60});
        expect(aw.getActiveFplIdx()).toBe(2);
        expect(aw.isDctNavigation()).toBe(false);
    });
});
