import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

// BearingFieldset: a direction of 000 to 359 in two cells, the first two digits as one cell (00 to 35) and the last
// digit. Its host here is the wind direction of TRI 0 (row 4, after the three TAS digits; navPage memory
// triPage.windDirTrue). CAL 3 uses it for the heading (Cal3Page.test.ts). The keyboard cannot type the first cell (its
// entries are two characters long): that is #109, whose typing rule is a design decision still open, so no test here
// holds either behavior.

/** TRI 0 with the wind direction stored as `dir` and the left cursor on its first two digits */
async function onWindDir(dir: number): Promise<HeadlessUnit> {
    const unit = await bootUnit();
    unit.props.memory.triPage.windDirTrue = dir; // read when TRI 0 is built
    await unit.panel.selectPage('L', 'TRI 0');
    await unit.panel.cursor('L');
    await unit.panel.outer('L', 3);
    expect(unit.panel.focused('L')).toMatchObject({row: 4, col: 6});
    return unit;
}

const windRow = () => Screen.read().rows('L')[4];

describe('bearing fieldset', () => {
    // 5-2 steps 4 to 6 (figures 5-3, 5-4): the first two digits of the direction are one cursor position, the last
    // digit the next one; the inner knob on the first steps the direction by ten degrees: 210 to 180 in three clicks
    it('steps the first two digits as one cell: 210 to 180 in three clicks (5-2)', async () => {
        const unit = await onWindDir(210);
        expect(unit.panel.focused('L')).toEqual({row: 4, col: 6, text: '21'});
        await unit.panel.inner('L', -3);

        expect(windRow()).toBe('WIND: 180°¥');
        expect(unit.props.memory.triPage.windDirTrue).toBe(180);
    });

    // 5-2 step 6: the last digit completes the direction and keeps the first two: 180 to 184
    it('sets the last digit and keeps the first two: 184 (5-2)', async () => {
        const unit = await onWindDir(180);
        await unit.panel.outer('L', 1);
        expect(unit.panel.focused('L')).toEqual({row: 4, col: 8, text: '0'});
        await unit.panel.inner('L', 4);

        expect(windRow()).toBe('WIND: 184°¥');
        expect(unit.props.memory.triPage.windDirTrue).toBe(184);
    });

    // 5-2: the first two digits keep the last one: 184 to 214
    it('keeps the last digit when the first two change: 184 to 214 (5-2)', async () => {
        const unit = await onWindDir(184);
        await unit.panel.inner('L', 3);

        expect(windRow()).toBe('WIND: 214°¥');
        expect(unit.props.memory.triPage.windDirTrue).toBe(214);
    });
});

describe('bearing fieldset wrap', () => {
    // Checked in the KLN 89 trainer, 2026-10-08, T4: the block of the first two digits of the trainer's radial runs
    // from 00 to 35 and wraps in both directions (35 up gives 00, 00 down gives 35); the heading of its CAL 7 wraps
    // between 359 and 000 (T14). In the 90B's cell the first two digits are the same range, so 359 becomes 009 and
    // back.
    it('wraps the first two digits from 35 to 00: 359 becomes 009 '
        + '(checked in the KLN 89 trainer, 2026-10-08, T4)', async () => {
        const unit = await onWindDir(359);
        await unit.panel.inner('L', 1);

        expect(windRow()).toBe('WIND: 009°¥');
        expect(unit.props.memory.triPage.windDirTrue).toBe(9);
        await unit.panel.inner('L', -1);
        expect(windRow()).toBe('WIND: 359°¥');
        expect(unit.props.memory.triPage.windDirTrue).toBe(359);
    });
});
