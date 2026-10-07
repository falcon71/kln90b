import {describe, expect, it} from 'vitest';
import {BoundaryType, LodBoundary} from '@microsoft/msfs-sdk';
import {airspace} from '../../../harness/navdata/airspaces';
import {BoundaryUtils} from '../../../../kln90b/data/navdata/BoundaryUtils';

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

    // Both bugs come from the same shift: a path from 10W to 10E has its western end shifted to 350E, so it appears to
    // span the whole box, and getIntersections does no shifting at all.
    describe('known bugs', () => {
        it.fails('finds no intersection for a short path around 0 degrees longitude (#106)', () => {
            expect(BoundaryUtils.intersects(dateLineBox, 15, -10, 15, 10)).toBe(false);
        });

        it.fails('returns both crossing points of a path across the date line (#106)', () => {
            const points = BoundaryUtils.getIntersections(dateLineBox, 15, 178, 15, -178);
            expect(points.map(p => p.lat)).toEqual([15, 15]);
            expect(points.map(p => ((p.lon + 540) % 360) - 180).sort((a, b) => a - b)).toEqual([-179, 179]);
        });
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
});

describe('BoundaryUtils.getIntersections on hand-computed paths (characterization)', () => {
    // The meridian 8.5 E enters the triangle through its sloping edge at 47.5 N and leaves through the south edge at 47 N.
    // Both points are on the meridian, so the longitude is exact, and the plane puts the crossing with the south edge at
    // 47 N. The rounding to 0.001 degree only absorbs float noise. The points are compared as a set: the pin below holds
    // that each comes once.
    const crossings = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const points = BoundaryUtils.getIntersections(TRIANGLE, lat1, lon1, lat2, lon2).map(p => [Math.round(p.lat * 1000) / 1000, Math.round(p.lon * 1000) / 1000]);
        return [...new Set(points.map(p => p.join(' ')))].sort();
    };

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

    // The loop visits the first edge of the closed ring twice (BoundaryUtils.ts:121-122, next = (current + 1) % (length - 1)),
    // so a path across the first edge, here the sloping one, gets that point twice. CTR 1 drops the copy (cleanup in
    // AirspacesAlongRoute skips crossings within 1 NM), so nothing shows on the screen today.
    it.fails('returns each crossing point once (#NEW-3-1)', () => {
        expect(BoundaryUtils.getIntersections(TRIANGLE, 48, 8.5, 46.5, 8.5)).toHaveLength(2);
    });

    it('returns no point for a path beside the triangle', () => {
        expect(BoundaryUtils.getIntersections(TRIANGLE, 48, 9.5, 46.5, 9.5)).toEqual([]);
    });
});
