import {describe, expect, it} from 'vitest';
import {LEVEL_ATTITUDE} from '../../kln90b/GpsSignal';
import {
    CALIBRATION_AGL_FT,
    dbToRatio,
    diffractionLossDb,
    fakeSnr,
    jammerEdgeNm,
    jammerPowerDb,
    levelDb,
    noiseRiseDb,
    radioHorizonNm,
    rangeFromSinElevationM,
    spooferEdgeNm,
    spooferPowerDb,
    transmitterGainDb,
    transmitterSinAntennaElevation,
    transmitterSinLocalElevation,
} from '../../kln90b/GpsTransmitter';
import {levelGainDb} from '../harness/transmitterGain';

const DEG = Math.PI / 180;

describe('GpsTransmitter', () => {
    it('radio horizon', () => {
        expect(radioHorizonNm(0)).toBeCloseTo(12.3, 1);
        expect(radioHorizonNm(5000)).toBeCloseTo(99.3, 1);
        expect(radioHorizonNm(10000)).toBeCloseTo(135.3, 1);
        expect(radioHorizonNm(35000)).toBeCloseTo(242.4, 1);
    });

    it('diffraction loss is 0 within the horizon and rises with the distance beyond it', () => {
        expect(diffractionLossDb(100, 10000)).toBe(0);
        expect(diffractionLossDb(140.3, 10000)).toBeCloseTo(10, 1);
        expect(diffractionLossDb(150, 10000)).toBeGreaterThan(diffractionLossDb(140.3, 10000));
        expect(diffractionLossDb(200, 10000)).toBeGreaterThan(diffractionLossDb(150, 10000));
    });

    // Final review (2026-11-08): above the plane the satellite curve (12 log10 sin e under the zenith), at least -12 dB; at and
    // below it -12 dB less 0.5 dB per degree, at least -25 dB
    it.each([
        [90, 0],
        [30, 12 * Math.log10(0.5)], // -3.612
        [10, 12 * Math.log10(Math.sin(10 * DEG))], // -9.115
        [5, -12], // the curve's -12.716 is under the plane's value
        [0, -12],
        [-2, -13],
        [-10, -17],
        [-26, -25],
        [-60, -25],
        [-90, -25],
    ])('the gain toward a transmitter at %d degrees above the antenna plane is %f dB', (elevationDeg, gainDb) => {
        expect(transmitterGainDb(Math.sin(elevationDeg * DEG))).toBeCloseTo(gainDb, 9);
    });

    it('the gain is continuous at the antenna plane and the floor for a value that is not a number', () => {
        expect(transmitterGainDb(1e-12)).toBe(-12);
        expect(transmitterGainDb(-1e-12)).toBeCloseTo(-12, 9);
        expect(transmitterGainDb(NaN)).toBe(-25);
    });

    it('level flight puts a distant transmitter a little under the antenna plane', () => {
        // 50 NM, 10,000 ft: sin = -0.03804 (below), 2.180 degrees under the plane: -12 - 1.090
        const s = transmitterSinAntennaElevation(90, transmitterSinLocalElevation(50, 10000), LEVEL_ATTITUDE);
        expect(transmitterGainDb(s)).toBeCloseTo(-13.090, 3);
    });

    // Bank 20 degrees with the transmitter 2.180 degrees under the horizon abeam: toward it the plane tilts it to
    // asin(-0.03804 cos 20 + 0.99928 sin 20) = 17.81 degrees above, 12 log10 sin = -6.169; away to 22.18 degrees under, -23.090
    it('banking toward the transmitter raises the gain, away lowers it', () => {
        const sinLocal = transmitterSinLocalElevation(50, 10000);
        const right = {...LEVEL_ATTITUDE, bankRightDeg: 20};
        const left = {...LEVEL_ATTITUDE, bankRightDeg: -20};
        expect(transmitterGainDb(transmitterSinAntennaElevation(90, sinLocal, right))).toBeCloseTo(-6.169, 2);
        expect(transmitterGainDb(transmitterSinAntennaElevation(90, sinLocal, left))).toBeCloseTo(-23.090, 2);
        // A bank of 30 degrees away puts it more than 26 degrees under: the floor
        expect(transmitterGainDb(transmitterSinAntennaElevation(90, sinLocal, {...LEVEL_ATTITUDE, bankRightDeg: -30}))).toBe(-25);
    });

    it('the bearing is taken relative to the heading', () => {
        const sinLocal = transmitterSinLocalElevation(50, 10000);
        const base = {...LEVEL_ATTITUDE, headingTrueDeg: 90};
        // the transmitter is 90 degrees to the right of the nose
        expect(transmitterGainDb(transmitterSinAntennaElevation(180, sinLocal, {...base, bankRightDeg: 20}))).toBeCloseTo(-6.169, 2);
        expect(transmitterGainDb(transmitterSinAntennaElevation(180, sinLocal, {...base, bankRightDeg: -20}))).toBeCloseTo(-23.090, 2);
    });

    it('pitch raises the antenna toward the tail and lowers it toward the nose', () => {
        const up = {...LEVEL_ATTITUDE, pitchUpDeg: 30};
        // on the horizon, ahead: the plane's nose is 30 degrees up, so sin(-30) = -0.5; behind: +0.5
        expect(transmitterSinAntennaElevation(0, 0, up)).toBeCloseTo(-0.5, 6);
        expect(transmitterSinAntennaElevation(180, 0, up)).toBeCloseTo(0.5, 6);
        // abeam the pitch has no effect
        expect(transmitterSinAntennaElevation(90, 0, up)).toBeCloseTo(0, 6);
        // sin 0.6, cos 0.8, behind: 0.6 cos30 + 0.8 sin30 = 0.919615
        expect(transmitterSinAntennaElevation(180, 0.6, up)).toBeCloseTo(0.919615, 5);
        // heading 90, bearing 90 is straight ahead
        expect(transmitterSinAntennaElevation(90, 0, {...up, headingTrueDeg: 90})).toBeCloseTo(-0.5, 6);
    });

    it('the local elevation over a 4/3 earth', () => {
        // 50 NM, 10,000 ft: -9900 / 303,806 ft - 50 / 9173.5 NM = -0.032587 - 0.005450
        expect(transmitterSinLocalElevation(50, 10000)).toBeCloseTo(-0.03804, 4);
        // 2 NM, on the ground: 100 / 12,152 ft - 2 / 9173.5 = 0.008229 - 0.000218
        expect(transmitterSinLocalElevation(2, 0)).toBeCloseTo(0.00801, 4);
        // clamped to the sine's range
        expect(transmitterSinLocalElevation(0.1, 100000)).toBe(-1);
        expect(transmitterSinLocalElevation(0.1, -100000)).toBe(1);
    });

    it('noise rise', () => {
        expect(noiseRiseDb(0, 0)).toBe(0);
        expect(noiseRiseDb(dbToRatio(6.02), 0)).toBeCloseTo(7.0, 1);
    });

    it('fake SNR caps at about 51.5 with eight fake satellites', () => {
        const a = fakeSnr(dbToRatio(40), 8, 0);
        expect(a).toBeGreaterThanOrEqual(51);
        expect(a).toBeLessThanOrEqual(54);
        expect(Math.abs(fakeSnr(dbToRatio(60), 8, 0) - a)).toBeLessThan(0.1);
    });

    // Final review (2026-11-08): the power is calibrated in level flight at FL350, with the gain at the transmitter's
    // depression there (150 NM: 3.13 degrees under the horizon, -13.57 dB; the gain computed by the test's harness)
    it('a jammer of the drawn power takes the weakest satellite at its first-loss distance at the calibration height', () => {
        expect(CALIBRATION_AGL_FT).toBe(35000);
        for (const nm of [100, 150, 240]) {
            expect(noiseRiseDb(dbToRatio(levelDb(jammerPowerDb(nm), nm, 35000, levelGainDb(nm, 35000))), 0)).toBeCloseTo(7.0, 6);
        }
        expect(levelGainDb(150, 35000)).toBeCloseTo(-13.566, 2);
    });

    // Final review (2026-11-08): the jammer draws reach 600 NM, beyond the 242 NM horizon of FL350. Such a distance is taken in
    // line of sight, as if there were no horizon, as the spoofer's are: the free-space spreading and the gain alone (600 NM:
    // 4.30 degrees under the horizon, -14.15 dB)
    it('a jammer drawn beyond the horizon would take the weakest satellite there in line of sight', () => {
        for (const nm of [400, 600]) {
            const losLevelDb = jammerPowerDb(nm) - 20 * Math.log10(nm) + levelGainDb(nm, 35000);
            expect(noiseRiseDb(dbToRatio(losLevelDb), 0)).toBeCloseTo(7.0, 6);
        }
        expect(levelGainDb(600, 35000)).toBeCloseTo(-14.15, 2);
    });

    // In line of sight, as if there were no horizon: the free-space spreading and the gain alone
    it('a spoofer of the drawn power would raise the noise 20 dB at its capture distance at the calibration height', () => {
        for (const nm of [300, 600]) {
            const losLevelDb = spooferPowerDb(nm) - 20 * Math.log10(nm) + levelGainDb(nm, 35000);
            expect(noiseRiseDb(0, dbToRatio(losLevelDb))).toBeCloseTo(20.0, 6);
        }
    });

    it('the jammer edge is where the rise is 1 dB, capped by the horizon', () => {
        const high = jammerEdgeNm(jammerPowerDb(150), 35000);
        expect(high).toBeGreaterThanOrEqual(243);
        expect(high).toBeLessThanOrEqual(260);
        const ground = jammerEdgeNm(jammerPowerDb(150), 0);
        expect(ground).toBeGreaterThanOrEqual(25);
        expect(ground).toBeLessThanOrEqual(35);
    });

    // Controller rulings H and I: the edges for another threshold, the stronger effect of the placement and a spoofer's leave
    // edge. Checked against the level functions at the solved distance, in level flight with the gain at the depression there
    it.each([10000, 35000])('the edges for another threshold at %d ft: the rise or the fake SNR there is that threshold', aglFt => {
        const jam = jammerPowerDb(150);
        const at1 = jammerEdgeNm(jam, aglFt);
        const at3 = jammerEdgeNm(jam, aglFt, 3);
        expect(at3).toBeLessThan(at1);
        expect(noiseRiseDb(dbToRatio(levelDb(jam, at1, aglFt, levelGainDb(at1, aglFt))), 0)).toBeCloseTo(1, 4);
        expect(noiseRiseDb(dbToRatio(levelDb(jam, at3, aglFt, levelGainDb(at3, aglFt))), 0)).toBeCloseTo(3, 4);

        const spoof = spooferPowerDb(450);
        const snrAt = (nm: number) => fakeSnr(dbToRatio(levelDb(spoof, nm, aglFt, levelGainDb(nm, aglFt))) / 8, 8, 0);
        const at35 = spooferEdgeNm(spoof, 8, aglFt);
        const at38 = spooferEdgeNm(spoof, 8, aglFt, 38);
        const at25 = spooferEdgeNm(spoof, 8, aglFt, 25);
        expect(at38).toBeLessThan(at35);
        expect(at25).toBeGreaterThan(at35);
        expect(snrAt(at35)).toBeCloseTo(35, 4);
        expect(snrAt(at38)).toBeCloseTo(38, 4);
        expect(snrAt(at25)).toBeCloseTo(25, 4);
    });

    it('a spoofer is horizon-limited', () => {
        const edge = spooferEdgeNm(spooferPowerDb(450), 8, 35000);
        expect(edge).toBeGreaterThanOrEqual(242.4);
        expect(edge).toBeLessThanOrEqual(270);
    });

    it('range from elevation', () => {
        expect(rangeFromSinElevationM(1) / 1000).toBeCloseTo(20189, -1);
        expect(Math.abs(rangeFromSinElevationM(1) / 1000 - 20189)).toBeLessThan(1);
        expect(Math.abs(rangeFromSinElevationM(0) / 1000 - 25785)).toBeLessThan(5);
    });
});
