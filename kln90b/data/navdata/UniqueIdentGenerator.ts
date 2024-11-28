import {FacilityClient, FacilitySearchType, ICAO} from "@microsoft/msfs-sdk";

export async function getUniqueIdent(ident: string, facilityLoader: FacilityClient): Promise<string | null> {
    const start = ident.substring(0, 4);
    const existing = await facilityLoader.searchByIdent(FacilitySearchType.All, start, 100);
    const SUFFIXES = ['', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
    const existingIdents = existing.map(ICAO.getIdentFromStringV1);
    for (const suffix of SUFFIXES) {
        if (!existingIdents.includes(start + suffix)) {
            return start + suffix;
        }
    }
    return null;
}