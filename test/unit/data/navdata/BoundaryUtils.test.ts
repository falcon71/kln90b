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
