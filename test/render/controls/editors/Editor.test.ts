import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {blinkCycle} from '../../../harness/render/blink';
import {Screen} from '../../../harness/render/screen';

/**
 * The base of every editor (Editor.tsx, EditorField.tsx), driven on the latitude of SET 1 (row 2 of the left half),
 * whose cells are separated by a fixed blank, a degree sign and a point: N 47°30.00'. The page is always editable and
 * shows the present position. Two-digit degrees, so that no row meets #230.
 */
async function onSet1Latitude(): Promise<HeadlessUnit> {
    const unit = await bootUnit({position: {lat: 47.5, lon: 11.25}});
    await unit.panel.selectPage('L', 'SET 1');
    await unit.panel.cursor('L');
    await unit.panel.outer('L', 1); // the latitude
    expect(Screen.read().rows('L')[2]).toBe("N 47°30.00'");
    return unit;
}

const latRow = () => Screen.read().rows('L')[2];

/**
 * The columns of the latitude row that flash over one blink cycle. The open editor flashes the cell the inner knob
 * changes, and inverts the rest of the field.
 */
async function flashingColumns(): Promise<number[]> {
    const cols = new Set<number>();
    for (const mask of await blinkCycle(() => Screen.read().maskRows('L')[2])) {
        [...mask].forEach((attr, col) => {
            if (attr === 'F') cols.add(col);
        });
    }
    return [...cols].sort((a, b) => a - b);
}

/** Whether the mode field of the status line shows ent on any display tick of one blink cycle */
async function entPromptShown(): Promise<boolean> {
    return (await blinkCycle(() => Screen.read().status().mode)).some(mode => mode.endsWith('ent'));
}

/**
 * The seven cells the cursor visits in the latitude row: the hemisphere, two degree digits, two minute digits, two
 * hundredths
 */
const CELL_COLUMNS = [0, 2, 3, 5, 6, 8, 9];

describe('editor data entry (3-14, 3-53, 5-17)', () => {
    // 3-53, figure 3-165, and 3-14 (figures 3-41, 3-42): the first turn of the inner knob selects the first character,
    // and the characters not yet selected show dashes; the flashing part of the cursor is on the first character
    it('opens with the first click: the first cell selected, the others ' +
        'dashed, the first cell flashing (3-14, 3-53)', async () => {
        const unit = await onSet1Latitude();

        await unit.panel.inner('L', 1);

        expect(unit.errors).toEqual([]);
        expect(latRow().slice(1)).toBe(" __°__.__'");
        expect(await flashingColumns()).toEqual([0]);
    });

    // 3-14 steps 4 and 5, 5-17 step 8: the outer knob moves the flashing part of the cursor to the next character to
    // select; the hemisphere, the two degree digits, the two minute digits and the two hundredths are the positions,
    // the fixed blank, degree sign and point are not
    it('moves the flashing part over the seven selectable cells only (3-14, 5-17)', async () => {
        const unit = await onSet1Latitude();
        await unit.panel.inner('L', 1);

        const visited = [];
        for (let i = 0; i < 7; i++) {
            visited.push(...await flashingColumns());
            if (i < 6) await unit.panel.outer('L', 1);
        }

        expect(unit.errors).toEqual([]);
        expect(visited).toEqual(CELL_COLUMNS);
    });

    // 3-14 steps 3 to 6, 5-17 step 8: the inner knob selects the character under the flashing part; ENT enters the
    // whole field. The first click on a dashed digit gives 0, so n + 1 clicks give n. After the cursor is turned off
    // the field shows what was entered, not the value it had before.
    it('enters the selected characters with ENT (3-14, 5-17)', async () => {
        const unit = await onSet1Latitude();
        await unit.panel.inner('L', 1); // N
        for (const digit of [4, 6, 1, 2, 3, 4]) {
            await unit.panel.outer('L', 1);
            await unit.panel.inner('L', digit + 1);
        }
        expect(latRow()).toBe("N 46°12.34'");

        await unit.panel.ent();
        await unit.panel.cursor('L');

        expect(unit.errors).toEqual([]);
        expect(latRow()).toBe("N 46°12.34'");
    });

    // Checked in the KLN 89 trainer, 2026-10-08 (T5): a field with cells still dashed is taken, the dashes counting as
    // 0 (the trainer entered the latitude N 42 with the minutes dashed and got N 42°00.00')
    it('takes the dashed cells of a partly filled field as 0 on ENT (checked ' +
        'in the KLN 89 trainer, 2026-10-08)', async () => {
        const unit = await onSet1Latitude();
        await unit.panel.inner('L', 1); // N
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 5); // 4
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 3); // 2
        expect(latRow()).toBe("N 42°__.__'");

        await unit.panel.ent();
        await unit.panel.cursor('L');

        expect(unit.errors).toEqual([]);
        expect(latRow()).toBe("N 42°00.00'");
    });
});

