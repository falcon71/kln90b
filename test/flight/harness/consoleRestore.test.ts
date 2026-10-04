import {describe, expect, it} from 'vitest';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {airport} from '../../harness/navdata/builders';

const original = console.error;

/** The two tests run in order: the second checks what the first one's flight left behind. */
describe('Flight restores console.error (harness)', () => {
    it('wraps console.error during a flight', async () => {
        const world = new World().add(airport('KAAA', 47.0, 8.0));
        await Flight.start({world, aircraft: {lat: 47.0, lon: 8.0, altitudeFt: 3000, groundspeedKt: 120, trackTrue: 90}});
        expect(console.error).not.toBe(original);
    });

    it('has the original back after the flight', () => {
        expect(console.error).toBe(original);
    });
});
