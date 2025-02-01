import {ICAO, IcaoValue} from "@microsoft/msfs-sdk";

export const TEMPORARY_WAYPOINT = 'XY';
export const USER_WAYPOINT = 'XX';

/**
 * @deprecated use buildIcaoStruct
 * @param type
 * @param region
 * @param ident
 */
export function buildIcao(type: 'A' | 'W' | 'V' | 'N' | 'U', region: string, ident: string): string {
    return buildIcaoWithAirport(type, region, '    ', ident);
}

/**
 * @deprecated use buildIcaoStructWithAirport
 * @param type
 * @param region
 * @param airport
 * @param ident
 */
export function buildIcaoWithAirport(type: 'A' | 'W' | 'V' | 'N' | 'U', region: string, airport: string, ident: string): string {
    return type + region + airport + ident.padEnd(5, " ");
}

export function buildIcaoStruct(type: 'A' | 'W' | 'V' | 'N' | 'U', region: string, ident: string): IcaoValue {
    return buildIcaoStructWithAirport(type, region, '', ident);
}

export function buildIcaoStructIdentOnly(ident: string): IcaoValue {
    return buildIcaoStructWithAirport('', '', '', ident);
}

export function buildIcaoStructWithAirport(type: 'A' | 'W' | 'V' | 'N' | 'U' | '', region: string, airport: string, ident: string): IcaoValue {
    return ICAO.value(type, region, airport, ident);
}
