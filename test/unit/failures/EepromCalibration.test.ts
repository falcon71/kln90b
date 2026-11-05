import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {DefaultUserSettingManager, EventBus} from '@microsoft/msfs-sdk';
import {Failures} from '../../../kln90b/failures/Failures';
import {EepromCalibration} from '../../../kln90b/failures/EepromCalibration';
import {KLN90BFailureSettings} from '../../../kln90b/settings/KLN90BFailureSettings';
import {KLN90BEepromSettings, KLN90BEepromTypes} from '../../../kln90b/settings/KLN90BEepromSettings';
import {DataInterface, KLN90PlaneSettings, ObsInterface, RmiInterface} from '../../../kln90b/settings/KLN90BPlaneSettings';
import {clearStatic} from '../../harness/singletons';

function plane(): KLN90PlaneSettings {
    return {
        takeHomeMode: false, basePath: '', debugMode: false, vfrOnly: false,
        input: {
            altimeterInterfaced: true, obsSource: 1, headingInput: false, headingSimVar: '', electricitySimVar: '',
            airdata: {isInterfaced: false, baroSource: 0, interface: DataInterface.RS232},
            obsInterface: ObsInterface.ANALOG, headingInterface: DataInterface.ARINC429,
            fuelComputer: {isInterfaced: false} as KLN90PlaneSettings['input']['fuelComputer'],
            externalSwitches: {legObsSwitchInstalled: false, appArmSwitchInstalled: false},
        },
        output: {
            obsTarget: 0, altitudeAlertEnabled: false, writeGPSSimVars: true, rmiInterface: RmiInterface.OBI, rmiInstalled: false,
            dataInterface: DataInterface.ARINC429,
            externalAnnunciators: {msgInstalled: false, wptInstalled: false, armInstalled: false, actvInstalled: false},
        },
    };
}

let settings: DefaultUserSettingManager<KLN90BEepromTypes>;
let failures: Failures;

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
    clearStatic(KLN90BFailureSettings, 'INSTANCE', false);
    const bus = new EventBus();
    settings = KLN90BEepromSettings.getManager(bus);
    failures = new Failures(bus, KLN90BFailureSettings.getManager(bus), plane());
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

describe('EepromCalibration', () => {
    it('working EEPROM changes nothing', () => {
        store(3, -5, 200, -300);
        const calibration = new EepromCalibration(settings, failures);

        expect(calibration.screenShiftXPx()).toBe(0);
        expect(calibration.screenShiftYPx()).toBe(0);
        expect(calibration.dbarDeviation(0.7, 5)).toBe(0.7);
    });

    it('failed EEPROM applies the calibration', () => {
        store(3, -5, 200, -300);
        const calibration = new EepromCalibration(settings, failures);
        failures.fail('eeprom');

        // The uncorrected image is off by the opposite of the stored centering, times ZOOM_FACTOR 4
        expect(calibration.screenShiftXPx()).toBe(-12);
        expect(calibration.screenShiftYPx()).toBe(20);
        // gain 600 / 500 = 1.2, zero point 300 - 1.2 * 200 = 60 mV, 150 mV full scale
        expect(calibration.dbarDeviation(0.7, 5)).toBeCloseTo(1.2 * 0.7 + 60 / 150 * 5, 9);
        expect(calibration.dbarDeviation(0.7, 5)).toBeCloseTo(2.84, 9);
    });

    it('a stored 0 reads as neutral', () => {
        const calibration = new EepromCalibration(settings, failures);
        failures.fail('eeprom');

        expect(calibration.screenShiftXPx()).toBe(0);
        expect(calibration.screenShiftYPx()).toBe(0);
        expect(calibration.dbarDeviation(0.7, 5)).toBe(0.7);
    });

    // The D-bar write runs at 16 Hz (SensorsOut.setFilteredOutputs), and port writes allocate nothing (#459, the Task 1
    // review): the catalog is searched with loops, without find or filter and their closures and arrays
    describe('the 16 Hz path', () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('dbarDeviation calls no find or filter while failed', () => {
            store(3, -5, 200, -300);
            const calibration = new EepromCalibration(settings, failures);
            failures.fail('eeprom');
            const find = vi.spyOn(Array.prototype, 'find');
            const filter = vi.spyOn(Array.prototype, 'filter');

            const deviation = calibration.dbarDeviation(0.7, 5);

            expect(deviation).toBeCloseTo(2.84, 9); // Precondition: the failed path ran
            expect(find).not.toHaveBeenCalled();
            expect(filter).not.toHaveBeenCalled();
        });
    });
});
