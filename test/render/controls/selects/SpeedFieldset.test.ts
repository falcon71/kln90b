import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {storedSetting} from '../../../harness/storage';

// SpeedFieldset: three digit cells, 000 to 999. Its host here is CAL 5, whose third field is the speed in knots
// (row 4) and fourth the speed in miles per hour (row 5), saved as the settings cal5SpeedKt and cal5SpeedMph. CAL 2,
// CAL 3, CAL 4, TRI 0, TRI 1, TRI 3 and TRI 5 use the same fieldset. A converted value of 1000 or more does not fit
// the three cells; what the real unit shows then is the question #257, so no test here reaches it.

/** CAL 5 with the left cursor on the hundreds of the speed in knots */
async function onKnots(kt: number, mph: number): Promise<HeadlessUnit> {
    const unit = await bootUnit({storage: {cal5TempC: 0, cal5TempF: 32, cal5SpeedKt: kt, cal5SpeedMph: mph}});
    await unit.panel.selectPage('L', 'CAL 5');
    await unit.panel.cursor('L');
    await unit.panel.outer('L', 6); // past the two temperatures, three cells each
    expect(unit.panel.focused('L')).toMatchObject({row: 4, col: 3});
    return unit;
}

describe('speed fieldset', () => {
    // 5-13 (figures 5-43, 5-44): the cursor goes over each digit of the knots; the three digits are three positions,
    // then the cursor goes on to the speed in miles per hour
    it('visits the three digits of the speed, then the next speed (5-13)', async () => {
        const unit = await onKnots(100, 115);
        const seen = [unit.panel.focused('L')];
        for (let i = 0; i < 3; i++) {
            await unit.panel.outer('L', 1);
            seen.push(unit.panel.focused('L'));
        }
        expect(seen).toEqual([
            {row: 4, col: 3, text: '1'}, {row: 4, col: 4, text: '0'}, {row: 4, col: 5, text: '0'},
            {row: 5, col: 3, text: '1'},
        ]);
    });

    // 5-13 (figures 5-43, 5-44): 100 kt turned digit by digit to 145 kt shows 167 mph (145 * 1852 / 1609.344 = 166.9).
    // The units first, so that a tens digit that overwrote the units would show.
    it('takes 145 kt digit by digit and shows 167 mph (5-13)', async () => {
        const unit = await onKnots(100, 115);
        await unit.panel.outer('L', 2);
        await unit.panel.inner('L', 5);
        await unit.panel.outer('L', -1);
        await unit.panel.inner('L', 4);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L').slice(4)).toEqual(['   145kt   ', '   167mph  ']);
        expect(storedSetting(unit, 'cal5SpeedKt')).toBe(145);
    });

    // 5-13: a speed the page converted into the field is the speed the field works with: after 145 kt gave 167 mph,
    // the units of the mph turned to 168 give 146 kt (168 * 1609.344 / 1852 = 146.0)
    it('takes a digit of the converted speed from the value it shows (5-13)', async () => {
        const unit = await onKnots(100, 115);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 4);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 5);
        expect(Screen.read().rows('L')[5]).toBe('   167mph  ');
        await unit.panel.outer('L', 3); // the units of the mph
        await unit.panel.inner('L', 1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L').slice(4)).toEqual(['   146kt   ', '   168mph  ']);
        expect(storedSetting(unit, 'cal5SpeedMph')).toBe(168);
    });

    // Checked in the KLN 89 trainer, 2026-10-08, T4: a digit at the end of its list wraps in both directions. The units
    // digit of 100 kt turned down one click is 9, and up one click is 0 again
    it('wraps the units digit of the speed (checked in the KLN 89 trainer, 2026-10-08, T4)', async () => {
        const unit = await onKnots(100, 115);
        await unit.panel.outer('L', 2);
        await unit.panel.inner('L', -1);
        expect(Screen.read().rows('L')[4]).toBe('   109kt   ');

        await unit.panel.inner('L', 1);
        expect(Screen.read().rows('L')[4]).toBe('   100kt   ');
    });

    // 5-13: the hundreds digit too: 145 kt to 245 kt is 282 mph (245 * 1852 / 1609.344 = 281.9)
    it('takes the hundreds digit: 245 kt shows 282 mph (5-13)', async () => {
        const unit = await onKnots(145, 166.86);
        await unit.panel.inner('L', 1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L').slice(4)).toEqual(['   245kt   ', '   282mph  ']);
        expect(storedSetting(unit, 'cal5SpeedKt')).toBe(245);
    });
});
