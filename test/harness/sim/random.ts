import {Mock, vi} from 'vitest';

/**
 * The mulberry32 generator, started at seed
 * @param seed
 * @returns a function that returns the next draw in [0, 1)
 */
export function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Replaces Math.random with mulberry32, so the GPS clock jitter and the scan-list job ids repeat between runs.
 * @param seed
 * @returns the spy, which the teardown of a boot restores so that Math.random is the real one again. bootUnit starts it
 * again from the seed with mockImplementation(mulberry32(seed)) once the user settings are built
 */
export function seedRandom(seed: number): Mock<() => number> {
    return vi.spyOn(Math, 'random').mockImplementation(mulberry32(seed));
}
