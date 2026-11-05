import {beforeEach, describe, expect, it} from 'vitest';
import {EventBus} from '@microsoft/msfs-sdk';
import {Failures, FailureChangedEvents} from '../../../kln90b/failures/Failures';
import {FAILURE_CATALOG, FailureKey, failureSettingName} from '../../../kln90b/failures/FailureCatalog';
import {KLN90BFailureSettings} from '../../../kln90b/settings/KLN90BFailureSettings';
import {DataInterface, KLN90PlaneSettings, ObsInterface, RmiInterface} from '../../../kln90b/settings/KLN90BPlaneSettings';
import {clearStatic} from '../../harness/singletons';

function plane(dataInterface: DataInterface): KLN90PlaneSettings {
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
            dataInterface,
            externalAnnunciators: {msgInstalled: false, wptInstalled: false, armInstalled: false, actvInstalled: false},
        },
    };
}

let events: { key: FailureKey, active: boolean }[];

function build(dataInterface: DataInterface = DataInterface.ARINC429, change: (s: KLN90PlaneSettings) => void = () => undefined) {
    clearStatic(KLN90BFailureSettings, 'INSTANCE', false);
    const bus = new EventBus();
    events = [];
    bus.getSubscriber<FailureChangedEvents>().on('failureChanged').handle(e => events.push(e));
    const settings = KLN90BFailureSettings.getManager(bus);
    const p = plane(dataInterface);
    change(p);
    return {settings, failures: new Failures(bus, settings, p)};
}

beforeEach(() => clearStatic(KLN90BFailureSettings, 'INSTANCE', false));

