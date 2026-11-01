import {describe, expect, it, vi} from 'vitest';
import {GPSPredictionContext, GPSSatelliteState} from '@microsoft/msfs-sdk';
import {computeGeometry, GpsGeometry, predictRaim, Raim, raimStatus} from '../../kln90b/GpsSolution';
import {RAIM_ENROUTE_NOT_APPROACH, stubSatellites} from '../harness/predictionStub';

// #453: the receiver solution. Every expected value below is derived by hand, never by calling the module.
// A line of sight is [zenith, azimuth] in radians. The measurement row of a satellite is
// [sin(zenith) cos(azimuth), sin(zenith) sin(azimuth), cos(zenith), 1], all weighted 1.
const DEG = Math.PI / 180;
// The line of sight as the SDK gives it: a Float64Array of zenith and azimuth
const sky = (zenithDeg: number, azimuthDeg: number): Float64Array => new Float64Array([zenithDeg * DEG, azimuthDeg * DEG]);
const ZENITH = sky(0, 0);
const horizon = (azimuthDeg: number): Float64Array => sky(90, azimuthDeg);
const THREE_ON_THE_HORIZON = [horizon(0), horizon(120), horizon(240)];
const ZENITH_AND_FOUR = [ZENITH, horizon(0), horizon(90), horizon(180), horizon(270)];

