import {Mock, vi} from 'vitest';

/**
 * Replaces Math.random with mulberry32, so the GPS clock jitter and the scan-list job ids repeat between runs.
 * @param seed
 * @returns the spy, which the teardown of a boot restores so that Math.random is the real one again
 */
export function seedRandom(seed: number): Mock<() => number> {
    let a = seed >>> 0;
    return vi.spyOn(Math, 'random').mockImplementation(() => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    });
}
