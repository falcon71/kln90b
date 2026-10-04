import {describe, expect, it} from 'vitest';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';

describe('GPS ground magnetic track', () => {
    // Public contract: GPS SimVars (CLAUDE.md, "Public contract with aircraft"); both are radians in the MSFS definitions.
    // The GPS track is the bearing between two successive fixes, so the aircraft has to move.
    it('is the true track minus the magnetic variation (6be164c)', async () => {
        const world = new World({magvar: 4});
        const flight = await Flight.start({
            world,
            aircraft: {lat: 47, lon: 8, altitudeFt: 3000, groundspeedKt: 120, trackTrue: 90},
        });
        await flight.fly(10);

        const sim = flight.sim;
        // Control: the true track is flown east, so a failure below says which of the two is wrong
        expect(sim.get('GPS GROUND TRUE TRACK', 'radians')).toBeCloseTo(90 * Math.PI / 180, 2);
        expect(sim.lastWrite('GPS GROUND TRUE TRACK')!.unit).toBe('radians');
        // 4 degrees east variation: magnetic = true - 4 = 86. The tolerance of 0.005 rad (0.29 degrees) is far below the
        // 4 degrees between the two.
        expect(sim.get('GPS GROUND MAGNETIC TRACK', 'radians')).toBeCloseTo(86 * Math.PI / 180, 2);
        expect(sim.lastWrite('GPS GROUND MAGNETIC TRACK')!.unit).toBe('radians');
    });
});
