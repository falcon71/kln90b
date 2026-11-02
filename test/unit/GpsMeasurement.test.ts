import {beforeEach, describe, expect, it, onTestFinished, vi} from 'vitest';
import {GpsMeasurement, ExactMeasurement, MeasurementInputs, SimulatedMeasurement} from '../../kln90b/GpsMeasurement';
import {GpsErrorModel, SIGMA_SLOW_M, TAU_SLOW_S} from '../../kln90b/GpsErrorModel';
import {GpsPositionFilter} from '../../kln90b/GpsPositionFilter';
import {ALTITUDE_WEIGHT, computeGeometry, MAX_ROWS} from '../../kln90b/GpsSolution';
import {simEnv} from '../harness/sim/install';
import {mulberry32} from '../harness/sim/random';

// #402: the measurement strategies. The satellite geometry is synthetic: a line of sight is [zenith, azimuth] in
// degrees, and computeGeometry gives the coefficients of the error mapping. Expected values are derived by hand.
const DEG = Math.PI / 180;
const EARTH_RADIUS_M = 6378100;
const MPS_PER_KNOT = 1852 / 3600;
const sky = (zenithDeg: number, azimuthDeg: number): Float64Array => new Float64Array([zenithDeg * DEG, azimuthDeg * DEG]);

// An asymmetric sky: the sums of the north and east coefficients are far from zero, so that an error offset is visible
const FIVE_SATELLITES = [sky(20, 10), sky(50, 100), sky(70, 200), sky(40, 300), sky(60, 50)];
// Three satellites at different heights: with the altitude row they give a fix, and the altitude couples to the
// horizontal position
const THREE_SATELLITES = [sky(30, 0), sky(70, 90), sky(80, 200)];

// Box-Muller turns this constant into the same normal draw every time: u1 = 0.875 and u2 = 0.125 give a radius of
// sqrt(-2 ln 0.875) and cos = sin = sqrt(1/2) for both values of the pair.
const CONSTANT = () => 0.125;
const Z = Math.sqrt(-2 * Math.log(0.875)) * Math.SQRT1_2;

function makeInputs(satellites: Float64Array[], aided: boolean, indicatedAltitudeFt: number | null): MeasurementInputs {
    const coefficients = new Float64Array(2 * MAX_ROWS);
    const geometry = computeGeometry(satellites, aided, coefficients);
    expect(geometry.valid).toBe(true);
    return {geometry, prns: satellites.map((_, i) => i + 1), coefficients, indicatedAltitudeFt};
}

/** The same rows, but every satellite's error maps to no position error at all */
function withoutErrors(inputs: MeasurementInputs): MeasurementInputs {
    return {...inputs, coefficients: new Float64Array(2 * MAX_ROWS)};
}

function metersBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const north = (lat2 - lat1) * DEG * EARTH_RADIUS_M;
    const east = (lon2 - lon1) * DEG * EARTH_RADIUS_M * Math.cos(lat1 * DEG);
    return Math.hypot(north, east);
}

const metersToLat = (m: number): number => m / EARTH_RADIUS_M / DEG;

function setVelocity(northMps: number, eastMps: number): void {
    simEnv().sim.set('VELOCITY WORLD Z', 'meters per second', northMps);
    simEnv().sim.set('VELOCITY WORLD X', 'meters per second', eastMps);
}

/** Counts the SimVar reads per name while the callback runs. The FakeSim answers; the spy only counts. */
function countReads(body: () => void): Map<string, number> {
    const read = vi.spyOn(SimVar, 'GetSimVarValue');
    onTestFinished(() => read.mockRestore()); // A second spyOn on the method would return this one with its calls
    body();
    const counts = new Map<string, number>();
    for (const call of read.mock.calls) {
        counts.set(call[0], (counts.get(call[0]) ?? 0) + 1);
    }
    read.mockRestore();
    return counts;
}

beforeEach(() => {
    simEnv().sim.reset();
    setVelocity(0, 0);
    simEnv().sim.set('PLANE ALTITUDE', 'feet', 3000);
});

