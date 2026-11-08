import {describe, expect, it} from 'vitest';
import {EventBus, UserSetting} from '@microsoft/msfs-sdk';
import {KLN90BUserSettings} from '../../../kln90b/settings/KLN90BUserSettings';
import {KLN90BUserWaypointsSettings} from '../../../kln90b/settings/KLN90BUserWaypoints';
import {KLN90BUserFlightplansSettings} from '../../../kln90b/settings/KLN90BUserFlightplans';
import {KLN90BUserRemarkSettings} from '../../../kln90b/settings/KLN90BUserRemarkSettings';
import {KLN90BFailureSettings} from '../../../kln90b/settings/KLN90BFailureSettings';
import {KLN90BEepromSettings} from '../../../kln90b/settings/KLN90BEepromSettings';
import {KEPT_USER_SETTINGS, wipeStorage} from '../../../kln90b/settings/UserMemory';

/** A value of the setting's type that differs from its default */
function nonDefault(setting: UserSetting<any>): number | boolean | string {
    const def = setting.definition.defaultValue;
    switch (typeof def) {
        case 'number':
            return def + 7;
        case 'boolean':
            return !def;
        default:
            return `${def}X`;
    }
}

// Characterization of the design (docs/superpowers/specs/2026-11-08-failures-battery-design.md, "The wipe"): which
// stored keys a failed battery loses at the power-on, and which it does not reach
describe('wipeStorage (#461)', () => {
    it('resets every user setting but the kept ones, empties the slots and leaves the failure and EEPROM settings', () => {
        const bus = new EventBus();
        const userSettings = new KLN90BUserSettings(bus);
        const waypoints = KLN90BUserWaypointsSettings.getManager(bus);
        const flightplans = KLN90BUserFlightplansSettings.getManager(bus);
        const remarks = KLN90BUserRemarkSettings.getManager(bus);
        const failures = KLN90BFailureSettings.getManager(bus);
        const eeprom = KLN90BEepromSettings.getManager(bus);

        const written = new Map<string, number | boolean | string>();
        for (const setting of userSettings.getAllSettings()) {
            const value = nonDefault(setting);
            setting.set(value);
            written.set(setting.definition.name, value);
        }
        waypoints.getSetting('wpt3').set('UXX        USR1    +4700.00+00800.00');
        flightplans.getSetting('fpl1').set('VXX        ABC     ');
        remarks.getSetting('rmk7').set('KAAALINE ONE   LINE TWO   LINE THREE ');
        failures.getSetting('failure_battery').set('{}');
        failures.getSetting('batteryHealth').set(12.5);
        eeprom.getSetting('eepromDbarCalPlus').set(3);

        wipeStorage(userSettings, bus);

        for (const setting of userSettings.getAllSettings()) {
            const name = setting.definition.name;
            if (KEPT_USER_SETTINGS.includes(name as any)) {
                continue;
            }
            expect(setting.get(), name).toBe(setting.definition.defaultValue);
        }
        expect(userSettings.getSetting('userDataFormat').get()).toBe(written.get('userDataFormat'));
        expect(userSettings.getSetting('fastGpsAcquisition').get()).toBe(written.get('fastGpsAcquisition'));
        expect(waypoints.getSetting('wpt3').get()).toBe('');
        expect(flightplans.getSetting('fpl1').get()).toBe('');
        expect(remarks.getSetting('rmk7').get()).toBe('');
        expect(failures.getSetting('failure_battery').get()).toBe('{}');
        expect(failures.getSetting('batteryHealth').get()).toBe(12.5);
        expect(eeprom.getSetting('eepromDbarCalPlus').get()).toBe(3);
    });

    it('keeps exactly userDataFormat and fastGpsAcquisition', () => {
        expect([...KEPT_USER_SETTINGS]).toEqual(['userDataFormat', 'fastGpsAcquisition']);
    });
});
