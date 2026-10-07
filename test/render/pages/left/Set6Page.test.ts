import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {storedSetting} from '../../../harness/storage';

describe('SET 6 page (characterization)', () => {
    it('shows turn anticipation enabled with the cursor off', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 6');

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')).toMatchInlineSnapshot(`
          [
            "   TURN    ",
            "ANTICIPATE ",
            "           ",
            "  ENABLE   ",
            "           ",
            "           ",
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

// 4-9, figure 4-36: SET 6 enables or disables turn anticipation with the left cursor and the left inner knob. The choice
// is the persisted setting turnAnticipation (CLAUDE.md "Public contract with aircraft": setting keys). What the setting
// does to the navigation is held in NavCalculator.test.ts.
describe('SET 6 turn anticipation (4-9)', () => {
    it('disables turn anticipation with the inner knob (4-9)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 6');
        expect(Screen.read().rows('L')[3].trim()).toBe('ENABLE');
        await unit.panel.cursor('L');

        await unit.panel.inner('L', 1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L')[3].trim()).toBe('DISABLE');
        expect(storedSetting(unit, 'turnAnticipation')).toBe(false);
        expect(unit.props.userSettings.getSetting('turnAnticipation').get()).toBe(false);
    });

    it('shows DISABLE on a unit booted with turn anticipation off (4-9)', async () => {
        const unit = await bootUnit({storage: {turnAnticipation: false}});
        await unit.panel.selectPage('L', 'SET 6');

        expect(Screen.read().rows('L')[3].trim()).toBe('DISABLE');
    });
});
