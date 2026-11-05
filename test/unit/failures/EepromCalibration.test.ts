import {beforeEach, describe, expect, it} from 'vitest';
import {DefaultUserSettingManager, EventBus} from '@microsoft/msfs-sdk';
import {EepromCalibration} from '../../../kln90b/failures/EepromCalibration';
import {KLN90BEepromSettings, KLN90BEepromTypes} from '../../../kln90b/settings/KLN90BEepromSettings';
import {clearStatic} from '../../harness/singletons';
import {countAllocations, noAllocations} from '../../harness/allocation';

let settings: DefaultUserSettingManager<KLN90BEepromTypes>;
/** The result of the power-on read the calibration is built with (VolatileMemory, #459) */
let readFailed: boolean;

/** A random source that hands out the queue in order and counts the reads; reading past its end fails the test */
function queue(values: number[]): { random: () => number, reads: () => number } {
    let i = 0;
    return {
        random: () => {
            if (i >= values.length) {
                throw new Error(`random read ${i + 1} times, the queue has ${values.length}`);
            }
            return values[i++];
        },
        reads: () => i,
    };
}

const value = (key: keyof KLN90BEepromTypes) => settings.getSetting(key).get();

function store(x: number, y: number, plus: number, minus: number) {
    settings.getSetting('eepromCrtCenterX').set(x);
    settings.getSetting('eepromCrtCenterY').set(y);
    settings.getSetting('eepromDbarCalPlus').set(plus);
    settings.getSetting('eepromDbarCalMinus').set(minus);
}

beforeEach(() => {
    clearStatic(KLN90BEepromSettings, 'INSTANCE', false);
    settings = KLN90BEepromSettings.getManager(new EventBus());
    readFailed = false;
});

describe('EepromCalibration.drawMissing', () => {
    it('draws every key at 0', () => {
        const q = queue([0, 0, 0, 0, 0, 0]);
        EepromCalibration.drawMissing(settings, q.random);

        expect(value('eepromCrtCenterX')).toBe(-2);
        expect(value('eepromCrtCenterY')).toBe(-2);
        expect(value('eepromDbarCalPlus')).toBeCloseTo(345 / 0.7, 6);
        expect(value('eepromDbarCalPlus')).toBeCloseTo(492.8571428571, 6);
        expect(value('eepromDbarCalMinus')).toBeCloseTo(-364.2857142857, 6);
        expect(q.reads()).toBe(6);
    });

    it('draws the far end', () => {
        const q = queue([0.999, 0.999, 0.999, 0.999, 0.999, 0.999]);
        EepromCalibration.drawMissing(settings, q.random);

        expect(value('eepromCrtCenterX')).toBeCloseTo(5.996, 6);
        expect(value('eepromCrtCenterY')).toBeCloseTo(5.996, 6);
        expect(value('eepromDbarCalPlus')).toBeCloseTo((300 - 44.91) / 1.2994, 6);
        expect(value('eepromDbarCalMinus')).toBeCloseTo((-300 - 44.91) / 1.2994, 6);
    });

    it('reads the random source in its order: X magnitude, X sign, Y magnitude, Y sign, gain, zero point', () => {
        const q = queue([0.1, 0.2, 0.3, 0.6, 0.4, 0.9]);
        EepromCalibration.drawMissing(settings, q.random);

        // X: 2 + 4 * 0.1, negative (0.2); Y: 2 + 4 * 0.3, positive (0.6)
        expect(value('eepromCrtCenterX')).toBeCloseTo(-2.4, 9);
        expect(value('eepromCrtCenterY')).toBeCloseTo(3.2, 9);
        // gain 0.7 + 0.6 * 0.4 = 0.94, zero point -45 + 90 * 0.9 = 36 mV: plus 264 / 0.94, minus -336 / 0.94
        expect(value('eepromDbarCalPlus')).toBeCloseTo(280.8510638298, 6);
        expect(value('eepromDbarCalMinus')).toBeCloseTo(-357.4468085106, 6);
        expect(q.reads()).toBe(6);
    });

    it('a sign draw below 0.5 is negative, 0.5 is positive', () => {
        store(0, 0, 200, -300);
        const q = queue([0, 0.49, 0, 0.5]);
        EepromCalibration.drawMissing(settings, q.random);

        expect(value('eepromCrtCenterX')).toBe(-2);
        expect(value('eepromCrtCenterY')).toBe(2);
    });

    it('leaves stored values alone', () => {
        store(3, 0, 200, -300);
        const q = queue([0, 0.7]);
        EepromCalibration.drawMissing(settings, q.random);

        expect(value('eepromCrtCenterX')).toBe(3);
        expect(value('eepromCrtCenterY')).toBe(2);
        expect(value('eepromDbarCalPlus')).toBe(200);
        expect(value('eepromDbarCalMinus')).toBe(-300);
        expect(q.reads()).toBe(2);
    });

    it('draws both D-bar points when one is 0', () => {
        store(3, -5, 250, 0);
        const q = queue([0, 0]);
        EepromCalibration.drawMissing(settings, q.random);

        expect(value('eepromDbarCalPlus')).toBeCloseTo(345 / 0.7, 6);
        expect(value('eepromDbarCalMinus')).toBeCloseTo(-255 / 0.7, 6);
        expect(value('eepromCrtCenterX')).toBe(3);
        expect(value('eepromCrtCenterY')).toBe(-5);
        expect(q.reads()).toBe(2);
    });
});

