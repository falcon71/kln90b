import {describe, expect, it} from 'vitest';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {standardRoute} from '../../harness/fixtures';
import {savedFlightplan} from '../../harness/storage';
import {angleBetween, courseDeg, finalCourseDeg, pointBefore, pointFrom} from '../../harness/flight/geo';

/** L:KLN90B_RollCommand once per second for the first seconds after DTK switched to the next leg; positive = left */
const rollAfterTurnStart: number[] = [];

/**
 * The first test flies and records and the second only judges what was recorded, so the flight is flown once.
 * The first test failing means the flight itself broke, which the second cannot tell apart from the bug.
 */
describe('turn direction at ABC', () => {
    it('commands a bank in the turn at ABC', async () => {
        const {kaaa, abc, kbbb} = standardRoute();
        const world = new World({magvar: 0}).add(kaaa, abc, kbbb);
        // 3 NM before ABC on the first leg, 0.02 NM left of it: the residual any autopilot leaves. A side has to be
        // chosen, because exactly on the leg the sign of the cross track is rounding noise (the bug shows on both
        // sides, from the right once the roll-in carries the aircraft across the leg). KAAA - ABC arrives on about 51°
        // and ABC - KBBB leaves on about 16°: a 35° left turn.
        const leg1 = finalCourseDeg(kaaa, abc);
        const leg2 = courseDeg(abc, kbbb);
        const start = pointFrom(pointBefore(kaaa, abc, 3), leg1 - 90, 0.02);
        const flight = await Flight.start({
            world, storage: savedFlightplan(0, [kaaa, abc, kbbb]),
            aircraft: {lat: start.lat, lon: start.lon, altitudeFt: 3000, groundspeedKt: 120, trackTrue: leg1},
        });
        await flight.flyUntilActive('ABC', {timeout: 30});

        await flight.flyUntil(() => flight.nav.activeIdent !== 'ABC' || angleBetween(flight.nav.dtkTrue, leg2) < 1, {timeout: 5 * 60, description: 'start of the turn at ABC'});
        expect(flight.nav.activeIdent).toBe('ABC');
        let maxLeftBank = 0;
        for (let s = 0; s < 3; s++) {
            await flight.fly(1);
            const roll = flight.sim.get('L:KLN90B_RollCommand', 'degrees');
            rollAfterTurnStart.push(roll);
            maxLeftBank = Math.max(maxLeftBank, roll);
        }
        await flight.flyUntil(() => {
            maxLeftBank = Math.max(maxLeftBank, flight.sim.get('L:KLN90B_RollCommand', 'degrees'));
            return flight.nav.activeIdent === 'KBBB';
        }, {timeout: 60, description: 'sequencing to KBBB'});

        expect(rollAfterTurnStart).toHaveLength(3);
        // A standard-rate turn at 120 kt banks 18.3°; the unit commands up to 25°
        expect(maxLeftBank).toBeGreaterThan(15);
    });

    // #100: during the roll-in the unit steers against the inbound leg with the outbound DTK, and the sign of a cross
    // track of about zero picks the side, so it can command a right bank at the start of a left turn
    it.fails('banks into the turn when turn anticipation starts (#100)', () => {
        expect(rollAfterTurnStart).toHaveLength(3);
        for (const roll of rollAfterTurnStart) expect(roll).toBeGreaterThan(0);
    });
});
