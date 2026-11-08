import {beforeEach, describe, expect, it} from 'vitest';
import {FailingMeasurement} from '../../../kln90b/failures/FailingMeasurement';
import {GpsMeasurement, MeasurementInputs} from '../../../kln90b/GpsMeasurement';
import {GpsGeometry} from '../../../kln90b/GpsSolution';
import {RangeErrorView} from '../../../kln90b/failures/RangeErrors';

/**
 * The measurement with the errors of the mixed solution (#460, #465): the inner strategy's outputs moved by the view of the
 * range errors (RangeErrors), or the false position in their place under the false reference. The expected values are
 * derived by hand from the view's shift
 */

const R = 6378100;
const DEG = 180 / Math.PI;
const MPS_PER_KT = 1852 / 3600;

/** An inner strategy with fixed outputs that records its calls */
class FakeInner implements GpsMeasurement {
    public lat = 47.5;
    public lon = 8.25;
    public groundspeedKt = 123;
    public trackTrue: number | null = 77;
    public calls: [number, number, number, MeasurementInputs][] = [];
    public restarts = 0;

    public update(simTimeS: number, truthLat: number, truthLon: number, inputs: MeasurementInputs): void {
        this.calls.push([simTimeS, truthLat, truthLon, inputs]);
    }

    public restart(): void {
        this.restarts++;
    }
}

let inner: FakeInner;
let view: { -readonly [K in keyof RangeErrorView]: RangeErrorView[K] };
let fm: FailingMeasurement;

function inputs(): MeasurementInputs {
    return {geometry: {} as GpsGeometry, prns: [7], coefficients: Float64Array.of(1, 0, 0, 0), indicatedAltitudeFt: null};
}

beforeEach(() => {
    view = {falseReference: false, falseLat: 0, falseLon: 0, northM: 0, eastM: 0, velNorthMps: 0, velEastMps: 0, clockM: 0, sseM2: 0};
    inner = new FakeInner();
    fm = new FailingMeasurement(inner, view);
});