describe('editor cells wrap (checked in the KLN 89 trainer, 2026-10-08)', () => {
    // Checked in the KLN 89 trainer, 2026-10-08 (T4): every cell wraps in both directions, from its last
    // choice to its first and back. The latitude tens is the exception that #303 pins (it offers 9 today, the
    // trainer's cell stops at 8), so it is left out here.
    // [column, first choice, last choice]
    const WRAPPING_CELLS: [number, string, string][] = [
        [0, 'N', 'S'],   // the hemisphere
        [3, '0', '9'],   // the degree units
        [5, '0', '5'],   // the tens of the minutes
        [6, '0', '9'],   // the units of the minutes
        [8, '0', '9'],   // the tenths of the minutes
        [9, '0', '9'],   // the hundredths of the minutes
    ];

    for (const [col, first, last] of WRAPPING_CELLS) {
        it(`wraps the cell in column ${col} from ${last} to ${first} and back ` +
            '(checked in the KLN 89 trainer, 2026-10-08)', async () => {
            const unit = await onSet1Latitude();
            await unit.panel.inner('L', 1); // opens the edit, the hemisphere shows its first choice
            await unit.panel.outer('L', CELL_COLUMNS.indexOf(col));
            if (col !== 0) await unit.panel.inner('L', 1); // the first click on a dashed cell gives its first choice
            expect(latRow()[col]).toBe(first);

            await unit.panel.inner('L', -1);
            expect(latRow()[col]).toBe(last);
            await unit.panel.inner('L', 1);

            expect(unit.errors).toEqual([]);
            expect(latRow()[col]).toBe(first);
        });
    }
});

describe('editor open edit and the cursor button (checked in the KLN 89 trainer, 2026-10-08)', () => {
    // Checked in the KLN 89 trainer, 2026-10-08 (T3): CRSR during an open edit turns the cursor off and brings the old
    // value back
    it('drops an edit that was not entered when the cursor is turned off ' +
        '(checked in the KLN 89 trainer, 2026-10-08)', async () => {
        const unit = await onSet1Latitude();
        await unit.panel.inner('L', 1);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 3);
        expect(latRow()).toBe("N 2_°__.__'");

        await unit.panel.cursor('L');

        expect(unit.errors).toEqual([]);
        expect(Screen.read().status().left).toBe('SET 1');
        expect(latRow()).toBe("N 47°30.00'");
        // No cell of the row keeps flashing
        expect(await blinkCycle(() => Screen.read().maskRows('L')[2])).toEqual(Array(4).fill('.'.repeat(11)));
    });
});

describe('editor CLR during an open edit (checked in the KLN 89 trainer, 2026-10-08, #307)', () => {
    /** The edit of the tests below: the tens of the degrees selected, the rest dashed */
    async function withOpenEdit(): Promise<HeadlessUnit> {
        const unit = await onSet1Latitude();
        await unit.panel.inner('L', 1);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 3);
        return unit;
    }

    // Sibling of the pin: what the pin relies on. The edit is open with the tens selected, the unit asks for ENT, and
    // the cursor is on the latitude
    it('has an open edit with the status line asking for ent, before CLR ' +
        '(checked in the KLN 89 trainer, 2026-10-08)', async () => {
        const unit = await withOpenEdit();

        expect(unit.errors).toEqual([]);
        expect(latRow()).toBe("N 2_°__.__'");
        expect(await entPromptShown()).toBe(true);
        expect(unit.panel.focused('L').row).toBe(2);
    });

    // Checked in the KLN 89 trainer, 2026-10-08 (T2): CLR brings the old value back, the cursor stays on
    // the field, and the ent prompt goes. The code ignores CLR (Editor.isClearAccepted is false), so the edit stays
    // open.
    it.fails('brings the old value back and closes the edit (checked in the KLN 89 ' +
        'trainer, 2026-10-08, #307)', async () => {
        const unit = await withOpenEdit();

        await unit.panel.clr();

        expect(unit.errors).toEqual([]);
        expect(latRow()).toBe("N 47°30.00'");
        expect(await entPromptShown()).toBe(false);
        expect(unit.panel.focused('L').row).toBe(2);
    });

    // Checked in the KLN 89 trainer, 2026-10-08 (T2): ENT after the CLR does nothing. Today the edit is still open, so
    // ENT enters it (N 20°00.00'); the pin turns green with the fix of #307
    it.fails('does nothing on a following ENT (checked in the KLN 89 trainer, 2026-10-08, #307)', async () => {
        const unit = await withOpenEdit();

        await unit.panel.clr();
        await unit.panel.ent();
        await unit.panel.cursor('L');

        expect(unit.errors).toEqual([]);
        expect(latRow()).toBe("N 47°30.00'");
    });
});

