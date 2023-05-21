import {EventBus, FacilitySearchType, FSComponent, UserFacility} from "@microsoft/msfs-sdk";
import {WaypointSelector} from "./WaypointSelector";
import {KLNFacilityLoader} from "../../data/navdata/KLNFacilityLoader";


export class SupplementarySelector extends WaypointSelector<UserFacility> {

    constructor(bus: EventBus, ident: string, facilityLoader: KLNFacilityLoader, changedCallback: (icao: UserFacility | string) => void) {
        super(bus, ident, facilityLoader, 5, FacilitySearchType.User, changedCallback);
    }

}