import {EventBus, FacilitySearchType, FSComponent, NdbFacility} from "@microsoft/msfs-sdk";
import {WaypointSelector} from "./WaypointSelector";
import {KLNFacilityLoader} from "../../data/navdata/KLNFacilityLoader";


export class NdbSelector extends WaypointSelector<NdbFacility> {

    constructor(bus: EventBus, ident: string, facilityLoader: KLNFacilityLoader, changedCallback: (icao: NdbFacility | string) => void) {
        super(bus, ident, facilityLoader, 3, FacilitySearchType.Ndb, changedCallback);
    }

}