describe('Failures', () => {
    it('defaults: nothing failed, MTBF off', () => {
        const {settings, failures} = build();
        for (const d of FAILURE_CATALOG) {
            expect(failures.isActive(d.key)).toBe(false);
            expect(settings.getSetting(failureSettingName(d.key)).get()).toBe('');
        }
        expect(failures.mtbfHours).toBe(0);
    });

    it('fail stores {} and publishes', () => {
        const {settings, failures} = build();
        failures.fail('arinc429Out');
        failures.fail('arinc429Out');

        expect(settings.getSetting('failure_arinc429Out').get()).toBe('{}');
        expect(events).toEqual([{key: 'arinc429Out', active: true}]);
    });

    it('repair and repairAll', () => {
        const {settings, failures} = build();
        failures.fail('arinc429Out');
        failures.fail('altitude');
        events.length = 0;

        failures.repair('arinc429Out');
        failures.repair('arinc429Out');
        expect(settings.getSetting('failure_arinc429Out').get()).toBe('');
        expect(events).toEqual([{key: 'arinc429Out', active: false}]);

        events.length = 0;
        failures.repairAll();
        expect(settings.getSetting('failure_altitude').get()).toBe('');
        expect(events).toEqual([{key: 'altitude', active: false}]);
    });

    it('an ineligible active failure is active but not effective', () => {
        const {failures} = build(DataInterface.ARINC429);
        failures.fail('rs232Out');

        expect(failures.isActive('rs232Out')).toBe(true);
        expect(failures.isEffective('rs232Out')).toBe(false);
        expect(failures.isOutputFailed('rs232Out')).toBe(false);
        expect(failures.activeList().map(d => d.key)).toContain('rs232Out');
        expect(failures.inactiveList().map(d => d.key)).not.toContain('rs232Out');
    });

    it('an inactive ineligible failure is in neither list of the FLR pages', () => {
        const {failures} = build(DataInterface.ARINC429);

        expect(failures.isActive('rs232Out')).toBe(false);
        expect(failures.inactiveList().map(d => d.key)).not.toContain('rs232Out');
        expect(failures.activeList().map(d => d.key)).not.toContain('rs232Out');
        expect(failures.inactiveList().map(d => d.key)).toContain('arinc429Out');
    });

    it('an ineligible active input failure does not fail the input', () => {
        const {failures} = build(DataInterface.ARINC429, s => { s.input.obsSource = 0; });
        failures.fail('obsResolver');
        expect(failures.isActive('obsResolver')).toBe(true);
        expect(failures.isInputFailed('obsResolver')).toBe(false);

        const eligible = build(DataInterface.ARINC429, s => { s.input.obsSource = 1; });
        eligible.failures.fail('obsResolver');
        expect(eligible.failures.isInputFailed('obsResolver')).toBe(true);
    });

    it('an effective failure fails its ports', () => {
        const {failures} = build(DataInterface.RS232);
        failures.fail('rs232Out');
        failures.fail('altitude');

        expect(failures.isOutputFailed('rs232Out')).toBe(true);
        expect(failures.isOutputFailed('arinc429Tx')).toBe(false);
        expect(failures.isInputFailed('grayCode')).toBe(true);
        expect(failures.isInputFailed('obsResolver')).toBe(false);
    });

    it('a stored value that is not JSON counts as active', () => {
        const {settings, failures} = build();
        settings.getSetting('failure_arinc429Out').set('x');

        expect(failures.isActive('arinc429Out')).toBe(true);
        expect(() => failures.isEffective('arinc429Out')).not.toThrow();
    });

    it('lists are sorted by FLR name', () => {
        const {failures} = build(DataInterface.ARINC429, s => { s.input.fuelComputer.isInterfaced = true; });
        failures.fail('rs232In');
        failures.fail('altitude');
        failures.fail('arinc429Out');

        expect(failures.activeList().map(d => d.flrName)).toEqual(['429 OUTPUT', 'ALTITUDE', 'RS-232 IN']);
        const inactive = failures.inactiveList().map(d => d.flrName);
        expect(inactive).toEqual([...inactive].sort());
    });

    it('randomCandidates are the eligible failures that are not active, in catalog order', () => {
        const {failures} = build();
        failures.fail('arinc429Out');

        expect(failures.randomCandidates().map(d => d.key)).toEqual(['obsResolver', 'altitude', 'eeprom', 'superflag']);
    });

    it('the MTBF is kept within 0 to 999 hours', () => {
        const {failures} = build();
        failures.setMtbfHours(50);
        expect(failures.mtbfHours).toBe(50);
        failures.setMtbfHours(5000);
        expect(failures.mtbfHours).toBe(999);
        failures.setMtbfHours(-3);
        expect(failures.mtbfHours).toBe(0);
    });

    describe('lampFault (#459)', () => {
        const msgOn = (s: KLN90PlaneSettings) => { s.output.externalAnnunciators.msgInstalled = true; };

        it('is null with nothing failed', () => {
            expect(build(DataInterface.ARINC429, msgOn).failures.lampFault('msg')).toBeNull();
        });

        it('a bulb or a wiring failure darkens the lamp', () => {
            const {failures} = build(DataInterface.ARINC429, msgOn);
            failures.fail('msgBulb');
            expect(failures.lampFault('msg')).toBe('dark');
            failures.repair('msgBulb');
            failures.fail('msgWiring');
            expect(failures.lampFault('msg')).toBe('dark');
        });

        it('a driver failure sticks the lamp on', () => {
            const {failures} = build(DataInterface.ARINC429, msgOn);
            failures.fail('msgDriver');
            expect(failures.lampFault('msg')).toBe('stuck');
        });

        it('a dark lamp wins over a stuck driver', () => {
            const {failures} = build(DataInterface.ARINC429, msgOn);
            failures.fail('msgBulb');
            failures.fail('msgDriver');
            expect(failures.lampFault('msg')).toBe('dark');
        });

        it('an undeclared lamp has no fault', () => {
            const {failures} = build();
            failures.fail('msgBulb');
            expect(failures.isActive('msgBulb')).toBe(true);
            expect(failures.lampFault('msg')).toBeNull();
        });

        it('the other lamps are not affected', () => {
            const {failures} = build(DataInterface.ARINC429, s => { msgOn(s); s.output.externalAnnunciators.wptInstalled = true; });
            failures.fail('msgBulb');
            failures.fail('msgDriver');
            expect(failures.lampFault('wpt')).toBeNull();
        });
    });
});