describe('ExactMeasurement', () => {
    const inputs = makeInputs(FIVE_SATELLITES, false, null);

    // 3-34: the track is the bearing of the move. The expected bearing is the flat one, for a move of 100 m
    it('returns the truth and the bearing of the move', () => {
        simEnv().sim.set('GROUND VELOCITY', 'knots', 120);
        const exact = new ExactMeasurement();

        exact.update(0, 50, 8, inputs);
        expect(exact.lat).toBe(50);
        expect(exact.lon).toBe(8);
        expect(exact.groundspeedKt).toBe(120);
        expect(exact.trackTrue).toBeNull();

        // south-east: 0.0005 degrees south and 0.001 degrees east
        exact.update(1, 49.9995, 8.001, inputs);
        expect(exact.lat).toBe(49.9995);
        expect(exact.lon).toBe(8.001);
        const expected = Math.atan2(0.001 * Math.cos(50 * DEG), -0.0005) / DEG;
        expect(exact.trackTrue).not.toBeNull();
        expect(exact.trackTrue).toBeCloseTo(expected, 1);
        expect(expected).toBeGreaterThan(90);
        expect(expected).toBeLessThan(180);
    });

    it('reads the ground speed of the sim at every update', () => {
        const exact = new ExactMeasurement();
        simEnv().sim.set('GROUND VELOCITY', 'knots', 90);
        exact.update(0, 50, 8, inputs);
        simEnv().sim.set('GROUND VELOCITY', 'knots', 95);
        exact.update(1, 50, 8, inputs);

        expect(exact.groundspeedKt).toBe(95);
    });

    it('gives no track while the position does not change (the sim is paused)', () => {
        const exact = new ExactMeasurement();
        exact.update(0, 50, 8, inputs);
        exact.update(1, 50.001, 8, inputs);
        expect(exact.trackTrue).not.toBeNull();

        exact.update(1, 50.001, 8, inputs);
        expect(exact.trackTrue).toBeNull();
    });

    it('has no track after a restart until the position has moved twice', () => {
        const exact = new ExactMeasurement();
        exact.update(0, 50, 8, inputs);
        exact.update(1, 50.001, 8, inputs);

        exact.restart();
        exact.update(2, 51, 9, inputs);
        expect(exact.trackTrue).toBeNull();

        exact.update(3, 51.001, 9, inputs);
        expect(exact.trackTrue).not.toBeNull();
        expect(exact.trackTrue).toBeCloseTo(0, 1);
    });

    // The SDK's equality tolerance is 1e-7 rad, about 0.64 m: a move below it is no move, one above it is
    it('treats a move of 0.3 m as no move and a move of 1 m as a move, like GeoPoint.equals', () => {
        const exact = new ExactMeasurement();
        exact.update(0, 50, 8, inputs);
        exact.update(1, 50 + metersToLat(0.3), 8, inputs);
        expect(exact.trackTrue).toBeNull();

        const moved = new ExactMeasurement();
        moved.update(0, 50, 8, inputs);
        moved.update(1, 50 + metersToLat(1), 8, inputs);
        expect(moved.trackTrue).not.toBeNull();
        expect(moved.trackTrue).toBeCloseTo(0, 3);
    });

    it('reads the ground speed once per update and nothing else from the sim', () => {
        const counts = countReads(() => {
            const exact = new ExactMeasurement();
            exact.update(0, 50, 8, inputs);
            exact.update(1, 50.001, 8, inputs);
        });

        expect([...counts]).toEqual([['GROUND VELOCITY', 2]]);
    });

    it('never draws a random number', () => {
        const random = vi.spyOn(Math, 'random');
        try {
            const exact = new ExactMeasurement();
            exact.update(0, 50, 8, inputs);
            exact.update(1, 50.001, 8.001, inputs);
            exact.restart();
            exact.update(2, 50.002, 8.002, inputs);
            expect(random).not.toHaveBeenCalled();
        } finally {
            random.mockRestore();
        }
    });
});

/** An error model that returns fixed errors: position north and east in meters, velocity north and east in m/s */
class FixedErrors extends GpsErrorModel {
    constructor(public fixed: number[]) {
        super();
    }

    public update(_dtS: number, _prns: readonly number[], _coefficients: Float64Array, _altitudeErrorM: number | null, out: Float64Array): void {
        out.set(this.fixed);
    }
}

