import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {airport, intersection} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';

// The intersection selector of the INT page: five cells, intersections only. INTAB is the first intersection, so the
// page opens on it; INT0 is an airport whose identifier sorts before it (digits first).
async function intabWithCursor(): Promise<HeadlessUnit> {
    const unit = await bootUnit({
        facilities: [intersection('INTAB', 47.2, 8.0), airport('INT0', 47.3, 8.0)],
        position: {lat: 47.0, lon: 8.0},
    });
    await unit.panel.selectPage('R', 'INT  ');
    await unit.panel.cursor('R');
    expect(unit.panel.focused('R')).toEqual({row: 0, col: 13, text: 'I'}); // precondition
    return unit;
}

describe('intersection selector (3-20, 5-18)', () => {
    // 5-18: an intersection identifier has one to five characters, so the selector has five cells (3-20: the
    // outer knob steps over each).
    // Turning the outer knob on from the first cell, the cursor visits exactly these cells of the identifier row.
    it('has five character cells (3-20, 5-18)', async () => {
        const unit = await intabWithCursor();
        const cols = new Set<number>();

        for (let i = 0; i < 8; i++) {
            const {row, col} = unit.panel.focused('R');
            if (row === 0) cols.add(col);
            await unit.panel.outer('R', 1);
        }

        expect([...cols].sort((a, b) => a - b)).toEqual([13, 14, 15, 16, 17]);
    });

    // 3-20: the INT page offers the first intersection that begins with the characters entered: INT offers INTAB, not
    // the airport INT0. The third character turns away and back, so the search runs for INT
    it('offers an intersection, not the airport that sorts first (3-20)', async () => {
        const unit = await intabWithCursor();
        await unit.panel.outer('R', 2);

        await unit.panel.inner('R', 1);
        await unit.panel.inner('R', -1);

        expect(Screen.read().rows('R')[0].slice(0, 6)).toBe(' INTAB');
        const shown = unit.props.memory.intPage.facility as { icaoStruct: { ident: string } };
        expect(shown.icaoStruct.ident).toBe('INTAB');
    });
});
