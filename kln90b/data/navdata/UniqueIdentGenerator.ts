import {FacilityClient, FacilitySearchType} from "@microsoft/msfs-sdk";
import {format} from "numerable";

/**
 * Generates a unique ident and uses alphabet letters at the end. Null if no unique ident was found
 * @param ident
 * @param facilityLoader
 */
export async function getUniqueIdent(ident: string, facilityLoader: FacilityClient): Promise<string | null> {
    const start = ident.substring(0, 4);
    const existing = await facilityLoader.searchByIdentWithIcaoStructs(FacilitySearchType.All, start, 100);
    const SUFFIXES = ['', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
    const existingIdents = existing.map(i => i.ident);
    for (const suffix of SUFFIXES) {
        if (!existingIdents.includes(start + suffix)) {
            return start + suffix;
        }
    }
    return null;
}

/**
 * Generates a unique ident, but with numbers at the end
 * @param ident Expects as VOR with three letters
 * @param facilityLoader
 */
export async function getUniqueIdentWithNumbers(ident: string, facilityLoader: FacilityClient): Promise<string | null> {
    const start = ident;
    const existing = await facilityLoader.searchByIdentWithIcaoStructs(FacilitySearchType.All, start, 100);
    const existingIdents = existing.map(i => i.ident);
    for (let i = 0; i < 100; i++) {
        const checkIdent = start + format(i, "00");
        if (!existingIdents.includes(checkIdent)) {
            return checkIdent;
        }
    }
    return null;
}