describe('SimulatedMeasurement measurement', () => {
    const inputs = makeInputs(FIVE_SATELLITES, false, null);

    // The first update starts the filter from the measurement, so the output is the truth plus the error
    it('the first update is the truth plus the error, in meters on the surface', () => {
        setVelocity(100, -20);
        const sim = new SimulatedMeasurement(Math.random, new FixedErrors([7, -3, 0.4, -0.3]));

        sim.update(10, 60, 10, inputs);

        expect(sim.lat).toBeCloseTo(60 + 7 / EARTH_RADIUS_M / DEG, 9);
        // At 60 degrees north a degree of longitude is half as long
        expect(sim.lon).toBeCloseTo(10 - 3 / (EARTH_RADIUS_M * 0.5) / DEG, 9);
        expect(sim.groundspeedKt).toBeCloseTo(Math.hypot(100.4, -20.3) / MPS_PER_KNOT, 6);
        expect(sim.trackTrue).not.toBeNull();
        expect(sim.trackTrue).toBeCloseTo((Math.atan2(-20.3, 100.4) / DEG + 360) % 360, 6);
    });

    it('hands the satellites, the coefficients and the altitude error to the error model', () => {
        const model = new GpsErrorModel(CONSTANT);
        const update = vi.spyOn(model, 'update');
        simEnv().sim.set('PLANE ALTITUDE', 'feet', 3000);
        const aided = makeInputs(THREE_SATELLITES, true, 3100);
        const sim = new SimulatedMeasurement(CONSTANT, model);

        sim.update(0, 50, 8, aided);

        expect(update).toHaveBeenCalledTimes(1);
        const [dt, prns, coefficients, altitudeErrorM] = update.mock.calls[0];
        expect(dt).toBe(0);
        expect(prns).toEqual([1, 2, 3]);
        expect(coefficients).toBe(aided.coefficients);
        expect(altitudeErrorM).toBeCloseTo(30.48, 9);
    });

    it('passes no altitude error to the error model without an altitude input', () => {
        const model = new GpsErrorModel(CONSTANT);
        const update = vi.spyOn(model, 'update');
        const sim = new SimulatedMeasurement(CONSTANT, model);

        sim.update(0, 50, 8, inputs);

        expect(update.mock.calls[0][3]).toBeNull();
    });

    // The error model's output is checked for each of its four numbers; a number that is not finite never reaches the
    // filter, and the update does not count as a time reference
    it.each([0, 1, 2, 3])('skips an update whose error number %i is not finite', (index) => {
        const errors = new FixedErrors([1, 1, 0.1, 0.1]);
        const filter = new GpsPositionFilter();
        const update = vi.spyOn(filter, 'update');
        const sim = new SimulatedMeasurement(Math.random, errors, filter);
        sim.update(0, 50, 8, inputs);
        const held = [sim.lat, sim.lon, sim.groundspeedKt, sim.trackTrue];

        errors.fixed = [1, 1, 0.1, 0.1];
        errors.fixed[index] = NaN;
        sim.update(1, 50.001, 8, inputs);
        expect(update).toHaveBeenCalledTimes(1);
        expect([sim.lat, sim.lon, sim.groundspeedKt, sim.trackTrue]).toEqual(held);

        errors.fixed = [1, 1, 0.1, 0.1];
        sim.update(3, 50.001, 8, inputs);
        expect(update).toHaveBeenCalledTimes(2);
        // The whole time since the last good update
        expect(update.mock.calls[1][0]).toBe(3);
    });

    // The measurement noise of an axis is the diagonal of C of that axis: the position variance is the squared range
    // error of 5 m times it, the velocity variance the squared Doppler error of 0.05 m/s times it
    it('hands the measurement and its variances to the filter, north and east in order', () => {
        const filter = new GpsPositionFilter();
        const update = vi.spyOn(filter, 'update');
        const geometry = {...inputs.geometry, cNorth: 2, cEast: 3};
        const sim = new SimulatedMeasurement(Math.random, new FixedErrors([7, -3, 0.4, -0.3]), filter);
        setVelocity(100, -20);

        sim.update(10, 50, 8, {...inputs, geometry});
        // 2 s at the velocity: 200 m north and 40 m west
        sim.update(12, 50 + metersToLat(200), 8 - 40 / (EARTH_RADIUS_M * Math.cos(50 * DEG)) / DEG, {...inputs, geometry});

        expect(update).toHaveBeenCalledTimes(2);
        // The first update has no time reference
        const [dt, lat, lon, vNorth, vEast, posVarNorth, posVarEast, velVarNorth, velVarEast] = update.mock.calls[0];
        expect(dt).toBe(0);
        expect(lat).toBeCloseTo(50 + 7 / EARTH_RADIUS_M / DEG, 9);
        expect(lon).toBeCloseTo(8 - 3 / (EARTH_RADIUS_M * Math.cos(50 * DEG)) / DEG, 9);
        expect(vNorth).toBeCloseTo(100.4, 9);
        expect(vEast).toBeCloseTo(-20.3, 9);
        expect(posVarNorth).toBeCloseTo(50, 9);
        expect(posVarEast).toBeCloseTo(75, 9);
        expect(velVarNorth).toBeCloseTo(0.005, 9);
        expect(velVarEast).toBeCloseTo(0.0075, 9);
        expect(update.mock.calls[1][0]).toBe(2);
    });

    it('the track is the direction of the filtered velocity, in [0, 360), and null without any', () => {
        const none = withoutErrors(inputs);
        const cases: [number, number, number | null][] = [
            [50, 0, 0],
            [0, 50, 90],
            [-50, 0, 180],
            [0, -50, 270],
            // a tiny angle below north must not round to 360
            [1, -1e-20, 0],
            [0, 0, null],
        ];
        for (const [north, east, track] of cases) {
            setVelocity(north, east);
            const sim = new SimulatedMeasurement(mulberry32(1));
            sim.update(0, 50, 8, none);
            if (track === null) {
                expect(sim.trackTrue).toBeNull();
            } else {
                expect(sim.trackTrue).not.toBeNull();
                expect(sim.trackTrue).toBeCloseTo(track, 6);
                expect(sim.trackTrue).toBeLessThan(360);
                expect(sim.trackTrue).toBeGreaterThanOrEqual(0);
            }
        }
        // The pair from above: -1e-20 east of a speed of 1 is exactly the case that rounds up to 360
        setVelocity(1, -1e-20);
        const sim = new SimulatedMeasurement(mulberry32(1));
        sim.update(0, 50, 8, none);
        expect(sim.trackTrue).toBe(0);
    });

    // The filter's velocity is the measured one, so a small speed stays a small speed and still has a direction
    it('a small speed still has a track', () => {
        for (const [north, east, track] of [[0.1, 0, 0], [0, 0.1, 90], [0, 1e-6, 90], [0, 1e-12, 90]] as [number, number, number][]) {
            setVelocity(north, east);
            const sim = new SimulatedMeasurement(mulberry32(1));
            sim.update(0, 50, 8, withoutErrors(inputs));

            expect(sim.trackTrue).not.toBeNull();
            expect(sim.trackTrue).toBeCloseTo(track, 6);
            expect(sim.groundspeedKt).toBeCloseTo(Math.max(north, east) / MPS_PER_KNOT, 9);
        }
    });

    it('the ground speed is the length of the velocity in knots', () => {
        setVelocity(30, 40);
        const sim = new SimulatedMeasurement(mulberry32(1));
        sim.update(0, 50, 8, withoutErrors(inputs));

        expect(sim.groundspeedKt).toBeCloseTo(50 / MPS_PER_KNOT, 6);
    });

    it('the filter smooths: after a step in the measurement the output has not jumped all the way', () => {
        // The truth stands still and the position error steps 100 m north, 1 s later
        const errors = new FixedErrors([0, 0, 0, 0]);
        const sim = new SimulatedMeasurement(Math.random, errors);
        sim.update(0, 50, 8, inputs);
        errors.fixed = [100, 0, 0, 0];
        sim.update(1, 50, 8, inputs);

        const moved = metersBetween(50, 8, sim.lat, sim.lon);
        expect(moved).toBeGreaterThan(5);
        expect(moved).toBeLessThan(95);
    });
});

