import {describe, expect, it} from 'vitest';
import {MIN_SNR, satelliteSnr} from '../../kln90b/GpsSignal';

/** The SDK gives a satellite's direction as a zenith angle in radians */
const zenith = (elevationDeg: number): number => (90 - elevationDeg) * Math.PI / 180;

// #464: the SNR of a satellite follows the gain of an aircraft antenna over the elevation: steep near the horizon, nearly
// flat above 45 degrees. The values are 50 + 12 × log10(sin(elevation)), worked out by hand
describe('satelliteSnr (#464)', () => {
    it.each([
        [5, 37.28],
        [10, 40.88],
        [15, 42.96],
        [30, 46.39],
        [45, 48.19],
        [90, 50],
    ])('gives %s degrees of elevation an SNR of %s', (elevation, snr) => {
        expect(satelliteSnr(zenith(elevation))).toBeCloseTo(snr, 2);
    });

    // The Installation Manual (C-7) puts typical values in the forties: a satellite at 20 degrees is already in them
    it('is in the forties from 20 degrees up', () => {
        expect(satelliteSnr(zenith(20))).toBeCloseTo(44.4, 1);
    });

    // A satellite at 1 degree would be 28.9: the curve stops at the bottom of the marginal range
    it('does not go below 30 near the horizon', () => {
        expect(MIN_SNR).toBe(30);
        expect(satelliteSnr(zenith(1))).toBe(30);
        expect(satelliteSnr(zenith(0))).toBe(30);
        expect(satelliteSnr(zenith(-3))).toBe(30);
    });

    // #456: the SDK can give a satellite due north or south an angle that is not a number
    it('gives the lowest value for an angle that is not a number', () => {
        expect(satelliteSnr(NaN)).toBe(30);
    });
});
