/**
 * The map scales of NAV 5 and Super NAV 5 in NM. 3-35 gives only the end points, 1 and 1000 NM; the steps between them
 * are those of the AVsoftech KLN 90B trainer (unreliable), which the maintainer adopted (#236). Figure 6-15 (on 6-9)
 * shows the 7 NM scale.
 */
export const MAP_RANGES: readonly number[] = [1, 2, 3, 5, 7, 10, 15, 20, 30, 40, 60, 80, 120, 160, 240, 320, 480, 640, 1000];

/** The default of the settings nav5MapRange and superNav5MapRange (KLN90BUserSettings) */
export const DEFAULT_MAP_RANGE = 40;

/**
 * #236: a range saved by a version with another list (25 or 100 NM) is not in MAP_RANGES and becomes the default, so
 * that the field shows a value and the map is drawn at the scale it shows
 */
export function knownMapRange(range: number): number {
    return MAP_RANGES.includes(range) ? range : DEFAULT_MAP_RANGE;
}