describe('SimulatedMeasurement SimVar reads', () => {
    // The sim stalls while instrument JS runs and a SimVar read is expensive: one read per name per update
    const readsOf = (inputs: MeasurementInputs, updates: number): Map<string, number> => countReads(() => {
        const sim = new SimulatedMeasurement(mulberry32(1));
        for (let t = 0; t < updates; t++) {
            sim.update(t, 50, 8, inputs);
        }
    });

    it('reads each velocity once per update, and the altitude only with the altitude input', () => {
        const without = readsOf(makeInputs(FIVE_SATELLITES, false, null), 1);
        expect([...without].sort()).toEqual([['VELOCITY WORLD X', 1], ['VELOCITY WORLD Z', 1]]);

        const aided = readsOf(makeInputs(THREE_SATELLITES, true, 3100), 1);
        expect([...aided].sort()).toEqual([['PLANE ALTITUDE', 1], ['VELOCITY WORLD X', 1], ['VELOCITY WORLD Z', 1]]);

        // Several updates: still one of each per update
        const several = readsOf(makeInputs(THREE_SATELLITES, true, 3100), 3);
        expect(several.get('PLANE ALTITUDE')).toBe(3);
        expect(several.get('VELOCITY WORLD X')).toBe(3);
        expect(several.get('VELOCITY WORLD Z')).toBe(3);
    });

    it('reads nothing at the same sim time', () => {
        const aided = makeInputs(THREE_SATELLITES, true, 3100);
        const sim = new SimulatedMeasurement(mulberry32(1));
        sim.update(10, 50, 8, aided);

        const counts = countReads(() => sim.update(10, 50, 8, aided));

        expect([...counts]).toEqual([]);
    });
});

