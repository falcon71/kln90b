import {AirportFacility, EventBus, FacilitySearchType, FSComponent} from "@microsoft/msfs-sdk";
import {WaypointSelector} from "./WaypointSelector";
import {KLNFacilityLoader} from "../../data/navdata/KLNFacilityLoader";


export class AirportSelector extends WaypointSelector<AirportFacility> {

    constructor(bus: EventBus, ident: string, facilityLoader: KLNFacilityLoader, changedCallback: (icao: AirportFacility | string) => void) {
        super(bus, ident, facilityLoader, 4, FacilitySearchType.Airport, changedCallback);
    }

}