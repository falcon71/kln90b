import {describe, expect, it} from 'vitest';
import {calculateSunrise, calculateSunset} from '../../../kln90b/data/Sun';
import {TimeStamp, TIMEZONES, UTC} from '../../../kln90b/data/Time';

// Expected values from the U.S. Naval Observatory, Astronomical Applications Department, "Sun and Moon rise/set
// for one day" (API 4.0.1, fetched 2026-10-06), https://aa.usno.navy.mil/api/rstt/oneday?date=<date>&coords=<lat>,<lon>&tz=0
// USNO defines rise and set by the standard zenith of 90 deg 50 min (refraction plus the sun's semidiameter) and
// rounds to the minute. The algorithm in Sun.ts (edwilliams.org, the Almanac for Computers) is good to about a
// minute, so the full-precision result is held within 90 s of the published minute: 30 s of rounding plus 60 s.
const STANDARD_ZENITH = 90 + 50 / 60;
const TOLERANCE_S = 90;

const CST = TIMEZONES.find(t => t.code === 'CST')!;
const EST = TIMEZONES.find(t => t.code === 'EST')!;

function secondsOfDay(t: TimeStamp): number {
    return t.getHours() * 3600 + t.getMinutes() * 60 + t.getSeconds();
}

/** |a - b| in seconds of the day, across midnight. */
function offBy(t: TimeStamp, hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    const d = Math.abs(secondsOfDay(t) - (h * 3600 + m * 60)) % 86400;
    return Math.min(d, 86400 - d);
}

/** The time as the CAL 7 page shows it (TimeDisplay: getHours and getMinutes, two digits each). */
function shown(t: TimeStamp | null): string {
    return t === null ? '--:--' : `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
}

describe('sunrise and sunset at the standard zenith against the USNO almanac', () => {
    it.each([
        // place, lat, lon, y, m (0-based), d, USNO rise, USNO set (UTC)
        ['47 N 8 E, midsummer', 47, 8, 2024, 5, 21, '03:33', '19:27'],
        // the local morning rise is on the previous UTC day: the hour angle wraps below 0 h UTC
        ['34 S 151 E, southern midsummer', -34, 151, 2024, 11, 21, '18:42', '09:07'],
        // near the equinox at 60 N the rise moves 3 min a day, which holds the day of the year
        ['60 N 25 E, equinox', 60, 25, 2024, 2, 20, '04:21', '16:35'],
        ['60 N 25 E, a day later', 60, 25, 2024, 2, 21, '04:18', '16:38'],
    ] as const)('%s', (_name, lat, lon, y, m, d, rise, set) => {
        const date = TimeStamp.createDate(y, m, d);
        expect(offBy(calculateSunrise(date, {lat, lon}, STANDARD_ZENITH)!, rise)).toBeLessThanOrEqual(TOLERANCE_S);
        expect(offBy(calculateSunset(date, {lat, lon}, STANDARD_ZENITH)!, set)).toBeLessThanOrEqual(TOLERANCE_S);
    });

    it('has no rise and no set where USNO lists the sun continuously above or below the horizon (70 N 20 E)', () => {
        const pos = {lat: 70, lon: 20};
        for (const date of [TimeStamp.createDate(2024, 5, 21), TimeStamp.createDate(2024, 11, 21)]) {
            expect(calculateSunrise(date, pos)).toBeNull();
            expect(calculateSunset(date, pos)).toBeNull();
        }
    });
});

describe('CAL 7 figures (5-15)', () => {
    // 5-15, figures 5-50 to 5-52: the rise and set the real unit shows for KATL. The position is the airport's
    // reference point rounded to 0.01 deg, passed as coordinates. Figure 5-49 (KORD) is left out: no zenith and
    // neither truncation nor rounding reproduces both of its times.
    const ATL = {lat: 33.64, lon: -84.43};

    it.fails.each([
        ['03 MAR 89 CST', 2, 3, CST, '06:04', '17:35'],
        ['10 MAR 89 CST', 2, 10, CST, '05:55', '17:41'],
        ['10 MAR 89 EST', 2, 10, EST, '06:55', '18:41'],
    ] as const)('shows the figure times for %s with the default zenith (#164)', (_n, m, d, tz, rise, set) => {
        const date = TimeStamp.createDate(1989, m, d);
        expect(shown(calculateSunrise(date, ATL)?.atTimezone(tz) ?? null)).toBe(rise);
        expect(shown(calculateSunset(date, ATL)?.atTimezone(tz) ?? null)).toBe(set);
    });
});

describe('what the sunrise depends on', () => {
    const ORD = {lat: 41.98, lon: -87.90};
    // The same calendar day, 03 MAR 1989, 59 s apart (UTC), and at 08:00 and 20:00 on the clock of CST.
    const noon = TimeStamp.create(Date.UTC(1989, 2, 3, 12, 0, 0));
    const noonPlus59s = TimeStamp.create(Date.UTC(1989, 2, 3, 12, 0, 59));
    const morning = TimeStamp.create(Date.UTC(1989, 2, 3, 8, 0, 0), CST);
    const evening = TimeStamp.create(Date.UTC(1989, 2, 3, 20, 0, 0), CST);

    it('is given two dates 59 s apart that fall on one UTC day, and two CST stamps on one CST day', () => {
        // the preconditions of the two pins below
        expect(noonPlus59s.getTimestamp() - noon.getTimestamp()).toBe(59_000);
        expect([noon.getDate(), noonPlus59s.getDate()]).toEqual([3, 3]);
        // 20:00 CST on 03 MAR is 02:00 UTC on 04 MAR
        expect([morning.getDate(), evening.getDate()]).toEqual([3, 3]);
        expect([morning.atTimezone(UTC).getDate(), evening.atTimezone(UTC).getDate()]).toEqual([3, 4]);
    });

    // 5-15: CAL 7 gives the times for a waypoint and a date. The second at which the date was taken is not an input.
    it.fails('does not depend on the seconds of the date it is given (#165)', () => {
        expect(calculateSunrise(noonPlus59s, ORD)!.getTimestamp()).toBe(calculateSunrise(noon, ORD)!.getTimestamp());
    });

    // 5-15: the date on CAL 7 is shown in the selected time zone, and the rise is for that date.
    it.fails('uses the calendar date in the zone of the stamp, not the UTC date (#166)', () => {
        expect(shown(calculateSunrise(evening, ORD)!.atTimezone(CST))).toBe(shown(calculateSunrise(morning, ORD)!.atTimezone(CST)));
    });
});
