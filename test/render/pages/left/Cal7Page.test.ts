import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {airport} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';
import {savedFlightplan} from '../../../harness/storage';

// FPL 0 runs from KAAA to KBBB (42 N, 88 W); the clock starts at 12:00 UTC on 1 June 2026 (06:00 CST). The rise and
// set times themselves are held at the unit stage (Sun.test.ts), so the tests here compare times with each other or
// with bounds.
const CST = 7;
const EST = 5;

async function cal7(storage: Record<string, unknown> = {}, start?: Date): Promise<HeadlessUnit> {
    const kaaa = airport('KAAA', 41.0, -87.0);
    const kbbb = airport('KBBB', 42.0, -88.0);
    const unit = await bootUnit({
        facilities: [kaaa, kbbb], position: {lat: 41.0, lon: -87.0}, start,
        storage: {...savedFlightplan(0, [kaaa, kbbb]), ...storage},
    });
    await settle(unit);
    await unit.panel.selectPage('L', 'CAL 7');
    return unit;
}

/** Minutes since midnight of a RISE or SET row, `RISE  hh:mm` */
const minutes = (row: string) => {
    const [h, m] = row.slice(6).split(':').map(Number);
    return h * 60 + m;
};

describe('CAL 7 page (characterization)', () => {
    // RISE and SET are left out: Sun.test.ts holds the times
    it('shows the destination of FPL 0, the date and the zone (characterization)', async () => {
        const unit = await cal7();
        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L').slice(0, 4)).toMatchInlineSnapshot(`
          [
            "SUNRISE/SET",
            "KBBB       ",
            "  01 JUN 26",
            "        UTC",
          ]
        `);
    });
});

describe('CAL 7 page (5-15)', () => {
    // 5-15, step 1: at its first view the waypoint is the destination, the date the current date and the zone the
    // system zone. 12:00 UTC is 06:00 CST on the same day
    it('defaults to the destination of FPL 0, today and the system zone (5-15)', async () => {
        await cal7({timezone: CST});
        expect(Screen.read().rows('L').slice(1, 4)).toEqual(['KBBB       ', '  01 JUN 26', '        CST']);
    });

    // 5-15, step 5 and figures 5-51 and 5-52: the times are shown in the selected zone; EST is an hour ahead of CST
    it('shows rise and set an hour later in EST than in CST (5-15)', async () => {
        const unit = await cal7({timezone: CST});
        const cst = Screen.read().rows('L');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 2);
        expect(unit.panel.focused('L')).toEqual({row: 3, col: 8, text: 'CST'});
        await unit.panel.inner('L', EST - CST);
        const est = Screen.read().rows('L');
        expect(est[3]).toBe('        EST');
        expect(minutes(est[4]) - minutes(cst[4])).toBe(60);
        expect(minutes(est[5]) - minutes(cst[5])).toBe(60);
    });

    // 5-15, step 4: a new date counts only once ENT is pressed. Source of the bound: the sunrise hour angle at 42 N,
    // computed by hand with the 0.83 deg of refraction and semidiameter: 112.6 deg on 1 June (declination +22.0) and
    // 84.1 deg on 1 March (-7.8), 114 min less half-day, plus 14.7 min from the equation of time (+2.2 and -12.5 min):
    // the March sunrise is about 129 min later
    it('changes rise and set only when the new date is entered with ENT (5-15)', async () => {
        const unit = await cal7();
        const before = Screen.read().rows('L');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1); // the editor opens on day 01
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 3); // the first click enters JAN, then FEB, MAR
        expect(Screen.read().rows('L')[2]).toBe('  01 MAR __');
        expect(Screen.read().rows('L').slice(4)).toEqual(before.slice(4)); // not yet entered

        await unit.panel.ent();
        const after = Screen.read().rows('L');
        expect(after[2]).toBe('  01 MAR 88'); // the year left blank is 1988 (#64, DateEditor.test.ts)
        const later = minutes(after[4]) - minutes(before[4]);
        expect(later).toBeGreaterThanOrEqual(115);
        expect(later).toBeLessThanOrEqual(140);
    });

    // 5-15: the date on the page is the date in the selected zone, and the times are those of that date. 02:00 UTC on
    // 04 MAR is 20:00 CST on 03 MAR. The expected rows are the ones the unit shows at 08:00 CST on 03 MAR (14:00 UTC),
    // where the UTC date and the zone date agree (read from the unit before the fix, KBBB at 42 N 88 W).
    it('computes rise and set for the date shown in the zone, in the evening when UTC is already on the next day (5-15, #166)', async () => {
        await cal7({timezone: CST}, new Date(Date.UTC(2026, 2, 4, 2, 0)));
        expect(Screen.read().rows('L').slice(2, 6)).toEqual(['  03 MAR 26', '        CST', 'RISE  06:24', 'SET   17:44']);
    });

    // 5-15, step 1: the date defaults to today. At 02:00 UTC on 04 MAR it is still the 3rd in CST, so the first use
    // in CST shows the 3rd
    it('opens on today in the system zone, which is the 3rd in CST when UTC is on the 4th (5-15, #390)', async () => {
        await cal7({timezone: CST}, new Date(Date.UTC(2026, 2, 4, 2, 0)));
        expect(Screen.read().rows('L').slice(2, 4)).toEqual(['  03 MAR 26', '        CST']);
    });

    // Checked in the KLN 89 trainer, 2026-10-17: a zone change on CAL 8 left the date row as it was and shifted the
    // times by the zone offset. The same on CAL 7: the date stays 04 MAR, and the times are those of 04 MAR in CST
    // (06:22 and 17:45 at KBBB), not those of 03 MAR (06:24, 17:44).
    it('keeps the date as shown when the zone changes and shows the times of that date (5-15, KLN 89 trainer 2026-10-17, #390)', async () => {
        const unit = await cal7({}, new Date(Date.UTC(2026, 2, 4, 2, 0)));
        expect(Screen.read().rows('L').slice(2, 4)).toEqual(['  04 MAR 26', '        UTC']);
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 2);
        expect(unit.panel.focused('L')).toEqual({row: 3, col: 8, text: 'UTC'});
        await unit.panel.inner('L', CST);
        expect(Screen.read().rows('L').slice(2, 6)).toEqual(['  04 MAR 26', '        CST', 'RISE  06:22', 'SET   17:45']);
    });

    // A return to the page builds it again from the memory; the date must not be converted into the zone again
    it('shows the same date when the page is left and shown again after a zone change (5-15, #390)', async () => {
        const unit = await cal7({}, new Date(Date.UTC(2026, 2, 4, 2, 0)));
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 2);
        await unit.panel.inner('L', CST);
        await unit.panel.cursor('L'); // cursor off
        await unit.panel.selectPage('L', 'CAL 6');
        await unit.panel.selectPage('L', 'CAL 7');
        expect(Screen.read().rows('L').slice(2, 6)).toEqual(['  04 MAR 26', '        CST', 'RISE  06:22', 'SET   17:45']);
    });
});
