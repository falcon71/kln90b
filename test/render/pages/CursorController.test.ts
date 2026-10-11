import {describe, expect, it} from 'vitest';
import {bootUnit} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';

/** The mask of the left half page's row n */
function leftMask(n: number): string {
    return Screen.read().mask().split('\n')[n].slice(0, 11);
}

describe('cursor controller ENT on a field with nothing to accept (#354)', () => {
    // The digits of the CAL 1 altitude change as the knob turns, so ENT has nothing to accept. Checked in the KLN 89
    // trainer, 2026-10-11, on CAL 4 Ind, CAL 1 GS and the ALT 2 selected altitude: nothing happens, the cursor stays
    it('leaves the cursor on the field (checked in the KLN 89 trainer, 2026-10-11, #354)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'CAL 1');
        expect(Screen.read().leftName()).toBe('CAL 1');
        await unit.panel.cursor('L');
        expect(leftMask(1)).toBe('....I......');

        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        expect(leftMask(1)).toBe('....I......');
    });
});
