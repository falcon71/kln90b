import {Facility} from "@microsoft/msfs-sdk";

export class IcaoFixedLength {

    /**
     * Returns the icao code with a fixed length of 5
     * @param icao
     */
    public static getIdent(icao: string | null): string {
        if (icao === null) {
            return "     ";
        }
        return icao.substring(7);
    }

    /**
     Returns the icao code with a fixed length of 5
     * @param facility
     */
    public static getIdentFromFacility(facility: Facility | null): string {
        if (facility === null) {
            return "     ";
        }
        return this.getIdent(facility.icao);
    }
}