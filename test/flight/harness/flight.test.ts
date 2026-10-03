import {describe, expect, it} from 'vitest';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {ManualPilot} from '../../harness/flight/pilots';
import {vor} from '../../harness/navdata/builders';
import {distanceNm} from '../../harness/flight/geo';

describe('Flight', () => {
    it('flies wings level and the unit follows the position', async () => {
        const world = new World().add(vor('ABC', 47.5, 8.5));
        const flight = await Flight.start({world, aircraft: {lat: 47, lon: 8, altitudeFt: 3000, groundspeedKt: 120, trackTrue: 90}, pilot: new ManualPilot()});
        const start = {lat: flight.aircraft.lat, lon: flight.aircraft.lon};
        await flight.fly(60);
        expect(distanceNm(start, flight.aircraft)).toBeCloseTo(2.0, 2);
        expect(distanceNm(flight.unit.props.sensors.in.gps.coords, flight.aircraft)).toBeLessThan(0.05);
        expect(flight.sim.get('GPS GROUND SPEED', 'knots')).toBeCloseTo(120, 0);
    });
});
