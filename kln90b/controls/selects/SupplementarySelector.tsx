import {EventBus, FacilityClient, FacilitySearchType, UserFacility} from "@microsoft/msfs-sdk";
import {WaypointSelector} from "./WaypointSelector";


export class SupplementarySelector extends WaypointSelector<UserFacility> {

    constructor(bus: EventBus, ident: string, facilityLoader: FacilityClient, changedCallback: (icao: UserFacility | string) => void) {
        super(bus, ident, facilityLoader, 5, FacilitySearchType.User, changedCallback);
    }

}