describe('FailingMeasurement', () => {
    it('without errors the outputs equal the inner ones exactly and the call is passed on', () => {
        const inp = inputs();
        fm.update(12, 47.4, 8.2, inp);
        expect(fm.lat).toBe(47.5);
        expect(fm.lon).toBe(8.25);
        expect(fm.groundspeedKt).toBe(123);
        expect(fm.trackTrue).toBe(77);
        expect(inner.calls).toHaveLength(1);
        expect(inner.calls[0][0]).toBe(12);
        expect(inner.calls[0][1]).toBe(47.4);
        expect(inner.calls[0][2]).toBe(8.2);
        expect(inner.calls[0][3]).toBe(inp);
    });

    it('a null track of the inner strategy stays null', () => {
        inner.trackTrue = null;
        fm.update(1, 47, 8, inputs());
        expect(fm.trackTrue).toBeNull();
        view.velNorthMps = 30;
        fm.update(2, 47, 8, inputs());
        expect(fm.trackTrue).toBeNull(); // Moving with no direction known yet to add the error to: the inner outputs are kept
        expect(fm.groundspeedKt).toBe(123);
    });

    // ExactMeasurement gives no track for an aircraft standing still: its velocity is 0, so the error is the velocity
    it('at rest the velocity error alone gives the ground speed and the track', () => {
        inner.groundspeedKt = 0;
        inner.trackTrue = null;
        view.velNorthMps = -30 * MPS_PER_KT;
        fm.update(1, 47.4, 8.2, inputs());
        expect(fm.groundspeedKt).toBeCloseTo(30, 9);
        expect(fm.trackTrue).toBeCloseTo(180, 9);

        // Below the 2 kt of a track (3-35) the inner velocity counts as 0 too, whatever track it gives
        inner.groundspeedKt = 1.5;
        inner.trackTrue = 90;
        view.velNorthMps = 0;
        view.velEastMps = -40 * MPS_PER_KT;
        fm.update(2, 47.4, 8.2, inputs());
        expect(fm.groundspeedKt).toBeCloseTo(40, 9);
        expect(fm.trackTrue).toBeCloseTo(270, 9);

        // Without an error the inner values stay, also at rest
        view.velEastMps = 0;
        fm.update(3, 47.4, 8.2, inputs());
        expect(fm.groundspeedKt).toBe(1.5);
        expect(fm.trackTrue).toBe(90);
    });

    it('a moving aircraft whose inner update gives no track adds the error to its last track; a restart forgets it', () => {
        inner.groundspeedKt = 100;
        inner.trackTrue = 90;
        fm.update(1, 47.4, 8.2, inputs());
        inner.trackTrue = null; // The sim paused
        view.velNorthMps = 100 * MPS_PER_KT;
        fm.update(2, 47.4, 8.2, inputs());
        expect(fm.groundspeedKt).toBeCloseTo(100 * Math.SQRT2, 9);
        expect(fm.trackTrue).toBeCloseTo(45, 9);

        fm.restart();
        fm.update(3, 47.4, 8.2, inputs());
        expect(fm.groundspeedKt).toBe(100);
        expect(fm.trackTrue).toBeNull();
    });

    // The faulty satellite's cases of #460, now through the view: a satellite due north moves the position south by its
    // coefficient times the bias, one to the east moves it west
    it('a shift to the south moves the latitude only', () => {
        view.northM = -800;
        fm.update(1, 47.4, 8.2, inputs());
        expect(fm.lat).toBeCloseTo(47.5 - 800 / R * DEG, 12);
        expect(fm.lon).toBe(8.25);
        expect(fm.groundspeedKt).toBe(123);
        expect(fm.trackTrue).toBe(77);
    });

    it('a shift to the west moves the longitude, scaled by cos(latitude)', () => {
        view.eastM = -500;
        fm.update(1, 47.4, 8.2, inputs());
        expect(fm.lat).toBe(47.5);
        expect(fm.lon).toBeCloseTo(8.25 - 500 / (R * Math.cos(47.5 / DEG)) * DEG, 12);
    });

    it('a shift on both axes scales the east by the moved latitude', () => {
        view.northM = 500;
        view.eastM = -1000;
        fm.update(1, 47.4, 8.2, inputs());
        const lat = 47.5 + 500 / R * DEG;
        expect(fm.lat).toBeCloseTo(lat, 12);
        expect(fm.lon).toBeCloseTo(8.25 - 1000 / (R * Math.cos(lat / DEG)) * DEG, 12);
    });

    it('the shift does not accumulate over updates, and is gone with the error', () => {
        view.northM = -1000;
        fm.update(1, 47.4, 8.2, inputs());
        fm.update(2, 47.4, 8.2, inputs());
        expect(fm.lat).toBeCloseTo(47.5 - 1000 / R * DEG, 12);
        view.northM = 0;
        fm.update(3, 47.4, 8.2, inputs());
        expect(fm.lat).toBe(47.5);
    });

    it('keeps the cos(latitude) floor near the pole', () => {
        view.eastM = -1000;
        inner.lat = 90;
        fm.update(1, 90, 0, inputs());
        expect(fm.lon).toBeCloseTo(8.25 - 1000 / (R * 1e-4) * DEG, 6);
    });

    it('the velocity error is added to the inner velocity: ground speed and track from the sum', () => {
        inner.groundspeedKt = 100;
        inner.trackTrue = 90; // Due east at 100 kt
        view.velNorthMps = 100 * MPS_PER_KT; // Plus 100 kt north
        fm.update(1, 47.4, 8.2, inputs());
        expect(fm.groundspeedKt).toBeCloseTo(100 * Math.SQRT2, 9);
        expect(fm.trackTrue).toBeCloseTo(45, 9);

        view.velNorthMps = 0;
        view.velEastMps = -200 * MPS_PER_KT; // Minus 200 kt east: 100 kt west
        fm.update(2, 47.4, 8.2, inputs());
        expect(fm.groundspeedKt).toBeCloseTo(100, 9);
        expect(fm.trackTrue).toBeCloseTo(270, 9);
    });

    it('a sum below 2 kt has no track', () => {
        inner.groundspeedKt = 100;
        inner.trackTrue = 0;
        view.velNorthMps = -99 * MPS_PER_KT;
        fm.update(1, 47.4, 8.2, inputs());
        expect(fm.groundspeedKt).toBeCloseTo(1, 9);
        expect(fm.trackTrue).toBeNull();
    });

    it('reference false: the false position and ground speed 0 with no error rows', () => {
        view.falseReference = true;
        view.falseLat = 32.0114;
        view.falseLon = 34.8867;
        fm.update(1, 47.4, 8.2, inputs());
        expect(fm.lat).toBe(32.0114);
        expect(fm.lon).toBe(34.8867);
        expect(fm.groundspeedKt).toBe(0);
        expect(fm.trackTrue).toBeNull();
        expect(inner.calls).toHaveLength(1); // The inner strategy runs on
    });

    it('reference false: the shift and the velocity error alone', () => {
        view.falseReference = true;
        view.falseLat = 32;
        view.falseLon = 35;
        view.northM = 1000;
        view.eastM = 2000;
        view.velNorthMps = -30 * MPS_PER_KT;
        view.velEastMps = -40 * MPS_PER_KT;
        fm.update(1, 47.4, 8.2, inputs());
        const lat = 32 + 1000 / R * DEG;
        expect(fm.lat).toBeCloseTo(lat, 12);
        expect(fm.lon).toBeCloseTo(35 + 2000 / (R * Math.cos(lat / DEG)) * DEG, 12);
        expect(fm.groundspeedKt).toBeCloseTo(50, 9);
        expect(fm.trackTrue).toBeCloseTo(180 + Math.atan2(4, 3) * DEG, 9);
    });

    it('restart passes through', () => {
        fm.restart();
        expect(inner.restarts).toBe(1);
    });
});
