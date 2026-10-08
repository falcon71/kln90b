import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {airport, vor} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';
import {collectStatusMessages} from '../../../harness/statusLine';

// The shared rules of the ident selector of the waypoint pages, on its cheapest host, APT 1 (four cells). The airports
// of the example of 3-20 and 3-21: B19 (the page opens on it, the first airport of the list), K00, KS01 and KSAT; the
// VOR KSA is another type and must not be offered on APT 1. The type-specific rules are in AirportSelector.test.ts,
// VorSelector.test.ts, NdbSelector.test.ts, IntersectionSelector.test.ts and SupplementarySelector.test.ts.
const world = () => ({
    facilities: [
        airport('B19', 47.2, 8.0), airport('K00', 47.3, 8.0), airport('KS01', 47.4, 8.0), airport('KSAT', 47.5, 8.0),
        vor('KSA', 47.6, 8.1),
    ],
    position: {lat: 47.0, lon: 8.0},
});

/** APT 1 of B19 with the right cursor on the first character of the ident */
async function b19WithCursor(): Promise<HeadlessUnit> {
    const unit = await bootUnit(world());
    await unit.panel.selectPage('R', 'APT 1');
    await unit.panel.cursor('R');
    expect(unit.panel.focused('R')).toEqual({row: 0, col: 13, text: 'B'}); // precondition
    return unit;
}

/** APT 1 of KSAT, the only airport of its world besides the default one, the right cursor on its first character */
async function ksatWithCursor(): Promise<HeadlessUnit> {
    const unit = await bootUnit({facilities: [airport('KSAT', 47.5, 8.0)], position: {lat: 47.0, lon: 8.0}});
    await unit.panel.selectPage('R', 'APT 1');
    await unit.panel.cursor('R');
    return unit;
}

const identRow = () => Screen.read().rows('R')[0];
const firstChar = () => Screen.read().cell(0, 13).ch;

describe('waypoint selector (3-20, 3-21)', () => {
    // 3-20 and 3-21, figures 3-61 to 3-66: K on the first character offers K00 (numbers sort before letters), S on the
    // second KS01, A on the third KSAT, and the page shows KSAT. The clicks follow the wheel of 3-20: B to K is nine
    // clicks clockwise, 0 to S eight counterclockwise (past Z), 0 to A eleven clockwise (past 9 and the blank). KSA
    // is a VOR, so the APT selector does not offer it.
    it('selects KSAT by its first three characters, offering K00 and KS01 on the way (3-20, 3-21)', async () => {
        const unit = await b19WithCursor();
        const rows: string[] = [];

        await unit.panel.inner('R', 9);
        rows.push(identRow());
        await unit.panel.outer('R', 1);
        await unit.panel.inner('R', -8);
        rows.push(identRow());
        await unit.panel.outer('R', 1);
        await unit.panel.inner('R', 11);
        rows.push(identRow());

        expect(rows).toEqual([' K00       ', ' KS01      ', ' KSAT      ']);
        expect((unit.props.memory.aptPage.facility as { icaoStruct: { ident: string } }).icaoStruct.ident).toBe('KSAT');
    });

    // 3-20 step 3: the characters wrap around, with a blank between 9 and A
    it('steps from A to the blank to 9 counterclockwise and back clockwise (3-20)', async () => {
        const unit = await b19WithCursor();
        const seen: string[] = [];

        for (const click of [-1, -1, -1, 1, 1]) {
            await unit.panel.inner('R', click);
            seen.push(firstChar());
        }

        expect(seen).toEqual(['A', ' ', '9', ' ', 'A']);
    });

    // 3-20: letters and digits wrap around, so Z is followed by 0 (the blank lies between 9 and A only). B to Z is 24
    // clicks clockwise
    it('steps from Z to 0 clockwise (3-20)', async () => {
        const unit = await b19WithCursor();
        await unit.panel.inner('R', 24);
        expect(firstChar()).toBe('Z'); // precondition

        await unit.panel.inner('R', 1);

        expect(firstChar()).toBe('0');
    });

    // 3-20: the characters wrap around in both directions, so 0 is followed by Z counterclockwise. B to 0 is twelve
    // clicks counterclockwise (past A and the blank)
    it('steps from 0 to Z counterclockwise (3-20)', async () => {
        const unit = await b19WithCursor();
        await unit.panel.inner('R', -12);
        expect(firstChar()).toBe('0'); // precondition

        await unit.panel.inner('R', -1);

        expect(firstChar()).toBe('Z');
    });

    // 3-20 steps 2 and 4: the cursor starts over the first character, and each step of the outer knob moves it over the
    // next character. KSAT fills all four cells
    it('moves the cursor over each character of the identifier (3-20)', async () => {
        const unit = await ksatWithCursor();
        const cells = [unit.panel.focused('R')];

        for (let i = 0; i < 3; i++) {
            await unit.panel.outer('R', 1);
            cells.push(unit.panel.focused('R'));
        }

        expect(cells).toEqual([
            {row: 0, col: 13, text: 'K'}, {row: 0, col: 14, text: 'S'},
            {row: 0, col: 15, text: 'A'}, {row: 0, col: 16, text: 'T'},
        ]);
    });

    // 3-20: sibling of the #290 pins: the fourth cell of a four-character identifier turns like the others (T to U;
    // KSAU is no airport)
    it('turns the fourth character of a four-character identifier (3-20)', async () => {
        const unit = await ksatWithCursor();
        await unit.panel.outer('R', 3);

        await unit.panel.inner('R', 1);

        expect(identRow()).toBe(' KSAU      ');
    });

    // 3-20: the cursor covers every character position of the identifier; B19 has three characters, so the fourth
    // position is a blank. The selector builds that cell without a character (WaypointSelector.tsx:44), so it has no
    // width and shows no cursor (#290)
    it.fails('puts the cursor on the blank fourth cell of the three-character identifier B19 '
        + '(3-20, #290)', async () => {
        const unit = await b19WithCursor();

        await unit.panel.outer('R', 3);

        expect(unit.panel.focused('R')).toEqual({row: 0, col: 16, text: ' '});
    });

    // 3-20: the blank lies between 9 and A, so one click clockwise turns a blank cell into A. Checked in the KLN 89
    // trainer, 2026-10-07 (medium confidence). The selector gives 0 (#290)
    it.fails('turns the blank fourth cell of B19 into an A clockwise '
        + '(3-20, checked in the KLN 89 trainer, 2026-10-07, #290)', async () => {
        const unit = await b19WithCursor();
        await unit.panel.outer('R', 3);

        await unit.panel.inner('R', 1);

        expect(identRow()).toBe(' B19A      ');
    });
});

