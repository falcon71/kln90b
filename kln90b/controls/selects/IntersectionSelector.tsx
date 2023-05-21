import {EventBus, FacilitySearchType, FSComponent, IntersectionFacility} from "@microsoft/msfs-sdk";
import {WaypointSelector} from "./WaypointSelector";
import {KLNFacilityLoader} from "../../data/navdata/KLNFacilityLoader";


export class IntersectionSelector extends WaypointSelector<IntersectionFacility> {

    constructor(bus: EventBus, ident: string, facilityLoader: KLNFacilityLoader, changedCallback: (icao: IntersectionFacility | string) => void) {
        super(bus, ident, facilityLoader, 5, FacilitySearchType.Intersection, changedCallback);
    }

}