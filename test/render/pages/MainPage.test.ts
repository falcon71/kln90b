import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';

/** The left half page's row n (11 characters) */
function left(n: number): string {
    return Screen.read().half('L').split('\n')[n];
}

describe('pushed pages close when they do not handle a knob (characterization, KLN 89 trainer, #56)', () => {
    it('pops the ALT page and passes the outer knob on to the page below', async () => {
        const unit = await bootUnit();
        await unit.panel.alt();
        await unit.panel.cursor('L');
        expect(Screen.read().leftName()).toBe('ALT  ');
        expect(Screen.read().rightName()).toBe('CRSR ');

        await unit.panel.outer('L', 1);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().leftName()).toBe('CAL 1');
        expect(Screen.read().rightName()).toBe('SUP  ');
    });

    it('keeps the DIR page open with the cursor off, then pops it on the outer knob', async () => {
        const unit = await bootUnit();
        await unit.panel.dct();
        await unit.panel.cursor('L');
        // A page that closes itself in a tick shows it one display tick later
        await vi.advanceTimersByTimeAsync(500);
        expect(Screen.read().leftName()).toBe('DIR  ');
        expect(left(0)).toBe('DIRECT TO: ');

        await unit.panel.outer('L', 1);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().leftName()).toBe('CAL 1');
    });
});

describe('the inner knob with SCAN pulled (characterization, KLN 89 trainer, 8e9a7c4)', () => {
    it('changes the field under the cursor instead of scanning', async () => {
        const unit = await bootUnit();
        await unit.panel.outer('R', -5);
        await unit.panel.inner('R', 3);
        expect(Screen.read().rightName()).toBe('NAV 4');
        await unit.panel.cursor('R');
        expect(Screen.read().half('R').split('\n')[3]).toBe('SEL:00000ft');

        await unit.panel.scan();
        await unit.panel.inner('R', 1);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().half('R').split('\n')[3]).toBe('SEL:10000ft');
        expect(unit.props.memory.navPage.nav4SelectedAltitude).toBe(10000);
    });
});
