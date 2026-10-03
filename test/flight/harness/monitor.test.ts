import {describe, expect, it} from 'vitest';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {vor} from '../../harness/navdata/builders';

describe('monitors', () => {
    it('fail the flight with the monitor name and the sim time', async () => {
        const flight = await Flight.start({world: new World().add(vor('ABC', 47.5, 8.5)), aircraft: {lat: 47, lon: 8, altitudeFt: 3000, groundspeedKt: 120, trackTrue: 0}});
        flight.monitor('always fails', () => 'on purpose');
        await expect(flight.fly(2)).rejects.toThrow(/t=\d+ s always fails: on purpose/);
    });
});
