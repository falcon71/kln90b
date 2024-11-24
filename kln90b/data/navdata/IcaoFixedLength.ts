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
}