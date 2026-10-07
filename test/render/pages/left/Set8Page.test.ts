import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {storedSetting} from '../../../harness/storage';

describe('SET 8 page (characterization)', () => {
    it('shows the alert enabled with the default buffer and the cursor off', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 8');
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')).toMatchInlineSnapshot(`
          [
            " AIRSPACE  ",
            "  ALERT    ",
            "  ENABLE   ",
            "           ",
            "VERT BUFFER",
            "   ±00500ft",
          ]
        `);
        expect(Screen.read().maskRows('L')).toMatchInlineSnapshot(`
          [
            "...........",
            "...........",
            "...........",
            "...........",
            "...........",
            "...........",
          ]
        `);
    });
});

// 3-41: SET 8 enables or disables the special use airspace alert, and with the alert enabled it sets a vertical buffer
// in steps of 100 ft. Both are persisted settings, airspaceAlertEnabled and airspaceAlertBuffer (CLAUDE.md "Public
// contract with aircraft": setting keys). What the settings do to the alert is held in AirspaceAlert.test.ts.
describe('SET 8 airspace alert (3-41)', () => {
    // Figure 3-129: with the alert disabled the page shows no buffer
    it('hides the buffer when the alert is disabled (3-41)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 8');
        await unit.panel.cursor('L');

        await unit.panel.inner('L', 1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L').map(r => r.trim())).toEqual(['AIRSPACE', 'ALERT', 'DISABLE', '', '', '']);
        expect(storedSetting(unit, 'airspaceAlertEnabled')).toBe(false);
    });

    // Figures 3-131 and 3-132: the outer knob moves the cursor over the buffer digits, and the inner knob sets each one;
    // 00500 becomes 01000 with the thousands digit 1 and the hundreds digit 0
    it('sets the buffer digit by digit (3-41)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 8');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 2); // the thousands digit
        await unit.panel.inner('L', 1);
        await unit.panel.outer('L', 1); // the hundreds digit
        await unit.panel.inner('L', -5);
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')[5]).toBe('   ±01000ft');
        expect(storedSetting(unit, 'airspaceAlertBuffer')).toBe(1000);
    });

    // The buffer is set in steps of 100 ft: the cursor visits the ten thousands, thousands and hundreds digits (columns 4
    // to 6) and never the tens or the units (columns 7 and 8), whether the outer knob wraps at the last field or stops
    // there (#218). A click on the hundreds digit changes the buffer by 100 ft.
    it('steps the buffer by 100 ft and never puts the cursor on the tens or the units (3-41)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 8');
        await unit.panel.cursor('L');

        const visited: string[] = [];
        const step = async () => {
            await unit.panel.outer('L', 1);
            const f = unit.panel.focused('L');
            visited.push(`${f.row}:${f.col}`);
        };
        for (let i = 0; i < 3; i++) await step();
        await unit.panel.inner('L', 1); // on the hundreds digit
        await vi.advanceTimersByTimeAsync(1000);
        expect(storedSetting(unit, 'airspaceAlertBuffer')).toBe(600);
        for (let i = 0; i < 5; i++) await step();

        expect(visited.slice(0, 3)).toEqual(['5:4', '5:5', '5:6']);
        expect(visited.filter(v => v === '5:7' || v === '5:8')).toEqual([]);
    });
});
