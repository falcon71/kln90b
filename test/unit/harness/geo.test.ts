import {describe, expect, it} from 'vitest';
import {angleBetween, angleDiff, courseDeg, distanceNm, pointBefore, pointFrom} from '../../harness/flight/geo';

const kaaa = {lat: 47.0, lon: 8.0};
const abc = {lat: 47.5, lon: 8.9};

describe('angleDiff and angleBetween', () => {
    it('angleDiff is signed, a minus b, across north', () => {
        expect(angleDiff(10, 350)).toBeCloseTo(20, 9);
        expect(angleDiff(350, 10)).toBeCloseTo(-20, 9);
        expect(angleDiff(90, 80)).toBeCloseTo(10, 9);
        expect(angleDiff(80, 90)).toBeCloseTo(-10, 9);
    });

    it('angleDiff of opposite courses is +180, never -180', () => {
        expect(angleDiff(0, 180)).toBe(180);
        expect(angleDiff(180, 0)).toBe(180);
        expect(angleDiff(270, 90)).toBe(180);
        expect(angleDiff(5, 5)).toBe(0);
    });

    it('angleBetween is the absolute difference, and a null course counts as 180', () => {
        expect(angleBetween(10, 350)).toBeCloseTo(20, 9);
        expect(angleBetween(350, 10)).toBeCloseTo(20, 9);
        expect(angleBetween(0, 180)).toBe(180);
        expect(angleBetween(null, 5)).toBe(180);
    });
});

describe('pointFrom and pointBefore', () => {
    it('pointFrom is nm away from the start on the given course', () => {
        const p = pointFrom(kaaa, 51, 30);
        expect(Math.abs(distanceNm(kaaa, p) - 30)).toBeLessThan(1e-6);
        expect(angleBetween(courseDeg(kaaa, p), 51)).toBeLessThan(1e-6);
    });

    it('pointFrom goes the right way in each quadrant, and crosses the antimeridian', () => {
        const ne = pointFrom(kaaa, 45, 20);
        expect(ne.lat).toBeGreaterThan(kaaa.lat);
        expect(ne.lon).toBeGreaterThan(kaaa.lon);
        const sw = pointFrom(kaaa, 225, 20);
        expect(sw.lat).toBeLessThan(kaaa.lat);
        expect(sw.lon).toBeLessThan(kaaa.lon);
        const across = pointFrom({lat: 0, lon: 179.9}, 90, 30);
        expect(across.lon).toBeCloseTo(-179.6, 1);
    });

    it('pointBefore is nm from the target, on the great circle from the start', () => {
        const p = pointBefore(kaaa, abc, 10);
        expect(Math.abs(distanceNm(p, abc) - 10)).toBeLessThan(1e-6);
        expect(angleBetween(courseDeg(kaaa, p), courseDeg(kaaa, abc))).toBeLessThan(1e-6);
        // Before ABC means between KAAA and ABC
        expect(Math.abs(distanceNm(kaaa, p) + 10 - distanceNm(kaaa, abc))).toBeLessThan(1e-6);
    });
});
