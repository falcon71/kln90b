import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {savedUserWaypoints} from '../../../harness/storage';

// The supplemental waypoint selector of the SUP page: five cells, supplemental (user) waypoints only. USUPA is the only
// supplemental waypoint, so the page opens on it; USAP is a user airport whose identifier sorts before it.
async function usupaWithCursor(): Promise<HeadlessUnit> {
    const unit = await bootUnit({
        position: {lat: 47.0, lon: 8.0},
        storage: savedUserWaypoints([
            {kind: 'sup', ident: 'USUPA', lat: 47.4, lon: 10.5}, {kind: 'apt', ident: 'USAP', lat: 47.3, lon: 10.5},
        ]),
    });
    await unit.panel.selectPage('R', 'SUP  ');
    await unit.panel.cursor('R');
    expect(unit.panel.focused('R')).toEqual({row: 0, col: 13, text: 'U'}); // precondition
    return unit;
}

describe('supplemental waypoint selector (3-20, 5-18)', () => {
    // 5-18: a supplemental waypoint identifier has one to five characters, so the selector has five cells (3-20: the
    // outer knob steps over each).
    // Turning the outer knob on from the first cell, the cursor visits exactly these cells of the identifier row.
    it('has five character cells (3-20, 5-18)', async () => {
        const unit = await usupaWithCursor();
        const cols = new Set<number>();

        for (let i = 0; i < 8; i++) {
            const {row, col} = unit.panel.focused('R');
            if (row === 0) cols.add(col);
            await unit.panel.outer('R', 1);
        }

        expect([...cols].sort((a, b) => a - b)).toEqual([13, 14, 15, 16, 17]);
    });

    // 3-20: the SUP page offers the first supplemental waypoint that begins with the characters entered: US offers
    // USUPA, not the user airport USAP. The second character turns away and back, so the search runs for US
    it('offers a supplemental waypoint, not the user airport that sorts first (3-20)', async () => {
        const unit = await usupaWithCursor();
        await unit.panel.outer('R', 1);

        await unit.panel.inner('R', 1);
        await unit.panel.inner('R', -1);

        expect(Screen.read().rows('R')[0].slice(0, 6)).toBe(' USUPA');
        const shown = unit.props.memory.supPage.facility as { icaoStruct: { ident: string } };
        expect(shown.icaoStruct.ident).toBe('USUPA');
    });
});
