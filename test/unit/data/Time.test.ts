import {describe, expect, it} from 'vitest';
import {shortYearToLongYear, TimeStamp, TIMEZONES, UTC} from '../../../kln90b/data/Time';

const zone = (code: string) => TIMEZONES.find(t => t.code === code)!;

describe('time zones', () => {
    it('offers the time zones of the list on 3-5, in that order, with their UTC offsets', () => {
        // 3-5: the time zones the unit can display, each with its offset from UTC
        expect(TIMEZONES.map(t => [t.code, t.offset])).toEqual([
            ['UTC', 0], ['GST', -3], ['GDT', -2], ['ATS', -4], ['ATD', -3], ['EST', -5], ['EDT', -4], ['CST', -6],
            ['CDT', -5], ['MST', -7], ['MDT', -6], ['PST', -8], ['PDT', -7], ['AKS', -9], ['AKD', -8], ['HAS', -10],
            ['HAD', -9], ['SST', -11], ['SDT', -10],
        ]);
        expect(UTC).toBe(TIMEZONES[0]);
    });

    it('names the zones as CAL 6 shows them (5-14)', () => {
        // 5-14, figures 5-45 to 5-48: the second line under each time
        expect(zone('UTC').name).toBe('CORD UNIV/Z');
        expect(zone('CST').name).toBe('CENTRAL STD');
        expect(zone('PST').name).toBe('PACIFIC STD');
        expect(zone('EST').name).toBe('EASTERN STD');
    });

    it('names the other zones in 11 cells (characterization)', () => {
        expect(TIMEZONES.filter(t => !['UTC', 'CST', 'PST', 'EST'].includes(t.code)).map(t => t.name)).toEqual([
            'GREENL STD ', 'GREENL DAY ', 'ATLANT STD ', 'ATLANT DAY ', 'EASTERN DAY', 'CENTRAL DAY', 'MOUNT STD  ',
            'MOUNT DAY  ', 'PACIFIC DAY', 'ALASKA STD ', 'ALASKA DAY ', 'HAWAII STD ', 'HAWAII DAY ', 'SAMOA STD  ',
            'SAMOA DAY  ',
        ]);
    });
});

describe('TimeStamp', () => {
    it('converts the CAL 6 example: 09:56 PST is 17:56 UTC and 12:56 EST (5-14)', () => {
        // 5-14, figures 5-45 to 5-48. A TimeStamp holds the wall time of its zone in the UTC fields.
        const utc = TimeStamp.create(Date.UTC(1994, 7, 3, 17, 56));
        const pst = utc.atTimezone(zone('PST'));
        expect([pst.getHours(), pst.getMinutes(), pst.tz.code]).toEqual([9, 56, 'PST']);
        const est = pst.atTimezone(zone('EST'));
        expect([est.getHours(), est.getMinutes(), est.tz.code]).toEqual([12, 56, 'EST']);
        const back = est.atTimezone(UTC);
        expect(back.getTimestamp()).toBe(Date.UTC(1994, 7, 3, 17, 56));
        // figure 5-45: 11:56 CST is 17:56 UTC
        expect(TimeStamp.create(Date.UTC(1994, 7, 3, 11, 56), zone('CST')).atTimezone(UTC).getHours()).toBe(17);
    });

    it('rolls the date with the time zone (characterization)', () => {
        const utc = TimeStamp.create(Date.UTC(1994, 7, 3, 2, 30));
        const cst = utc.atTimezone(zone('CST'));
        expect([cst.getDate(), cst.getHours(), cst.getMinutes()]).toEqual([2, 20, 30]);
    });

    it('withDate keeps the time of day and the zone (characterization)', () => {
        const t = TimeStamp.create(Date.UTC(1994, 7, 3, 8, 10, 14), zone('CST'));
        const moved = t.withDate(2026, 0, 31);
        expect(moved.getTimestamp()).toBe(Date.UTC(2026, 0, 31, 8, 10, 14));
        expect(moved.tz.code).toBe('CST');
    });

    it('withTime keeps the date and the seconds (characterization)', () => {
        const t = TimeStamp.create(Date.UTC(1994, 7, 3, 8, 10, 14, 500));
        expect(t.withTime(23, 5).getTimestamp()).toBe(Date.UTC(1994, 7, 3, 23, 5, 14, 500));
    });

    it('addSeconds and getSecondsSinceMidnight count seconds (characterization)', () => {
        const t = TimeStamp.create(Date.UTC(1994, 7, 3, 23, 59, 30));
        expect(t.getSecondsSinceMidnight()).toBe(23 * 3600 + 59 * 60 + 30);
        const later = t.addSeconds(45);
        expect([later.getDate(), later.getHours(), later.getMinutes(), later.getSeconds()]).toEqual([4, 0, 0, 15]);
        expect(t.getSeconds()).toBe(30); // addSeconds returns a new stamp
    });

    it('createDate and createTime fill the fields they are given (characterization)', () => {
        const d = TimeStamp.createDate(1989, 2, 10, zone('EST'));
        expect([d.getYear(), d.getMonth(), d.getDate(), d.getHours(), d.tz.code]).toEqual([1989, 2, 10, 0, 'EST']);
        const t = TimeStamp.createTime(14, 7);
        expect([t.getHours(), t.getMinutes(), t.tz]).toEqual([14, 7, UTC]);
    });
});

describe('two-digit years', () => {
    it('reads 00 to 87 as 2000 to 2087', () => {
        // 5-15: the dates run until 31 December 2087
        expect(shortYearToLongYear(0)).toBe(2000);
        expect(shortYearToLongYear(87)).toBe(2087);
    });

    it('reads 88 to 99 as 1988 to 1999 (characterization)', () => {
        expect(shortYearToLongYear(88)).toBe(1988);
        expect(shortYearToLongYear(99)).toBe(1999);
    });
});
