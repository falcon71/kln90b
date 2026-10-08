import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {airport, ndb} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';

// The NDB selector of the NDB page: three cells, NDBs only. KNA is the first NDB, so the page opens on it; KN0 is an
// airport whose identifier sorts before it (digits first). The NDB is on a half kHz, away from #287.
async function knaWithCursor(): Promise<HeadlessUnit> {
    const unit = await bootUnit({
        facilities: [ndb('KNA', 47.2, 8.0, {frequencyKHz: 350.5}), airport('KN0', 47.3, 8.0)],
        position: {lat: 47.0, lon: 8.0},
    });
    await unit.panel.selectPage('R', 'NDB  ');
    await unit.panel.cursor('R');
    expect(unit.panel.focused('R')).toEqual({row: 0, col: 13, text: 'K'}); // precondition
    return unit;
}

describe('NDB selector (3-20, 5-18)', () => {
    // 5-18: an NDB identifier has one to three characters, so the selector has three cells (3-20: the outer knob steps
    // over each).
    // Turning the outer knob on from the first cell, the cursor visits exactly these cells of the identifier row.
    it('has three character cells (3-20, 5-18)', async () => {
        const unit = await knaWithCursor();
        const cols = new Set<number>();

        for (let i = 0; i < 6; i++) {
            const {row, col} = unit.panel.focused('R');
            if (row === 0) cols.add(col);
            await unit.panel.outer('R', 1);
        }

        expect([...cols].sort((a, b) => a - b)).toEqual([13, 14, 15]);
    });

    // 3-20: the NDB page offers the first NDB that begins with the characters entered: KN offers KNA, not the airport
    // KN0. The second character turns away and back, so the search runs for KN
    it('offers an NDB, not the airport that sorts first (3-20)', async () => {
        const unit = await knaWithCursor();
        await unit.panel.outer('R', 1);

        await unit.panel.inner('R', 1);
        await unit.panel.inner('R', -1);

        expect(Screen.read().rows('R')[0].slice(0, 4)).toBe(' KNA');
        expect((unit.props.memory.ndbPage.facility as { icaoStruct: { ident: string } }).icaoStruct.ident).toBe('KNA');
    });
});
