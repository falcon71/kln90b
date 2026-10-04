import {describe, expect, it} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

/**
 * The names are read with the knobs and never with selectPage, which stops at the first match
 * (3-39 and 5-10 for SET 7, 3-41 for SET 8, 3-57 for SET 9, 5-6 for TRI 5).
 */
describe('left page names (fb671c0, 74134be, 9d1fe96)', () => {
    it('names the SET pages in order, from SET 1 to SET 10', async () => {
        const unit = await bootUnit();
        await unit.panel.outer('L', 3);
        const names = [Screen.read().leftName()];
        for (let i = 0; i < 9; i++) {
            await unit.panel.inner('L', 1);
            names.push(Screen.read().leftName());
        }

        expect(unit.errors).toEqual([]);
        expect(names).toEqual(['SET 1', 'SET 2', 'SET 3', 'SET 4', 'SET 5', 'SET 6', 'SET 7', 'SET 8', 'SET 9', 'SET10']);
    });

    it('names the TRI pages in order, from TRI 0 to TRI 6', async () => {
        const unit = await bootUnit();
        await unit.panel.outer('L', -3);
        const names = [Screen.read().leftName()];
        for (let i = 0; i < 6; i++) {
            await unit.panel.inner('L', 1);
            names.push(Screen.read().leftName());
        }

        expect(unit.errors).toEqual([]);
        expect(names).toEqual(['TRI 0', 'TRI 1', 'TRI 2', 'TRI 3', 'TRI 4', 'TRI 5', 'TRI 6']);
    });
});
