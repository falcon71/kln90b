import {vi} from 'vitest';

/**
 * Replaces Math.random with mulberry32, so the GPS clock jitter and the scan-list job ids repeat between runs.
 * @param seed
 */
export function seedRandom(seed: number): void {
    let a = seed >>> 0;
    vi.spyOn(Math, 'random').mockImplementation(() => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    });
}
