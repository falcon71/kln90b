import {describe, expect, it} from 'vitest';
import {GeoCircle, GeoPoint} from '@microsoft/msfs-sdk';
import {rollSteeringCommand} from '../../../kln90b/services/RollSteeringLaw';
import {angleDiff, EARTH_RADIUS_NM} from '../../harness/flight/geo';

// The roll steering law of the roll steering design (docs/superpowers/specs/2026-10-19-roll-steering-design.md,
// section 4B). Every expectation below is worked out by hand from the formulas there, with these constants: the
// look-ahead of 30 s and the 45 degree intercept cap (both checked in the KLN 89 trainer, 2026-10-19), the bank gain
// 1.25 (autopilot/lnav/LNavRollSteerComputer.ts, getDesiredBankAngleForTrack) and the 25 degree MAX_BANK_ANGLE.
// L = GS x 30 s / 3600, intercept = min(45, atan(|XTK| / L)), course to steer = DTK - sign(XTK) x intercept,
// bank = 1.25 x |course to steer - track|, capped at 25, positive left.

const DEG = 180 / Math.PI;
/** The point `nm` east (positive) or west of (0, 0) on the equator: there the longitude is the distance */
const east = (nm: number) => new GeoPoint(0, nm / EARTH_RADIUS_NM * DEG);
/** The great circle due north through (0, 0): right of it is east, so XTK is the eastward offset */
const northbound = () => GeoCircle.createGreatCircle(new GeoPoint(0, 0), new GeoPoint(1, 0));

describe('rollSteeringCommand on a great circle (the roll steering design, section 4B)', () => {
    it('0.1 NM right at 120 kt on the DTK: steers 5.71 degrees left of it and banks 7.14 left', () => {
        // L = 120 x 30 / 3600 = 1 NM; atan(0.1 / 1) = 5.711; CTS = 360 - 5.711 = 354.289; e = -5.711, a left turn;
        // bank 1.25 x 5.711 = 7.138
        const c = rollSteeringCommand(northbound(), east(0.1), 120, 0, null);

        expect(c.courseToSteer).toBeCloseTo(354.29, 2);
        expect(c.bankAngle).toBeCloseTo(7.14, 2);
        expect(c.latch).toBeNull();
    });

    it('0.1 NM left at 120 kt: steers 5.71 degrees right of the DTK and banks 7.14 right', () => {
        // The mirror image: CTS = 0 + 5.711, e = +5.711, a right turn, bank -7.138
        const c = rollSteeringCommand(northbound(), east(-0.1), 120, 0, null);

        expect(c.courseToSteer).toBeCloseTo(5.71, 2);
        expect(c.bankAngle).toBeCloseTo(-7.14, 2);
    });

    it('0.1 NM right at 240 kt: the look-ahead doubles, so the bank is 3.58', () => {
        // L = 240 x 30 / 3600 = 2 NM; atan(0.1 / 2) = 2.862; CTS = 357.138; bank 1.25 x 2.862 = 3.578
        const c = rollSteeringCommand(northbound(), east(0.1), 240, 0, null);

        expect(c.courseToSteer).toBeCloseTo(357.14, 2);
        expect(c.bankAngle).toBeCloseTo(3.58, 2);
    });

    it('10 NM right at 120 kt: the intercept is capped at 45 degrees and the bank at 25', () => {
        // atan(10 / 1) = 84.3, capped at 45: CTS = 360 - 45 = 315 exactly; 1.25 x 45 = 56.25, capped at 25
        const c = rollSteeringCommand(northbound(), east(10), 120, 0, null);

        expect(c.courseToSteer).toBeCloseTo(315, 6);
        expect(c.bankAngle).toBeCloseTo(25, 6);
    });

    it('on the path with the track of the DTK: no bank and the DTK as the course to steer', () => {
        const c = rollSteeringCommand(northbound(), east(0), 120, 0, null);

        expect(Math.abs(angleDiff(c.courseToSteer, 0))).toBeLessThan(1e-6);
        expect(c.bankAngle).toBeCloseTo(0, 6);
        expect(c.latch).toBeNull();
    });
});