describe('editor outer knob at the ends of an open edit (checked in the KLN 89 trainer, 2026-10-08, #306)', () => {
    // Sibling of both pins: the edit is open with the cursor on the first cell (N selected), and six clicks of the
    // outer knob reach the last cell, the hundredths; the edit is still open and shows its dashes
    it('reaches the last cell with six clicks of the outer knob, the edit ' +
        'still open (checked in the KLN 89 trainer, 2026-10-08)', async () => {
        const unit = await onSet1Latitude();
        await unit.panel.inner('L', 1);
        expect(await flashingColumns()).toEqual([0]);

        await unit.panel.outer('L', 6);

        expect(unit.errors).toEqual([]);
        expect(await flashingColumns()).toEqual([9]);
        expect(latRow()).toBe("N __°__.__'");
        expect(await entPromptShown()).toBe(true);
    });

    // Checked in the KLN 89 trainer, 2026-10-08 (T1): past the last cell the cursor stays on it, and the
    // edit stays open. The code wraps to the first cell.
    it.fails('stops at the last cell of an open edit (checked in the KLN 89 ' +
        'trainer, 2026-10-08, #306)', async () => {
        const unit = await onSet1Latitude();
        await unit.panel.inner('L', 1);
        await unit.panel.outer('L', 6);

        await unit.panel.outer('L', 1);

        expect(unit.errors).toEqual([]);
        expect(await flashingColumns()).toEqual([9]);
        expect(await entPromptShown()).toBe(true);
    });

    // Checked in the KLN 89 trainer, 2026-10-08 (T1): before the first cell the cursor stays on it too,
    // and the edit stays open. The code wraps to the last cell.
    it.fails('stops at the first cell of an open edit (checked in the KLN 89 ' +
        'trainer, 2026-10-08, #306)', async () => {
        const unit = await onSet1Latitude();
        await unit.panel.inner('L', 1);

        await unit.panel.outer('L', -1);

        expect(unit.errors).toEqual([]);
        expect(await flashingColumns()).toEqual([0]);
        expect(await entPromptShown()).toBe(true);
    });
});

describe('editor keyboard entry (characterization, sim-only feature, #25)', () => {
    // A typed key sets the cell under the cursor and moves on to the next; a key that is not one of the cell's choices
    // is refused and the cursor stays, so the next key lands in the same cell
    it('refuses a key that is not a choice of the cell, and the cursor stays', async () => {
        const unit = await onSet1Latitude();

        await unit.panel.type('L', 'NX4');

        expect(unit.errors).toEqual([]);
        expect(latRow()).toBe("N 4_°__.__'");
    });

    // After the last cell the automatic advance (KeyboardService: outerRight after every accepted key) wraps to the
    // first cell, so the next key replaces the hemisphere. A clamp in Editor.outerRight (the fix of #306) changes
    // it.
    it('wraps the cursor to the first cell after the last key, so the next key overwrites it', async () => {
        const unit = await onSet1Latitude();
        await unit.panel.type('L', 'N473000'); // all seven cells
        expect(latRow()).toBe("N 47°30.00'");

        await unit.panel.type('L', 'S');

        expect(unit.errors).toEqual([]);
        expect(latRow()).toBe("S 47°30.00'");
    });
});

describe('editor status line (characterization)', () => {
    // While an edit is open the status line flashes ent (the field takes ENT); after ENT it does not
    it('shows ent in the status line while an edit is open', async () => {
        const unit = await onSet1Latitude();
        expect(await entPromptShown()).toBe(false);

        await unit.panel.inner('L', 1);
        expect(await entPromptShown()).toBe(true);
        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        expect(await entPromptShown()).toBe(false);
    });
});
