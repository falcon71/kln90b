import {EventBus, FacilitySearchType, FSComponent, VorFacility, VorType} from "@microsoft/msfs-sdk";
import {WaypointSelector} from "./WaypointSelector";
import {KLNFacilityLoader} from "../../data/navdata/KLNFacilityLoader";


export class VorSelector extends WaypointSelector<VorFacility> {

    constructor(bus: EventBus, ident: string, facilityLoader: KLNFacilityLoader, changedCallback: (icao: VorFacility | string) => void) {
        super(bus, ident, facilityLoader, 3, FacilitySearchType.Vor, changedCallback);
    }


    protected isValidResult(facility: VorFacility): boolean {
        return facility.type === VorType.VORDME || facility.type === VorType.DME || facility.type === VorType.VOR || facility.type === VorType.Unknown;
    }
}