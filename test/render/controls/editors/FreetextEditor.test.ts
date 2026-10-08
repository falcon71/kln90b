import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {airport} from '../../../harness/navdata/builders';
import {blinkCycle} from '../../../harness/render/blink';
import {Screen} from '../../../harness/render/screen';
import {storedSetting} from '../../../harness/storage';

/** The letters, the digits and the blank, sorted as the choices are */
const LETTERS_DIGITS_BLANK = [...' 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

/** The characters a cell shows over n clicks of the inner knob, sorted; `cell` reads it from the screen */
async function choices(unit: HeadlessUnit, side: 'L' | 'R', cell: () => string, n: number): Promise<string[]> {
    const seen = new Set<string>();
    for (let i = 0; i < n; i++) {
        await unit.panel.inner(side, 1);
        seen.add(cell());
    }
    return [...seen].sort();
}

/**
 * The Turn-On page (5-28) of a unit switched on cold: its third to sixth rows are four free-text lines of 23
 * characters, stored in the user settings `welcome1` to `welcome4`. The page stays while the left cursor is on.
 */
async function onTurnOnPage(storage: Record<string, unknown> = {}): Promise<HeadlessUnit> {
    const unit = await bootUnit({engineRunning: false, storage});
    unit.send('KLN90B_Power_On');
    await vi.advanceTimersByTimeAsync(1000);
    expect(Screen.read().text().split('\n')[6]).toBe(' SELF TEST IN PROGRESS ');
    await unit.panel.cursor('L');
    return unit;
}

const turnOnLine = (n: number) => Screen.read().text().split('\n')[1 + n];

describe('free text editor on the Turn-On page (5-28)', () => {
    // 5-28 steps 2 to 4: with the left cursor on, the inner knob selects each character and the outer knob moves the
    // cursor; ENT approves the line, which is kept for every later power-on. The guide gives no order of the choices:
    // the click counts follow the code's (the first click shows the blank, the next A, B).
    it('stores a line selected with the knobs and approved with ENT (5-28)', async () => {
        const unit = await onTurnOnPage();
        await unit.panel.inner('L', 2); // A
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 3); // B
        expect(turnOnLine(1).slice(0, 2)).toBe('AB');

        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.errors).toEqual([]);
        expect(turnOnLine(1)).toBe('AB' + ' '.repeat(21));
        expect(storedSetting(unit, 'welcome1')).toBe('AB' + ' '.repeat(21));
        // 5-28 step 3: the cursor moves on to the second line, and the field stays inverse on every tick
        const masks = await blinkCycle(() => Screen.read().mask().split('\n').slice(2, 4));
        expect(masks).toEqual(Array(4).fill(['.'.repeat(23), 'I'.repeat(23)]));
    });

    // 5-28 step 5: a line already approved is deleted by entering a blank as its first character and ENT
    it('deletes a stored line with a blank first character and ENT (5-28)', async () => {
        const unit = await onTurnOnPage({welcome1: 'HELLO' + ' '.repeat(18)});
        expect(turnOnLine(1)).toBe('HELLO' + ' '.repeat(18));

        await unit.panel.inner('L', 1); // the first click selects the blank
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.errors).toEqual([]);
        expect(turnOnLine(1)).toBe(' '.repeat(23));
        expect(storedSetting(unit, 'welcome1')).toBe(' '.repeat(23));
    });

    // 5-28: the Turn-On page takes the letters A to Z, the digits 0 to 9 and the blank, and nothing else. 40 clicks go
    // round the 37 choices once.
    it('offers the letters, the digits and the blank, and nothing else (5-28)', async () => {
        const unit = await onTurnOnPage();

        const seen = await choices(unit, 'L', () => turnOnLine(1)[0], 40);

        expect(unit.errors).toEqual([]);
        expect(seen).toEqual(LETTERS_DIGITS_BLANK);
    });
});

