import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {storedSetting} from '../../../harness/storage';

// FpmFieldset: four digit cells for a rate in feet per minute, of which the cursor reaches the thousands and the
// hundreds. Its only host is CAL 4: GS on row 2 (three cells), FPM on row 3, ANGLE on row 4; the values are
// the settings cal4GS, cal4Fpm and cal4Angle.

/** CAL 4 with the left cursor on the thousands of FPM */
async function onFpm(storage: Record<string, unknown>): Promise<HeadlessUnit> {
    const unit = await bootUnit({storage});
    await unit.panel.selectPage('L', 'CAL 4');
    await unit.panel.cursor('L');
    await unit.panel.outer('L', 3); // past the three GS digits
    expect(unit.panel.focused('L')).toMatchObject({row: 3, col: 7});
    return unit;
}

const FIG_5_40 = {cal4GS: 160, cal4Fpm: 800, cal4Angle: 2.8};

describe('fpm fieldset', () => {
    // 5-12 (figures 5-40, 5-41): the rate 0800 turned to 0500 with its hundreds digit gives the angle 1.8 at 160 kt
    it('takes 0500 from the hundreds digit and commits it (5-12)', async () => {
        const unit = await onFpm(FIG_5_40);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', -3);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L').slice(3, 5)).toEqual(['FPM:   0500', 'ANGLE: 1.8°']);
        expect(storedSetting(unit, 'cal4Fpm')).toBe(500);
    });

    // 5-12: the thousands digit: 0800 to 1800 ft/min at 160 kt is atan(1800 / 16203) = 6.3 degrees
    it('takes the thousands digit: 1800 gives 6.3 degrees at 160 kt (5-12)', async () => {
        const unit = await onFpm(FIG_5_40);
        await unit.panel.inner('L', 1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L').slice(3, 5)).toEqual(['FPM:   1800', 'ANGLE: 6.3°']);
        expect(storedSetting(unit, 'cal4Fpm')).toBe(1800);

        // then the hundreds keep the thousands: 1800 to 1500 is atan(1500 / 16203) = 5.3 degrees
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', -3);
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().rows('L').slice(3, 5)).toEqual(['FPM:   1500', 'ANGLE: 5.3°']);
        expect(storedSetting(unit, 'cal4Fpm')).toBe(1500);
    });

    // Checked in the KLN 89 trainer, 2026-10-08, T4: a digit at the end of its list wraps in both directions. The
    // hundreds digit of 0800 turned up two clicks is 0 (0000), and down one click is 9 (0900)
    it('wraps the hundreds digit of the rate (checked in the KLN 89 trainer, 2026-10-08, T4)', async () => {
        const unit = await onFpm(FIG_5_40);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 2);
        expect(Screen.read().rows('L')[3]).toBe('FPM:   0000');

        await unit.panel.inner('L', -1);
        expect(Screen.read().rows('L')[3]).toBe('FPM:   0900');
    });

    // The sibling of the pin below: after the angle 1.8 the field shows 0500, and its thousands digit set to 1 shows
    // 1500
    it('shows 1500 after an angle entry and the thousands digit set to 1 (5-12)', async () => {
        const unit = await onFpm(FIG_5_40);
        await unit.panel.outer('L', 2); // the units of the angle
        await unit.panel.inner('L', -1); // 2.8 -> 1.8
        expect(Screen.read().rows('L')[3]).toBe('FPM:   0500');
        await unit.panel.outer('L', -2); // back to the thousands of FPM
        await unit.panel.inner('L', 1);

        expect(Screen.read().rows('L')[3]).toBe('FPM:   1500');
    });

    // 5-12: the rate the field shows is the rate the page works with. After the angle set the field to 0500, the
    // thousands digit set to 1 must commit 1500, not 1800 rebuilt from the rate before the angle.
    it.fails('commits 1500 after an angle entry and the thousands digit set to 1 (5-12, #255)', async () => {
        const unit = await onFpm(FIG_5_40);
        await unit.panel.outer('L', 2);
        await unit.panel.inner('L', -1);
        await unit.panel.outer('L', -2);
        await unit.panel.inner('L', 1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(storedSetting(unit, 'cal4Fpm')).toBe(1500);
    });
});

describe('fpm fieldset (characterization)', () => {
    // The rate is shown with four digits, but the cursor visits only the thousands and the hundreds: it goes from the
    // hundreds straight to ANGLE, so the rate is entered in steps of 100 ft/min.
    it('skips the tens and the units of the rate (characterization)', async () => {
        const unit = await onFpm(FIG_5_40);
        const seen = [unit.panel.focused('L')];
        for (let i = 0; i < 2; i++) {
            await unit.panel.outer('L', 1);
            seen.push(unit.panel.focused('L'));
        }
        expect(seen).toEqual([{row: 3, col: 7, text: '0'}, {row: 3, col: 8, text: '8'}, {row: 4, col: 7, text: '2'}]);
    });
});
