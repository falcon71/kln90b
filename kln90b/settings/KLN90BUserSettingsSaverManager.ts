import {EventBus, UserSettingSaveManager} from '@microsoft/msfs-sdk';
import {KLN90BUserSettings} from "./KLN90BUserSettings";
import {KLN90BUserWaypointsSettings} from "./KLN90BUserWaypoints";
import {KLN90BUserFlightplansSettings} from "./KLN90BUserFlightplans";
import {KLN90BUserRemarkSettings} from "./KLN90BUserRemarkSettings";
import {KLN90BFailureSettings} from "./KLN90BFailureSettings";
import {KLN90BEepromSettings} from "./KLN90BEepromSettings";


export class KLN90BSettingSaveManager extends UserSettingSaveManager {

    constructor(bus: EventBus, userSettings: KLN90BUserSettings) {
        const klnUserWaypoints = KLN90BUserWaypointsSettings.getManager(bus);
        const klnUserFlightplans = KLN90BUserFlightplansSettings.getManager(bus);
        const klnUserRemarks = KLN90BUserRemarkSettings.getManager(bus);
        const klnFailures = KLN90BFailureSettings.getManager(bus);
        const klnEeprom = KLN90BEepromSettings.getManager(bus);
        const settings = userSettings.getAllSettings().concat(klnUserWaypoints.getAllSettings(), klnUserFlightplans.getAllSettings(), klnUserRemarks.getAllSettings(), klnFailures.getAllSettings(), klnEeprom.getAllSettings());

        super(settings, bus);
    }
}