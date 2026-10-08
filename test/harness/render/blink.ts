import {vi} from 'vitest';
import {TICK_TIME_DISPLAY} from '../../../kln90b/TickController';
import {Mounted} from './mount';

/**
 * Reads the screen on four consecutive display ticks of a booted unit, one blink cycle (TickController raises `blink`
 * on every fourth display tick), so that a flashing cell is seen in both phases whatever the phase at the start. `read`
 * runs after each tick; the four results come back in order.
 */
export async function blinkCycle<T>(read: () => T): Promise<T[]> {
    const reads: T[] = [];
    for (let i = 0; i < 4; i++) {
        await vi.advanceTimersByTimeAsync(TICK_TIME_DISPLAY);
        reads.push(read());
    }
    return reads;
}

/** The same for a mounted control: four ticks, the fourth the blink tick, `read` after each */
export function mountedCycle<T>(m: Mounted, read: () => T): T[] {
    const reads: T[] = [];
    for (let i = 0; i < 4; i++) {
        m.tick(i === 3);
        reads.push(read());
    }
    return reads;
}
