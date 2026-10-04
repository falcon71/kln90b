import {describe, expect, it} from 'vitest';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {ManualPilot} from '../../harness/flight/pilots';
import {standardRoute} from '../../harness/fixtures';
import {savedFlightplan} from '../../harness/storage';
import {angleBetween, courseDeg, distanceNm, finalCourseDeg, pointBefore} from '../../harness/flight/geo';

const LVAR_TO_FROM = 'L:KLN90B_HSI_TF_FLAGS';

describe('HSI TO/FROM flag across the waypoint in OBS mode (a0678fa, #29)', () => {
    // Public contract: the LVar is documented in LVars.ts (CLAUDE.md, "LVars") with the values 0 (flagged), 1 (TO) and
    // 2 (FROM). The geometry is the pilot's: in OBS the TO/FROM indication follows the selected course through the
    // waypoint (5-34, the NAV 1 triangle 3-31), so it flips when the aircraft passes the waypoint abeam.
    it('is 1 before ABC and 2 after it, on the OBS course through ABC (a0678fa)', async () => {
        const {kaaa, abc, kbbb} = standardRoute();
        const world = new World({magvar: 0}).add(kaaa, abc, kbbb);
        const leg1 = finalCourseDeg(kaaa, abc);
        const start = pointBefore(kaaa, abc, 1.5);
        const flight = await Flight.start({
            world, storage: savedFlightplan(0, [kaaa, abc, kbbb]), pilot: new ManualPilot(),
            aircraft: {lat: start.lat, lon: start.lon, altitudeFt: 3000, groundspeedKt: 120, trackTrue: leg1},
        });
        flight.sim.set('Nav OBS:1', 'degrees', leg1); // The external OBS course; unset it reads 0
        await flight.flyUntilActive('ABC', {timeout: 30});
        await flight.panel.obsMode();
        await flight.fly(2);
        expect(flight.nav.mode).toBe('ENR-OBS');
        expect(flight.sim.get(LVAR_TO_FROM, 'enum')).toBe(1);

        // The LVar is written once per calculation tick, so the samples within 0.05 NM of ABC (one tick at 120 kt is
        // 0.033 NM) may still show the other side
        const seen = new Set<number>();
        flight.monitor('TO/FROM flag follows the course through ABC', f => {
            if (distanceNm(f.aircraft, abc) < 0.05) return true;
            const flag = f.sim.get(LVAR_TO_FROM, 'enum');
            seen.add(flag);
            const diff = angleBetween(courseDeg(f.aircraft, abc), leg1);
            const expected = diff <= 90 ? 1 : 2;
            return flag === expected || `flag ${flag}, expected ${expected} (bearing to ABC ${courseDeg(f.aircraft, abc).toFixed(1)}, course ${leg1.toFixed(1)})`;
        });
        await flight.fly(60);

        // 1.5 NM at 120 kt takes 45 s, so both sides were flown, and OBS never sequences (5-35)
        expect(seen).toEqual(new Set([1, 2]));
        expect(flight.nav.activeIdent).toBe('ABC');
        expect(flight.nav.mode).toBe('ENR-OBS');
        expect(distanceNm(flight.aircraft, abc)).toBeGreaterThan(0.3);
    });
});