describe('computeGeometry', () => {
    // Rows: zenith (0,0,1,1) and horizon (cos a, sin a, 0, 1). The normal matrix N = GtG has
    // xx = yy = 3 * 1/2 = 1.5 and no x or y cross terms (the cosines and sines of 0/120/240 degrees sum to zero), so
    // the x and y variances are 1/1.5 = 2/3 each. HDOP = sqrt(2/3 + 2/3) = 2/sqrt(3) = 1.154700
    it('zenith plus three satellites on the horizon 120° apart: HDOP 2/√3', () => {
        const g = computeGeometry([ZENITH, ...THREE_ON_THE_HORIZON], false);
        expect(g.valid).toBe(true);
        expect(g.hdop).toBeCloseTo(2 / Math.sqrt(3), 6);
        expect(g.measurements).toBe(4);
        expect(g.satellites).toBe(4);
        expect(g.altitudeAided).toBe(false);
    });

    // EPE = 2 * HDOP * 5 m = 20 / sqrt(3) = 11.547005 m, and 1 NM is 1852 m
    it('EPE is 2 × HDOP × 5 m in NM', () => {
        const g = computeGeometry([ZENITH, ...THREE_ON_THE_HORIZON], false);
        expect(g.epeNm).toBeCloseTo((20 / Math.sqrt(3)) / 1852, 6);
    });

    // Without a fourth row the 3 satellites give a singular normal matrix. The altitude row is (0, 0, 5/30, 0): it is
    // the only row with a z entry and the only one without a clock entry, so N is diagonal with xx = yy = 1.5,
    // clock = 3 and zz = (1/6)^2. The x and y variances stay 2/3 whatever the altitude weight, so HDOP is 1.154700
    it('three satellites on the horizon need the altitude', () => {
        const without = computeGeometry(THREE_ON_THE_HORIZON, false);
        expect(without.valid).toBe(false);

        const aided = computeGeometry(THREE_ON_THE_HORIZON, true);
        expect(aided.valid).toBe(true);
        expect(aided.hdop).toBeCloseTo(2 / Math.sqrt(3), 6);
        expect(aided.altitudeAided).toBe(true);
        expect(aided.measurements).toBe(4);
        expect(aided.satellites).toBe(3);
    });

    // All four rows have a z entry of zero: the z column of the normal matrix is zero, so no inverse exists
    it('four satellites on the horizon are singular without the altitude', () => {
        const g = computeGeometry([horizon(0), horizon(90), horizon(180), horizon(270)], false);
        expect(g.valid).toBe(false);
        expect(g.hdop).toBeNaN();
        expect(g.epeNm).toBeNaN();
        expect(g.maxSlope).toBe(Infinity);
    });

    // N: xx = yy = 2 (four horizon satellites, half each), the z/clock block is [[1, 1], [1, 5]] with the inverse
    // 1/4 [[5, -1], [-1, 1]]. So the x and y variances are 0.5, the clock variance 0.25 and the z variance 1.25.
    // A horizon satellite g = (cos a, sin a, 0, 1): g C gt = 0.5 + 0.25 = 0.75, so S = 0.25. Its column of
    // H = C gt has the horizontal part 0.5 (cos a, sin a), of length 0.5. Slope = 0.5 / sqrt(0.25) = 1.
    // The zenith satellite is the only one that constrains z: its S is 1 - (1.25 - 0.5 + 0.25) = 0 and its horizontal
    // part is 0, so it cannot cause a horizontal error and its slope is 0.
    it('zenith plus four on the horizon at 0/90/180/270°: max slope 1', () => {
        const g = computeGeometry(ZENITH_AND_FOUR, false);
        expect(g.valid).toBe(true);
        expect(g.measurements).toBe(5);
        expect(g.maxSlope).toBeCloseTo(1, 6);
        expect(raimStatus(g, 2)).toBe(Raim.Available);
    });

    // The same constellation with the altitude row (0, 0, w, 0), w = 5/30 = 1/6, added. Only the z/clock block of N
    // changes, to [[1 + w², 1], [1, 5]] with the determinant 4 + 5w² = 149/36 and the clock variance
    // (1 + w²) / det = 37/149. A horizon satellite then has S = 1 - 0.5 - 37/149 = 75/298 and a slope of
    // 0.5 / sqrt(75/298). The zenith satellite and the altitude row act on z only, their horizontal part is 0.
    // (With the altitude weighted 1 the slope would be 0.5 / sqrt(5/18) = 0.9487.) There are six measurements.
    it('the altitude row counts as a measurement and is weighted 5 m / 30 m', () => {
        const g = computeGeometry(ZENITH_AND_FOUR, true);
        expect(g.measurements).toBe(6);
        expect(g.altitudeAided).toBe(true);
        expect(g.satellites).toBe(5);
        expect(g.hdop).toBeCloseTo(1, 6);
        expect(g.maxSlope).toBeCloseTo(0.5 * Math.sqrt(298 / 75), 6);
    });

    // Four satellites that all stand at the same zenith angle have z = cos(zenith) in every row, so the z column is
    // cos(zenith) times the clock column: the normal matrix is singular and there is no HDOP at all, not even a bad one
    it('four satellites on one cone of the sky (equal zenith angles) are singular', () => {
        const near = (azimuthDeg: number): Float64Array => sky(89.9, azimuthDeg);
        const g = computeGeometry([near(0), near(0.1), near(0.2), near(0.3)], false);
        expect(g.valid).toBe(false);
        expect(g.hdop).toBeNaN();
    });

    // Satellites at zenith 70/65/60/55 degrees and azimuth 0/5/10/15 degrees are all in one corner of the sky. The rows
    // are independent, but only just: the normal matrix has a pivot of 3e-7 and an HDOP of about 2300, which is an
    // EPE of 2 * 2300 * 5 m = 23000 m = 12 NM, well above the 3.8 NM of B-4 (7038 m, or an HDOP of 704)
    it('a nearly collinear constellation is invalid above 3.8 NM', () => {
        const g = computeGeometry([sky(70, 0), sky(65, 5), sky(60, 10), sky(55, 15)], false);
        expect(g.valid).toBe(false);
        expect(g.epeNm).toBeGreaterThan(3.8);
        expect(g.hdop).toBeGreaterThan(704);
        expect(g.maxSlope).toBe(Infinity);
    });

    // The same corner of the sky with the satellites spread over 8.5 degrees of azimuth each: the HDOP is 841.7, an EPE of
    // 2 * 841.7 * 5 m = 8417 m = 4.545 NM (numpy, with the normal matrix inverted outside the project): beyond the 3.8 NM
    // of B-4, but within about 5 NM, so a limit set far above 3.8 NM does not pass it
    it('a constellation with an error estimate of 4.5 NM is invalid', () => {
        const g = computeGeometry([sky(70, 0), sky(65, 8.5), sky(60, 17), sky(55, 25.5)], false);
        expect(g.epeNm).toBeCloseTo(4.545, 2);
        expect(g.valid).toBe(false);
        expect(g.maxSlope).toBe(Infinity);
    });

    // The spread of 10 degrees: HDOP 589.1, EPE 2 * 589.1 * 5 m = 5891 m = 3.181 NM (numpy), within the 3.8 NM
    it('a constellation with an error estimate of 3.2 NM is valid', () => {
        const g = computeGeometry([sky(70, 0), sky(65, 10), sky(60, 20), sky(55, 30)], false);
        expect(g.epeNm).toBeCloseTo(3.181, 2);
        expect(g.valid).toBe(true);
    });
});

