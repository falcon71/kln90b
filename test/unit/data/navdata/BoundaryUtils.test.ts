import {describe, expect, it, vi} from 'vitest';
import {BoundaryType, GeoCircle, LodBoundary} from '@microsoft/msfs-sdk';
import {airspace, arcSectorAirspace, circularAirspace, multiShapeAirspace} from '../../../harness/navdata/airspaces';
import {BoundaryUtils} from '../../../../kln90b/data/navdata/BoundaryUtils';
import {distanceNm, LatLon, pointFrom} from '../../../harness/flight/geo';

// An airspace from 179E across the date line to 179W, 10N to 20N. The code detects a crossing from the bounding box
// (bottomRight.long - topLeft.long > 180), which is its own assumption about the sim's boundary data and has not been
// checked against real sim records, so these are characterization tests of the date-line handling. airspace() builds
// that box (min to max longitude of the corners) and the SDK's LodBoundary turns the facility into the shape.
const dateLineBox = new LodBoundary(airspace('DATELINE', BoundaryType.Restricted, [[10, 179], [10, -179], [20, -179], [20, 179]]));

describe('BoundaryUtils across the date line (characterization, #9 103ea59)', () => {
    describe('isInside', () => {
        it.each([
            ['east of the date line, inside', 15, 179.5, true],
            ['west of the date line, inside', 15, -179.5, true],
            ['on the opposite side of the world', 15, 0, false],
            ['east of the box', 15, 178, false],
            ['west of the box', 15, -178, false],
        ])('%s', (_name, lat, lon, expected) => {
            expect(BoundaryUtils.isInside(dateLineBox, lat, lon)).toBe(expected);
        });
    });

    describe('intersects', () => {
        it('finds a path across the date line through the box', () => {
            expect(BoundaryUtils.intersects(dateLineBox, 15, 178, 15, -178)).toBe(true);
        });

        // Only the western edge (179W) can be met by these paths: the eastern edge (179E) is out of their reach
        it('finds a path that only meets the edge west of the date line', () => {
            expect(BoundaryUtils.intersects(dateLineBox, 15, -179.5, 15, -178)).toBe(true);
        });

        it('finds no intersection for a path west of the date line that stays outside the box', () => {
            expect(BoundaryUtils.intersects(dateLineBox, 15, -178, 15, -176)).toBe(false);
        });

        it('finds no intersection for a path that stays west of the box', () => {
            expect(BoundaryUtils.intersects(dateLineBox, 15, 170, 15, 175)).toBe(false);
        });
    });
});

// #106: the path and the ring are read in one continuous longitude range around the box, so neither the date line nor the
// prime meridian splits them. This is geometry in the lat/lon plane, there is no manual page for it.
describe('the longitude range of the path and the box (#106)', () => {
    // A box from 5W to 5E, 10N to 20N: it does not cross the date line, its reference longitude is its middle, 0
    const primeBox = new LodBoundary(airspace('PRIME', BoundaryType.Restricted, [[10, -5], [10, 5], [20, 5], [20, -5]]));

    it('finds no intersection for a short path around 0 degrees longitude (#106)', () => {
        expect(BoundaryUtils.intersects(dateLineBox, 15, -10, 15, 10)).toBe(false);
    });

    it('returns both crossing points of a path across the date line (#106)', () => {
        const points = BoundaryUtils.getIntersections(dateLineBox, 15, 178, 15, -178);
        expect(points.map(p => p.lat)).toEqual([15, 15]);
        expect(points.map(p => ((p.lon + 540) % 360) - 180).sort((a, b) => a - b)).toEqual([-179, 179]);
    });

    it('returns both crossing points of a path from 10W to 10E through a box around 0 degrees (#106)', () => {
        const points = BoundaryUtils.getIntersections(primeBox, 15, -10, 15, 10);
        expect(points.map(p => p.lat)).toEqual([15, 15]);
        expect(points.map(p => p.lon).sort((a, b) => a - b)).toEqual([-5, 5]);
        expect(BoundaryUtils.intersects(primeBox, 15, -10, 15, 10)).toBe(true);
    });

    // The path from 170E to 170W is the short one across the date line, 20 degrees long; read as 170 to -170 it would
    // span the whole world through the box
    it('finds no intersection for a path across the date line with a box around 0 degrees (#106)', () => {
        expect(BoundaryUtils.intersects(primeBox, 15, 170, 15, -170)).toBe(false);
    });
});

