import {describe, expect, it} from 'vitest';
import {angleBetween, angleDiff, courseDeg, crossTrackNm, distanceNm, pointBefore, pointFrom} from '../../harness/flight/geo';

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

// The expectations are derived without the formula of crossTrackNm. On the sphere of EARTH_RADIUS_NM (6378100 / 1852 =
// 3443.8985 NM) one degree of arc is 3443.8985 * pi / 180 = 60.10737 NM and one minute 1.001790 NM.
describe('crossTrackNm', () => {
    const origin = {lat: 0, lon: 0};

    // The meridian through the origin is the course line. A point on the equator 1 degree east of it is exactly 1 degree
    // of the equator away from it, because the equator meets every meridian at right angles. East is right of north.
    it('is the arc to a meridian course, positive right of the course', () => {
        expect(crossTrackNm({lat: 0, lon: 1}, origin, 0)).toBeCloseTo(60.10737, 4);
        expect(crossTrackNm({lat: 0, lon: -1}, origin, 0)).toBeCloseTo(-60.10737, 4);
        // The same line flown the other way: the point is now left of the course
        expect(crossTrackNm({lat: 0, lon: 1}, origin, 180)).toBeCloseTo(-60.10737, 4);
    });

    // The equator is the course line. A point at latitude 2 is 2 degrees of a meridian away from it (120.21474 NM),
    // wherever it lies along the equator, also more than 90 degrees behind the origin: the whole great circle counts.
    // North is left of an east-bound course.
    it('is the latitude to the equator as an east-bound course, ahead and behind', () => {
        expect(crossTrackNm({lat: 2, lon: 50}, origin, 90)).toBeCloseTo(-120.21474, 4);
        expect(crossTrackNm({lat: -2, lon: -120}, origin, 90)).toBeCloseTo(120.21474, 4);
        expect(crossTrackNm({lat: -2, lon: -120}, origin, 270)).toBeCloseTo(-120.21474, 4);
    });

    // A meridian course and a point off the equator, by vectors: the plane of the meridian at longitude 0 has the
    // normal (0, 1, 0), and the unit vector of the point (10 N, 3 E) has the y component cos(10) sin(3), the sine of its
    // angular distance from that plane: asin(0.0515399) * 3443.8985 = 177.58016 NM. The line is the same great circle
    // through any point of the meridian, so the point is measured the same from 40 N, where it lies behind.
    it('is the distance from the plane of a meridian, from any point of the meridian', () => {
        expect(crossTrackNm({lat: 10, lon: 3}, origin, 0)).toBeCloseTo(177.58016, 4);
        expect(crossTrackNm({lat: -10, lon: 3}, {lat: 40, lon: 0}, 0)).toBeCloseTo(177.58016, 4);
        expect(crossTrackNm({lat: -10, lon: 3}, {lat: 40, lon: 0}, 180)).toBeCloseTo(-177.58016, 4);
    });

    // An east-bound course at 47 N and a point 2 minutes of latitude north of the through point: the meridian meets the
    // course at right angles there, so the distance is the 2 minutes of the meridian, 2.003579 NM, to the left.
    it('is the meridian arc to a point abeam of the through point at 47 N', () => {
        expect(crossTrackNm({lat: 47 + 2 / 60, lon: 8}, {lat: 47, lon: 8}, 90)).toBeCloseTo(-2.003579, 5);
    });

    // A small offset at 47 N, by flat-earth geometry: 0.6 NM north and 1.2 NM east of the through point on a course of
    // 051 is 1.2 cos(51) - 0.6 sin(51) = 0.75518 - 0.46629 = 0.28890 NM right. The flat earth is good to a few
    // ten-thousandths of a mile at this size.
    it('agrees with flat-earth geometry for a small offset', () => {
        const nmPerDegree = 6378100 / 1852 * Math.PI / 180;
        const position = {lat: 47 + 0.6 / nmPerDegree, lon: 8 + 1.2 / (nmPerDegree * Math.cos(47 * Math.PI / 180))};

        expect(Math.abs(crossTrackNm(position, {lat: 47, lon: 8}, 51) - 0.28890)).toBeLessThan(0.0005);
    });
});
