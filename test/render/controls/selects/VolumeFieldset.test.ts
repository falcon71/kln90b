import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {storedSetting} from '../../../harness/storage';

// VolumeFieldset: the alert volume 00 to 99 in two digit cells. Its only host is SET 9 (3-57), row 4, saved as the
// setting altAlertVolume. SelectField.test.ts holds the generic rules of a cell on the same page (wrap, keyboard, CLR,
// ENT); Set9Page.test.ts holds the page with the alert disabled.

describe('volume fieldset', () => {
    // 3-57 (figure 3-181): the two digits are two cursor positions; the outer knob comes back to the tens
    it('visits the tens and the units of the volume (3-57)', async () => {
        const unit = await bootUnit({storage: {altAlertVolume: 37}});
        await unit.panel.selectPage('L', 'SET 9');
        await unit.panel.cursor('L');
        const seen = [unit.panel.focused('L')];
        for (let i = 0; i < 2; i++) {
            await unit.panel.outer('L', 1);
            seen.push(unit.panel.focused('L'));
        }

        expect(seen).toEqual([{row: 4, col: 4, text: '3'}, {row: 4, col: 5, text: '7'}, {row: 4, col: 4, text: '3'}]);
    });

    // 3-57: a volume between 00 and 99, digit by digit: 37 to 52, the units first so that a tens digit that overwrote
    // the units would show
    it('takes 52 digit by digit (3-57)', async () => {
        const unit = await bootUnit({storage: {altAlertVolume: 37}});
        await unit.panel.selectPage('L', 'SET 9');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', -5);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 2);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L')[4]).toBe('    52     ');
        expect(storedSetting(unit, 'altAlertVolume')).toBe(52);

        // and the units keep the tens: 53
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(storedSetting(unit, 'altAlertVolume')).toBe(53);
    });

    // Checked in the KLN 89 trainer, 2026-10-08, T4: a digit at the end of its list wraps in both directions. The units
    // digit of 37 turned up 3 clicks is 0 (30), and down one click is 9 (39)
    it('wraps the units digit of the volume (checked in the KLN 89 trainer, 2026-10-08, T4)', async () => {
        const unit = await bootUnit({storage: {altAlertVolume: 37}});
        await unit.panel.selectPage('L', 'SET 9');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 3);
        expect(Screen.read().rows('L')[4]).toBe('    30     ');

        await unit.panel.inner('L', -1);
        expect(Screen.read().rows('L')[4]).toBe('    39     ');
    });

    // 3-57: 00 is the lowest volume and a valid entry
    it('takes the lowest volume 00 (3-57)', async () => {
        const unit = await bootUnit({storage: {altAlertVolume: 10}});
        await unit.panel.selectPage('L', 'SET 9');
        await unit.panel.cursor('L');
        await unit.panel.inner('L', -1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L')[4]).toBe('    00     ');
        expect(storedSetting(unit, 'altAlertVolume')).toBe(0);
    });
});
