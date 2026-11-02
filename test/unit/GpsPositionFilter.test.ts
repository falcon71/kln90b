import {describe, expect, it} from 'vitest';
import {GpsPositionFilter, PROCESS_NOISE} from '../../kln90b/GpsPositionFilter';

// #402: the Doppler-aided position filter (design 6.5, 6.7). The expectations are physical: meters of position error
// against a truth that is moved with a flat-earth step, written out in this file and not taken from the filter.

const R = 6378100;
const DEG = 180 / Math.PI;
/** Typical variances a later task passes with good geometry: 25 m^2 position, 0.0025 (m/s)^2 velocity */
const POS_VAR = 25;
const VEL_VAR = 0.0025;
const KT = 1852 / 3600;

/** A point moving with constant velocity; each step is the flat-earth step of the design */
class Truth {
    constructor(public lat: number, public lon: number, public vN: number, public vE: number) {
    }

    step(dt: number): void {
        const cosLat = Math.cos(this.lat / DEG);
        this.lat += this.vN * dt / R * DEG;
        this.lon += this.vE * dt / (R * cosLat) * DEG;
        if (this.lon >= 180) {
            this.lon -= 360;
        } else if (this.lon < -180) {
            this.lon += 360;
        }
    }
}

/** Distance in meters between two points, east difference wrapped, using the mean latitude */
function errorM(aLat: number, aLon: number, bLat: number, bLon: number): number {
    const north = (aLat - bLat) / DEG * R;
    let dLon = aLon - bLon;
    if (dLon > 180) {
        dLon -= 360;
    } else if (dLon < -180) {
        dLon += 360;
    }
    const east = dLon / DEG * R * Math.cos((aLat + bLat) / 2 / DEG);
    return Math.hypot(north, east);
}

function northM(fromLat: number, toLat: number): number {
    return (toLat - fromLat) / DEG * R;
}

function fly(filter: GpsPositionFilter, truth: Truth, updates: number, posVar = POS_VAR, velVar = VEL_VAR): void {
    for (let i = 0; i < updates; i++) {
        truth.step(1);
        filter.update(1, truth.lat, truth.lon, truth.vN, truth.vE, posVar, posVar, velVar, velVar);
    }
}

function finiteState(filter: GpsPositionFilter): boolean {
    return [filter.lat, filter.lon, filter.vNorth, filter.vEast].every(Number.isFinite);
}

