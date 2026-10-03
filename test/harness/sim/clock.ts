import {vi} from 'vitest';
import {simEnv} from './install';

export const DEFAULT_START = new Date('2026-06-01T12:00:00Z');
/** Navdata cycle containing DEFAULT_START, in the format of the game var FLIGHT NAVDATA DATE RANGE */
export const DEFAULT_NAVDATA_RANGE = 'MAY15JUN12/26';

/** Switches to Vitest fake timers. Every interval of the instrument then runs on simulated time. */
export function startFakeClock(start: Date = DEFAULT_START): void {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'requestAnimationFrame', 'cancelAnimationFrame']});
    vi.setSystemTime(start);
    simEnv().sim.startClock();
}
