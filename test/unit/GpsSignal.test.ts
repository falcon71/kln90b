import {describe, expect, it} from 'vitest';
import {
    AntennaAttitude,
    antennaCurveSnr,
    antennaSinElevation,
    blockOffsetDb,
    fadeSigmaDb,
    jitterSigmaDb,
    LEVEL_ATTITUDE,
} from '../../kln90b/GpsSignal';

const sin = (deg: number): number => Math.sin(deg * Math.PI / 180);
const DEG = Math.PI / 180;

// #467: characterizations of our own signal model; the numbers are worked out by hand from the formulas
describe('antennaCurveSnr (#467, characterization)', () => {
    it.each([
        [10, 40.9],
        [30, 46.4],
        [90, 50],
    ])('gives %s degrees an SNR of %s', (elevation, snr) => {
        expect(antennaCurveSnr(sin(elevation))).toBeCloseTo(snr, 1);
    });

    it.each([[0], [-0.5], [NaN], [sin(0.3)]])('floors %s at 25', (s) => {
        expect(antennaCurveSnr(s)).toBe(25);
    });
});

describe('antennaSinElevation (#467, characterization)', () => {
    const elevationDeg = (zenithDeg: number, hourAngle: number, att: Partial<AntennaAttitude>): number =>
        Math.asin(antennaSinElevation(zenithDeg * DEG, hourAngle, {...LEVEL_ATTITUDE, ...att})) / DEG;

    it('is the local elevation in level flight', () => {
        expect(elevationDeg(60, 1.2, {headingTrueDeg: 33})).toBeCloseTo(30, 6);
    });

    it('lowers a satellite ahead and raises one behind when the nose is up', () => {
        expect(elevationDeg(60, 0, {pitchUpDeg: 10})).toBeCloseTo(20, 6);
        expect(elevationDeg(60, Math.PI, {pitchUpDeg: 10})).toBeCloseTo(40, 6);
    });

    it('raises a satellite on the low wing side and lowers one on the high side', () => {
        expect(elevationDeg(70, -Math.PI / 2, {bankRightDeg: 25})).toBeCloseTo(45, 6);
        expect(elevationDeg(70, Math.PI / 2, {bankRightDeg: 25})).toBeCloseTo(-5, 6);
    });

    it('depends on the azimuth relative to the heading', () => {
        expect(elevationDeg(70, Math.PI, {headingTrueDeg: 90, bankRightDeg: 25})).toBeCloseTo(45, 6);
        expect(elevationDeg(70, 0, {headingTrueDeg: 90, bankRightDeg: 25})).toBeCloseTo(-5, 6);
    });

    it('gives -1 at or under the local horizon', () => {
        expect(antennaSinElevation(95 * DEG, 0, LEVEL_ATTITUDE)).toBe(-1);
        expect(antennaSinElevation(90 * DEG, 0, {...LEVEL_ATTITUDE, bankRightDeg: 25})).toBe(-1);
    });

    it('gives NaN for an hour angle that is not a number', () => {
        expect(antennaSinElevation(60 * DEG, NaN, LEVEL_ATTITUDE)).toBeNaN();
    });
});

describe('blockOffsetDb (#467, characterization)', () => {
    it.each([
        ['GPS-IIF', 1],
        ['GPS-IIR-M', 0.5],
        ['GPS-IIR-B', 0],
        ['GPS-IIR-A', -1],
        [undefined, 0],
        ['GPS-IIIF', 0],
    ])('gives %s %s dB', (block, offset) => {
        expect(blockOffsetDb(block, sin(45))).toBe(offset);
    });

    it.each([
        [20, -1.5],
        [30, -1.5],
        [40, -2.75],
        [50, -4],
        [60, -4],
    ])('gives GPS-IIIA at %s degrees %s dB', (elevation, offset) => {
        expect(blockOffsetDb('GPS-IIIA', sin(elevation))).toBeCloseTo(offset, 9);
    });
});

describe('fadeSigmaDb (#467, characterization)', () => {
    it.each([
        [0, false, 1.2],
        [0, true, 2.0],
        [50, false, 0.3],
        [50, true, 0.5],
        [22.5, false, 0.75],
        [22.5, true, 1.25],
        [-10, false, 1.2],
    ])('gives %s degrees (on ground %s) %s dB', (elevation, onGround, sigma) => {
        expect(fadeSigmaDb(sin(elevation), onGround)).toBeCloseTo(sigma, 9);
    });

    it('treats a value that is not a number as the horizon', () => {
        expect(fadeSigmaDb(NaN, false)).toBeCloseTo(1.2, 9);
    });
});

describe('jitterSigmaDb (#467, characterization)', () => {
    it.each([
        [45, 0.15],
        [35, 0.4743],
        [30, 0.8435],
        [10, 1.5],
    ])('gives an SNR of %s a sigma of %s dB', (snr, sigma) => {
        expect(jitterSigmaDb(snr)).toBeCloseTo(sigma, 3);
    });
});
