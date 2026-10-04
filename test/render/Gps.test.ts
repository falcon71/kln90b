import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../harness/boot';
import {readRows} from '../harness/render/screen';
import {TimeStamp} from '../../kln90b/data/Time';

// The channels of the satellite computer stay null until the first onUpdate(), so "all non-null" means that acquisition
// runs. Not asserted: Acquiring, or isValid(), whose timing comes from the seeded random (and isValid() sits next to the
// end of the turn-on page).
describe('GPS acquisition starts at power-on (179d37d)', () => {
    // Spec 3-17: the time to first fix counts from power-on, not from the approval of the self-test page
    it('the satellite channels are searching while the turn-on page is still up', async () => {
        const unit = await bootUnit({engineRunning: false});
        const gps = unit.props.sensors.in.gps;
        expect(gps.gpsSatComputer.getChannels().every(c => c === null)).toBe(true);

        unit.send('KLN90B_Power_On');
        await vi.advanceTimersByTimeAsync(5000);

        // The welcome page is a seven-row full page, which Screen cannot read; this is its first row (PowerButton.test.ts)
        const welcome = readRows(document.querySelector('.full-page')!);
        expect(welcome[0].map(c => c.ch).join('')).toBe(' GPS             ORS 20');
        expect(gps.gpsSatComputer.getChannels().every(c => c !== null)).toBe(true);
    });
});

// The receiver sends only the week number modulo 1024, so the unit picks the era from the date it believes it is (the
// pilot-entered date, which Set2Page.saveDate stores in gps.timeZulu) and lands 1024 weeks off when that guess is wrong
// (Gps.calculateGPSTime). The default fake clock starts 2026-06-01T12:00:00Z.
describe('GPS week rollover (64c203d)', () => {
    const CLOCK_START = Date.UTC(2026, 5, 1, 12);

    async function acquireWithDate(userDate: number) {
        const unit = await bootUnit({coldGps: true});
        const gps = unit.props.sensors.in.gps;
        expect(gps.isValid()).toBe(false);
        gps.timeZulu = TimeStamp.create(userDate);
        // Not settle(): the era check runs at the acquisition tick, before the valid-state tick recalculates, so the loop
        // must stop at the first valid second
        for (let i = 0; i < 60 && !gps.isValid(); i++) {
            await vi.advanceTimersByTimeAsync(1000);
        }
        expect(gps.isValid()).toBe(true);
        return gps;
    }

    // The unit's time lags the clock by up to one calculation tick (measured 0.25 to 1 s)
    const TOLERANCE_MS = 1500;

    // characterization: the Pilot's Guide is silent on the rollover. 2006-10-16T12:00Z is the clock start minus 1024 weeks
    // (7168 days), so a date one era in the past is shifted by exactly one era: the sim time minus 1024 weeks.
    it('characterization: a date one era off makes the unit show the sim time minus 1024 weeks, right after acquisition and 5 s later', async () => {
        const gps = await acquireWithDate(Date.UTC(2006, 5, 1, 12));
        const expected = () => Date.UTC(2006, 9, 16, 12) + (Date.now() - CLOCK_START);

        // gpsAcquired
        expect(Math.abs(gps.timeZulu.getTimestamp() - expected())).toBeLessThan(TOLERANCE_MS);

        // The valid tick, which recalculates the era every second
        await vi.advanceTimersByTimeAsync(5000);
        expect(Math.abs(gps.timeZulu.getTimestamp() - expected())).toBeLessThan(TOLERANCE_MS);
    });

    // 3-53: the date comes from the satellite; a date in the right era is simply replaced by the sim time
    it('a date in the right era is replaced by the sim time', async () => {
        const gps = await acquireWithDate(Date.UTC(2026, 5, 1, 11));

        expect(Math.abs(gps.timeZulu.getTimestamp() - Date.now())).toBeLessThan(TOLERANCE_MS);
    });

    // characterization: era 2 began 2019-04-07T00:00Z (2048 weeks after 1980-01-06). A date half a day after it is in the
    // right era, so no shift; together with the case below it pins the epoch from both sides (an epoch a day later puts
    // this date before the boundary).
    it('characterization: a date just after the 2019 era boundary is in the right era', async () => {
        const gps = await acquireWithDate(Date.UTC(2019, 3, 7, 12));

        expect(Math.abs(gps.timeZulu.getTimestamp() - Date.now())).toBeLessThan(TOLERANCE_MS);
    });

    // characterization: half a day before the same boundary is the last half day of era 1, so the era is off by one and
    // the unit shows the sim time minus 1024 weeks. An epoch a day earlier, or rounding the era instead of flooring it,
    // moves this date into era 2.
    it('characterization: a date just before the 2019 era boundary is in the previous era', async () => {
        const gps = await acquireWithDate(Date.UTC(2019, 3, 6, 12));
        const ERA_MS = 1024 * 7 * 24 * 60 * 60 * 1000;

        expect(Math.abs(gps.timeZulu.getTimestamp() - (Date.now() - ERA_MS))).toBeLessThan(TOLERANCE_MS);
    });
});
