import {beforeEach, describe, expect, it, vi} from 'vitest';
import {EventBus} from '@microsoft/msfs-sdk';
import {Failures} from '../../../kln90b/failures/Failures';
import {formatReceiverCode, ReceiverErrors} from '../../../kln90b/failures/ReceiverErrors';
import {KLN90BFailureSettings} from '../../../kln90b/settings/KLN90BFailureSettings';
import {DataInterface, KLN90PlaneSettings, ObsInterface, RmiInterface} from '../../../kln90b/settings/KLN90BPlaneSettings';
import {clearStatic} from '../../harness/singletons';

function plane(takeHomeMode: boolean): KLN90PlaneSettings {
    return {
        takeHomeMode, basePath: '', debugMode: false, vfrOnly: false,
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

let bus: EventBus;
let settings: ReturnType<typeof KLN90BFailureSettings.getManager>;
let failures: Failures;
let re: ReceiverErrors;
let rnd: number;
let randomSpy: ReturnType<typeof vi.fn<() => number>>;

function build(takeHome = false) {
    clearStatic(KLN90BFailureSettings, 'INSTANCE', false);
    bus = new EventBus();
    settings = KLN90BFailureSettings.getManager(bus);
    failures = new Failures(bus, settings, plane(takeHome));
    make(takeHome);
}

/** A ReceiverErrors over the current settings */
function make(takeHome = false) {
    randomSpy = vi.fn<() => number>(() => rnd);
    re = new ReceiverErrors(bus, failures, takeHome, randomSpy);
}

function values(key: 'gpsAntenna' | 'rcvrMemory' | 'rcvrHardware' | 'rcvrInit' | 'rcvrEeprom' | 'antennaGain') {
    return JSON.parse(settings.getSetting(`failure_${key}`).get());
}

beforeEach(() => {
    rnd = 0.5;
    build();
});

describe('formatReceiverCode', () => {
    it('writes four uppercase hex digits', () => {
        expect(formatReceiverCode(0x18)).toBe('0018');
        expect(formatReceiverCode(0x110)).toBe('0110');
        expect(formatReceiverCode(0x2010)).toBe('2010');
        expect(formatReceiverCode(0x0a80)).toBe('0A80');
    });
});

describe('nothing failed', () => {
    it('is quiet and draws nothing', () => {
        re.latchPowerOn(false);
        expect(re.code).toBe(0);
        expect(re.testFailCode).toBe(0);
        expect(re.receiverDead).toBe(false);
        expect(re.acquisitionFactor).toBe(1);
        expect(re.antennaLossDb).toBe(0);
        expect(re.hostBlocked).toBe(false);
        expect(re.memoryBitSet).toBe(false);
        expect(randomSpy).not.toHaveBeenCalled();
    });
});

describe('gpsAntenna', () => {
    it('open antenna gives 0010', () => {
        rnd = 0.7;
        failures.fail('gpsAntenna');
        expect(values('gpsAntenna')).toEqual({short: 0});
        expect(re.code).toBe(0x10);
        expect(re.receiverDead).toBe(true);
    });

    it('short adds 0100 and a repair ends it at once', () => {
        rnd = 0.2;
        failures.fail('gpsAntenna');
        expect(values('gpsAntenna')).toEqual({short: 1});
        expect(re.code).toBe(0x110);
        expect(re.receiverDead).toBe(true);
        failures.repair('gpsAntenna');
        expect(re.code).toBe(0);
        expect(re.receiverDead).toBe(false);
    });

    it('draws missing values once and saves them', () => {
        settings.getSetting('failure_gpsAntenna').set('{}');
        rnd = 0.2;
        make();
        expect(re.code).toBe(0x110);
        expect(values('gpsAntenna')).toEqual({short: 1});
        rnd = 0.9;
        make();
        expect(re.code).toBe(0x110);
        expect(randomSpy).not.toHaveBeenCalled();
    });

    it('draws anew when the values are unusable', () => {
        settings.getSetting('failure_gpsAntenna').set('{"short":7}');
        rnd = 0.7;
        make();
        expect(re.code).toBe(0x10);
        expect(values('gpsAntenna')).toEqual({short: 0});
    });
});

describe('rcvrHardware', () => {
    it.each([[0, 0x0002], [0.2, 0x0004], [0.4, 0x0080], [0.6, 0x2000], [0.8, 0x8000]])('random %f saves code %i', (r, code) => {
        rnd = r;
        failures.fail('rcvrHardware');
        expect(values('rcvrHardware')).toEqual({code});
    });

    it.each([[0.6, 0x2000], [0.8, 0x8000]])('live code %i shows at once and ends with the repair', (r, code) => {
        rnd = r;
        failures.fail('rcvrHardware');
        expect(re.code).toBe(code);
        expect(re.receiverDead).toBe(true);
        failures.repair('rcvrHardware');
        expect(re.code).toBe(0);
    });

    it.each([[0, 0x0002], [0.2, 0x0004], [0.4, 0x0080]])('a power-on code (random %f) acts from the next power-on and stays until the one after the repair', (r, code) => {
        rnd = r;
        failures.fail('rcvrHardware');
        expect(re.code).toBe(0);
        expect(re.receiverDead).toBe(false);
        re.latchPowerOn(false);
        expect(re.code).toBe(code);
        expect(re.receiverDead).toBe(true);
        failures.repair('rcvrHardware');
        expect(re.code).toBe(code);
        re.latchPowerOn(false);
        expect(re.code).toBe(0);
    });
});

describe('battery wipe', () => {
    it('sets 0008 until a satellite is tracked, and TEST FAIL keeps it', () => {
        re.latchPowerOn(true);
        expect(re.code).toBe(0x0008);
        expect(re.memoryLostAtPowerOn).toBe(false);
        expect(re.receiverDead).toBe(false);
        expect(re.memoryBitSet).toBe(true);
        re.satelliteTracked();
        expect(re.code).toBe(0);
        expect(re.memoryBitSet).toBe(false);
        expect(re.testFailCode).toBe(0x0008);
        re.latchPowerOn(false);
        expect(re.code).toBe(0);
        expect(re.testFailCode).toBe(0);
    });
});

describe('rcvrMemory', () => {
    it('not transient acts at every power-on', () => {
        rnd = 0.9;
        failures.fail('rcvrMemory');
        expect(values('rcvrMemory')).toEqual({transient: 0});
        for (let i = 0; i < 2; i++) {
            re.latchPowerOn(false);
            expect(re.code).toBe(0x0008);
            expect(re.memoryLostAtPowerOn).toBe(true);
            expect(failures.isActive('rcvrMemory')).toBe(true);
            re.satelliteTracked();
            expect(re.code).toBe(0);
        }
    });

    it('transient acts once and is repaired', () => {
        rnd = 0.1;
        failures.fail('rcvrMemory');
        expect(values('rcvrMemory')).toEqual({transient: 1});
        re.latchPowerOn(false);
        expect(re.code).toBe(0x0008);
        expect(failures.isActive('rcvrMemory')).toBe(false);
        expect(re.memoryLostAtPowerOn).toBe(true);
        re.latchPowerOn(false);
        expect(re.code).toBe(0);
        expect(re.memoryLostAtPowerOn).toBe(false);
    });

    it('started in operation does nothing before the power-on', () => {
        failures.fail('rcvrMemory');
        expect(re.code).toBe(0);
        expect(re.memoryBitSet).toBe(false);
    });
});

describe('rcvrInit', () => {
    it('blocks the host for the power-on, also after a repair', () => {
        failures.fail('rcvrInit');
        expect(re.hostBlocked).toBe(false);
        re.latchPowerOn(false);
        expect(re.hostBlocked).toBe(true);
        expect(re.code).toBe(0x0400);
        expect(re.receiverDead).toBe(false);
        failures.repair('rcvrInit');
        expect(re.hostBlocked).toBe(true);
        expect(re.code).toBe(0x0400);
        re.latchPowerOn(false);
        expect(re.hostBlocked).toBe(false);
        expect(re.code).toBe(0);
    });

    it('repaired before the power-on latches nothing', () => {
        failures.fail('rcvrInit');
        failures.repair('rcvrInit');
        re.latchPowerOn(false);
        expect(re.hostBlocked).toBe(false);
        expect(re.code).toBe(0);
    });
});

describe('rcvrEeprom', () => {
    it('draws the acquisition factor at the latch', () => {
        failures.fail('rcvrEeprom');
        expect(re.acquisitionFactor).toBe(1);
        re.latchPowerOn(false);
        expect(re.acquisitionFactor).toBe(3);
        expect(re.code).toBe(0x0800);
        expect(re.receiverDead).toBe(false);
    });

    it('draws a factor from 2 to 4', () => {
        failures.fail('rcvrEeprom');
        rnd = 0;
        re.latchPowerOn(false);
        expect(re.acquisitionFactor).toBe(2);
        rnd = 0.999;
        re.latchPowerOn(false);
        expect(re.acquisitionFactor).toBeCloseTo(3.998, 3);
    });
});

describe('rcvrEeprom transient slowdown', () => {
    it('the drawn factor stays after the transient repair, until the next latch', () => {
        rnd = 0.1;
        failures.fail('rcvrEeprom');
        expect(values('rcvrEeprom')).toEqual({transient: 1});
        rnd = 0.5;
        re.latchPowerOn(false);
        expect(failures.isActive('rcvrEeprom')).toBe(false);
        expect(re.code).toBe(0x0800);
        expect(re.acquisitionFactor).toBe(3);
        re.latchPowerOn(false);
        expect(re.code).toBe(0);
        expect(re.acquisitionFactor).toBe(1);
    });

    it('the factor stays also after a repair, and the next latch gives 1', () => {
        failures.fail('rcvrEeprom');
        re.latchPowerOn(false);
        expect(re.acquisitionFactor).toBe(3);
        failures.repair('rcvrEeprom');
        expect(re.acquisitionFactor).toBe(3);
        expect(re.code).toBe(0x0800);
        re.latchPowerOn(false);
        expect(re.acquisitionFactor).toBe(1);
        expect(re.code).toBe(0);
    });
});

describe.each([['rcvrInit', 0x0400], ['rcvrEeprom', 0x0800]] as const)('%s transient rule', (key, bit) => {
    it('transient acts once and is repaired', () => {
        rnd = 0.1;
        failures.fail(key);
        expect(values(key)).toEqual({transient: 1});
        re.latchPowerOn(false);
        expect(re.code).toBe(bit);
        expect(failures.isActive(key)).toBe(false);
        re.latchPowerOn(false);
        expect(re.code).toBe(0);
    });

    it('not transient acts at every power-on', () => {
        rnd = 0.9;
        failures.fail(key);
        expect(values(key)).toEqual({transient: 0});
        for (let i = 0; i < 2; i++) {
            re.latchPowerOn(false);
            expect(re.code).toBe(bit);
            expect(failures.isActive(key)).toBe(true);
        }
    });
});

describe('combinations', () => {
    it('open antenna with a battery wipe', () => {
        rnd = 0.7;
        failures.fail('gpsAntenna');
        re.latchPowerOn(true);
        expect(re.code).toBe(0x0018);
    });

    it('eeprom with memory', () => {
        failures.fail('rcvrEeprom');
        failures.fail('rcvrMemory');
        re.latchPowerOn(false);
        expect(re.code).toBe(0x0808);
    });
});

describe('gpsReceiver', () => {
    it('hides the word from the host and from TEST FAIL', () => {
        rnd = 0.7;
        failures.fail('gpsAntenna');
        expect(re.reportedCode).toBe(0x10);
        expect(re.testFailCode).toBe(0x10);
        failures.fail('gpsReceiver');
        expect(re.code).toBe(0x10);
        expect(re.reportedCode).toBe(0);
        expect(re.testFailCode).toBe(0);
        failures.repair('gpsReceiver');
        expect(re.reportedCode).toBe(0x10);
        expect(re.testFailCode).toBe(0x10);
    });
});

describe('antennaGain', () => {
    it('loses the drawn dB while failed', () => {
        failures.fail('antennaGain');
        expect(values('antennaGain')).toEqual({lossDb: 10.5});
        expect(re.antennaLossDb).toBe(10.5);
        failures.repair('antennaGain');
        expect(re.antennaLossDb).toBe(0);
    });

    it('draws anew when the stored loss is out of range', () => {
        settings.getSetting('failure_antennaGain').set('{"lossDb":99}');
        rnd = 0;
        make();
        expect(re.antennaLossDb).toBe(6);
    });
});

describe('junk stored values', () => {
    it('a hardware code that is no code is drawn anew', () => {
        settings.getSetting('failure_rcvrHardware').set('{"code":8}');
        rnd = 0.2;
        make();
        failures.fail('rcvrHardware');
        make();
        expect(re.code).toBe(0);
        expect(values('rcvrHardware')).toEqual({code: 0x0004});
        re.latchPowerOn(false);
        expect(re.code).toBe(0x0004);
    });

    it('a transient value that is no bit is drawn anew', () => {
        settings.getSetting('failure_rcvrInit').set('{"transient":7}');
        rnd = 0.1;
        make();
        failures.fail('rcvrInit');
        expect(values('rcvrInit')).toEqual({transient: 1});
        re.latchPowerOn(false);
        expect(failures.isActive('rcvrInit')).toBe(false);
    });

    it('a loss below the range is drawn anew', () => {
        settings.getSetting('failure_antennaGain').set('{"lossDb":2}');
        rnd = 0;
        make();
        failures.fail('antennaGain');
        expect(values('antennaGain')).toEqual({lossDb: 6});
        expect(re.antennaLossDb).toBe(6);
    });
});

describe('take-home mode', () => {
    it('has no word and draws nothing', () => {
        build(true);
        failures.fail('gpsAntenna');
        failures.fail('rcvrHardware');
        failures.fail('rcvrInit');
        failures.fail('rcvrEeprom');
        failures.fail('rcvrMemory');
        failures.fail('antennaGain');
        re.latchPowerOn(true);
        expect(re.code).toBe(0);
        expect(re.reportedCode).toBe(0);
        expect(re.testFailCode).toBe(0);
        expect(re.receiverDead).toBe(false);
        expect(re.memoryLostAtPowerOn).toBe(false);
        expect(re.hostBlocked).toBe(false);
        expect(re.acquisitionFactor).toBe(1);
        expect(re.antennaLossDb).toBe(0);
        expect(re.memoryBitSet).toBe(false);
        expect(randomSpy).not.toHaveBeenCalled();
    });
});