describe('GpsPositionFilter', () => {
    it('keeps the process noise of 3 m/s^2 as a spectral density', () => {
        expect(PROCESS_NOISE).toBe(9);
    });

    it('takes the first measurement as its state', () => {
        const filter = new GpsPositionFilter();
        expect(filter.initialized).toBe(false);
        filter.update(1, 50.25, 8.5, 12, -7, POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
        expect(filter.initialized).toBe(true);
        expect(filter.lat).toBe(50.25);
        expect(filter.lon).toBe(8.5);
        expect(filter.vNorth).toBe(12);
        expect(filter.vEast).toBe(-7);
    });

    it('starts again from the measurement after a restart', () => {
        const filter = new GpsPositionFilter();
        fly(filter, new Truth(50, 8, 30, 0), 20);
        filter.restart();
        expect(filter.initialized).toBe(false);
        filter.update(1, 10, -20, 1, 2, POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
        expect(filter.lat).toBe(10);
        expect(filter.lon).toBe(-20);
        expect(filter.vNorth).toBe(1);
        expect(filter.vEast).toBe(2);
    });

    it('converges to a constant measurement', () => {
        const filter = new GpsPositionFilter();
        // Start 30 m north and 40 m east of the later constant measurement
        const lat = 50;
        const lon = 8;
        filter.update(1, lat + 30 / R * DEG, lon + 40 / (R * Math.cos(lat / DEG)) * DEG, 0, 0, POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
        for (let i = 0; i < 300; i++) {
            filter.update(1, lat, lon, 0, 0, POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
        }
        expect(errorM(filter.lat, filter.lon, lat, lon)).toBeLessThan(0.1);
        expect(filter.vNorth).toBeCloseTo(0, 3);
        expect(filter.vEast).toBeCloseTo(0, 3);
    });

    it('follows a velocity step within one update', () => {
        const filter = new GpsPositionFilter();
        const truth = new Truth(50, 8, 0, 0);
        fly(filter, truth, 30);
        expect(Math.abs(filter.vNorth)).toBeLessThan(0.01);
        truth.vN = 60;
        fly(filter, truth, 1);
        expect(Math.abs(filter.vNorth - 60)).toBeLessThan(1);
        expect(Math.abs(filter.vEast)).toBeLessThan(0.1);
    });

    it('follows an east velocity step within one update', () => {
        const filter = new GpsPositionFilter();
        const truth = new Truth(50, 8, 0, 0);
        fly(filter, truth, 30);
        truth.vE = -45;
        fly(filter, truth, 1);
        expect(Math.abs(filter.vEast + 45)).toBeLessThan(1);
        expect(Math.abs(filter.vNorth)).toBeLessThan(0.1);
    });

    it('turns a 20 m position step into a glide', () => {
        const filter = new GpsPositionFilter();
        const truth = new Truth(50, 8, 60, 0);
        fly(filter, truth, 60);
        const before = filter.lat;
        // The satellite change: the measured position jumps 20 m north while the aircraft flies on
        truth.step(1);
        const measuredLat = truth.lat + 20 / R * DEG;
        const predictedLat = before + 60 / R * DEG;
        filter.update(1, measuredLat, truth.lon, 60, 0, POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
        expect(northM(predictedLat, filter.lat)).toBeLessThan(10);
        expect(northM(predictedLat, filter.lat)).toBeGreaterThan(0);
        for (let i = 0; i < 29; i++) {
            truth.step(1);
            filter.update(1, truth.lat + 20 / R * DEG, truth.lon, 60, 0, POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
        }
        expect(northM(truth.lat, filter.lat)).toBeGreaterThan(18);
        expect(northM(truth.lat, filter.lat)).toBeLessThan(20.001);
    });

    it('turns a 20 m step to the east into a glide', () => {
        const filter = new GpsPositionFilter();
        const truth = new Truth(50, 8, 0, 60);
        fly(filter, truth, 60);
        const stepLon = 20 / (R * Math.cos(50 / DEG)) * DEG;
        truth.step(1);
        const predicted = filter.lon + 60 / (R * Math.cos(50 / DEG)) * DEG;
        filter.update(1, truth.lat, truth.lon + stepLon, 0, 60, POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
        const first = (filter.lon - predicted) / DEG * R * Math.cos(50 / DEG);
        expect(first).toBeGreaterThan(0);
        expect(first).toBeLessThan(10);
        for (let i = 0; i < 29; i++) {
            truth.step(1);
            filter.update(1, truth.lat, truth.lon + stepLon, 0, 60, POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
        }
        const after = (filter.lon - truth.lon) / DEG * R * Math.cos(50 / DEG);
        expect(after).toBeGreaterThan(18);
    });

    it('does not lag a constant-velocity truth', () => {
        const filter = new GpsPositionFilter();
        const truth = new Truth(50, 8, 0, 120 * KT);
        let worst = 0;
        for (let i = 0; i < 120; i++) {
            truth.step(1);
            filter.update(1, truth.lat, truth.lon, truth.vN, truth.vE, POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
            worst = Math.max(worst, errorM(filter.lat, filter.lon, truth.lat, truth.lon));
        }
        expect(worst).toBeLessThan(1);
    });

    it('does not lag a truth that moves north and east', () => {
        const filter = new GpsPositionFilter();
        const truth = new Truth(50, 8, 40, 25);
        let worst = 0;
        for (let i = 0; i < 120; i++) {
            truth.step(1);
            filter.update(1, truth.lat, truth.lon, truth.vN, truth.vE, POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
            worst = Math.max(worst, errorM(filter.lat, filter.lon, truth.lat, truth.lon));
        }
        expect(worst).toBeLessThan(1);
        expect(filter.vNorth).toBeCloseTo(40, 1);
        expect(filter.vEast).toBeCloseTo(25, 1);
    });

    it('normalizes the longitude of the first measurement', () => {
        const at = (lon: number): number => {
            const filter = new GpsPositionFilter();
            filter.update(1, 10, lon, 0, 0, POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
            return filter.lon;
        };
        expect(at(180)).toBe(-180);
        expect(at(190)).toBe(-170);
        expect(at(-180)).toBe(-180);
        expect(at(179.5)).toBe(179.5);
        // The edge value rounds to -180.00000000000003 without the last correction
        const edge = at(179.99999999999997);
        expect(edge).toBeGreaterThanOrEqual(-180);
        expect(edge).toBeLessThan(180);
    });

    describe('measurements that are not numbers', () => {
        const bad = [NaN, Infinity, -Infinity];
        // The four measured values, one at a time
        const slots = [0, 1, 2, 3];

        it.each(bad)('does not start from a measurement with %s', (value) => {
            for (const slot of slots) {
                const filter = new GpsPositionFilter();
                const m = [50, 8, 3, 4];
                m[slot] = value;
                filter.update(1, m[0], m[1], m[2], m[3], POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
                expect(filter.initialized).toBe(false);
                expect(finiteState(filter)).toBe(true);
                filter.update(1, 51, 9, 5, 6, POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
                expect(filter.initialized).toBe(true);
                expect(filter.lat).toBe(51);
                expect(filter.lon).toBe(9);
                expect(filter.vNorth).toBe(5);
                expect(filter.vEast).toBe(6);
            }
        });

        it.each(bad)('ignores a measurement with %s and takes the next good one normally', (value) => {
            for (const slot of slots) {
                const filter = new GpsPositionFilter();
                const truth = new Truth(50, 8, 30, 10);
                fly(filter, truth, 30);
                const before = [filter.lat, filter.lon, filter.vNorth, filter.vEast];
                const m = [truth.lat, truth.lon, 30, 10];
                m[slot] = value;
                filter.update(1, m[0], m[1], m[2], m[3], POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
                expect([filter.lat, filter.lon, filter.vNorth, filter.vEast]).toEqual(before);
                expect(filter.initialized).toBe(true);
                // The skipped call also did not predict or touch the covariance
                fly(filter, truth, 1);
                fly(filter, truth, 60);
                expect(errorM(filter.lat, filter.lon, truth.lat, truth.lon)).toBeLessThan(1);
                expect(finiteState(filter)).toBe(true);
            }
        });
    });

    it('weights each axis by its own position variance', () => {
        const filter = new GpsPositionFilter();
        const truth = new Truth(50, 8, 0, 0);
        fly(filter, truth, 30);
        // A good north measurement, an unusable east one, both 20 m off
        const stepLat = 20 / R * DEG;
        const stepLon = 20 / (R * Math.cos(50 / DEG)) * DEG;
        for (let i = 0; i < 5; i++) {
            filter.update(1, truth.lat + stepLat, truth.lon + stepLon, 0, 0, 0.01, 1e8, VEL_VAR, VEL_VAR);
        }
        expect(northM(truth.lat, filter.lat)).toBeGreaterThan(19);
        const east = (filter.lon - truth.lon) / DEG * R * Math.cos(50 / DEG);
        expect(Math.abs(east)).toBeLessThan(1);
    });

    it('weights each axis by its own velocity variance', () => {
        const filter = new GpsPositionFilter();
        const truth = new Truth(50, 8, 0, 0);
        fly(filter, truth, 30);
        // A good north velocity, an unusable east one
        filter.update(1, truth.lat, truth.lon, 10, 10, POS_VAR, POS_VAR, 0.0001, 1e8);
        expect(Math.abs(filter.vNorth - 10)).toBeLessThan(0.5);
        expect(Math.abs(filter.vEast)).toBeLessThan(0.5);
    });

    // The expected numbers were computed once with an independent textbook Kalman filter (numpy, full 2x2 matrices,
    // F = [[1, dt], [0, 1]], Q = 9 * [[dt^3/3, dt^2/2], [dt^2/2, dt]], one joint update with diagonal R). Positions in
    // meters from the start, velocities in m/s; each row is dt, measured position, measured velocity, position
    // variance, velocity variance, then the expected position and velocity after the update.
    const REFERENCE_NORTH = [
        [1, 3.0, 5.5, 25, 0.0025, 4.108347, 5.499806],
        [1, 14.0, 4.0, 25, 0.0025, 10.655653, 4.000584],
        [2, 25.0, 5.2, 400, 0.04, 20.037218, 5.197836],
        [0.5, 31.0, 6.0, 400, 0.04, 23.126362, 5.993198],
        [1, 34.0, 5.0, 1, 0.0001, 33.656113, 5.000028],
        [1, 41.0, 5.1, 100, 0.01, 38.744164, 5.100002],
    ];
    const REFERENCE_EAST = [
        [1, -2.0, -3.0, 36, 0.0016, -2.494840, -2.999989],
        [3, -15.0, -4.0, 100, 0.01, -13.551506, -3.999847],
        [1, -17.5, -2.5, 2500, 1.0, -16.881098, -2.649947],
        [1, -22.0, -3.1, 4, 0.0004, -21.739126, -3.099997],
        [2, -30.0, -3.0, 25, 0.0025, -28.435486, -3.000170],
        [1, -33.0, -3.0, 25, 0.0025, -31.802213, -3.000060],
    ];

    it('matches a reference Kalman filter to the north', () => {
        const filter = new GpsPositionFilter();
        filter.update(1, 0, 0, 5, 0, 25, 25, 0.0025, 0.0025);
        for (const [dt, z, zv, rp, rv, expectedPos, expectedVel] of REFERENCE_NORTH) {
            filter.update(dt, z / R * DEG, 0, zv, 0, rp, rp, rv, rv);
            expect(filter.lat / DEG * R).toBeCloseTo(expectedPos, 4);
            expect(filter.vNorth).toBeCloseTo(expectedVel, 5);
            expect(filter.lon).toBeCloseTo(0, 9);
            expect(filter.vEast).toBeCloseTo(0, 9);
        }
    });

    it('matches a reference Kalman filter to the east', () => {
        const filter = new GpsPositionFilter();
        filter.update(1, 0, 0, 0, -3, 36, 36, 0.0016, 0.0016);
        for (const [dt, z, zv, rp, rv, expectedPos, expectedVel] of REFERENCE_EAST) {
            filter.update(dt, 0, z / R * DEG, 0, zv, rp, rp, rv, rv);
            expect(filter.lon / DEG * R).toBeCloseTo(expectedPos, 4);
            expect(filter.vEast).toBeCloseTo(expectedVel, 5);
            expect(filter.lat).toBeCloseTo(0, 9);
            expect(filter.vNorth).toBeCloseTo(0, 9);
        }
    });

    it('takes a very precise measurement as it is, in meters on both axes', () => {
        const filter = new GpsPositionFilter();
        filter.update(1, 50, 8, 0, 0, POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
        const lat = 50 + 30 / R * DEG;
        const lon = 8 + 40 / (R * Math.cos(50 / DEG)) * DEG;
        filter.update(0, lat, lon, 0, 0, 1e-9, 1e-9, VEL_VAR, VEL_VAR);
        expect(northM(50, filter.lat)).toBeCloseTo(30, 4);
        expect((filter.lon - 8) / DEG * R * Math.cos(50 / DEG)).toBeCloseTo(40, 4);
    });

    describe('the antimeridian and the poles', () => {
        it('wraps the antimeridian flying east', () => {
            const filter = new GpsPositionFilter();
            const truth = new Truth(10, 179.99, 0, 60);
            let worst = 0;
            let crossed = false;
            for (let i = 0; i < 400; i++) {
                truth.step(1);
                filter.update(1, truth.lat, truth.lon, truth.vN, truth.vE, POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
                expect(filter.lon).toBeGreaterThanOrEqual(-180);
                expect(filter.lon).toBeLessThan(180);
                crossed = crossed || filter.lon < 0;
                worst = Math.max(worst, errorM(filter.lat, filter.lon, truth.lat, truth.lon));
            }
            expect(crossed).toBe(true);
            expect(filter.lon).toBeLessThan(-179.7);
            expect(worst).toBeLessThan(1);
        });

        it('wraps the antimeridian flying west', () => {
            const filter = new GpsPositionFilter();
            const truth = new Truth(-10, -179.99, 0, -60);
            let worst = 0;
            let crossed = false;
            for (let i = 0; i < 400; i++) {
                truth.step(1);
                filter.update(1, truth.lat, truth.lon, truth.vN, truth.vE, POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
                expect(filter.lon).toBeGreaterThanOrEqual(-180);
                expect(filter.lon).toBeLessThan(180);
                crossed = crossed || filter.lon > 0;
                worst = Math.max(worst, errorM(filter.lat, filter.lon, truth.lat, truth.lon));
            }
            expect(crossed).toBe(true);
            expect(filter.lon).toBeGreaterThan(179.7);
            expect(worst).toBeLessThan(1);
        });

        it('takes the short way to a measurement across the antimeridian', () => {
            const filter = new GpsPositionFilter();
            filter.update(1, 0, 179.99999, 0, 0, POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
            // The measurement is 2 m east of the state, on the other side of 180
            const eastDeg = 2 / R * DEG;
            for (let i = 0; i < 100; i++) {
                filter.update(1, 0, -180 + (eastDeg - 0.00001), 0, 0, POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
            }
            expect(errorM(filter.lat, filter.lon, 0, -180 + (eastDeg - 0.00001))).toBeLessThan(0.1);
        });

        it('stays finite at 89.9 degrees north', () => {
            const filter = new GpsPositionFilter();
            const truth = new Truth(89.9, 10, 20, 100);
            fly(filter, truth, 100);
            expect(finiteState(filter)).toBe(true);
            expect(filter.lat).toBeLessThanOrEqual(90);
            expect(filter.lon).toBeGreaterThanOrEqual(-180);
            expect(filter.lon).toBeLessThan(180);
        });

        it('moves the longitude by a bounded amount at the pole', () => {
            const filter = new GpsPositionFilter();
            filter.update(1, 90, 0, 0, 10, POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
            // Without the clamp this step is divided by cos(90 deg), about 6e-17
            filter.update(1, 90, 0, 0, 10, 1e9, 1e9, VEL_VAR, VEL_VAR);
            expect(finiteState(filter)).toBe(true);
            expect(Math.abs(filter.lon)).toBeLessThan(2);
        });

        it('does not run over the pole', () => {
            const filter = new GpsPositionFilter();
            filter.update(1, 89.99, 0, 0, 0, POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
            // 200 m/s north for 100 s is 20 km, 0.18 degrees: past the pole. The position is only predicted.
            for (let i = 0; i < 100; i++) {
                filter.update(1, 89.99, 0, 200, 0, NaN, NaN, VEL_VAR, VEL_VAR);
            }
            expect(filter.lat).toBeLessThanOrEqual(90);
            expect(filter.lat).toBeGreaterThanOrEqual(-90);
            expect(finiteState(filter)).toBe(true);
        });

        it('keeps the predicted latitude on the sphere before it takes the measurement', () => {
            const filter = new GpsPositionFilter();
            filter.update(1, 89.99, 0, 200, 0, POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
            // 200 m/s for 100 s would end 0.17 degrees past the pole. The gain is about one half here, so the
            // measurement pulls the clamped prediction, not the one beyond the pole, back below 90.
            filter.update(100, 89.95, 0, 200, 0, 3e6, 3e6, VEL_VAR, VEL_VAR);
            expect(filter.lat).toBeLessThan(89.99);
            expect(filter.lat).toBeGreaterThan(89.95);
        });

        it('keeps the latitude on the sphere for a measurement beyond the pole', () => {
            const north = new GpsPositionFilter();
            north.update(1, 89.99, 0, 0, 0, POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
            north.update(1, 95, 0, 0, 0, 1e-9, 1e-9, VEL_VAR, VEL_VAR);
            expect(north.lat).toBe(90);
            const south = new GpsPositionFilter();
            south.update(1, -89.99, 0, 0, 0, POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
            south.update(1, -95, 0, 0, 0, 1e-9, 1e-9, VEL_VAR, VEL_VAR);
            expect(south.lat).toBe(-90);
        });

        it('does not lag an eastbound truth at 89.9 degrees north', () => {
            const filter = new GpsPositionFilter();
            const truth = new Truth(89.9, 10, 0, 100);
            let worst = 0;
            for (let i = 0; i < 60; i++) {
                truth.step(1);
                filter.update(1, truth.lat, truth.lon, truth.vN, truth.vE, POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
                worst = Math.max(worst, errorM(filter.lat, filter.lon, truth.lat, truth.lon));
            }
            expect(worst).toBeLessThan(1);
        });

        it('does not run over the south pole', () => {
            const filter = new GpsPositionFilter();
            filter.update(1, -89.99, 0, 0, 0, POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
            for (let i = 0; i < 100; i++) {
                filter.update(1, -89.99, 0, -200, 0, NaN, NaN, VEL_VAR, VEL_VAR);
            }
            expect(filter.lat).toBeGreaterThanOrEqual(-90);
            expect(filter.lat).toBeLessThanOrEqual(90);
            expect(finiteState(filter)).toBe(true);
        });
    });

    describe('variances that cannot be used', () => {
        const unusable = [NaN, Infinity, 0, -1];

        it.each(unusable)('skips the position update with the position variance %s', (bad) => {
            const filter = new GpsPositionFilter();
            const truth = new Truth(50, 8, 30, 0);
            fly(filter, truth, 30);
            const lat0 = filter.lat;
            // The measured position is 1 km off and must not be used; the state keeps predicting with 30 m/s north
            for (let i = 0; i < 5; i++) {
                filter.update(1, lat0 + 1000 / R * DEG, truth.lon + 0.01, 30, 0, bad, bad, VEL_VAR, VEL_VAR);
                expect(finiteState(filter)).toBe(true);
            }
            expect(northM(lat0, filter.lat)).toBeCloseTo(150, 3);
            expect(filter.lon).toBeCloseTo(truth.lon, 9);
            // A later usable measurement is taken normally
            const target = lat0 + 400 / R * DEG;
            for (let i = 0; i < 100; i++) {
                filter.update(1, target + 30 * i / R * DEG, truth.lon, 30, 0, POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
            }
            expect(northM(target + 30 * 99 / R * DEG, filter.lat)).toBeCloseTo(0, 0);
            expect(finiteState(filter)).toBe(true);
        });

        it.each(unusable)('skips the velocity update with the velocity variance %s', (bad) => {
            const filter = new GpsPositionFilter();
            const truth = new Truth(50, 8, 30, 10);
            fly(filter, truth, 30);
            for (let i = 0; i < 3; i++) {
                truth.step(1);
                // The velocity measurement of 100 m/s must not be used
                filter.update(1, truth.lat, truth.lon, 100, -100, POS_VAR, POS_VAR, bad, bad);
                expect(finiteState(filter)).toBe(true);
            }
            expect(filter.vNorth).toBeLessThan(31);
            expect(filter.vNorth).toBeGreaterThan(29);
            expect(filter.vEast).toBeLessThan(11);
            expect(filter.vEast).toBeGreaterThan(9);
        });

        it.each(unusable)('skips only the north axis when the north variance is %s', (bad) => {
            const filter = new GpsPositionFilter();
            const truth = new Truth(50, 8, 0, 0);
            fly(filter, truth, 30);
            const stepLat = 20 / R * DEG;
            const stepLon = 20 / (R * Math.cos(50 / DEG)) * DEG;
            for (let i = 0; i < 5; i++) {
                filter.update(1, truth.lat + stepLat, truth.lon + stepLon, 5, 5, bad, POS_VAR, bad, VEL_VAR);
            }
            expect(Math.abs(northM(truth.lat, filter.lat))).toBeLessThan(0.001);
            expect(filter.vNorth).toBe(0);
            expect(Math.abs((filter.lon - truth.lon) / DEG * R * Math.cos(50 / DEG))).toBeGreaterThan(5);
            expect(filter.vEast).toBeGreaterThan(4.9);
        });

        it.each(unusable)('skips only the east axis when the east variance is %s', (bad) => {
            const filter = new GpsPositionFilter();
            const truth = new Truth(50, 8, 0, 0);
            fly(filter, truth, 30);
            const stepLat = 20 / R * DEG;
            const stepLon = 20 / (R * Math.cos(50 / DEG)) * DEG;
            for (let i = 0; i < 5; i++) {
                filter.update(1, truth.lat + stepLat, truth.lon + stepLon, 5, 5, POS_VAR, bad, VEL_VAR, bad);
            }
            expect(filter.lon).toBe(truth.lon);
            expect(filter.vEast).toBe(0);
            expect(northM(truth.lat, filter.lat)).toBeGreaterThan(5);
            expect(filter.vNorth).toBeGreaterThan(4.9);
        });

        it.each(unusable)('initializes from the measurement with the position variance %s', (bad) => {
            const filter = new GpsPositionFilter();
            filter.update(1, 50, 8, 3, 4, bad, bad, bad, bad);
            expect(filter.initialized).toBe(true);
            expect(filter.lat).toBe(50);
            expect(filter.lon).toBe(8);
            expect(filter.vNorth).toBe(3);
            expect(filter.vEast).toBe(4);
            // The start covariance is large but finite, so a good measurement is nearly taken as it is
            filter.update(1, 50 + 100 / R * DEG, 8, 3, 4, POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
            expect(finiteState(filter)).toBe(true);
            const predicted = 50 + 3 / R * DEG;
            expect(northM(predicted, filter.lat)).toBeGreaterThan(90 - 3);
        });

        it.each(unusable)('starts the position with (1852 m)^2 on both axes when the variance is %s', (bad) => {
            const filter = new GpsPositionFilter();
            filter.update(1, 50, 8, 0, 0, bad, bad, VEL_VAR, VEL_VAR);
            // A 100 m innovation with a large measurement variance of 1e6 m^2. The prediction variance is about
            // 1852^2 + 3 = 3.43e6, so the gain is about 0.77 and the shift about 77 m. A start variance of 1e4 gives
            // a gain of 0.01, a shift of about 1 m.
            filter.update(1, 50 + 100 / R * DEG, 8 + 100 / (R * Math.cos(50 / DEG)) * DEG, 0, 0, 1e6, 1e6,
                VEL_VAR, VEL_VAR);
            expect(northM(50, filter.lat)).toBeGreaterThan(60);
            expect(northM(50, filter.lat)).toBeLessThan(90);
            const east = (filter.lon - 8) / DEG * R * Math.cos(50 / DEG);
            expect(east).toBeGreaterThan(60);
            expect(east).toBeLessThan(90);
        });

        it.each(unusable)('initializes from the measurement with the velocity variance %s', (bad) => {
            const filter = new GpsPositionFilter();
            filter.update(1, 50, 8, 3, 4, POS_VAR, POS_VAR, bad, bad);
            // Over a short step the start covariance decides: a large one takes a good velocity almost as it is
            filter.update(0.001, 50, 8, 13, 14, POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
            expect(finiteState(filter)).toBe(true);
            expect(filter.vNorth).toBeGreaterThan(12.9);
            expect(filter.vEast).toBeGreaterThan(13.9);
        });
    });

    describe('time steps that are not positive', () => {
        it.each([0, -5, NaN])('does not predict over dt %s but still takes the measurement', (dt) => {
            const filter = new GpsPositionFilter();
            const truth = new Truth(50, 8, 60, 0);
            fly(filter, truth, 30);
            const lat0 = filter.lat;
            filter.update(dt, truth.lat, truth.lon, 60, 0, NaN, NaN, NaN, NaN);
            expect(filter.lat).toBe(lat0);
            // The measurement update still runs
            const measured = lat0 + 20 / R * DEG;
            filter.update(dt, measured, truth.lon, 60, 0, 0.01, 0.01, VEL_VAR, VEL_VAR);
            expect(northM(lat0, filter.lat)).toBeGreaterThan(10);
            expect(northM(lat0, filter.lat)).toBeLessThan(20.001);
            expect(finiteState(filter)).toBe(true);
            // The covariance did not collapse or blow up: the next normal update behaves as usual
            filter.update(1, measured + 60 / R * DEG, truth.lon, 60, 0, POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
            expect(finiteState(filter)).toBe(true);
        });

        it('does not turn a negative dt into a negative covariance', () => {
            const filter = new GpsPositionFilter();
            const truth = new Truth(50, 8, 60, 0);
            fly(filter, truth, 30);
            for (let i = 0; i < 20; i++) {
                filter.update(-3, truth.lat, truth.lon, 60, 0, POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
            }
            // With a collapsed covariance the filter would stop taking the measurement
            const target = truth.lat + 50 / R * DEG;
            for (let i = 0; i < 100; i++) {
                truth.step(1);
                filter.update(1, target + 60 * (i + 1) / R * DEG, truth.lon, 60, 0, POS_VAR, POS_VAR, VEL_VAR, VEL_VAR);
            }
            expect(northM(target + 60 * 100 / R * DEG, filter.lat)).toBeCloseTo(0, 0);
        });
    });
});
