import {describe, expect, it, vi} from 'vitest';
import {Flight, minutes} from '../../harness/flight/Flight';
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

    // A teleport takes no time: the next read is at the new place, even when time has passed since the last physics step
    // (#457: a read moves the aircraft up to its time, which must not carry it on from the new place)
    it('teleport puts the aircraft where it is told, at once', async () => {
        const world = new World().add(vor('ABC', 47.5, 8.5));
        const flight = await Flight.start({world, aircraft: {lat: 47, lon: 8, altitudeFt: 3000, groundspeedKt: 120, trackTrue: 90}, pilot: new ManualPilot()});
        await flight.fly(10);
        await vi.advanceTimersByTimeAsync(30);
        const target = {lat: 47.2, lon: 8.3};

        flight.teleport(target);

        const read = {lat: flight.sim.get('PLANE LATITUDE', 'degrees'), lon: flight.sim.get('PLANE LONGITUDE', 'degrees')};
        expect(distanceNm(read, target) * 1852).toBeLessThan(0.01);
    });

    // A jump moves the aircraft as far as it would have flown in the jumped time, from where it is at the moment of the
    // jump, also between two physics steps: afterwards it is where a straight flight puts it at that sim time (#457)
    it('jump carries on from the aircraft at the time of the jump', async () => {
        const world = new World().add(vor('ABC', 47, 9));
        const flight = await Flight.start({world, aircraft: {lat: 47, lon: 8, altitudeFt: 3000, groundspeedKt: 120, trackTrue: 90}, pilot: new ManualPilot()});
        await flight.panel.directTo('ABC');
        await flight.fly(10);
        vi.setSystemTime(Date.now() + 30); //30 ms pass with no read: the aircraft has not been moved for them

        await flight.jump(minutes(5));

        const read = {lat: flight.sim.get('PLANE LATITUDE', 'degrees'), lon: flight.sim.get('PLANE LONGITUDE', 'degrees')};
        const expected = pointFrom({lat: 47, lon: 8}, 90, 120 * flight.t / 3600);
        expect(distanceNm(read, expected) * 1852).toBeLessThan(0.5);
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

        // The real sim writes the position and the clock together. The harness moves the aircraft up to the time of each
        // SimVar read, so the tick reads the position of its own sim time and not that of the last 16 Hz physics step,
        // up to 62 ms (3.8 m at 120 kt) older (#457)
        it('is the position of the aircraft at that sim time (#457)', async () => {
            const errors = await tickErrorsM();

            expect(errors.length).toBeGreaterThanOrEqual(55);
            expect(Math.max(...errors)).toBeLessThan(0.5);
        });
    });
});
