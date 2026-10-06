import {describe, expect, it} from 'vitest';
import {
    cas2Mach,
    indicatedAlt2PressureAlt,
    mach2Tas,
    pressureAlt2DensityAlt,
    pressureAlt2IndicatedAlt,
} from '../../../kln90b/data/Conversions';

// Source of the expected values (named again at each test): the ICAO standard atmosphere (troposphere), computed by
// hand with T0 = 288.15 K, lapse 0.0065 K/m, g = 9.80665 m/s2, M = 0.0289644 kg/mol, R = 8.31446 J/(mol K),
// P0 = 29.9213 inHg, a0 = 661.4788 kt, and the compressible pitot relation for subsonic flow. They do not use the code's
// rounded avform constants, which are the code's own source and so cannot be the evidence.

describe('pressure altitude (ISA)', () => {
    it('is the indicated altitude at the standard setting of 29.92"', () => {
        // Source: ICAO standard atmosphere, computed by hand (29.92" is 1.2 ft below the 29.9213" sea level pressure)
        expect(indicatedAlt2PressureAlt(9000, 29.92)).toBeCloseTo(9001.2, 0);
    });

    it('is lower than indicated above the standard setting: 8500 ft at 30.04" is 8390 ft (5-10)', () => {
        // Source: ICAO standard atmosphere, computed by hand: the 30.04" level lies 109.6 ft below the 29.92" level.
        // 5-10, figure 5-31, shows PRS 8400ft.
        expect(indicatedAlt2PressureAlt(8500, 30.04)).toBeCloseTo(8390.4, 0);
    });

    it('is higher than indicated below the standard setting: 5000 ft at 29.42" is 5467 ft', () => {
        // Source: ICAO standard atmosphere, computed by hand (the unit's pressure altitude, 5-10)
        expect(indicatedAlt2PressureAlt(5000, 29.42)).toBeCloseTo(5466.8, 0);
    });

    it('converts back to the indicated altitude', () => {
        // Source: ICAO standard atmosphere, the inverse of the two results above (5-10: the pilot enters the indicated altitude)
        expect(pressureAlt2IndicatedAlt(5466.8, 29.42)).toBeCloseTo(5000, 0);
        expect(pressureAlt2IndicatedAlt(8390.4, 30.04)).toBeCloseTo(8500, 0);
    });
});

describe('density altitude', () => {
    it('matches the CAL 1 figures to the 100 ft the page shows (5-10)', () => {
        // 5-10, figures 5-29 to 5-33: PRS and TEMP in, DEN out (the page rounds to 100 ft)
        const den = (prs: number, sat: number) => Math.round(pressureAlt2DensityAlt(prs, sat) / 100) * 100;
        expect(den(9000, 5)).toBe(9900);
        expect(den(8500, 5)).toBe(9300);
        expect(den(8390.4, 5)).toBe(9200);
        expect(den(8390.4, 6)).toBe(9300);
    });

    it('is within 15 ft of the exact ISA density altitude in the CAL 1 figure conditions', () => {
        // Source: ICAO standard atmosphere, computed by hand from the density at the pressure altitude and the
        // temperature: 9164 ft and 9912 ft. The conditions are those of the CAL 1 figures (5-10).
        expect(Math.abs(pressureAlt2DensityAlt(8390.4, 5) - 9164)).toBeLessThan(15);
        expect(Math.abs(pressureAlt2DensityAlt(9000, 5) - 9912)).toBeLessThan(25);
    });

    it('adds 118.6 ft per degree above ISA (characterization of the avform approximation)', () => {
        // ISA at 5000 ft is 5.094 C, so 25 C is 19.906 C above it: 5000 + 118.6 * 19.906 = 7360.9.
        // (The exact ISA value is 7262 ft; the approximation drifts on hot days.)
        expect(pressureAlt2DensityAlt(5000, 25)).toBeCloseTo(7360.9, 0);
        expect(pressureAlt2DensityAlt(0, 15)).toBeCloseTo(0, 6);
    });
});

describe('true airspeed (compressible, total air temperature)', () => {
    it('matches the CAL 2 figures (5-11)', () => {
        // 5-11, figures 5-34 to 5-36: ALT 8500, BARO 30.04 (PRS 8390 ft), CAS and TEMP (total air temperature) in
        const tas = (cas: number, tat: number) => mach2Tas(cas2Mach(cas, 8390.4), tat);
        expect(Math.round(tas(139, 2))).toBe(158);
        expect(Math.round(tas(144, 2))).toBe(163);
        expect(Math.round(tas(144, 6))).toBe(164);
    });

    it('agrees with the exact ISA computation to 0.2 kt', () => {
        // Source: ICAO standard atmosphere and the compressible pitot relation, computed by hand (5-11: CAS to TAS):
        // Mach 0.2452 / 157.52 kt; Mach 0.668 / 388.97 kt at FL300 with a TAT of -30 C
        expect(cas2Mach(139, 8390.4)).toBeCloseTo(0.2452, 3);
        expect(mach2Tas(cas2Mach(139, 8390.4), 2)).toBeCloseTo(157.52, 0);
        expect(Math.abs(mach2Tas(cas2Mach(250, 30000), -30) - 388.97)).toBeLessThan(0.2);
    });
});