/** APT 5 of KAAA with the right cursor on the first remark line (row 2) */
async function onRemarkLine(): Promise<HeadlessUnit> {
    const unit = await bootUnit({facilities: [airport('KAAA', 47, 8)], position: {lat: 47, lon: 8}});
    await unit.panel.selectPage('R', 'APT 5');
    await unit.panel.cursor('R');
    for (let i = 0; i < 10 && unit.panel.focused('R').row !== 2; i++) {
        await unit.panel.outer('R', 1);
    }
    expect(unit.panel.focused('R').row).toBe(2);
    return unit;
}

describe('free text editor on APT 5 (3-47)', () => {
    // 3-47: a remark takes letters, digits, hyphens and blanks. The sibling of the pin below: the letters, the digits
    // and the blank are offered.
    it('offers the letters, the digits and the blank in a remark (3-47)', async () => {
        const unit = await onRemarkLine();

        const seen = await choices(unit, 'R', () => Screen.read().rows('R')[2][0], 40);

        expect(unit.errors).toEqual([]);
        expect(LETTERS_DIGITS_BLANK.filter(c => !seen.includes(c))).toEqual([]);
    });

    // The first cell of the remark line, as the screen shows it
    const firstCell = () => Screen.read().rows('R')[2][0];

    /**
     *  Opens the edit of the first remark cell and steps clockwise until the cell shows the blank (one round at
     * most)
     */
    async function openOnBlank(unit: HeadlessUnit): Promise<void> {
        await unit.panel.inner('R', 1);
        for (let i = 0; i < 40 && firstCell() !== ' '; i++) {
            await unit.panel.inner('R', 1);
        }
    }

    // Sibling of the pin below: the blank is reachable by stepping clockwise, whatever the first click gives (3-47: the
    // blank is one of the characters of a remark)
    it('reaches the blank of a remark cell by stepping clockwise (3-47)', async () => {
        const unit = await onRemarkLine();

        await openOnBlank(unit);

        expect(unit.errors).toEqual([]);
        expect(firstCell()).toBe(' ');
    });

    // 3-47, figure 3-144 (a remark line with a hyphen in a telephone number) and checked in the KLN 89 trainer,
    // 2026-10-08 (T12): a remark takes hyphens, and the hyphen sits between 9 and the blank, so one click
    // counterclockwise from the blank is -, and one more is 9. The remark lines use AlphabetEditorField, whose choices
    // are the blank, A to Z and 0 to 9, so no hyphen can be entered. The Turn-On page (5-28) takes no hyphen, so the
    // fix belongs to the remarks only.
    it.fails('puts a hyphen between 9 and the blank in a remark (3-47, checked in ' +
        'the KLN 89 trainer, 2026-10-08, #NEW-1-3)', async () => {
        const unit = await onRemarkLine();
        await openOnBlank(unit);

        const shown = [];
        for (let i = 0; i < 2; i++) {
            await unit.panel.inner('R', -1);
            shown.push(firstCell());
        }

        expect(unit.errors).toEqual([]);
        expect(shown).toEqual(['-', '9']);
    });
});

describe('free text editor, the first click on an empty remark line (3-47, #NEW-3-2)', () => {
    // Sibling of the pin below: the remark line is empty (eleven blanks) and the cursor is on its first cell
    it('shows an empty remark line as blanks with the cursor on its first cell (3-47)', async () => {
        const unit = await onRemarkLine();

        expect(unit.errors).toEqual([]);
        expect(unit.panel.focused('R')).toEqual({row: 2, col: 12, text: ' '.repeat(11)});
    });

    // Checked in the KLN 89 trainer, 2026-10-08 (T12): the first click on an empty remark line puts an A in the first
    // cell (and dashes in the others). The code puts the blank there, so the first click selects nothing visible.
    it.fails('gives A on the first click on an empty remark line (checked in the KLN 89 trainer, ' +
        '2026-10-08, #NEW-3-2)', async () => {
        const unit = await onRemarkLine();

        await unit.panel.inner('R', 1);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('R')[2]).toBe('A__________');
    });
});
