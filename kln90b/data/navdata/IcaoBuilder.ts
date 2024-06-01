export const TEMPORARY_WAYPOINT = 'XY';
export const USER_WAYPOINT = 'XX';

export function buildIcao(type: 'A' | 'W' | 'V' | 'N' | 'U', region: string, ident: string): string {
    return buildIcaoWithAirport(type, region, '    ', ident);
}

export function buildIcaoWithAirport(type: 'A' | 'W' | 'V' | 'N' | 'U', region: string, airport: string, ident: string): string {
    return type + region + airport + ident.padEnd(5, " ");
}
