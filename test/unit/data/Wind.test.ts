import {describe, expect, it} from 'vitest';
import {
    calculateGroundspeedAlongCourse,
    calculateHeadwind,
    calculateWindDirection,
    calculateWindspeed,
} from '../../../kln90b/data/Wind';

// Source of the expected values (named again at each test): the wind triangle as a vector sum, computed by hand with
// vectors (east, north): the air vector along the true heading plus the wind vector, which blows toward the direction
// opposite to the one it comes from. Directions are true. The avform page the code cites is the code's own source and
// so is not the evidence.

describe('wind triangle', () => {
    // The ground speed along a course (#167): the aircraft crabs into the wind to hold the course, so the heading
    // cancels the crosswind and the ground speed is what is left along the course. Math, not a page: the Pilot's
    // Guide (5-3) says only that the TAS and wind are applied to the direction of flight.
    describe('ground speed along a course (#167)', () => {
        // Source: the wind triangle by hand. Course 180, wind from 090 at 30 kt (a pure crosswind), TAS 150: the crab
        // angle is asin(30 / 150) = 11.54 deg and the speed along the course is sqrt(150^2 - 30^2) = 146.97 kt
        it('gives the TAS less the crab loss for a direct crosswind: 146.97 kt (#167)', () => {
            expect(calculateGroundspeedAlongCourse(150, 180, 30, 90)).toBeCloseTo(146.969, 3);
        });

        // 5-2: TAS 200 kt, wind 180 at 25 kt, flying 180: about 175 kt. Source of the exact value: by hand, 200 - 25
        it('gives 175 kt for 200 kt TAS into a 25 kt headwind (5-2)', () => {
            expect(calculateGroundspeedAlongCourse(200, 180, 25, 180)).toBeCloseTo(175, 6);
        });

        // By hand: a 30 kt tailwind at TAS 0 is a ground speed of 30 kt. sin(180 deg) is not exactly 0 in floating
        // point, which makes the radicand a tiny negative number: the clamp keeps it a tailwind instead of a null
        it('gives the wind speed for a tailwind at TAS 0 (#167)', () => {
            expect(calculateGroundspeedAlongCourse(0, 180, 30, 0)).toBeCloseTo(30, 6);
        });

        // By hand: course 180, wind from 045 at 50 kt, TAS 20: the crosswind is 50 * sin(135 deg) = 35.4 kt, above
        // the TAS, so no heading holds the course. Without the check the tailwind part alone would give 20 + 35 kt
        it('gives null where the crosswind is stronger than the TAS (#167)', () => {
            expect(calculateGroundspeedAlongCourse(20, 180, 50, 45)).toBeNull();
        });

        // By hand: TAS 100 into a 150 kt headwind: 100 - 150 = -50 kt, the aircraft is blown backwards
        it('gives null where a headwind stronger than the TAS leaves no forward speed (#167)', () => {
            expect(calculateGroundspeedAlongCourse(100, 180, 150, 180)).toBeNull();
        });

        // By hand: TAS 100 into a 100 kt headwind: the ground speed is 0, which is no forward speed either
        it('gives null where a headwind equal to the TAS leaves a ground speed of zero (#167)', () => {
            expect(calculateGroundspeedAlongCourse(100, 180, 100, 180)).toBeNull();
        });
    });

    it('solves the wind from TAS, heading, ground speed and track (5-12)', () => {
        // Source: the wind triangle as a vector sum, computed by hand (5-12: the unit solves the wind from these four).
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
        // Source: the component of the wind vector along the heading, computed by hand (5-12)
        expect(calculateHeadwind(30, 45, 90)).toBeCloseTo(21.213, 2);
        expect(calculateHeadwind(25, 180, 180)).toBeCloseTo(25, 6);
        expect(calculateHeadwind(20, 270, 90)).toBeCloseTo(-20, 6);
        expect(calculateHeadwind(20, 0, 90)).toBeCloseTo(0, 6);
    });
});
