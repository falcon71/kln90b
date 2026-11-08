import {beforeEach, describe, expect, it} from 'vitest';
import {EventBus} from '@microsoft/msfs-sdk';
import {ageBattery, Battery, BATTERY_LOW_PERCENT} from '../../../kln90b/failures/Battery';
import {Failures} from '../../../kln90b/failures/Failures';
import {KLN90BFailureSettings} from '../../../kln90b/settings/KLN90BFailureSettings';
import {DataInterface, KLN90PlaneSettings, ObsInterface, RmiInterface} from '../../../kln90b/settings/KLN90BPlaneSettings';
import {clearStatic} from '../../harness/singletons';

const YEAR_S = 365.25 * 86400;
const DAY_S = 86400;
const NOW = 1_800_000_000;

describe('ageBattery', () => {
    it('the first session installs a full battery', () => {
        expect(ageBattery(100, 0, NOW, () => 0)).toEqual({health: 100, lastDateS: NOW});
    });

    it('a year at the slowest rate costs a fifth', () => {
        const r = ageBattery(100, NOW - YEAR_S, NOW, () => 0);
        expect(r.health).toBeCloseTo(80, 6);
        expect(r.lastDateS).toBe(NOW);
    });

    it('a year at the fastest rate costs a third', () => {
        expect(ageBattery(100, NOW - YEAR_S, NOW, () => 0.999999).health).toBeCloseTo(66.67, 1);
    });

    it('half a year at the slowest rate costs a tenth', () => {
        expect(ageBattery(100, NOW - YEAR_S / 2, NOW, () => 0).health).toBeCloseTo(90, 6);
    });

    it('a date set back or equal changes nothing', () => {
        expect(ageBattery(50, NOW + DAY_S, NOW, () => 0)).toEqual({health: 50, lastDateS: NOW + DAY_S});
        expect(ageBattery(50, NOW, NOW, () => 0)).toEqual({health: 50, lastDateS: NOW});
    });

    it('ten years empty the battery', () => {
        expect(ageBattery(100, NOW - 10 * YEAR_S, NOW, () => 0.5).health).toBe(0);
    });

    it('the charge never goes below 0', () => {
        expect(ageBattery(0.5, NOW - DAY_S, NOW, () => 0.999999).health).toBeGreaterThanOrEqual(0);
        expect(ageBattery(0.001, NOW - YEAR_S, NOW, () => 0).health).toBe(0);
    });
});

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

describe('Battery', () => {
    let settings: ReturnType<typeof KLN90BFailureSettings.getManager>;
    let failures: Failures;
    let battery: Battery;

    beforeEach(() => {
        clearStatic(KLN90BFailureSettings, 'INSTANCE', false);
        const bus = new EventBus();
        settings = KLN90BFailureSettings.getManager(bus);
        failures = new Failures(bus, settings, plane());
        battery = new Battery(settings, failures);
    });

    const setHealth = (h: number) => settings.getSetting('batteryHealth').set(h);

    it.each([[100, 100], [42.01, 43], [0.001, 1], [0, 0]])('displayPercent of %s is %s', (health, shown) => {
        setHealth(health);
        expect(battery.displayPercent).toBe(shown);
    });

    it('a fresh battery is full and not low', () => {
        expect(battery.health).toBe(100);
        expect(battery.isLow).toBe(false);
    });

    it('isLow at the threshold, not above it', () => {
        setHealth(1.51);
        expect(battery.isLow).toBe(false);
        setHealth(BATTERY_LOW_PERCENT);
        expect(battery.isLow).toBe(true);
    });

    it('a failed battery is low at any charge', () => {
        failures.fail('battery');
        expect(battery.health).toBe(100);
        expect(battery.isLow).toBe(true);
    });

    it('age stores the date and the charge', () => {
        battery.age(NOW, () => 0);
        expect(settings.getSetting('batteryDate').get()).toBe(NOW);
        battery.age(NOW + YEAR_S, () => 0);
        expect(battery.health).toBeCloseTo(80, 6);
    });

    it('service restores the charge and keeps the date', () => {
        setHealth(3.2);
        settings.getSetting('batteryDate').set(NOW);
        battery.service();
        expect(battery.health).toBe(100);
        expect(settings.getSetting('batteryDate').get()).toBe(NOW);
    });
});
