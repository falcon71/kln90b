import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {legWorld} from '../../../harness/fixtures';
import {Screen} from '../../../harness/render/screen';
import {savedFlightplan} from '../../../harness/storage';

// AltitudeFieldset: five digit cells of an altitude in feet, of which the cursor reaches the ten-thousands, the
// thousands and the hundreds (entries in 100 ft steps). Hosts: CAL 1 and CAL 2 (IND, ALT), NAV 4 (SEL, and FR without
// an altitude input), SET 8 (the vertical buffer; Set8Page.test.ts holds its 100 ft steps, its cells and the
// read-only buffer of a disabled alert). The tests below use NAV 4 on the left: SEL on row 3, committed to the navPage
// memory nav4SelectedAltitude.

/** NAV 4 on the left in the leg world, 40 NM west of KDDD at 7500 ft, with the cursor on the first digit of SEL */
async function onSel(): Promise<HeadlessUnit> {
    const {kaaa, kddd, keee, west} = legWorld();
    const unit = await bootUnit({
        facilities: [kaaa, kddd, keee], position: west(40), altitudeFt: 7500,
        storage: savedFlightplan(0, [kaaa, kddd, keee]),
    });
    await settle(unit);
    await unit.panel.selectPage('L', 'NAV 4');
    await unit.panel.cursor('L');
    expect(unit.panel.focused('L')).toEqual({row: 3, col: 4, text: '0'});
    return unit;
}

describe('altitude fieldset on NAV 4 SEL', () => {
    // 5-7 step 3, 3-55 step 5: SEL is entered digit by digit in 100 ft increments: 12300 ft from 00000, the hundreds
    // first, so that a higher digit that overwrote the lower ones would show
    it('takes 12300 ft digit by digit, the hundreds first (3-55, 5-7)', async () => {
        const unit = await onSel();
        await unit.panel.outer('L', 2);
        await unit.panel.inner('L', 3);
        await unit.panel.outer('L', -1);
        await unit.panel.inner('L', 2);
        await unit.panel.outer('L', -1);
        await unit.panel.inner('L', 1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L')[3]).toBe('SEL:12300ft');
        expect(unit.props.memory.navPage.nav4SelectedAltitude).toBe(12300);
    });

    // 3-55 step 5: the ten-thousands digit keeps the lower digits: 02300 to 12300
    it('keeps the lower digits when the ten-thousands digit changes (3-55, 5-7)', async () => {
        const unit = await onSel();
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 2);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 3);
        await unit.panel.outer('L', -2);
        await unit.panel.inner('L', 1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L')[3]).toBe('SEL:12300ft');
        expect(unit.props.memory.navPage.nav4SelectedAltitude).toBe(12300);
    });

    // Checked in the KLN 89 trainer, 2026-10-08, T4: a digit at the end of its list wraps in both directions. The
    // hundreds digit of 00000 turned down one click is 9 (900 ft), and up one click is 0 again
    it('wraps the hundreds digit of the altitude (checked in the KLN 89 trainer, 2026-10-08, T4)', async () => {
        const unit = await onSel();
        await unit.panel.outer('L', 2);
        await unit.panel.inner('L', -1);
        expect(Screen.read().rows('L')[3]).toBe('SEL:00900ft');

        await unit.panel.inner('L', 1);
        expect(Screen.read().rows('L')[3]).toBe('SEL:00000ft');
    });
});

describe('altitude fieldset', () => {
    it('keeps the other digits when the hundreds digit changes (#54)', async () => {
        const unit = await bootUnit();
        // CAL 2, cursor on: the first digit of ALT is the third field
        await unit.panel.selectPage('L', 'CAL 2');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 3);
        await unit.panel.inner('L', 3);
        await unit.panel.outer('L', 2);
        await unit.panel.inner('L', 1);

        expect(unit.errors).toEqual([]);
        // 5-11: the altitude entered on CAL 2 is the one CAL 1 shows; editing the hundreds digit must keep the 10000s digit
        expect(unit.props.userSettings.getSetting('cal12IndicatedAltitude').get()).toBe(30100);

        // CAL 2's own row reads 30100 even with the bug, so look at the value CAL 1 shows
        await unit.panel.cursor('L');
        await unit.panel.inner('L', -1); // raw: changing the CAL subpage is the subject
        expect(unit.props.userSettings.getSetting('cal12IndicatedAltitude').get()).toBe(30100);
        expect(Screen.read().status().left).toBe('CAL 1');
        expect(Screen.read().rows('L')[1]).toBe('IND:30100ft');
    });
});
