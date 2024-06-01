import {FacilitySearchType, ICAO} from "@microsoft/msfs-sdk";
import {KLNFacilityLoader} from "./KLNFacilityLoader";

export async function getUniqueIdent(ident: string, facilityLoader: KLNFacilityLoader): Promise<string | null> {
    const start = ident.substring(0, 4);
    const existing = await facilityLoader.searchByIdent(FacilitySearchType.All, start, 100);
    const SUFFIXES = ['', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
    const existingIdents = existing.map(ICAO.getIdent);
    for (const suffix of SUFFIXES) {
        if (!existingIdents.includes(start + suffix)) {
            return start + suffix;
        }
    }
    return null;
}