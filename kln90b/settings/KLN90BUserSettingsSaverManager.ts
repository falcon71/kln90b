import {EventBus, UserSettingSaveManager} from '@microsoft/msfs-sdk';
import {KLN90BUserSettings} from "./KLN90BUserSettings";
import {KLN90BUserWaypointsSettings} from "./KLN90BUserWaypoints";
import {KLN90BUserFlightplansSettings} from "./KLN90BUserFlightplans";
import {KLN90BUserRemarkSettings} from "./KLN90BUserRemarkSettings";


export class KLN90BSettingSaveManager extends UserSettingSaveManager {

    constructor(bus: EventBus, userSettings: KLN90BUserSettings) {
        const klnUserWaypoints = KLN90BUserWaypointsSettings.getManager(bus);
        const klnUserFlightplans = KLN90BUserFlightplansSettings.getManager(bus);
        const klnUserRemarks = KLN90BUserRemarkSettings.getManager(bus);
        const settings = userSettings.getAllSettings().concat(klnUserWaypoints.getAllSettings(), klnUserFlightplans.getAllSettings(), klnUserRemarks.getAllSettings());

        super(settings, bus);
    }
}