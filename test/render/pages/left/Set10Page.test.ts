import {describe, expect, it} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

describe('SET 10 page (characterization, the page is fictitious, #46)', () => {
    it('renders without an error', async () => {
        const unit = await bootUnit();
        await unit.panel.outer('L', 3);
        await unit.panel.inner('L', -2);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().leftName()).toBe('SET10');
        expect(Screen.read().half('L').split('\n')[0]).toBe('GPS:   FAST');
    });
});
