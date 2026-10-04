import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

/** Rows of the right half page that have highlighted (inverted or flashing) cells */
function highlightedRows(screen: Screen): number[] {
    const rows: number[] = [];
    for (let r = 0; r < 6; r++) {
        for (let c = 12; c < 23; c++) {
            if (['I', 'F'].includes(screen.cell(r, c).attr)) {
                rows.push(r);
                break;
            }
        }
    }
    return rows;
}

/** The ident selectors of the APT, VOR, NDB, INT and SUP pages take keyboard keys, not knob steps (enterIdent cannot) */
async function typeRight(unit: HeadlessUnit, text: string): Promise<void> {
    for (const ch of text) {
        unit.send(`KLN90B_Internal_Key:RIGHT:${ch}`);
        await vi.advanceTimersByTimeAsync(250);
    }
}

describe('APT 1 page', () => {
    // 5-19: a user airport is created by entering its latitude and longitude, and the cursor goes to the latitude
    it('creates a user airport at the user position without an error (#65)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('R', 'APT 1');
        await unit.panel.cursor('R');
        await typeRight(unit, 'ZZZZ');
        for (let guard = 0; !highlightedRows(Screen.read()).some(r => Screen.read().row(r).slice(12).startsWith('USER POS?')); guard++) {
            if (guard > 8) throw new Error(`no USER POS?\n${Screen.read().dump()}`);
            await unit.panel.outer('R', 1);
        }
        await unit.panel.ent();

        let screen = Screen.read();
        expect(unit.errors).toEqual([]);
        expect(screen.rightName()).toBe('CRSR ');
        expect(screen.row(0).slice(12)).toBe(' ZZZZ      ');
        // The latitude is the focused field (row 4), the longitude (row 5) is not
        expect(highlightedRows(screen)).toEqual([4]);

        await unit.panel.outer('R', 1);

        screen = Screen.read();
        expect(unit.errors).toEqual([]);
        expect(highlightedRows(screen)).toEqual([5]);
    });
});
