import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {airport, vor} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';

// The airport selector of the APT pages: four cells, airports only. KSAT is the only airport of the world besides the
// default one, so APT 1 opens on it; KSA is a VOR whose identifier begins like KSAT.
async function ksatWithCursor(): Promise<HeadlessUnit> {
    const unit = await bootUnit({
        facilities: [airport('KSAT', 47.5, 8.0), vor('KSA', 47.6, 8.1)],
        position: {lat: 47.0, lon: 8.0},
    });
    await unit.panel.selectPage('R', 'APT 1');
    await unit.panel.cursor('R');
    expect(unit.panel.focused('R')).toEqual({row: 0, col: 13, text: 'K'}); // precondition
    return unit;
}

describe('airport selector (3-20, 5-16)', () => {
    // 5-16: an airport identifier has one to four characters, so the selector has four cells (3-20: the outer knob
    // steps over each).
    // Turning the outer knob on from the first cell, the cursor visits exactly these cells of the identifier row.
    it('has four character cells (3-20, 5-16)', async () => {
        const unit = await ksatWithCursor();
        const cols = new Set<number>();

        for (let i = 0; i < 7; i++) {
            const {row, col} = unit.panel.focused('R');
            if (row === 0) cols.add(col);
            await unit.panel.outer('R', 1);
        }

        expect([...cols].sort((a, b) => a - b)).toEqual([13, 14, 15, 16]);
    });

    // 3-20: the APT page offers the first airport that begins with the characters entered. KSA is a VOR, so the third
    // character A offers the airport KSAT (the C on the way offers nothing)
    it('offers an airport, not the VOR of the same characters (3-20)', async () => {
        const unit = await ksatWithCursor();
        await unit.panel.outer('R', 2);

        await unit.panel.inner('R', 1);
        await unit.panel.inner('R', -1);

        expect(Screen.read().rows('R')[0]).toBe(' KSAT      ');
        expect((unit.props.memory.aptPage.facility as { icaoStruct: { ident: string } }).icaoStruct.ident).toBe('KSAT');
    });
});