// The geometry tests below: the expectations are hand-computed in the lat/lon plane, the plane BoundaryUtils works in (a
// ray cast for isInside, line-segment intersection for the paths). The cases keep 0.1 degree from every edge, and the
// crossing points sit on meridian edges, where the plane and the sphere agree. There is no manual page for this helper,
// so the tests are characterizations with independent expectations.
const shape = (name: string, corners: [number, number][]) => new LodBoundary(airspace(name, BoundaryType.Restricted, corners));

// A U open to the north: the outer box 47 to 48 N, 8 to 9 E, with the notch 47.5 to 48 N, 8.3 to 8.7 E cut out
const U = shape('U', [[48, 8], [48, 8.3], [47.5, 8.3], [47.5, 8.7], [48, 8.7], [48, 9], [47, 9], [47, 8]]);

// A diamond whose east and west corners lie on 47.5 N, the latitude of the test points: the ray of the cast runs through
// a corner, the classic trap of the algorithm
const DIAMOND = shape('DIAMOND', [[48, 8.5], [47.5, 9], [47, 8.5], [47.5, 8]]);

// A triangle with one sloping edge, from 47 N 8 E to 48 N 9 E; points just either side of it
const TRIANGLE = shape('TRIANGLE', [[47, 8], [48, 9], [47, 9]]);

describe('BoundaryUtils.isInside on hand-computed polygons (characterization)', () => {
    it.each([
        ['the west arm of the U', 47.8, 8.15, true],
        ['the east arm of the U', 47.8, 8.85, true],
        ['the base of the U', 47.2, 8.5, true],
        ['the notch of the U, whose eastward ray crosses two edges', 47.8, 8.5, false],
        ['north of the U', 48.2, 8.5, false],
        ['west of the U, whose eastward ray crosses four edges', 47.8, 7.8, false],
    ])('%s', (_name, lat, lon, expected) => {
        expect(BoundaryUtils.isInside(U, lat, lon)).toBe(expected);
    });

    it.each([
        ['the middle of the diamond, the ray through its east corner', 47.5, 8.5, true],
        ['west of the diamond, the ray through both corners', 47.5, 7.8, false],
        ['east of the diamond, on the latitude of its corners', 47.5, 9.2, false],
    ])('%s', (_name, lat, lon, expected) => {
        expect(BoundaryUtils.isInside(DIAMOND, lat, lon)).toBe(expected);
    });

    // On 47.5 N the sloping edge is at 8.5 E
    it.each([
        ['east of the sloping edge', 47.5, 8.6, true],
        ['west of the sloping edge', 47.5, 8.4, false],
    ])('%s of the triangle', (_name, lat, lon, expected) => {
        expect(BoundaryUtils.isInside(TRIANGLE, lat, lon)).toBe(expected);
    });
});

describe('BoundaryUtils.intersects on hand-computed paths (characterization)', () => {
    it.each([
        ['a path from outside into the base of the U', 46.8, 8.5, 47.2, 8.5, true],
        ['a path from outside into the base of the U near its west end', 46.8, 8.2, 47.2, 8.2, true],
        ['a path across the U from west to east', 47.8, 7.8, 47.8, 9.2, true],
        ['a path north of the U', 48.2, 7.8, 48.2, 9.2, false],
        ['a path that ends short of the U', 46.5, 8.5, 46.9, 8.5, false],
        ['a path inside the notch that meets no edge', 47.8, 8.4, 47.9, 8.6, false],
    ])('%s', (_name, lat1, lon1, lat2, lon2, expected) => {
        expect(BoundaryUtils.intersects(U, lat1, lon1, lat2, lon2)).toBe(expected);
    });

    // The first edge of the TRIANGLE is the sloping one, the last edge the south one (47 N)
    it.each([
        ['a path across only the first edge of the ring', 47.5, 8.2, 47.5, 8.8, true],
        ['a path across only the last edge of the ring', 46.5, 8.95, 47.2, 8.95, true],
        ['a path that ends short of the last edge', 46.5, 8.95, 46.9, 8.95, false],
    ])('%s (#208)', (_name, lat1, lon1, lat2, lon2, expected) => {
        expect(BoundaryUtils.intersects(TRIANGLE, lat1, lon1, lat2, lon2)).toBe(expected);
    });
});