describe('raimStatus', () => {
    const geometry = (measurements: number, maxSlope: number): GpsGeometry => ({
        valid: true,
        satellites: measurements,
        altitudeAided: false,
        measurements,
        hdop: 1,
        epeNm: 0.01,
        maxSlope,
    });

    it.each([0.3, 1, 2, 100])('four measurements are TooFewMeasurements whatever the HAL (%d NM)', (hal) => {
        expect(raimStatus(geometry(4, 1), hal)).toBe(Raim.TooFewMeasurements);
    });

    // HPL = 25 × 5 m × 5.3 = 662.5 m. 0.3 NM is 555.6 m, 1 NM is 1852 m
    it('is Geometry when the protection level exceeds the limit', () => {
        expect(raimStatus(geometry(6, 25), 0.3)).toBe(Raim.Geometry);
        expect(raimStatus(geometry(6, 25), 1)).toBe(Raim.Available);
    });

    // Zenith plus three on the horizon 120° apart, plus the altitude row (w = 1/6): four satellites but five
    // measurements, so RAIM is possible. N is block diagonal: xx = yy = 1.5, and the z/clock block is
    // [[1 + w², 1], [1, 4]] with the determinant 3 + 4w² = 28/9 and the clock variance (1 + w²) / det = 37/112.
    // A horizon satellite has S = 1 - (2/3 + 37/112) = 1/336 and a horizontal part of 2/3, so its slope is
    // (2/3) × sqrt(336) = 12.22, and HPL = 12.22 × 5 m × 5.3 = 323.8 m. The zenith satellite and the altitude row
    // have a horizontal part of 0. 2 NM is 3704 m, 0.1 NM is 185.2 m
    it('four satellites plus the altitude are five measurements: RAIM is not TooFewMeasurements', () => {
        const g = computeGeometry([ZENITH, ...THREE_ON_THE_HORIZON], true);
        expect(g.satellites).toBe(4);
        expect(g.measurements).toBe(5);
        expect(g.maxSlope).toBeCloseTo((2 / 3) * Math.sqrt(336), 6);
        expect(raimStatus(g, 2)).toBe(Raim.Available);
        expect(raimStatus(g, 0.1)).toBe(Raim.Geometry);
    });

    // Satellites (zenith, azimuth) 60/0, 60/90, 80/180, 80/270, 90/180 and the altitude row. The slopes were computed
    // independently of the module, with numpy from H = inv(G^T G) G^T and S = I - G H (no hand derivation of a 4×4
    // inverse): the satellites have 1.0513, 0.7753, 1.1463, 1.3232 and 0.7213, the altitude row has 1.80042 and is the
    // largest. The altitude row has a horizontal part because z is weakly observed with these low satellites.
    // HPL = 1.80042 × 26.5 m = 47.71 m with it, 1.3232 × 26.5 m = 35.07 m without it. 0.022 NM is 40.74 m.
    it('the altitude row can carry the maximum slope', () => {
        const g = computeGeometry([sky(60, 0), sky(60, 90), sky(80, 180), sky(80, 270), sky(90, 180)], true);
        expect(g.valid).toBe(true);
        expect(g.maxSlope).toBeCloseTo(1.80042, 4);
        expect(raimStatus(g, 0.022)).toBe(Raim.Geometry);
        expect(raimStatus(g, 0.03)).toBe(Raim.Available); // 55.56 m
    });

    // Satellites 30/0, 60/0, 45/180, 70/180 and 40/90, five measurements. Only the 40/90 satellite has a y entry
    // (sin 0° = sin 180° = 0), so it alone fixes y and nothing checks it: S = 0. Its horizontal part is 1 / sin(40°) =
    // 1.5557, so a fault in it moves the position without any residual, and the slope is Infinity.
    it('a satellite that alone fixes y and moves the position is an infinite slope: Geometry', () => {
        const g = computeGeometry([sky(30, 0), sky(60, 0), sky(45, 180), sky(70, 180), sky(40, 90)], false);
        expect(g.valid).toBe(true);
        expect(g.measurements).toBe(5);
        expect(g.maxSlope).toBe(Infinity);
        expect(raimStatus(g, 2)).toBe(Raim.Geometry);
    });
});

