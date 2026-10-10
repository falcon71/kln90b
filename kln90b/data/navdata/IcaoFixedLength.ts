import {Facility} from "@microsoft/msfs-sdk";

export class IcaoFixedLength {

    /**
     Returns the ident with a fixed length of 5
     * @param facility
     */
    public static getIdentFromFacility(facility: Facility | null): string {
        if (facility === null) {
            return "     ";
        }
        return facility.icaoStruct.ident.padEnd(5, " ");
    }

    /**
     * Returns the ident of the "from" waypoint of a leg with a fixed length of 5. The ident is right-aligned, so that
     * the "d" of the pseudo-waypoint of a direct-to stands right in front of the arrow and forms the Direct To symbol
     * with it. 3-31, figure 3-97
     * @param facility
     */
    public static getFromIdentFromFacility(facility: Facility | null): string {
        if (facility !== null && facility.icaoStruct.ident === "d") {
            return "d".padStart(5, " ");
        }
        return IcaoFixedLength.getIdentFromFacility(facility);
    }
}