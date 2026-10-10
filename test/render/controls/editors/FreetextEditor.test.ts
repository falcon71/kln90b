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
    await unit.panel.powerOn();
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

/** APT 5 of KAAA with the right cursor on a remark line (the first one, row 2, unless `row` says another) */
async function onRemarkLine(row = 2): Promise<HeadlessUnit> {
    const unit = await bootUnit({facilities: [airport('KAAA', 47, 8)], position: {lat: 47, lon: 8}});
    await unit.panel.selectPage('R', 'APT 5');
    await unit.panel.cursor('R');
    for (let i = 0; i < 10 && unit.panel.focused('R').row !== row; i++) {
        await unit.panel.outer('R', 1);
    }
    expect(unit.panel.focused('R').row).toBe(row);
    return unit;
}

describe('free text editor on APT 5 (3-47)', () => {
    // 3-47: a remark is made of letters, digits, the hyphen and the blank. The sibling of the hyphen tests below: the
    // letters, the digits and the blank are offered.
    it('offers the letters, the digits and the blank in a remark (3-47)', async () => {
        const unit = await onRemarkLine();

        const seen = await choices(unit, 'R', () => Screen.read().rows('R')[2][0], 40);

        expect(unit.errors).toEqual([]);
        expect(LETTERS_DIGITS_BLANK.filter(c => !seen.includes(c))).toEqual([]);
    });

    // The first cell of a remark line (the first one unless `row` says another), as the screen shows it
    const firstCell = (row = 2) => Screen.read().rows('R')[row][0];

    /**
     * Opens the edit of the first remark cell and steps clockwise until the cell shows the blank (one round at most)
     */
    async function openOnBlank(unit: HeadlessUnit, row = 2): Promise<void> {
        await unit.panel.inner('R', 1);
        for (let i = 0; i < 40 && firstCell(row) !== ' '; i++) {
            await unit.panel.inner('R', 1);
        }
    }

    // Sibling of the tests below: the blank is reachable by stepping clockwise, whatever the first click gives (3-47: the
    // blank is one of the characters of a remark)
    it('reaches the blank of a remark cell by stepping clockwise (3-47)', async () => {
        const unit = await onRemarkLine();

        await openOnBlank(unit);

        expect(unit.errors).toEqual([]);
        expect(firstCell()).toBe(' ');
    });

    // 3-47, figure 3-144 (a remark line with a hyphen in a telephone number) and checked in the KLN 89 trainer,
    // 2026-10-08 (T12): a remark takes hyphens, and the hyphen sits between 9 and the blank, so one click
    // counterclockwise from the blank is -, and one more is 9. The Turn-On page (5-28) takes no hyphen (its test above
    // holds the charset), so the hyphen belongs to the remarks only.
    it('puts a hyphen between 9 and the blank in a remark (3-47, checked in ' +
        'the KLN 89 trainer, 2026-10-08, #305)', async () => {
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

    // The same on the second and the third remark line: each line has its own editor
    for (const [row, line] of [[3, 'second'], [4, 'third']] as const) {
        it(`puts a hyphen between 9 and the blank on the ${line} remark line (3-47, checked in ` +
            'the KLN 89 trainer, 2026-10-08, #305)', async () => {
            const unit = await onRemarkLine(row);
            await openOnBlank(unit, row);

            const shown = [];
            for (let i = 0; i < 2; i++) {
                await unit.panel.inner('R', -1);
                shown.push(firstCell(row));
            }

            expect(unit.errors).toEqual([]);
            expect(shown).toEqual(['-', '9']);
        });
    }

    // The same order clockwise (checked in the KLN 89 trainer, 2026-10-08, T12: 8 9 - blank A B): from the 9 the next
    // click is the hyphen, then the blank, then A
    it('goes from 9 to the hyphen, the blank and A clockwise in a remark (checked in ' +
        'the KLN 89 trainer, 2026-10-08, #305)', async () => {
        const unit = await onRemarkLine();
        await openOnBlank(unit);
        await unit.panel.inner('R', -2);
        expect(firstCell()).toBe('9');

        const shown = [];
        for (let i = 0; i < 3; i++) {
            await unit.panel.inner('R', 1);
            shown.push(firstCell());
        }

        expect(unit.errors).toEqual([]);
        expect(shown).toEqual(['-', ' ', 'A']);
    });

    // Every character a remark cell offers, over one round (40 clicks) of the inner knob. 3-47 names the characters a
    // remark may hold but does not say that these are the only ones, so this is a characterization.
    it('characterization: offers the letters, the digits, the hyphen and the blank in a remark', async () => {
        const unit = await onRemarkLine();

        const seen = await choices(unit, 'R', () => Screen.read().rows('R')[2][0], 40);

        expect(unit.errors).toEqual([]);
        expect(seen).toEqual([...LETTERS_DIGITS_BLANK, '-'].sort());
    });

    // 3-47, figure 3-144: a remark with a hyphen (a telephone number) is approved with ENT and kept: it is stored in
    // the airport's slot and shown again when the page is selected anew.
    it('stores a remark with a hyphen and shows it again (3-47)', async () => {
        const unit = await onRemarkLine();
        await unit.panel.inner('R', 2); // the blank, A
        await unit.panel.outer('R', 1);
        await unit.panel.inner('R', 1); // the blank
        await unit.panel.inner('R', -1); // the hyphen
        await unit.panel.outer('R', 1);
        await unit.panel.inner('R', 29); // the blank, then the 28 choices up to the 1
        expect(Screen.read().rows('R')[2]).toBe('A-1________');
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.errors).toEqual([]);
        expect(storedSetting(unit, 'rmk0')).toBe('KAAA' + 'A-1        ' + ' '.repeat(22));
        await unit.panel.cursor('R'); // turns the cursor off
        await unit.panel.selectPage('R', 'APT 1');
        await unit.panel.selectPage('R', 'APT 5');
        expect(Screen.read().rows('R')[2]).toBe('A-1        ');
    });
});

describe('free text editor, the first click on an empty remark line (3-47, #311)', () => {
    // Sibling of the pin below: the remark line is empty (eleven blanks) and the cursor is on its first cell
    it('shows an empty remark line as blanks with the cursor on its first cell (3-47)', async () => {
        const unit = await onRemarkLine();

        expect(unit.errors).toEqual([]);
        expect(unit.panel.focused('R')).toEqual({row: 2, col: 12, text: ' '.repeat(11)});
    });

    // Checked in the KLN 89 trainer, 2026-10-08 (T12): the first click on an empty remark line puts an A in the first
    // cell (and dashes in the others). The code puts the blank there, so the first click selects nothing visible.
    it.fails('gives A on the first click on an empty remark line (checked in the KLN 89 trainer, ' +
        '2026-10-08, #311)', async () => {
        const unit = await onRemarkLine();

        await unit.panel.inner('R', 1);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('R')[2]).toBe('A__________');
    });
});
