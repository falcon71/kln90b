import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {storedSetting} from '../../../harness/storage';

describe('SET 4 page (characterization)', () => {
    it('shows the default flight timer operation with the cursor off', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 4');

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')).toMatchInlineSnapshot(`
          [
            "  FLIGHT   ",
            "  TIMER    ",
            " OPERATION ",
            "           ",
            "RUN WHEN   ",
            "GS > 30kt  ",
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

// 4-13, figure 4-54: SET 4 chooses whether the flight timer runs when the ground speed is above 30 kt or whenever the
// power is on; the left cursor and the left inner knob change it. The choice is the persisted setting flightTimer, true
// for power on (CLAUDE.md "Public contract with aircraft": setting keys).
describe('SET 4 flight timer operation (4-13)', () => {
    it('switches to RUN WHEN POWER IS ON with the inner knob (4-13)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 4');
        expect(Screen.read().rows('L').slice(4)).toEqual(['RUN WHEN   ', 'GS > 30kt  ']);
        await unit.panel.cursor('L');

        await unit.panel.inner('L', 1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L').slice(4)).toEqual(['RUN WHEN   ', 'POWER IS ON']);
        expect(storedSetting(unit, 'flightTimer')).toBe(true);
    });

    it('offers RUN WHEN POWER IS ON on a unit booted with it (4-13)', async () => {
        const unit = await bootUnit({storage: {flightTimer: true}});
        await unit.panel.selectPage('L', 'SET 4');

        expect(Screen.read().rows('L')[5]).toBe('POWER IS ON');
    });
});
