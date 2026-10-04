import {describe, expect, it} from 'vitest';
import {bootUnit} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';

/** The mask of the left half page's row n */
function leftMask(n: number): string {
    return Screen.read().mask().split('\n')[n].slice(0, 11);
}

describe('cursor controller (characterization, f347a2c)', () => {
    // ENT always moves the cursor to the next field: https://www.youtube.com/shorts/9We5fcd2-VE
    it('moves the cursor on with ENT, also when the field does not handle ENT', async () => {
        const unit = await bootUnit();
        await unit.panel.outer('L', 1);
        expect(Screen.read().leftName()).toBe('CAL 1');
        await unit.panel.cursor('L');
        expect(leftMask(1)).toBe('....I......');

        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        expect(leftMask(1)).toBe('.....I.....');
    });
});