// #459: the unit reads the calibration at a power-on only, so the calibration follows the result of that read, which
// VolatileMemory keeps, and not the failure as it stands now (docs/failures.md, "EEPROM")
describe('EepromCalibration', () => {
    const build = () => new EepromCalibration(settings, () => readFailed);

    it('a good read changes nothing', () => {
        store(3, -5, 200, -300);
        const calibration = build();

        expect(calibration.screenShiftXPx()).toBe(0);
        expect(calibration.screenShiftYPx()).toBe(0);
        expect(calibration.dbarDeviation(0.7, 5)).toBe(0.7);
    });

    it('a failed read applies the calibration', () => {
        store(3, -5, 200, -300);
        const calibration = build();
        readFailed = true;

        // The uncorrected image is off by the opposite of the stored centering, times ZOOM_FACTOR 4
        expect(calibration.screenShiftXPx()).toBe(-12);
        expect(calibration.screenShiftYPx()).toBe(20);
        // gain 600 / 500 = 1.2, zero point 300 - 1.2 * 200 = 60 mV, 150 mV full scale
        expect(calibration.dbarDeviation(0.7, 5)).toBeCloseTo(1.2 * 0.7 + 60 / 150 * 5, 9);
        expect(calibration.dbarDeviation(0.7, 5)).toBeCloseTo(2.84, 9);
    });

    it('a stored 0 reads as neutral', () => {
        const calibration = build();
        readFailed = true;

        expect(calibration.screenShiftXPx()).toBe(0);
        expect(calibration.screenShiftYPx()).toBe(0);
        expect(calibration.dbarDeviation(0.7, 5)).toBe(0.7);
    });

    // The D-bar write runs at 16 Hz (SensorsOut.setFilteredOutputs), and port writes allocate nothing (#459, the Task 1
    // review): no array method that builds an array or takes a closure, and no iterator of an array, set or map
    // (test/harness/allocation.ts). The read result comes through FailureDetector.actsOnUnit in the unit, whose own test
    // holds the same
    describe('the 16 Hz path', () => {
        it('dbarDeviation calls no allocating built-in while failed', () => {
            store(3, -5, 200, -300);
            const calibration = build();
            readFailed = true;

            const {result: deviation, counts} = countAllocations(() => calibration.dbarDeviation(0.7, 5));

            expect(deviation).toBeCloseTo(2.84, 9); // Precondition: the failed path ran
            expect(counts).toEqual(noAllocations());
        });
    });
});
