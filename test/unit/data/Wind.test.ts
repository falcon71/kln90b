import {describe, expect, it} from 'vitest';
import {
    calculateGroundspeed,
    calculateHeadwind,
    calculateWindDirection,
    calculateWindspeed,
} from '../../../kln90b/data/Wind';

// Expected values from the wind triangle laid out as vectors (east, north) by hand: the air vector along the true
// heading plus the wind vector, which blows toward the direction opposite to the one it comes from. Directions are true.

describe('wind triangle', () => {
    it('gives the ground speed for a heading (avform "Wind triangle")', () => {
        // heading 090 at 100 kt, wind from 360 at 20 kt: ground vector (100 E, 20 S), 101.98 kt
        expect(calculateGroundspeed(100, 90, 20, 0)).toBeCloseTo(101.980, 2);
        // heading 090 at 100 kt, wind from 045 at 30 kt: 81.59 kt
        expect(calculateGroundspeed(100, 90, 30, 45)).toBeCloseTo(81.593, 2);
    });

    it('gives 175 kt for 200 kt TAS into a 25 kt headwind (5-2)', () => {
        // 5-2: TAS 200 kt, wind 180 at 25 kt, flying 180: about 175 kt
        expect(calculateGroundspeed(200, 180, 25, 180)).toBeCloseTo(175, 6);
    });

    it('solves the wind from TAS, heading, ground speed and track (5-12)', () => {
        // The ground vector of heading 090 at 100 kt in a wind from 045 at 30 kt: 81.593 kt on track 105.069
        expect(calculateWindspeed(100, 81.5926, 90, 105.0694)).toBeCloseTo(30, 2);
        expect(calculateWindDirection(100, 81.5926, 90, 105.0694)).toBeCloseTo(45, 1);
        // wind from 360 at 20 kt: the direction comes back in 0..360, not as a negative angle
        expect(calculateWindspeed(100, 101.9804, 90, 101.3099)).toBeCloseTo(20, 2);
        const dir = calculateWindDirection(100, 101.9804, 90, 101.3099);
        expect(Math.min(dir, 360 - dir)).toBeLessThan(0.05);
        expect(dir).toBeGreaterThanOrEqual(0);
    });

    it('gives the headwind component along the heading, negative for a tailwind (5-12 HDWND/TLWND)', () => {
        expect(calculateHeadwind(30, 45, 90)).toBeCloseTo(21.213, 2);
        expect(calculateHeadwind(25, 180, 180)).toBeCloseTo(25, 6);
        expect(calculateHeadwind(20, 270, 90)).toBeCloseTo(-20, 6);
        expect(calculateHeadwind(20, 0, 90)).toBeCloseTo(0, 6);
    });
});
