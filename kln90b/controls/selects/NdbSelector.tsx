import {EventBus, FacilityClient, FacilitySearchType, NdbFacility} from "@microsoft/msfs-sdk";
import {WaypointSelector} from "./WaypointSelector";


export class NdbSelector extends WaypointSelector<NdbFacility> {

    constructor(bus: EventBus, ident: string, facilityLoader: FacilityClient, changedCallback: (icao: NdbFacility | string) => void) {
        super(bus, ident, facilityLoader, 3, FacilitySearchType.Ndb, changedCallback);
    }

}