describe('BoundaryUtils.getIntersections on hand-computed paths (characterization)', () => {
    // The meridian 8.5 E enters the triangle through its sloping edge at 47.5 N and leaves through the south edge at 47 N.
    // Both points are on the meridian, so the longitude is exact, and the plane puts the crossing with the south edge at
    // 47 N. The rounding to 0.001 degree only absorbs float noise.
    const crossings = (lat1: number, lon1: number, lat2: number, lon2: number) => BoundaryUtils.getIntersections(TRIANGLE, lat1, lon1, lat2, lon2)
        .map(p => `${Math.round(p.lat * 1000) / 1000} ${Math.round(p.lon * 1000) / 1000}`).sort();

    it('returns the two crossing points of a path through the triangle', () => {
        expect(crossings(48, 8.5, 46.5, 8.5)).toEqual(['47 8.5', '47.5 8.5']);
    });

    it('returns the crossing point of a path that ends inside the triangle', () => {
        expect(crossings(47.5, 8.2, 47.5, 8.8)).toEqual(['47.5 8.5']);
    });

    // Along 47.5 N out through the east edge (9 E): the crossing is at 9 E, the longitude of the edge, not of the path
    it('returns the crossing point of a path that leaves the triangle along a parallel', () => {
        expect(crossings(47.5, 8.7, 47.5, 9.5)).toEqual(['47.5 9']);
    });

    // The sloping edge is the first edge of the closed ring and the south edge its last: each gives its crossing point
    // exactly once, and a path across only one of them still finds it.
    it('returns each crossing point once, also for the first edge of the ring (#208)', () => {
        expect(BoundaryUtils.getIntersections(TRIANGLE, 48, 8.5, 46.5, 8.5)).toHaveLength(2);
        expect(crossings(47.5, 8.2, 47.5, 8.8)).toEqual(['47.5 8.5']);
    });

    it('returns the crossing point of a path that crosses only the last edge of the ring (#208)', () => {
        expect(crossings(46.5, 8.95, 47.2, 8.95)).toEqual(['47 8.95']);
    });

    it('returns no point for a path beside the triangle', () => {
        expect(BoundaryUtils.getIntersections(TRIANGLE, 48, 9.5, 46.5, 9.5)).toEqual([]);
    });
});