describe('SimulatedMeasurement time handling', () => {
    const base = makeInputs(FIVE_SATELLITES, false, null);
    const none = withoutErrors(base);

    // The tests below hold the truth still (v = 0) and move it by a step the filter would only follow partly: after a
    // restart the output is the measurement, which with no errors is the truth to the last digit.
    // The second update of the acquisition tick (GpsMeasurement)
    it('holds at the same sim time', () => {
        const draws = vi.fn(mulberry32(3));
        setVelocity(50, 0);
        const sim = new SimulatedMeasurement(draws);
        sim.update(10, 50, 8, base);
        sim.update(11, 50.0005, 8, base);
        const held = [sim.lat, sim.lon, sim.groundspeedKt, sim.trackTrue];
        const drawn = draws.mock.calls.length;

        setVelocity(10, 80);
        sim.update(11, 50.5, 8.5, base);

        expect([sim.lat, sim.lon, sim.groundspeedKt, sim.trackTrue]).toEqual(held);
        expect(draws.mock.calls.length).toBe(drawn);
    });

    it('restarts when sim time goes backwards', () => {
        setVelocity(50, 0);
        const sim = new SimulatedMeasurement(mulberry32(5));
        let t = 10000;
        const truthLat = (seconds: number) => 50 + metersToLat(50 * seconds);
        for (let s = 0; s < 3; s++, t++) {
            sim.update(t, truthLat(s), 8, base);
        }
        // A new flight: the sim time drops by 3600 s while the aircraft goes on
        t -= 3600;
        for (let s = 3; s < 8; s++, t++) {
            sim.update(t, truthLat(s), 8, base);
        }

        expect(metersBetween(truthLat(7), 8, sim.lat, sim.lon)).toBeLessThan(50);
    });

    it('starts from the measurement when sim time goes backwards', () => {
        const sim = new SimulatedMeasurement(mulberry32(5));
        sim.update(10000, 50, 8, none);
        sim.update(10001, 50, 8, none);

        sim.update(6401, 50 + metersToLat(1000), 8, none);

        expect(metersBetween(50 + metersToLat(1000), 8, sim.lat, sim.lon)).toBeLessThan(1e-3);
    });

    it('starts from the measurement after a gap of more than 30 s, not after 30 s', () => {
        const stepM = 1800;
        const after = (gapS: number): number => {
            const sim = new SimulatedMeasurement(mulberry32(5));
            sim.update(100, 50, 8, none);
            sim.update(100 + gapS, 50 + metersToLat(stepM), 8, none);
            return metersBetween(50 + metersToLat(stepM), 8, sim.lat, sim.lon);
        };

        expect(after(31)).toBeLessThan(1e-3);
        // The filter's own gain after 30 s of drift is large but not 1
        expect(after(30)).toBeGreaterThan(0.05);
    });

    it('an update sets the reference time of the next one', () => {
        const model = new GpsErrorModel(CONSTANT);
        const sim = new SimulatedMeasurement(CONSTANT, model);
        // A large first time stamp is no gap, and the next update is measured from it
        sim.update(1e6, 50, 8, base);
        sim.update(1e6 + 1, 50, 8, base);

        const a = Math.exp(-1 / TAU_SLOW_S);
        expect(model.slowError(1)).toBeCloseTo(a * SIGMA_SLOW_M * Z + SIGMA_SLOW_M * Math.sqrt(1 - a * a) * Z, 9);
    });

    it('restarts on a teleport', () => {
        setVelocity(50, 0);
        const sim = new SimulatedMeasurement(mulberry32(7));
        const lat0 = 50;
        for (let s = 0; s < 5; s++) {
            sim.update(s, lat0 + metersToLat(50 * s), 8, base);
        }
        // 50 NM east in one second
        const lon = 8 + (50 * 1852) / (EARTH_RADIUS_M * Math.cos(lat0 * DEG)) / DEG;
        sim.update(5, lat0 + metersToLat(250), lon, base);

        expect(metersBetween(lat0 + metersToLat(250), lon, sim.lat, sim.lon)).toBeLessThan(100);
    });

    /**
     * Flies north at 100 m/s for 3 s, then lands the truth after a step of dtS where the velocity puts it, moved by
     * offsetM east (or north with `alongTrack`). Returns the restarts of the filter in that step.
     */
    const restartsAfterOffset = (dtS: number, offsetM: number, alongTrack = false): number => {
        setVelocity(100, 0);
        const filter = new GpsPositionFilter();
        const restart = vi.spyOn(filter, 'restart');
        const sim = new SimulatedMeasurement(mulberry32(5), undefined, filter);
        for (let s = 0; s < 3; s++) {
            sim.update(s, 50 + metersToLat(100 * s), 8, none);
        }
        const before = restart.mock.calls.length;
        const lat = 50 + metersToLat(100 * (2 + dtS) + (alongTrack ? offsetM : 0));
        const lon = 8 + (alongTrack ? 0 : offsetM / (EARTH_RADIUS_M * Math.cos(lat * DEG)) / DEG);
        sim.update(2 + dtS, lat, lon, none);
        return restart.mock.calls.length - before;
    };

    // The allowance is 50 m plus 20 m/s² · dt² / 2, at most 1 NM
    it.each([
        [1, 58, 62],
        [8, 680, 700],
        [16, 1840, 1865],
    ])('after %i s a move off the velocity by %i m does not restart, by %i m it does', (dtS, within, beyond) => {
        expect(restartsAfterOffset(dtS, within)).toBe(0);
        expect(restartsAfterOffset(dtS, beyond)).toBe(1);
    });

    it('a move shorter or longer than the velocity explains restarts as well', () => {
        expect(restartsAfterOffset(1, -58, true)).toBe(0);
        expect(restartsAfterOffset(1, -62, true)).toBe(1);
        expect(restartsAfterOffset(1, 58, true)).toBe(0);
        expect(restartsAfterOffset(1, 62, true)).toBe(1);
    });

    // A turn at 100 m/s: 30 °/s in aerobatics, and the standard rate under time acceleration, where one tick of the
    // unit is several seconds of sim time
    it.each([
        [1, 30],
        [4, 3],
        [16, 3],
    ])('a turn is no jump: steps of %i s at %i °/s', (dtS, rateDegPerS) => {
        const speed = 100;
        const rate = rateDegPerS * DEG;
        const radius = speed / rate;
        const filter = new GpsPositionFilter();
        const restart = vi.spyOn(filter, 'restart');
        const sim = new SimulatedMeasurement(mulberry32(5), undefined, filter);
        let restarts = 0;
        for (let step = 0; step < 10; step++) {
            const heading = rate * dtS * step;
            setVelocity(speed * Math.cos(heading), speed * Math.sin(heading));
            const lat = 50 + metersToLat(radius * Math.sin(heading));
            const lon = 8 + radius * (1 - Math.cos(heading)) / (EARTH_RADIUS_M * Math.cos(lat * DEG)) / DEG;
            const before = restart.mock.calls.length;
            sim.update(dtS * step, lat, lon, none);
            if (step > 0) {
                restarts += restart.mock.calls.length - before;
            }
        }

        expect(restarts).toBe(0);
    });

    it('a teleport restarts only the filter: the error processes go on', () => {
        const model = new GpsErrorModel(CONSTANT);
        const sim = new SimulatedMeasurement(CONSTANT, model);
        sim.update(0, 50, 8, base);
        const before = model.slowError(1);
        expect(before).toBeCloseTo(SIGMA_SLOW_M * Z, 9);

        sim.update(1, 51, 8, base);

        const a = Math.exp(-1 / TAU_SLOW_S);
        expect(model.slowError(1)).toBeCloseTo(a * before + SIGMA_SLOW_M * Math.sqrt(1 - a * a) * Z, 9);
    });

    it('a time that goes backwards restarts the error processes too', () => {
        for (const second of [60, 1000]) {
            const model = new GpsErrorModel(CONSTANT);
            const sim = new SimulatedMeasurement(CONSTANT, model);
            sim.update(1000, 50, 8, base);
            sim.update(1001, 50, 8, base);
            const stepped = model.slowError(1);
            expect(stepped).not.toBeCloseTo(SIGMA_SLOW_M * Z, 2);

            sim.update(second, 50, 8, base);

            // New satellites again, drawn from the stationary distribution
            expect(model.slowError(1)).toBeCloseTo(SIGMA_SLOW_M * Z, 9);
        }
    });

    // Design 6.7: the Gauss-Markov step is exact for any dt, so a gap restarts only the filter. The satellites are the
    // same ones afterwards: redrawing their slow errors would be a jump the real receiver does not make
    // Beyond a few correlation times the step lands near a redraw, so the gaps that tell them apart are the short ones
    it.each([31, 45, 600])('a gap of %i s restarts only the filter: the error processes step over the real dt', (gapS) => {
        const model = new GpsErrorModel(CONSTANT);
        const update = vi.spyOn(model, 'update');
        const sim = new SimulatedMeasurement(CONSTANT, model);
        sim.update(1000, 50, 8, base);
        sim.update(1001, 50, 8, base);
        const stepped = model.slowError(1);
        expect(stepped).not.toBeCloseTo(SIGMA_SLOW_M * Z, 2);

        sim.update(1001 + gapS, 50, 8, base);

        expect(update.mock.calls[2][0]).toBe(gapS);
        expect(model.slowError(1)).toBeCloseTo(stepFrom(stepped, gapS), 9);
    });

    it('restart() discards the filter and the error processes', () => {
        const model = new GpsErrorModel(CONSTANT);
        const sim = new SimulatedMeasurement(mulberry32(5), model);
        sim.update(0, 50, 8, none);
        expect(model.slowError(1)).not.toBe(0);

        sim.restart();

        expect(model.slowError(1)).toBe(0);
    });

    it('after restart() the next update starts from the measurement and needs no new sim time', () => {
        const sim = new SimulatedMeasurement(mulberry32(5));
        sim.update(0, 50, 8, none);

        sim.restart();
        // The same sim time as before: no pause
        sim.update(0, 50 + metersToLat(1000), 8, none);

        expect(metersBetween(50 + metersToLat(1000), 8, sim.lat, sim.lon)).toBeLessThan(1e-3);
    });
});

