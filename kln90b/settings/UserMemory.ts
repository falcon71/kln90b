import {EventBus} from '@microsoft/msfs-sdk';
import {KLN90BUserSettings, KLN90BUserSettingsTypes} from "./KLN90BUserSettings";
import {KLN90BUserWaypointsSettings} from "./KLN90BUserWaypoints";
import {KLN90BUserFlightplansSettings} from "./KLN90BUserFlightplans";
import {KLN90BUserRemarkSettings} from "./KLN90BUserRemarkSettings";

/**
 * The user settings a loss of the battery-backed memory does not reset (#461), because they are not that memory:
 * userDataFormat says that the stored slots are V2, which is what the persistors write after a wipe as well, and
 * fastGpsAcquisition is the simulation's own SET 10 page
 */
export const KEPT_USER_SETTINGS: readonly (keyof KLN90BUserSettingsTypes)[] = ['userDataFormat', 'fastGpsAcquisition'];

/**
 * The stored part of a loss of the user memory at a power-on with the battery failed (B-2, #461): every user setting
 * goes back to its default except KEPT_USER_SETTINGS, and every slot of the user waypoints, the flight plans and the
 * remarks is emptied. The failure settings and the EEPROM (KLN90BFailureSettings, KLN90BEepromSettings) are not touched
 */
export function wipeStorage(userSettings: KLN90BUserSettings, bus: EventBus): void {
    for (const setting of userSettings.getAllSettings()) {
        if (!KEPT_USER_SETTINGS.includes(setting.definition.name as keyof KLN90BUserSettingsTypes)) {
            setting.resetToDefault();
        }
    }
    const slots = [KLN90BUserWaypointsSettings.getManager(bus), KLN90BUserFlightplansSettings.getManager(bus), KLN90BUserRemarkSettings.getManager(bus)];
    for (const manager of slots) {
        for (const setting of manager.getAllSettings()) {
            setting.set("");
        }
    }
}
