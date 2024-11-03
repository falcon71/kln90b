import {AirportFacility, Facility, LegDefinition} from "@microsoft/msfs-sdk";
import {ArcData} from "../navdata/SidStar";

export class AccessUserData {
    public static getFacility(leg: LegDefinition): Facility {
        return leg.userData['facility'];
    }

    public static getArcData(leg: LegDefinition): ArcData {
        return leg.userData['arcData'];
    }

    public static getParentFacility(leg: LegDefinition): AirportFacility | null {
        return leg.userData['parentFacility'];
    }

}