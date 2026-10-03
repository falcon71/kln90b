import {describe, expect, it} from 'vitest';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {vor} from '../../harness/navdata/builders';

describe('built-in monitor: no SimVar unit errors', () => {
    it('fails the flight when a SimVar conversion failed', async () => {
        const flight = await Flight.start({world: new World().add(vor('ABC', 47.5, 8.5)), aircraft: {lat: 47, lon: 8, altitudeFt: 3000, groundspeedKt: 120, trackTrue: 0}});
        await flight.fly(2);
        flight.sim.errors.push('X: bad');
        await expect(flight.fly(2)).rejects.toThrow(/no SimVar unit errors: X: bad/);
    });
});
