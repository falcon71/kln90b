import {AirportFacility, EventBus, FacilityClient, FacilitySearchType} from "@microsoft/msfs-sdk";
import {WaypointSelector} from "./WaypointSelector";


export class AirportSelector extends WaypointSelector<AirportFacility> {

    constructor(bus: EventBus, ident: string, facilityLoader: FacilityClient, changedCallback: (icao: AirportFacility | string) => void) {
        super(bus, ident, facilityLoader, 4, FacilitySearchType.Airport, changedCallback);
    }

}