import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {airport} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';

// The CREATE NEW WPT AT: block of the waypoint pages, on APT 1. BAAA is the only airport besides the default one, so
// the page opens on it; one click turns its first character into C, and no airport begins with C.
async function baaaWithCursor(): Promise<HeadlessUnit> {
    // A name no abbreviation touches (#265), a longitude of 10 degrees or more (#230)
    const unit = await bootUnit({
        facilities: [airport('BAAA', 47.2, 10.5, {name: 'ROTH FIELD'})],
        position: {lat: 47.0, lon: 10.5},
    });
    await unit.panel.selectPage('R', 'APT 1');
    await unit.panel.cursor('R');
    expect(unit.panel.focused('R')).toEqual({row: 0, col: 13, text: 'B'}); // precondition
    return unit;
}

const rows = () => Screen.read().rows('R');

describe('create waypoint message (5-16)', () => {
    // 5-16 (figure 5-54): an identifier that is in no database offers the creation of a user waypoint at the user's
    // position or at the present position
    it('offers USER POS? and PRES POS? for an identifier without a waypoint (5-16)', async () => {
        const unit = await baaaWithCursor();

        await unit.panel.inner('R', 1);

        expect(rows().slice(2)).toEqual(['CREATE NEW ', 'WPT AT:    ', 'USER POS?  ', 'PRES POS?  ']);
    });

    // 3-20 and 5-16: once the identifier selects a waypoint again, its page replaces the creation block
    it('goes when the identifier selects a waypoint again (3-20, 5-16)', async () => {
        const unit = await baaaWithCursor();
        await unit.panel.inner('R', 1);

        await unit.panel.inner('R', -1);

        // Screen.read() throws when a half page holds a character below its sixth row (docs/testing.md, section 3),
        // which is where a creation block that stayed visible under the waypoint page would show
        expect(rows()).toEqual([
            ' BAAA      ', 'ROTH FIELD ', '           ', '           ', "N 47°12.00'", "E 10°30.00'",
        ]);
    });

    // 5-16 (figure 5-54): the cursor is moved over USER POS? or PRES POS? to choose; from the identifier the outer knob
    // reaches USER POS? and then PRES POS?. C is followed by three blank cells, which the cursor visits first
    it('puts the cursor on USER POS? and then on PRES POS? (5-16)', async () => {
        const unit = await baaaWithCursor();
        await unit.panel.inner('R', 1);
        const texts: string[] = [];

        for (let i = 0; i < 5; i++) {
            await unit.panel.outer('R', 1);
            texts.push(unit.panel.focused('R').text);
        }

        expect(texts).toEqual([' ', ' ', ' ', 'USER POS?', 'PRES POS?']);
    });
});

// The guide does not say where the cursor goes when the block disappears under it
describe('create waypoint message (characterization)', () => {
    it('no longer stops the cursor on USER POS? and PRES POS? once the block is gone', async () => {
        const unit = await baaaWithCursor();
        await unit.panel.inner('R', 1);
        await unit.panel.inner('R', -1);
        const texts = new Set<string>();

        for (let i = 0; i < 8; i++) {
            await unit.panel.outer('R', 1);
            texts.add(unit.panel.focused('R').text);
        }

        expect([...texts].sort()).toEqual(['A', 'B']);
    });
});
