import type {HeadlessUnit} from './boot';

/**
 * The TRI and OTH figures the unit keeps over a power cycle are user settings (#192), read when a page is built. Sets
 * them the way the pages do, for a test whose subject is not the entry
 */
export interface TriFigures {
    tas?: number;
    windDirTrue?: number;
    windSpeed?: number;
    ff?: number;
    reserve?: number;
    tri5Fpl?: number;
    othReserve?: number;
}

const KEYS = {
    tas: 'triTas',
    windDirTrue: 'triWindDirTrue',
    windSpeed: 'triWindSpeed',
    ff: 'triFuelFlow',
    reserve: 'triReserve',
    tri5Fpl: 'tri5Fpl',
    othReserve: 'othReserve',
} as const;

export function setTriFigures(unit: HeadlessUnit, figures: TriFigures): void {
    for (const name of Object.keys(figures) as (keyof TriFigures)[]) {
        const value = figures[name];
        if (value !== undefined) {
            unit.props.userSettings.getSetting(KEYS[name]).set(value);
        }
    }
}