// Flight 1 in the sim (2026-11-02): in the active pause and in the pause the sim time runs on and VELOCITY WORLD keeps
// its last value, but the aircraft stands still. During a slew VELOCITY WORLD is the slew speed, but it reads 0 at the
// first and at the last tick of the slew.
describe('SimulatedMeasurement pause and slew', () => {
    const base = makeInputs(FIVE_SATELLITES, false, null);
    const none = withoutErrors(base);

    it.each([20, 90])('holds while the sim is paused at %i m/s', (speed) => {
        const draws = vi.fn(mulberry32(3));
        setVelocity(speed, 0);
        const sim = new SimulatedMeasurement(draws);
        for (let s = 0; s < 5; s++) {
            sim.update(s, 50 + metersToLat(speed * s), 8, base);
        }
        const held = [sim.lat, sim.lon, sim.groundspeedKt, sim.trackTrue];
        const drawn = draws.mock.calls.length;

        // 40 s of pause at the position of second 4
        for (let s = 5; s < 45; s++) {
            sim.update(s, 50 + metersToLat(speed * 4), 8, base);
            expect([sim.lat, sim.lon, sim.groundspeedKt, sim.trackTrue]).toEqual(held);
        }
        expect(draws.mock.calls.length).toBe(drawn);
    });

    it('the first update after a pause is a step of 1 s, not a gap', () => {
        const model = new GpsErrorModel(CONSTANT);
        const update = vi.spyOn(model, 'update');
        const filter = new GpsPositionFilter();
        const restart = vi.spyOn(filter, 'restart');
        setVelocity(90, 0);
        const sim = new SimulatedMeasurement(CONSTANT, model, filter);
        for (let s = 0; s < 5; s++) {
            sim.update(s, 50 + metersToLat(90 * s), 8, base);
        }
        for (let s = 5; s < 45; s++) {
            sim.update(s, 50 + metersToLat(90 * 4), 8, base);
        }
        const restarts = restart.mock.calls.length;
        const updates = update.mock.calls.length;

        sim.update(45, 50 + metersToLat(90 * 5), 8, base);

        expect(update.mock.calls.length).toBe(updates + 1);
        expect(update.mock.calls[updates][0]).toBe(1);
        expect(restart.mock.calls.length).toBe(restarts);
    });

    it.each([100, -100])('a flight across the antimeridian is no jump, at %i m/s east', (eastMps) => {
        setVelocity(0, eastMps);
        const filter = new GpsPositionFilter();
        const restart = vi.spyOn(filter, 'restart');
        const sim = new SimulatedMeasurement(mulberry32(5), undefined, filter);
        const degreesPerSecond = eastMps / (EARTH_RADIUS_M * Math.cos(50 * DEG)) / DEG;
        // Starts 0.0015 degrees (about 100 m) before the antimeridian
        const lon = (s: number): number => {
            const east = Math.sign(eastMps) * (180 - 0.0015) + degreesPerSecond * s;
            return east >= 180 ? east - 360 : east < -180 ? east + 360 : east;
        };
        sim.update(0, 50, lon(0), none);
        const restarts = restart.mock.calls.length;

        for (let s = 1; s < 6; s++) {
            sim.update(s, 50, lon(s), none);
        }

        expect(Math.sign(lon(5))).toBe(-Math.sign(eastMps));
        expect(restart.mock.calls.length).toBe(restarts);
    });

    it('a move of less than a tenth of what the velocity explains is a pause, unless the velocity explains less than 1 m', () => {
        const heldAfter = (movedM: number, speed: number): boolean => {
            const draws = vi.fn(mulberry32(3));
            setVelocity(speed, 0);
            const sim = new SimulatedMeasurement(draws);
            sim.update(0, 50, 8, none);
            const drawn = draws.mock.calls.length;
            sim.update(1, 50 + metersToLat(movedM), 8, none);
            return draws.mock.calls.length === drawn;
        };

        expect(heldAfter(9.9, 100)).toBe(true);
        expect(heldAfter(10.1, 100)).toBe(false);
        // An aircraft at rest
        expect(heldAfter(0, 0.9)).toBe(false);
        expect(heldAfter(0, 1.1)).toBe(true);
    });

    it('follows a slew whose first and last ticks read no velocity', () => {
        // As in flight 1: 84 m/s, a slew at 1430 m/s, 84 m/s again. The aircraft moves on during the last tick of the
        // slew, which reads 0.
        const sim = new SimulatedMeasurement(mulberry32(5));
        let north = 0;
        let t = 0;
        const tick = (velocity: number, movedM: number): number => {
            setVelocity(velocity, 0);
            north += movedM;
            sim.update(t++, 50 + metersToLat(north), 8, none);
            return metersBetween(50 + metersToLat(north), 8, sim.lat, sim.lon);
        };
        for (let s = 0; s < 5; s++) {
            tick(84, 84);
        }

        const errors = [tick(0, 0)];
        for (let s = 0; s < 7; s++) {
            errors.push(tick(1430, 1430));
        }
        errors.push(tick(0, 1430));
        for (let s = 0; s < 5; s++) {
            errors.push(tick(84, 84));
        }

        expect(Math.max(...errors)).toBeLessThan(1);
    });

    // Steady at 100 m/s north, then a step of 1 s in which the truth moves movedM north while the sim reads velocityMps
    const restartsAfterStep = (movedM: number, velocityMps: number): number => {
        setVelocity(100, 0);
        const filter = new GpsPositionFilter();
        const restart = vi.spyOn(filter, 'restart');
        const sim = new SimulatedMeasurement(mulberry32(5), undefined, filter);
        for (let s = 0; s < 3; s++) {
            sim.update(s, 50 + metersToLat(100 * s), 8, none);
        }
        const restarts = restart.mock.calls.length;

        setVelocity(velocityMps, 0);
        sim.update(3, 50 + metersToLat(200 + movedM), 8, none);

        return restart.mock.calls.length - restarts;
    };

    it("restarts when the velocity of the filter does not explain the move, though the sim's does", () => {
        expect(restartsAfterStep(300, 300)).toBe(1);
    });

    // The last tick of a slew: the filter would believe the velocity of 0 and pull the position back
    it("restarts when the velocity of the sim does not explain the move, though the filter's does", () => {
        expect(restartsAfterStep(100, 0)).toBe(1);
    });

    it('does not restart when both explain the move', () => {
        expect(restartsAfterStep(100, 100)).toBe(0);
    });
});

