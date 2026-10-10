import {describe, expect, it} from 'vitest';
import {bootToSelfTest, BootOptions, HeadlessUnit} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';

// The Database page (AiracPage), the last page of the start-up sequence after the approval of the Self Test page
// (3-7, 3-8). The VFR only page and the OBS warning before it are in VFROnlyPage.test.ts and ObsWarningPage.test.ts.

/** The fake clock's navdata cycle ends in June 2026 (DEFAULT_NAVDATA_RANGE): a start in July has an expired database */
const AFTER_CYCLE = new Date('2026-07-01T12:00:00Z');

/** Cold and dark, switched on, through the Turn-On page, then ENT on APPROVE? of the Self Test page */
async function approveSelfTestPage(opts: BootOptions = {}): Promise<HeadlessUnit> {
    const unit = await bootToSelfTest(opts);
    await unit.panel.cursorTo('R', 'APPROVE?');
    await unit.panel.ent();
    return unit;
}

describe('Database page (3-7)', () => {
    // 3-7 step 12, figure 3-24: line 2 says the data base expires, line 3 gives the date, and the cursor is on
    // ACKNOWLEDGE?. The status line shows the mode, a flashing ENT and CRSR on the right (figure 3-24; 3-10 for ENT).
    // Line 1 (the coverage area) and the year of line 3 (#199) are not asserted here.
    it('shows the expiry of a current data base with the cursor on ACKNOWLEDGE? (3-7)', async () => {
        const unit = await approveSelfTestPage();

        const rows = Screen.read().pageRows();
        expect(rows[1]).toBe('DATA BASE EXPIRES');
        expect(rows[2].startsWith('11 JUN')).toBe(true);
        expect(rows.slice(3)).toEqual(['', '', 'ACKNOWLEDGE?']);
        expect(Screen.read().inverse(5)).toBe('ACKNOWLEDGE?');
        expect(Screen.read().status()).toEqual({left: '', mode: 'enr-leg ent', right: 'CRSR'});
        expect(unit.errors).toEqual([]);
    });

    // 3-7 step 12, figure 3-25: an expired data base says EXPIRED, gives the date it expired, and adds that all data
    // must be confirmed before use
    it('shows the date an expired data base expired and the warning (3-7)', async () => {
        const unit = await approveSelfTestPage({start: AFTER_CYCLE, storage: {lastLatitude: 47, lastLongitude: 8}});

        const rows = Screen.read().pageRows();
        expect(rows[1]).toBe('DATA BASE EXPIRED');
        expect(rows[2].startsWith('11 JUN')).toBe(true);
        expect(rows.slice(3)).toEqual(['ALL DATA MUST BE', 'CONFIRMED BEFORE USE', 'ACKNOWLEDGE?']);
        expect(Screen.read().inverse(5)).toBe('ACKNOWLEDGE?');
        expect(unit.errors).toEqual([]);
    });

    // 3-7, figures 3-24 and 3-25: the date has a two-digit year. The sibling above holds the day and month.
    it.fails('shows the expiry date with a two-digit year (3-7, #199)', async () => {
        await approveSelfTestPage();

        expect(Screen.read().pageRows()[2]).toBe('11 JUN 26');
    });

    // 3-8: ENT on ACKNOWLEDGE? ends the start-up sequence; NAV 2 is shown on the left
    it('shows NAV 2 on the left after ACKNOWLEDGE? (3-7, 3-8)', async () => {
        const unit = await approveSelfTestPage();

        await unit.panel.ent();

        expect(Screen.read().status().left).toBe('NAV 2');
        expect(Screen.read().rows('L')[0]).toBe('PRESENT POS');
        expect(unit.errors).toEqual([]);
    });
});