describe('waypoint selector, duplicate identifiers (C-1)', () => {
    // Two VORs named ABC in different regions, and KSA and KSB, which share a beginning but not the identifier. The VOR
    // page is the host because APT 1 identifiers are unique here
    const dupWorld = () => ({
        facilities: [
            vor('ABC', 46.0, 8.0, {region: 'LS'}), vor('ABC', 49.0, 8.0, {region: 'ED'}),
            vor('KSA', 47.6, 8.1), vor('KSB', 47.7, 8.1),
        ],
        position: {lat: 47.0, lon: 8.0},
    });

    // C-1: DUP IDENT shows when the selected identifier belongs to more than one waypoint of the page's type
    it('posts DUP IDENT for an identifier two VORs share (C-1)', async () => {
        const unit = await bootUnit(dupWorld());
        await unit.panel.selectPage('R', 'VOR  ');
        await unit.panel.cursor('R');
        const messages = collectStatusMessages(unit);

        await unit.panel.enterIdent('R', 'ABC');

        expect(messages).toEqual(['DUP IDENT']);
    });

    // C-1 and 3-21: an identifier the autocompletion offers is the selected one, so a shared one posts DUP IDENT too.
    // K to A on the first character of KSA offers the first ABC
    it('posts DUP IDENT for a shared identifier the autocompletion offers (C-1, 3-21)', async () => {
        const unit = await bootUnit(dupWorld());
        await unit.panel.selectPage('R', 'VOR  ');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'KSA');
        const messages = collectStatusMessages(unit);
        await unit.panel.outer('R', -2);

        await unit.panel.inner('R', -10);

        expect(identRow().slice(0, 4)).toBe(' ABC');
        expect(messages).toEqual(['DUP IDENT']);
    });

    // C-1, the other side: an identifier only one VOR has posts nothing, although KSB begins with the same letters
    it('posts nothing for an identifier only one VOR has (C-1)', async () => {
        const unit = await bootUnit(dupWorld());
        await unit.panel.selectPage('R', 'VOR  ');
        await unit.panel.cursor('R');
        const messages = collectStatusMessages(unit);

        await unit.panel.enterIdent('R', 'KSA');

        expect(identRow().slice(0, 4)).toBe(' KSA');
        expect(messages).toEqual([]);
    });
});

// No guide page says what a character without any matching identifier does to the characters after it, nor anything
// about the keyboard (a simulator addition)
describe('waypoint selector (characterization)', () => {
    it('drops the characters after a turned one when no identifier begins with the new characters', async () => {
        const unit = await b19WithCursor();

        await unit.panel.inner('R', 1);

        expect(identRow()).toBe(' C         ');
        expect(unit.props.memory.aptPage.facility).toBeNull();
        expect(unit.props.memory.aptPage.ident).toBe('C');
    });

    it('types a character per key, offers the first matching airport and moves to the next cell', async () => {
        const unit = await b19WithCursor();
        const rows: string[] = [];

        for (const key of ['K', 'S', 'A']) {
            await unit.panel.type('R', key);
            rows.push(identRow());
        }

        expect(rows).toEqual([' K00       ', ' KS01      ', ' KSAT      ']);
        expect(unit.panel.focused('R')).toEqual({row: 0, col: 16, text: 'T'});
    });
});