describe('SimulatedMeasurement bad input', () => {
    const base = makeInputs(FIVE_SATELLITES, false, null);

    // A skipped update changes nothing, so the next good one takes the whole time since the last good one. The slow
    // error shows it: from t = 0 to 2 in one step of 2 s.
    const expectedAfterTwoSeconds = (): number => {
        const a = Math.exp(-2 / TAU_SLOW_S);
        return a * SIGMA_SLOW_M * Z + SIGMA_SLOW_M * Math.sqrt(1 - a * a) * Z;
    };

    const bad: [string, (inputs: MeasurementInputs) => [number, number, number, MeasurementInputs]][] = [
        ['sim time', i => [NaN, 50, 8, i]],
        ['latitude', i => [1, NaN, 8, i]],
        ['longitude', i => [1, 50, NaN, i]],
        ['north velocity', i => {
            simEnv().sim.set('VELOCITY WORLD Z', 'meters per second', NaN);
            return [1, 50, 8, i];
        }],
        ['east velocity', i => {
            simEnv().sim.set('VELOCITY WORLD X', 'meters per second', NaN);
            return [1, 50, 8, i];
        }],
        ['coefficients', i => {
            const coefficients = new Float64Array(i.coefficients);
            coefficients[0] = NaN;
            return [1, 50, 8, {...i, coefficients}];
        }],
    ];

    it.each(bad)('skips an update with a bad %s and takes the whole time at the next good one', (name, makeBad) => {
        const model = new GpsErrorModel(CONSTANT);
        const sim = new SimulatedMeasurement(CONSTANT, model);
        sim.update(0, 50, 8, base);
        const held = [sim.lat, sim.lon, sim.groundspeedKt, sim.trackTrue];

        const [t, lat, lon, inputs] = makeBad(base);
        sim.update(t, lat, lon, inputs);
        expect([sim.lat, sim.lon, sim.groundspeedKt, sim.trackTrue]).toEqual(held);

        setVelocity(0, 0);
        sim.update(2, 50, 8, base);
        expect(Number.isFinite(sim.lat)).toBe(true);
        expect(Number.isFinite(sim.lon)).toBe(true);
        expect(model.slowError(1)).toBeCloseTo(
            // The skipped update with bad coefficients has already stepped the error model once, by 1 s, and the good
            // one steps by the 2 s since the last one that counted
            name === 'coefficients' ? stepFrom(stepFrom(SIGMA_SLOW_M * Z, 1), 2) : expectedAfterTwoSeconds(), 9);
    });
    // GPS takes the position of a new fix from the first update after a restart (gpsAcquired), so that update must leave a
    // meaningful position even when it cannot measure: the truth, at rest
    const badAfterTheTruth = bad.filter(([name]) => name === 'north velocity' || name === 'east velocity' || name === 'coefficients');

    it.each(badAfterTheTruth)('a bad %s at the first update gives the truth at rest, and no reference', (_name, makeBad) => {
        const sim = new SimulatedMeasurement(CONSTANT, new GpsErrorModel(CONSTANT));
        const [t, lat, lon, inputs] = makeBad(base);
        sim.update(t, lat, lon, inputs);
        expect([sim.lat, sim.lon, sim.groundspeedKt, sim.trackTrue]).toEqual([50, 8, 0, null]);

        // With a reference this update at the same time would be a pause and hold the truth at rest. Without one it
        // starts from its measurement, which moves at 10 m/s
        setVelocity(10, 0);
        sim.update(t, 50, 8, base);
        expect(sim.groundspeedKt).toBeCloseTo(10 / MPS_PER_KNOT, 6);
    });

    it('a bad velocity at the first update after restart() gives the truth at rest', () => {
        const sim = new SimulatedMeasurement(CONSTANT, new GpsErrorModel(CONSTANT));
        setVelocity(10, 20);
        sim.update(0, 50, 8, base);
        sim.update(1, 50.0001, 8.0003, base);
        expect(sim.groundspeedKt).toBeGreaterThan(40); //Precondition: outputs that are not the truth at rest

        sim.restart();
        simEnv().sim.set('VELOCITY WORLD Z', 'meters per second', NaN);
        sim.update(2, 50.0002, 8.0006, base);

        expect([sim.lat, sim.lon, sim.groundspeedKt, sim.trackTrue]).toEqual([50.0002, 8.0006, 0, null]);
    });
});

