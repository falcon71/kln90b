import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {storedSetting} from '../../../harness/storage';

describe('SET 7 page (characterization)', () => {
    it('shows inches with the cursor off', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 7');

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')).toMatchInlineSnapshot(`
          [
            " BARO SET  ",
            "  UNITS    ",
            "           ",
            "    "      ",
            "           ",
            "  INCHES   ",
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

// 5-10, figure 5-32: SET 7 selects inches of mercury (") or millibars (MB) for the altimeter setting of CAL 1, with the
// left cursor and the left inner knob. The choice is the persisted setting barounit, true for inches (CLAUDE.md "Public
// contract with aircraft": setting keys).
describe('SET 7 baro units (5-10)', () => {
    it('switches to millibars with the inner knob (5-10)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 7');
        await unit.panel.cursor('L');

        await unit.panel.inner('L', 1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L')[3].trim()).toBe('MB');
        expect(Screen.read().rows('L')[5].trim()).toBe('MILLIBARS');
        expect(storedSetting(unit, 'barounit')).toBe(false);
    });

    // 5-10: the unit chosen on SET 7 is the unit of the CAL 1 altimeter setting. CAL 1 keeps 29.92" (the persisted
    // cal12Barometer), which is 1013 MB (1 inHg = 33.8639 hPa, so 29.92 inHg = 1013.2 hPa, by hand).
    it('shows the CAL 1 altimeter setting in millibars (5-10)', async () => {
        const unit = await bootUnit({storage: {cal12Barometer: 29.92}});
        await unit.panel.selectPage('L', 'CAL 1');
        expect(Screen.read().rows('L')[2]).toBe('BARO:29.92"');
        await unit.panel.selectPage('L', 'SET 7');
        await unit.panel.cursor('L');
        await unit.panel.inner('L', 1);
        await unit.panel.cursor('L');

        await unit.panel.selectPage('L', 'CAL 1');
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')[2]).toBe('BARO:1013MB');
    });
});
