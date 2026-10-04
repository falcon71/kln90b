import {describe, expect, it} from 'vitest';
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
