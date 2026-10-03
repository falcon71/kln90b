type Family = 'angle' | 'length' | 'speed' | 'time' | 'scalar';

/**
 * The units the instrument and the harness use, as [family, factor to the family's base unit]. A pair outside this
 * table cannot be converted, so a unit typo in the code under test is reported instead of reading a silent number.
 */
const UNITS: Record<string, [Family, number]> = {
    'degrees': ['angle', 1], 'degree': ['angle', 1],
    'radians': ['angle', 180 / Math.PI], 'radian': ['angle', 180 / Math.PI],
    'meters': ['length', 1], 'meter': ['length', 1], 'feet': ['length', 0.3048], 'foot': ['length', 0.3048],
    'nautical mile': ['length', 1852], 'nautical miles': ['length', 1852],
    'knots': ['speed', 1852 / 3600], 'knot': ['speed', 1852 / 3600], 'meters per second': ['speed', 1],
    'feet per minute': ['speed', 0.3048 / 60],
    'seconds': ['time', 1], 'hours': ['time', 3600],
    'number': ['scalar', 1], 'bool': ['scalar', 1], 'boolean': ['scalar', 1], 'enum': ['scalar', 1],
};

export function normalizeUnit(unit: string): string {
    return unit.trim().toLowerCase();
}

/**
 * Converts a value between units. Identical unit names always pass through, so units outside the table work as long
 * as reader and writer agree.
 * @throws Error if the units are unknown or of different families
 */
export function convertUnit(value: number, from: string, to: string): number {
    const f = normalizeUnit(from);
    const t = normalizeUnit(to);
    if (f === t) {
        return value;
    }
    const a = UNITS[f];
    const b = UNITS[t];
    if (a === undefined || b === undefined || a[0] !== b[0]) {
        throw new Error(`FakeSim: cannot convert from "${from}" to "${to}"`);
    }
    return value * a[1] / b[1];
}
