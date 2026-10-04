import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

/**
 * SET 2 with the date editable. A booted unit has a GPS fix at once, even with slow acquisition;
 * coldGps resets it and starts the slow search, which gives the date and time pages their editable state (3-53).
 */
async function bootOnSet2(): Promise<HeadlessUnit> {
    const unit = await bootUnit({storage: {fastGpsAcquisition: false}, coldGps: true});
    await unit.panel.outer('L', 3);
    await unit.panel.inner('L', 1);
    expect(Screen.read().leftName()).toBe('SET 2');
    expect(unit.props.sensors.in.gps.isValid()).toBe(false);
    return unit;
}

/** The left half page's row n (11 characters) */
function left(n: number): string {
    return Screen.read().half('L').split('\n')[n];
}

describe('date editor on SET 2', () => {
    it('defaults an entered blank date to 1 Jan 1988 (characterization, #64)', async () => {
        const unit = await bootOnSet2();
        await unit.panel.cursor('L');
        expect(left(2)).toBe('  01 JUN 26');

        await unit.panel.inner('L', 1);
        expect(left(2)).toBe('  01 ___ __');

        await unit.panel.ent();
        expect(unit.errors).toEqual([]);
        expect(left(2)).toBe('  01 JAN 88');
        const time = unit.props.sensors.in.gps.timeZulu;
        expect([time.getYear(), time.getMonth(), time.getDate()]).toEqual([1988, 0, 1]);
    });

    it('inverts the static characters of the editor with the cursor on (10c5a3d, characterization)', async () => {
        const unit = await bootOnSet2();
        await unit.panel.cursor('L');
        expect(unit.errors).toEqual([]);
        expect(Screen.read().mask().split('\n')[2].slice(0, 11)).toBe('..IIIIIIIII');
    });

    // The month is OCT in English; the field offers OKT (EditorField.tsx, MonthEditorField)
    it.fails('names the tenth month OCT (#112)', async () => {
        const unit = await bootOnSet2();
        await unit.panel.cursor('L');
        await unit.panel.inner('L', 1); // day 01
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 10); // the first click enters JAN

        expect(unit.errors).toEqual([]);
        expect(left(2)).toBe('  01 OCT __');
    });
});