// #453, 6-3, 6-20: the prediction of RAIM at a place and time. The context is a stub that hands out fixed satellites
describe('predictRaim', () => {
    function stubContext(satellites: ReturnType<typeof stubSatellites>) {
        const context = {
            setPosition: vi.fn(() => context),
            predict: vi.fn(() => context),
            getSatellites: vi.fn(() => satellites),
        };
        return context;
    }
    const predict = (context: ReturnType<typeof stubContext>, halNm: number, altitudeAided = false) =>
        predictRaim(context as unknown as GPSPredictionContext, 47, 8, 1_000_000, altitudeAided, halNm);

    // The slope of RAIM_ENROUTE_NOT_APPROACH is 43.90 by numpy (predictionStub.ts): HPL 0.63 NM
    it('checks the alert limit it is given: within 2 NM and 1 NM, beyond 0.3 NM', () => {
        expect(computeGeometry(stubSatellites(RAIM_ENROUTE_NOT_APPROACH).map(s => s.position.get()), false).maxSlope).toBeCloseTo(43.90, 1);
        const context = stubContext(stubSatellites(RAIM_ENROUTE_NOT_APPROACH));

        expect(predict(context, 2)).toBe(true);
        expect(predict(context, 1)).toBe(true);
        expect(predict(context, 0.3)).toBe(false);
    });

    it('predicts for the place and time it is given, at sea level, and reads the satellites after predict()', () => {
        const context = stubContext(stubSatellites(RAIM_ENROUTE_NOT_APPROACH));

        predict(context, 2);

        expect(context.setPosition).toHaveBeenCalledWith(47, 8, 0, 1_000_000);
        expect(context.predict.mock.invocationCallOrder[0]).toBeGreaterThan(context.setPosition.mock.invocationCallOrder[0]);
        expect(context.getSatellites.mock.invocationCallOrder[0]).toBeGreaterThan(context.predict.mock.invocationCallOrder[0]);
    });

    // Only the satellites the prediction has in use count: five tracked but not in use leave no solution
    it('ignores satellites that are not in use', () => {
        const context = stubContext(stubSatellites(RAIM_ENROUTE_NOT_APPROACH, GPSSatelliteState.Acquired));

        expect(predict(context, 2)).toBe(false);
    });

    // Four satellites are too few for RAIM; the altitude makes the fifth measurement. Four at zenith 45° and 90° apart
    // cannot tell the height from the clock, so the altitude row alone fixes the vertical (slope 0), and each satellite's
    // slope is √2 (numpy): HPL 37 m, within any limit
    it('counts the altitude as a measurement when it is aided', () => {
        const context = stubContext(stubSatellites([[45, 0], [45, 90], [45, 180], [45, 270]]));

        expect(predict(context, 2, false)).toBe(false);
        expect(predict(context, 2, true)).toBe(true);
    });
});