// #209: circles and arcs are read as curves. The expectations are geometry on the sphere: the points come from the
// textbook destination formula in flight/geo.ts and the distances from its haversine, independent of the SDK's GeoCircle
// that the code cuts the curves with. There is no manual page for this helper.
describe('circles and arcs (#209)', () => {
    const C: LatLon = {lat: 47, lon: 8};
    const at = (p: LatLon): [number, number] => [p.lat, p.lon];
    const path = (a: LatLon, b: LatLon): [number, number, number, number] => [a.lat, a.lon, b.lat, b.lon];

    // A circle of 10 NM around 47 N 8 E, and the quarter of it from bearing 0 clockwise to bearing 90
    const circle = new LodBoundary(circularAirspace('CIRC', BoundaryType.Restricted, [47, 8], 10));
    const sector = new LodBoundary(arcSectorAirspace('SECTOR', BoundaryType.Restricted, [47, 8], 10, 0, 90));

    /** The bearings from first to last (whole degrees) on which 9.94 NM is not inside or 10.01 NM is not outside */
    const wrongAround = (boundary: LodBoundary, name: string, first: number, last: number): string[] => {
        const wrong: string[] = [];
        for (let bearing = first; bearing <= last; bearing++) {
            if (!BoundaryUtils.isInside(boundary, ...at(pointFrom(C, bearing, 9.94)))) wrong.push(`${name} ${bearing} 9.94`);
            if (BoundaryUtils.isInside(boundary, ...at(pointFrom(C, bearing, 10.01)))) wrong.push(`${name} ${bearing} 10.01`);
        }
        return wrong;
    };

    it('finds the center and a point just inside a circle inside, and a point just outside it outside (#209)', () => {
        expect(BoundaryUtils.isInside(circle, 47, 8)).toBe(true);
        expect(BoundaryUtils.isInside(circle, ...at(pointFrom(C, 45, 9.8)))).toBe(true);
        expect(BoundaryUtils.isInside(circle, ...at(pointFrom(C, 45, 10.2)))).toBe(false);
    });

    // The chord of the 90 degree arc passes 7.07 NM from the center, so a chord would put 9.8 NM on bearing 45 outside
    it('reads an arc as a curve, not as its chord (#209)', () => {
        expect(BoundaryUtils.isInside(sector, ...at(pointFrom(C, 45, 9.8)))).toBe(true);
        expect(BoundaryUtils.isInside(sector, ...at(pointFrom(C, 45, 10.2)))).toBe(false);
        expect(BoundaryUtils.isInside(sector, ...at(pointFrom(C, 135, 5)))).toBe(false);
    });

    // The chords may cut 0.05 NM into the curve (ARC_CHORD_TOLERANCE_NM), wherever their corners fall: on every degree of
    // bearing, a point 0.06 NM inside the curve is inside and a point 0.01 NM outside it is outside
    it('cuts a circle and an arc within 0.06 NM inside the curve (#209)', () => {
        expect([...wrongAround(circle, 'circle', 0, 359), ...wrongAround(sector, 'sector', 1, 89)]).toEqual([]);
    });

    // The same quarter as an ArcCCW, from bearing 90 counterclockwise to bearing 0, the other half of the arcs in real
    // data. Run the wrong way, from 90 clockwise to 0, the arc would make the sector the other three quarters of the circle.
    it('reads a counterclockwise arc as the curve between its ends (#209)', () => {
        const ccw = new LodBoundary(arcSectorAirspace('CCW', BoundaryType.Restricted, [47, 8], 10, 90, 0, {counterClockwise: true}));

        expect(BoundaryUtils.isInside(ccw, ...at(pointFrom(C, 45, 9.8)))).toBe(true);
        expect(BoundaryUtils.isInside(ccw, ...at(pointFrom(C, 45, 10.2)))).toBe(false);
        expect(BoundaryUtils.isInside(ccw, ...at(pointFrom(C, 225, 5)))).toBe(false);
        expect(wrongAround(ccw, 'ccw', 1, 89)).toEqual([]);
        expect(BoundaryUtils.intersects(ccw, ...path(pointFrom(C, 45, 9), pointFrom(C, 45, 11)))).toBe(true);
    });

    // A path from 9 to 11 NM on bearing 45 crosses the arc, not the chord
    it('finds a path across an arc (#209)', () => {
        expect(BoundaryUtils.intersects(sector, ...path(pointFrom(C, 45, 9), pointFrom(C, 45, 11)))).toBe(true);
    });

    // A path through the circle's center, 20 NM west to 20 NM east: two crossings, each 10 NM from the center. The same
    // on bearings 100 and 280, away from where the corners of the chords are likely to fall.
    it.each([
        [270, 90],
        [280, 100],
    ])('returns both crossing points of a path through a circle from bearing %i to %i on the circle (#209)', (from, to) => {
        const xs = BoundaryUtils.getIntersections(circle, ...path(pointFrom(C, from, 20), pointFrom(C, to, 20)));

        expect(xs).toHaveLength(2);
        for (const x of xs) {
            expect(Math.abs(distanceNm(C, x) - 10)).toBeLessThan(0.06);
        }
    });

    // The SDK takes the arc's radius from its end point; here the arc's start lies 0.5 NM outside that circle. The arc
    // still runs on the circle from its very start, so the chord tolerance holds up to the first degree of bearing.
    it('reads an arc whose start lies off its circle (#209)', () => {
        const offCircle = new LodBoundary(arcSectorAirspace('OFF', BoundaryType.Restricted, [47, 8], 10, 0, 90, {startOffsetNm: 0.5}));

        expect(BoundaryUtils.isInside(offCircle, ...at(pointFrom(C, 45, 9.8)))).toBe(true);
        expect(wrongAround(offCircle, 'off', 1, 89)).toEqual([]);
    });

    // The polyline is built on first use and then kept: a second check cuts no arc again. The first cut of the 10 NM
    // quarter arc needs few points: a chord sags r(1 - cos(a/2)) below the curve, so 0.05 NM on 10 NM allows chords of
    // up to 11.5 degrees, 8 chords for 90 degrees, 7 points between the ends.
    it('cuts the arcs of a boundary once (#209)', () => {
        const fresh = new LodBoundary(arcSectorAirspace('ONCE', BoundaryType.Restricted, [47, 8], 10, 0, 90));
        const spy = vi.spyOn(GeoCircle.prototype, 'offsetAngleAlong');
        try {
            BoundaryUtils.isInside(fresh, 47.1, 8.1);
            const first = spy.mock.calls.length;
            spy.mockClear();
            BoundaryUtils.isInside(fresh, 47.1, 8.1);

            expect(first).toBeGreaterThanOrEqual(7);
            expect(first).toBeLessThan(12);
            expect(spy).not.toHaveBeenCalled();
        } finally {
            spy.mockRestore();
        }
    });

    // The square 46.9 to 47.1 N, 7.9 to 8.1 E without its last vector, the west edge back to the start: the ring is
    // closed anyway. West of the square, the eastward ray crosses the west and the east edge, so the point is outside;
    // a path from there to the middle crosses the west edge.
    it('closes a shape whose last vector does not return to its start (#209)', () => {
        const closed = airspace('OPEN', BoundaryType.Restricted, [[47.1, 7.9], [47.1, 8.1], [46.9, 8.1], [46.9, 7.9]]);
        const open = new LodBoundary({...closed, vectors: closed.vectors.slice(0, -1)});

        expect(open.lods[0][0]).toHaveLength(4); // Precondition: the start and three lines
        expect(BoundaryUtils.isInside(open, 47, 7.8)).toBe(false);
        expect(BoundaryUtils.isInside(open, 47, 8)).toBe(true);
        expect(BoundaryUtils.intersects(open, 47, 7.8, 47, 8)).toBe(true);
    });

    // A square of 0.1 degree around 47 N 8 E, then a circle of 5 NM around 47 N 9 E: two shapes in one boundary
    it('reads every shape of a boundary (#209)', () => {
        const two = new LodBoundary(multiShapeAirspace('TWO', BoundaryType.Restricted, [[47.1, 7.9], [47.1, 8.1], [46.9, 8.1], [46.9, 7.9]], [47, 9], 5));

        expect(BoundaryUtils.isInside(two, 47, 9)).toBe(true);
        expect(BoundaryUtils.isInside(two, 47, 8)).toBe(true);
        // A path across the circle, the second shape: two crossings, each 5 NM from its center
        const xs = BoundaryUtils.getIntersections(two, 47, 8.8, 47, 9.2);
        expect(xs).toHaveLength(2);
        for (const x of xs) {
            expect(Math.abs(distanceNm({lat: 47, lon: 9}, x) - 5)).toBeLessThan(0.06);
        }
        expect(BoundaryUtils.intersects(two, 47, 8.8, 47, 9.2)).toBe(true);
    });
});
