import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

describe('SET 10 page (characterization, the page is fictitious, #46)', () => {
    it('renders without an error', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 10');

        expect(unit.errors).toEqual([]);
        expect(Screen.read().status().left).toBe('SET10');
        expect(Screen.read().rows('L')[0]).toBe('GPS:   FAST');
    });
});

// #458: the FAILURES button on row 2 opens the FLR pages (fictional, like SET 10 itself)
describe('SET 10 FAILURES button (#458)', () => {
    it('shows the button below the GPS setting', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 10');

        expect(Screen.read().rows('L')[1].trim()).toBe('FAILURES');
    });

    it('opens FLR 1 with ENT', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 10');
        await unit.panel.cursor('L');
        await unit.panel.cursorTo('L', 'FAILURES');

        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().status().left).toBe('FLR 1');
    });
});