/** One Gauss-Markov step of the slow error with the constant draw */
function stepFrom(slow: number, dtS: number): number {
    const a = Math.exp(-dtS / TAU_SLOW_S);
    return a * slow + SIGMA_SLOW_M * Math.sqrt(1 - a * a) * Z;
}

describe('SimulatedMeasurement altitude', () => {
    // Three satellites alone give no fix; the altitude row is the fourth measurement, and its error moves the position
    it('with the altitude input, a 1000 ft wrong altitude moves a 3-satellite fix by more than 100 m', () => {
        const run = (indicatedFt: number): SimulatedMeasurement => {
            const inputs = makeInputs(THREE_SATELLITES, true, indicatedFt);
            const sim = new SimulatedMeasurement(mulberry32(11));
            sim.update(0, 50, 8, inputs);
            return sim;
        };

        const right = run(3000);
        const wrong = run(4000);

        expect(metersBetween(right.lat, right.lon, wrong.lat, wrong.lon)).toBeGreaterThan(100);
    });

    it('the altitude error is the indicated minus the true altitude, in meters, weighted 5 m / 30 m', () => {
        const inputsFor = (indicatedFt: number) => makeInputs(THREE_SATELLITES, true, indicatedFt);
        const at = (indicatedFt: number): SimulatedMeasurement => {
            const sim = new SimulatedMeasurement(CONSTANT);
            sim.update(0, 50, 8, inputsFor(indicatedFt));
            return sim;
        };
        const reference = inputsFor(3000);
        const altitudeRow = THREE_SATELLITES.length;

        const right = at(3000);
        const wrong = at(3500);

        // 500 ft is 152.4 m
        const northM = (wrong.lat - right.lat) * DEG * EARTH_RADIUS_M;
        const eastM = (wrong.lon - right.lon) * DEG * EARTH_RADIUS_M * Math.cos(50 * DEG);
        expect(northM).toBeCloseTo(reference.coefficients[2 * altitudeRow] * 152.4 * ALTITUDE_WEIGHT, 6);
        expect(eastM).toBeCloseTo(reference.coefficients[2 * altitudeRow + 1] * 152.4 * ALTITUDE_WEIGHT, 6);
        expect(Math.hypot(northM, eastM)).toBeGreaterThan(1);
    });

    it('the true altitude is the one of the sim', () => {
        const inputs = makeInputs(THREE_SATELLITES, true, 4000);
        simEnv().sim.set('PLANE ALTITUDE', 'feet', 3000);
        const low = new SimulatedMeasurement(mulberry32(11));
        low.update(0, 50, 8, inputs);
        simEnv().sim.set('PLANE ALTITUDE', 'feet', 4000);
        const same = new SimulatedMeasurement(mulberry32(11));
        same.update(0, 50, 8, inputs);

        // At 4000 ft the indicated 4000 ft is no error at all: the position differs from the 1000 ft case
        expect(metersBetween(low.lat, low.lon, same.lat, same.lon)).toBeGreaterThan(100);
    });

    it('without an altitude input the true altitude of the sim does not matter', () => {
        const inputs = makeInputs(FIVE_SATELLITES, false, null);
        const run = (altitudeFt: number): GpsMeasurement => {
            simEnv().sim.set('PLANE ALTITUDE', 'feet', altitudeFt);
            const sim = new SimulatedMeasurement(mulberry32(11));
            sim.update(0, 50, 8, inputs);
            return sim;
        };

        const low = run(0);
        const high = run(30000);

        expect(high.lat).toBe(low.lat);
        expect(high.lon).toBe(low.lon);
    });
});
