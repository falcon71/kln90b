import {describe, expect, it} from 'vitest';
import {Flight, nmBefore} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {standardRoute} from '../../harness/fixtures';
import {airport} from '../../harness/navdata/builders';
import {savedFlightplan} from '../../harness/storage';
import {angleBetween, courseDeg, finalCourseDeg, pointBefore, pointFrom} from '../../harness/flight/geo';

/** What the WPT light did around a sequencing: at the first calculation after it, and whether the turn was still flown */
interface AtSequencing { light: number; turnStackLength: number }

const atKbbbSequencing: AtSequencing[] = [];

/**
 * KAAA, ABC, KBBB, KCCC: a 34° left turn at ABC, where the next waypoint KBBB has a following leg, and a 44° right turn
 * at KBBB, where the next waypoint KCCC is the last one. The first test flies both turns and judges the one at ABC; the
 * second judges what was recorded at KBBB, so a broken flight cannot be taken for the bug.
 */
describe('waypoint alert through an anticipated turn', () => {
    // 4-8: the alert goes steady when the turn begins; 4-9: turn anticipation ends once the transition to the next leg is
    // made. The light stays on until the end of the turn, past the sequencing at the midpoint of the turn (the video the
    // code cites at the waypointAlert assignment in NavCalculator.ts). The WPT light is steady, the maintainer's ruling
    // (SensorsOut.test.ts).
    it('stays on past the sequencing at ABC until the turn ends, then goes off on the next leg (4-8, 4-9)', async () => {
        const {kaaa, abc, kbbb} = standardRoute();
        const c = pointFrom(kbbb, 60, 20);
        const kccc = airport('KCCC', c.lat, c.lon);
        const world = new World({magvar: 0}).add(kaaa, abc, kbbb, kccc);
        const leg1 = finalCourseDeg(kaaa, abc);
        const leg2 = courseDeg(abc, kbbb);
        const start = pointBefore(kaaa, abc, 3);
        const flight = await Flight.start({
            world, storage: savedFlightplan(0, [kaaa, abc, kbbb, kccc]),
            aircraft: {lat: start.lat, lon: start.lon, altitudeFt: 3000, groundspeedKt: 120, trackTrue: leg1},
        });
        await flight.flyUntilActive('ABC', {timeout: 30});
        // ActiveWaypoint replaces its turnStack array when it sequences, so read the field each time
        const turnStackLength = () => flight.unit.props.memory.navPage.activeWaypoint.turnStack.length;
        const light = () => flight.sim.get('L:KLN90B_WptLight', 'bool');

        // Once on, the light never goes off again until the turn has ended
        let alertOn = false;
        flight.monitor('WPT light steady from the alert to the end of the turn at ABC', f => {
            if (f.nav.activeIdent === 'KCCC' || (f.nav.activeIdent === 'KBBB' && !alertOn)) return true;
            const on = light() === 1;
            if (on) alertOn = true;
            const turnDone = f.nav.activeIdent === 'KBBB' && turnStackLength() === 0;
            if (turnDone) alertOn = false;
            return !alertOn || on || `light off at ${f.t.toFixed(0)} s, ${f.nav.activeIdent} active, turn stack ${turnStackLength()}`;
        });

        await flight.flyUntilActive('KBBB', {timeout: 150});
        // One calculation tick after the sequencing at the midpoint of the turn: the turn is still being flown and the
        // light is on (the sequencing tick itself still computed the alert for ABC)
        await flight.fly(1);
        expect(turnStackLength()).toBeGreaterThan(0);
        expect(light()).toBe(1);

        await flight.flyUntil(() => turnStackLength() === 0, {timeout: 30, description: 'end of the turn onto KBBB'});
        await flight.fly(1); // the light is written by the calculation tick after the turn ended
        expect(light()).toBe(0);
        // The turn ended on the next leg: the aircraft tracks it
        expect(angleBetween(flight.sim.get('GPS GROUND TRUE TRACK', 'degrees'), leg2)).toBeLessThan(3);
        expect(Math.abs(flight.nav.xtkNm!)).toBeLessThan(0.1);

        // The turn at KBBB onto the last leg, recorded for the test below
        await flight.jump(nmBefore('KBBB', 3));
        await flight.flyUntil(() => flight.nav.activeIdent === 'KCCC', {timeout: 150, description: 'KCCC active'});
        await flight.fly(1);
        atKbbbSequencing.push({light: light(), turnStackLength: turnStackLength()});
        expect(atKbbbSequencing[0].turnStackLength).toBeGreaterThan(0); // the turn is still being flown
    });

    // The same rule at a turn onto the last leg: KCCC has no following leg, so NavCalculator takes the branch without
    // turn anticipation, which sets the alert from the 36 s ETE alone and ignores the turn still being flown
    // This judge reads what the test above recorded, so it means something only when that test ran and passed first (run
    // alone it passes vacuously as an expected failure)
    it.fails('stays on past the sequencing at KBBB while the turn onto the last leg is flown (#156)', () => {
        expect(atKbbbSequencing).toHaveLength(1);
        expect(atKbbbSequencing[0].turnStackLength).toBeGreaterThan(0);
        expect(atKbbbSequencing[0].light).toBe(1);
    });
});
