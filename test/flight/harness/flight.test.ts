import {describe, expect, it, vi} from 'vitest';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {ManualPilot} from '../../harness/flight/pilots';
import {vor} from '../../harness/navdata/builders';
import {distanceNm, pointFrom} from '../../harness/flight/geo';

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

    describe('the sim position at a calculation tick', () => {
        /**
         * The distance in meters between the position the GPS tick reads and the position of the aircraft at that exact
         * sim time, at every calculation tick of a straight flight. The aircraft is at its start at flight.t = 0 and
         * moves from then on, so its position at t is the start plus the ground speed times t along the track.
         */
        async function tickErrorsM(): Promise<number[]> {
            const world = new World().add(vor('ABC', 47.5, 8.5));
            const flight = await Flight.start({world, aircraft: {lat: 47, lon: 8, altitudeFt: 3000, groundspeedKt: 120, trackTrue: 90}, pilot: new ManualPilot()});
            const start = {lat: 47, lon: 8};
            const gps = flight.unit.props.sensors.in.gps;
            const errors: number[] = [];
            const tick = gps.tick.bind(gps);
            vi.spyOn(gps, 'tick').mockImplementation(() => {
                const read = {lat: flight.sim.get('PLANE LATITUDE', 'degrees'), lon: flight.sim.get('PLANE LONGITUDE', 'degrees')};
                const expected = pointFrom(start, 90, 120 * flight.t / 3600);
                errors.push(distanceNm(read, expected) * 1852);
                tick();
            });
            await flight.fly(60);
            return errors;
        }

        // The position is written every 62 ms (the fake timers truncate the 62.5 ms of 16 Hz), while the tick reads an
        // exact E:ABSOLUTE TIME, so the position a tick reads is up to one physics step old: 3.83 m at 120 kt (62 ms). The real
        // sim writes the position and the clock together. Control: the lag is a physics step and not more, so the setup
        // flies as it should
        it('is at most one physics step old', async () => {
            const errors = await tickErrorsM();

            expect(errors.length).toBeGreaterThanOrEqual(55);
            expect(Math.max(...errors)).toBeLessThan(3.9);
            expect(Math.max(...errors), 'the pin below needs the lag').toBeGreaterThan(0.5);
        });

        it.fails('is the position of the aircraft at that sim time (#457)', async () => {
            const errors = await tickErrorsM();

            expect(errors.length).toBeGreaterThanOrEqual(55);
            expect(Math.max(...errors)).toBeLessThan(0.5);
        });
    });
});
