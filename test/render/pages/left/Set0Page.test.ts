import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {blinkCycle} from '../../../harness/render/blink';

/** The six rows of the full page (SET 0 has no right half), without trailing blanks */
function rows(): string[] {
    return Screen.read().text().split('\n').slice(0, 6).map(r => r.trimEnd());
}

describe('SET 0 page, the database update (2b9f811)', () => {
    it('leaves the mode and the right page name out of the status line (2-5)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 0');

        expect(unit.errors).toEqual([]);
        expect(Screen.read().row(6)).toBe('SET 0|        msg|     ');
    });

    // The steps follow the video https://youtu.be/7l57UDAuz8A, which could not be watched while writing this test, so
    // the rows are pinned as the code shows them today and carry no timestamps.
    it('walks through the update steps up to LOADER NOT READY (characterization)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 0');
        expect(rows()).toEqual([
            '      U P D A T E',
            '   D A T A   B A S E',
            '   O N   G R O U N D',
            '        O N L Y',
            '',
            '     KEY C70220BE',
        ]);

        await unit.panel.cursor('L');
        expect(rows()[3]).toBe('  UPDATE PUBLISHED DB');

        await unit.panel.ent();
        // The date row (index 4) is left out here: its year is the #199 pin below
        expect(rows().filter((_, i) => i !== 4)).toEqual([
            '      U P D A T E',
            '',
            '     INTERNATIONAL',
            '   DATA BASE EXPIRES',
            '     U P D A T E ?',
        ]);
        expect(rows()[4].trimStart().startsWith('11 JUN')).toBe(true);

        await unit.panel.ent();
        // The page turns the cursor off while it redraws, one display tick later
        await vi.advanceTimersByTimeAsync(250);
        expect(unit.errors).toEqual([]);
        expect(rows()).toEqual([
            '      U P D A T E',
            '   D A T A   B A S E',
            '',
            '      L O A D E R',
            '   N O T   R E A D Y',
            '',
        ]);
        expect(Screen.read().status().left).toBe('SET 0');
    });

    // Figures 3-24 and 3-25 show the date of the Database page with a two-digit year, and SET 0 shows the same field.
    // The nine characters of 11 JUN 26 are centered on the 23 columns with seven blanks, the way the other rows of the
    // page are centered (the figures are not exact enough to read a column off them). The sibling above holds the day
    // and month of this row.
    it.fails('shows the database expiry with a two-digit year (3-7, #199)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 0');
        await unit.panel.cursor('L');
        await unit.panel.ent();

        expect(rows()[4]).toBe('       11 JUN 26');
    });
});

describe('SET 0 page, the ENT prompt (2-4)', () => {
    /** The text and the mask of the ENT/MSG cells of the status line (row 6, cells 14 to 16) */
    const prompt = () => `${Screen.read().row(6).slice(14, 17)} ${Screen.read().mask().split('\n')[6].slice(14, 17)}`;

    // 2-4, figure 2-3: with the cursor on UPDATE PUBLISHED DB the status line shows CRSR and the ENT prompt; 3-11 and
    // 3-10: ENT flashes as plain text, not inverse, on one display tick in four (testing.md, blinkCycle)
    it('flashes ent while the cursor is on UPDATE PUBLISHED DB (2-4, figure 2-3, 3-10, 3-11)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 0');
        await unit.panel.cursor('L');
        expect(Screen.read().status().left).toBe('CRSR'); // Precondition

        const reads = await blinkCycle(prompt);

        expect(unit.errors).toEqual([]);
        expect([...reads].sort()).toEqual(['ent ...', 'ent ...', 'ent ...', 'ent BBB']);
    });

    // Checked in the KLN 89 trainer, 2026-10-09 (T5): with the cursor on a prompt (the one it showed was Copy FPL 0?
    // on FPL 25) a click of the inner knob in either direction did nothing: the page and the prompt stayed. The
    // trainer has no SET 0 page; this applies the rule to the prompt of 2-4, figure 2-3. The code pops the page when
    // the field refuses the knob (the rule of #56), which leaves SET 0 for SET 1 or SET 10 and drops the update. The
    // sibling above holds the prompt with the cursor on it
    it.fails('keeps SET 0 and the cursor on the prompt when the inner knob turns (2-4, T5, #NEW-E-4)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 0');
        await unit.panel.cursor('L');
        expect(rows()[3]).toBe('  UPDATE PUBLISHED DB'); // Precondition
        expect(Screen.read().status().left).toBe('CRSR'); // Precondition

        await unit.panel.inner('L', 1);

        expect(unit.errors).toEqual([]);
        expect(rows()[3]).toBe('  UPDATE PUBLISHED DB');
        expect(Screen.read().status().left).toBe('CRSR');

        await unit.panel.inner('L', -1);

        expect(unit.errors).toEqual([]);
        expect(rows()[3]).toBe('  UPDATE PUBLISHED DB');
        expect(Screen.read().status().left).toBe('CRSR');
    });
});

describe('SET 0 page, CLR during the update', () => {
    /** SET 0, cursor on (UPDATE PUBLISHED DB), ENT (the expiry and UPDATE ?), then one CLR */
    async function oneClrFromExpiry() {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 0');
        await unit.panel.cursor('L');
        await unit.panel.ent();
        expect(rows()[5]).toBe('     U P D A T E ?');
        await unit.panel.clr();
        return unit;
    }

    // The sibling of the pin below: one CLR on the expiry page goes back to UPDATE PUBLISHED DB, cursor on
    it('goes back from the expiry to UPDATE PUBLISHED DB with one CLR (characterization)', async () => {
        const unit = await oneClrFromExpiry();

        expect(unit.errors).toEqual([]);
        expect(rows()).toEqual([
            '      U P D A T E',
            '   D A T A   B A S E',
            '',
            '  UPDATE PUBLISHED DB',
            '',
            '',
        ]);
        expect(Screen.read().status().left).toBe('CRSR');
    });

    // 2-5 (the NOTE after step 7): during steps 5 to 7, CLR pressed repeatedly ends the update and brings back the
    // starting SET 0 page of figure 2-2, which has no cursor (ON GROUND ONLY). Set0Page.clear returns false at the first
    // step, so the page stays on UPDATE PUBLISHED DB with the cursor on. The KEY row is not asserted.
    it.fails('ends the update on the starting page after repeated CLR (2-5, #246)', async () => {
        const unit = await oneClrFromExpiry();
        await unit.panel.clr();
        await unit.panel.clr();

        expect(unit.errors).toEqual([]);
        expect(Screen.read().status().left).toBe('SET 0');
        expect(rows().slice(0, 4)).toEqual([
            '      U P D A T E',
            '   D A T A   B A S E',
            '   O N   G R O U N D',
            '        O N L Y',
        ]);
    });
});
