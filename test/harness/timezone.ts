import {simEnv} from './sim/install';

const HOUR = 3600 * 1000;

/**
 * Answers the sim's time zone call (GET_TIMEZONE_INFO, see TimezoneService.test.ts) for a zone of `standardHours` from
 * UTC that observes one hour of daylight saving time in the months `dstMonths` (0-based, UTC), or none. Without it the
 * call never resolves, like a sim with nothing attached, and APT 2 shows no time zone. The answer arrives
 * asynchronously, so advance the clock by a display tick after selecting the page. The teardown clears it.
 */
export function answerTimezone(standardHours: number, dstMonths: number[] = []): void {
    simEnv().coherent.replies.set('GET_TIMEZONE_INFO', (datum: unknown) => {
        const dst = dstMonths.includes(new Date(datum as number).getUTCMonth());
        return {utcOffset: (standardHours + (dst ? 1 : 0)) * HOUR, dstActive: dst};
    });
}
