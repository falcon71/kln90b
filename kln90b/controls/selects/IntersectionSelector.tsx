import {EventBus, FacilityClient, FacilitySearchType, IntersectionFacility} from "@microsoft/msfs-sdk";
import {WaypointSelector} from "./WaypointSelector";


export class IntersectionSelector extends WaypointSelector<IntersectionFacility> {

    constructor(bus: EventBus, ident: string, facilityLoader: FacilityClient, changedCallback: (icao: IntersectionFacility | string) => void) {
        super(bus, ident, facilityLoader, 5, FacilitySearchType.Intersection, changedCallback);
    }

}