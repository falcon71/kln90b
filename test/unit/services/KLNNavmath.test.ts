import {describe, expect, it} from 'vitest';
import {NavMath} from '@microsoft/msfs-sdk';
import {
    bankeAngleForStandardTurn,
    distanceToAchieveBankAngleChange,
    intermediatePoint,
} from '../../../kln90b/services/KLNNavmath';
import {courseDeg, distanceNm, pointFrom} from '../../harness/flight/geo';

const A = {lat: 50, lon: 8};
const B = {lat: 51, lon: 10};
/** The point a fraction f along the great circle A to B: the destination formula at f times the haversine distance */
const textbookPoint = (f: number) => pointFrom(A, courseDeg(A, B), distanceNm(A, B) * f);

describe('intermediatePoint', () => {
    it('returns the start point for f = 0', () => {
        const p = intermediatePoint(A, B, 0);
        expect(p.lat).toBeCloseTo(50, 6);
        expect(p.lon).toBeCloseTo(8, 6);
    });

    // The pins below take their expectation from the harness geometry. This sibling passes today and holds that
    // source to the literals of https://edwilliams.org/avform147.htm#Intermediate (also in issue #97), so a pin
    // cannot stay red because the expectation is wrong.
    it('the expectation of the pins below is the textbook midpoint and end point', () => {
        expect(textbookPoint(0.5).lat).toBeCloseTo(50.5043, 3);
        expect(textbookPoint(0.5).lon).toBeCloseTo(8.9894, 3);
        expect(textbookPoint(1).lat).toBeCloseTo(51, 6);
        expect(textbookPoint(1).lon).toBeCloseTo(10, 6);
    });

    // The code has two errors: the sine of (1 - f) times d instead of the sine of the product, and a z without the
    // B term. The latitude collapses to the equator as f grows (f = 1 returns 0.0000 / 10.0000), so no point other
    // than f = 0 is right today and every f has its own pin.
    it.fails.each([0.25, 0.5, 0.75, 1])('returns the great-circle point at f = %s (#97)', (f) => {
        const p = intermediatePoint(A, B, f);
        const expected = textbookPoint(f);
        expect(p.lat).toBeCloseTo(expected.lat, 3);
        expect(p.lon).toBeCloseTo(expected.lon, 3);
    });

    // Once #97 is fixed this is the property the MSA sampling needs: the point is on the segment
    it.fails('lies on the segment between the ends for f = 0.5 (#97)', () => {
        const p = intermediatePoint(A, B, 0.5);
        expect(distanceNm(A, p) + distanceNm(p, B)).toBeCloseTo(distanceNm(A, B), 6);
    });
});

describe('bankeAngleForStandardTurn', () => {
    // A standard-rate turn is 3°/s, so tan(bank) = V * omega / g (https://edwilliams.org/avform147.htm#Turns). The
    // textbook value is derived here from the physical constants, with V in knots converted to m/s. The code uses the
    // rounded constant 362.1 of that page, which differs from the physical value (364.1) by 0.5 %, up to 0.1°.
    const OMEGA = 3 * Math.PI / 180; // rad/s
    const G = 9.80665; // m/s²
    const physicalBank = (kt: number) => Math.atan(kt * (1852 / 3600) * OMEGA / G) * 180 / Math.PI;

    it.each([60, 90, 120, 150])('banks the standard-rate angle at %s kt, within 0.15°', (kt) => {
        expect(Math.abs(bankeAngleForStandardTurn(kt) - physicalBank(kt))).toBeLessThan(0.15);
    });

    // The code takes the constants of the avform147 page literally (57.3 degrees per radian, 362.1). The values below
    // are 57.3 * atan(V / 362.1), worked out by hand and rounded to two places, so a change of either constant shows
    it.each([[60, 9.41], [90, 13.96], [120, 18.34], [150, 22.50]])('banks the avform147 angle at %s kt: %s°', (kt, bank) => {
        expect(bankeAngleForStandardTurn(kt)).toBeCloseTo(bank, 2);
    });

    it('turns at the standard rate: the turn radius of the SDK at that bank is V / omega', () => {
        // 120 kt: V / omega = 61.73 m/s / 0.05236 rad/s = 1179 m. The SDK's radius is an independent formula
        const radiusM = NavMath.turnRadius(120, bankeAngleForStandardTurn(120));
        expect(radiusM).toBeGreaterThan(1179 * 0.99);
        expect(radiusM).toBeLessThan(1179 * 1.01);
    });

    it('banks nothing at 0 kt', () => {
        expect(bankeAngleForStandardTurn(0)).toBe(0);
    });

    // MAX_BANK_ANGLE is 25° (NavCalculator.ts). The standard-rate bank reaches it at about 169 kt (tan 25° * 362.1)
    it('stays below the limit up to 160 kt and is limited to 25° from 170 kt on', () => {
        expect(bankeAngleForStandardTurn(160)).toBeLessThan(25);
        expect(bankeAngleForStandardTurn(160)).toBeGreaterThan(23);
        expect(bankeAngleForStandardTurn(170)).toBe(25);
        expect(bankeAngleForStandardTurn(250)).toBe(25);
    });
});

// characterization: the roll rate of 5°/s is the author's assumption (comment in KLNNavmath.ts), the Pilot's Guide names none
describe('distanceToAchieveBankAngleChange (characterization)', () => {
    it('is the distance flown while the bank changes at 5°/s, in NM', () => {
        // 25° take 5 s; at 120 kt (2 NM per minute, 1/30 NM per second) that is 1/6 NM
        expect(distanceToAchieveBankAngleChange(25, 120)).toBeCloseTo(1 / 6, 6);
        // 10° take 2 s; at 360 kt (0.1 NM per second) that is 0.2 NM
        expect(distanceToAchieveBankAngleChange(10, 360)).toBeCloseTo(0.2, 6);
    });

    it('is 0 for no bank change and at 0 kt', () => {
        expect(distanceToAchieveBankAngleChange(0, 150)).toBe(0);
        expect(distanceToAchieveBankAngleChange(18, 0)).toBe(0);
    });
});