describe('rollSteeringCommand turn latch (the roll steering design, section 4B step 6)', () => {
    it('sets the latch beyond 150 degrees of track error: the shorter way to the course to steer', () => {
        // 0.3 NM right, track 180: atan(0.3) = 16.70, CTS = 343.30, e = 343.30 - 180 = +163.3 > 150, the shorter way
        // right (the course line lies west, so this is also the turn toward it): bank -25 (1.25 x 163.3 capped), latch right
        const c = rollSteeringCommand(northbound(), east(0.3), 120, 180, null);

        expect(c.courseToSteer).toBeCloseTo(343.30, 2);
        expect(c.bankAngle).toBeCloseTo(-25, 6);
        expect(c.latch).toBe('right');
    });

    it('holds a set latch against the shorter way of the track error', () => {
        // 0.3 NM left, track 190: CTS = 0 + 16.70 = 16.70, e = 16.70 - 190 = -173.3, whose shorter way is left, but
        // |e| > 150 and the latch says right: bank -25, latch kept
        const c = rollSteeringCommand(northbound(), east(-0.3), 120, 190, 'right');

        expect(c.bankAngle).toBeCloseTo(-25, 6);
        expect(c.latch).toBe('right');
    });

    it('without a latch the same case turns the shorter way, left', () => {
        // e = -173.3, the shorter way left: +25, latch left
        const c = rollSteeringCommand(northbound(), east(-0.3), 120, 190, null);

        expect(c.bankAngle).toBeCloseTo(25, 6);
        expect(c.latch).toBe('left');
    });

    // A Direct To about 155 degrees behind: one second after it the aircraft has drifted off the new leg's start, here
    // 0.02 NM to the right. CTS = 360 - atan(0.02) = 358.85, e = 358.85 - 155 = 203.85, wrapped -156.15: the shorter way
    // is left (about 156 degrees). A turn toward the side of the path (west, 270, 115 right of the track) would be the
    // long way, about 204 degrees (the roll steering design, section 4B (amended 2026-10-19))
    it('turns the shorter way after a Direct To about 155 degrees behind', () => {
        const c = rollSteeringCommand(northbound(), east(0.02), 120, 155, null);

        expect(c.bankAngle).toBeCloseTo(25, 6);
        expect(c.latch).toBe('left');
    });

    it('clears the latch once the track error is below 150 degrees', () => {
        // The first great circle case with a right latch left over: e = -5.711, so the bank is +7.138 and the latch null
        const c = rollSteeringCommand(northbound(), east(0.1), 120, 0, 'right');

        expect(c.bankAngle).toBeCloseTo(7.14, 2);
        expect(c.latch).toBeNull();
    });
});

describe('rollSteeringCommand on a curved path (the roll steering design, section 4B step 5)', () => {
    // A circle of 1 NM around (0, 0). The SDK's GeoCircle.createFromPoint runs counterclockwise, a left turn; reverse()
    // makes it clockwise. At the point 1 NM east of the center the counterclockwise circle runs due north.
    const leftCircle = () => GeoCircle.createFromPoint(new GeoPoint(0, 0), 1 / EARTH_RADIUS_NM);

    // The bank of a coordinated turn on the circle: atan(v^2 / (g R)) with v = 120 x 1852 / 3600 = 61.733 m/s,
    // g = 9.80665 m/s^2, R = 1852 m: atan(3811.0 / 18161.9) = atan(0.20984) = 11.85 degrees
    it('banks 11.85 left on a left circle of 1 NM at 120 kt, on it and on its tangent', () => {
        const c = rollSteeringCommand(leftCircle(), east(1), 120, 0, null);

        expect(Math.abs(c.bankAngle - 11.85)).toBeLessThan(0.05);
    });

    it('banks 11.85 right on the same circle reversed', () => {
        const c = rollSteeringCommand(leftCircle().reverse(), east(1), 120, 180, null);

        expect(Math.abs(c.bankAngle - -11.85)).toBeLessThan(0.05);
    });

    // Step 10, the clamp: on the left circle at 120 kt with the track 30 degrees right of the DTK (000), e = -30, so the
    // track bank is 1.25 x 30 = 37.5, capped at 25, and the turn bank 11.85 is added: 36.85, clamped to MAX_BANK_ANGLE.
    // Without the clamp the command would leave the +-30 range of L:KLN90B_RollCommand (LVars.ts, the wiki page Autopilot)
    it('clamps the track bank plus the turn bank at 25', () => {
        const c = rollSteeringCommand(leftCircle(), east(1), 120, 30, null);

        expect(c.bankAngle).toBe(25);
    });

    // The blend k = max(1 - |XTK| / R25, 0), with R25 the turn radius at 25 degrees and 120 kt: 3811.0 / (9.80665 x tan 25)
    // = 833 m = 0.450 NM. 1.2 NM east of the center the aircraft is 0.2 NM outside (XTK +0.2), so k = 1 - 0.2 / 0.450 =
    // 0.556 and the turn bank is 0.556 x 11.85 = 6.59. The track is the course to steer, 360 - atan(0.2 / 1) = 348.69, so the
    // track bank is 0 and the bank is the blended turn bank alone (with the circle's own radius, 1 NM, k would be 0.8: 9.48)
    it('blends in part of the turn bank 0.2 NM outside the circle', () => {
        const c = rollSteeringCommand(leftCircle(), east(1.2), 120, 348.6901, null);

        expect(c.courseToSteer).toBeCloseTo(348.69, 2);
        expect(Math.abs(c.bankAngle - 6.59)).toBeLessThan(0.05);
    });

    it('adds no turn bank 3 NM outside the circle', () => {
        // 4 NM east of the center: the closest point is 1 NM east, the DTK there 000, XTK +3 (outside is right of a
        // counterclockwise circle). atan(3 / 1) is capped at 45, so CTS = 315, and the track 315 gives e = 0. The turn
        // radius at 25 degrees and 120 kt is 3811.0 / (9.80665 x tan 25) = 833 m = 0.45 NM, so k = max(1 - 3 / 0.45, 0)
        // = 0 and the bank is the track bank alone, 0 (with the full turn bank it would be 11.85)
        const c = rollSteeringCommand(leftCircle(), east(4), 120, 315, null);

        expect(c.courseToSteer).toBeCloseTo(315, 2);
        expect(c.bankAngle).toBeCloseTo(0, 6);
    });
});

// #433: on the center of a DME arc no point of the circle is abeam. The track counts as the DTK, and the intercept,
// capped at 45 for an XTK of the whole radius, turns toward the circle: the center is left of a counterclockwise circle,
// so the course to steer is 45 right of the track
describe('rollSteeringCommand on the center of a curved path (#433)', () => {
    it('steers 45 right of the track on the center of a left circle of 10 NM', () => {
        const circle = GeoCircle.createFromPoint(new GeoPoint(0, 0), 10 / EARTH_RADIUS_NM);

        const c = rollSteeringCommand(circle, new GeoPoint(0, 0), 120, 90, null);

        expect(c.courseToSteer).toBeCloseTo(135, 2);
    });
});

// The roll steering design, section 4B (amended 2026-10-19): on the circle of an anticipated turn (turnCircle) the command
// never banks against the turn; that side is held at 0. Inside the circle near its start the law alone steers out to it
describe('rollSteeringCommand on the circle of an anticipated turn (the roll steering design, section 4B, amended)', () => {
    const leftCircle = () => GeoCircle.createFromPoint(new GeoPoint(0, 0), 1 / EARTH_RADIUS_NM);

    // 0.6 NM east of the center, 0.4 NM inside the left circle (XTK -0.4), track 000 (the DTK abeam): CTS = atan(0.4) =
    // 21.8, e = +21.8, a right track bank of 1.25 x 21.8 = 27.3, capped at 25; k = 1 - 0.4 / 0.450 = 0.111, so the turn
    // bank adds 0.111 x 11.85 = 1.32 to the left: -23.68, a right bank against the left turn
    it('banks against the turn inside the circle when the path is no turn circle', () => {
        const c = rollSteeringCommand(leftCircle(), east(0.6), 120, 0, null);

        expect(Math.abs(c.bankAngle - -23.68)).toBeLessThan(0.05);
    });

    it('holds the bank against a left turn at 0 on a turn circle', () => {
        const c = rollSteeringCommand(leftCircle(), east(0.6), 120, 0, null, true);

        expect(c.bankAngle).toBe(0);
    });

    // The mirror image: the clockwise circle runs due south 1 NM east of the center, so 0.6 NM east is 0.4 NM inside, to
    // the right (XTK +0.4): CTS = 180 - 21.8, e = -21.8, +25 - 1.32 = +23.68, a left bank against the right turn
    it('holds the bank against a right turn at 0 on a turn circle', () => {
        const c = rollSteeringCommand(leftCircle().reverse(), east(0.6), 120, 180, null, true);

        expect(c.bankAngle).toBe(0);
    });

    // A small bank against the turn is held at 0 as well, not only a large one. On the left circle 1 NM east of the center
    // (XTK 0, so the course to steer is the DTK 000) with the track 349.7196, e = +10.2804, a right track bank of
    // 1.25 x 10.2804 = 12.8505; the full turn bank 11.8505 (k = 1) to the left leaves -1.000, a right bank of 1 degree
    it('banks 1 degree against the turn there when the path is no turn circle', () => {
        const c = rollSteeringCommand(leftCircle(), east(1), 120, 349.7196, null);

        expect(Math.abs(c.bankAngle - -1.0)).toBeLessThan(0.01);
    });

    it('holds a bank of 1 degree against the turn at 0 on a turn circle', () => {
        const c = rollSteeringCommand(leftCircle(), east(1), 120, 349.7196, null, true);

        expect(c.bankAngle).toBe(0);
    });

    // The bank into the turn is kept: on the circle and its tangent the turn bank of 11.85
    it('keeps the bank into the turn on a turn circle', () => {
        const c = rollSteeringCommand(leftCircle(), east(1), 120, 0, null, true);

        expect(Math.abs(c.bankAngle - 11.85)).toBeLessThan(0.05);
    });
});
