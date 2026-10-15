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

/**
 * APT 1 of AB. The world holds the airport ABA too (an A entered with the blank dropped would select it) and nothing
 * that begins with AB A. The page opens on AB; the outer knob puts the right cursor on the fourth ident cell, the
 * second blank after the B
 */
async function abWithCursorOnFourthCell(): Promise<HeadlessUnit> {
    const unit = await bootUnit({facilities: [airport('AB', 47.2, 8.0), airport('ABA', 47.3, 8.0)], position: {lat: 47.0, lon: 8.0}});
    await unit.panel.selectPage('R', 'APT 1');
    await unit.panel.cursor('R');
    await unit.panel.outer('R', 3);
    expect(unit.panel.focused('R')).toEqual({row: 0, col: 16, text: ' '}); // precondition
    expect(identRow().slice(1, 5)).toBe('AB  '); // precondition
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

    // 3-20 step 3: from the second character on the blank lies between 9 and A (the first character has none, see the first-character
    // tests below; checked in the KLN 89 trainer, 2026-10-15, #374). The fourth cell of AB is blank
    it('keeps the blank between 9 and A in the fourth character '
        + '(3-20, checked in the KLN 89 trainer, 2026-10-15, #374)', async () => {
        const unit = await abWithCursorOnFourthCell();
        const seen: string[] = [];

        for (const click of [-1, 1, 1]) {
            await unit.panel.inner('R', click);
            seen.push(Screen.read().cell(0, 16).ch);
        }

        expect(seen).toEqual(['9', ' ', 'A']);
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

    // 3-20: the fourth cell of a four-character identifier turns like the others (T to U; KSAU is no airport), and the
    // blank cell of a shorter identifier does too, as the next tests show (#290)
    it('turns the fourth character of a four-character identifier (3-20)', async () => {
        const unit = await ksatWithCursor();
        await unit.panel.outer('R', 3);

        await unit.panel.inner('R', 1);

        expect(identRow()).toBe(' KSAU      ');
    });

    // 3-20: the cursor covers every character position of the identifier; B19 has three characters, so the fourth
    // position is a blank cell that still has a width and shows the cursor (#290)
    it('puts the cursor on the blank fourth cell of the three-character identifier B19 '
        + '(3-20, #290)', async () => {
        const unit = await b19WithCursor();

        await unit.panel.outer('R', 3);

        expect(unit.panel.focused('R')).toEqual({row: 0, col: 16, text: ' '});
    });

    // 3-20: the blank lies between 9 and A, so one click clockwise turns a blank cell into A. Checked in the KLN 89
    // trainer, 2026-10-07 (medium confidence)
    it('turns the blank fourth cell of B19 into an A clockwise '
        + '(3-20, checked in the KLN 89 trainer, 2026-10-07, #290)', async () => {
        const unit = await b19WithCursor();
        await unit.panel.outer('R', 3);

        await unit.panel.inner('R', 1);

        expect(identRow()).toBe(' B19A      ');
    });
});

describe('waypoint selector, the first character (checked in the KLN 89 trainer, 2026-10-15, #374)', () => {
    // 3-20 step 3 puts a blank between 9 and A for the general wheel. The first character of the ident has none: in the
    // KLN 89 trainer (2026-10-15, #374) it ran A to Z, 0 to 9 and back to A on the USR and APT 1 pages (Z to 0, 9 to A,
    // and A to 9, 0 to Z counterclockwise). The other cells keep the blank (the test of the fourth cell below)
    it('steps from A to 9 counterclockwise and from 9 to A clockwise, with no blank in the first character '
        + '(checked in the KLN 89 trainer, 2026-10-15, #374)', async () => {
        const unit = await b19WithCursor();
        await unit.panel.inner('R', -1);
        expect(firstChar()).toBe('A'); // precondition

        await unit.panel.inner('R', -1);
        const below = firstChar();
        await unit.panel.inner('R', 1);

        expect([below, firstChar()]).toEqual(['9', 'A']);
    });

    // The same trainer check, a whole turn: from B clockwise every character once, none of them a blank
    it('turns through the 36 characters of the first character with no blank '
        + '(checked in the KLN 89 trainer, 2026-10-15, #374)', async () => {
        const unit = await b19WithCursor();
        let seen = '';

        for (let click = 0; click < 36; click++) {
            await unit.panel.inner('R', 1);
            seen += firstChar();
        }

        expect(seen).toBe('CDEFGHIJKLMNOPQRSTUVWXYZ0123456789AB');
    });

    // 3-20: letters and digits wrap around, so Z is followed by 0 (checked in the KLN 89 trainer, 2026-10-15, for the
    // first character). B to Z is 24 clicks clockwise
    it('steps from Z to 0 clockwise (checked in the KLN 89 trainer, 2026-10-15, #374)', async () => {
        const unit = await b19WithCursor();
        await unit.panel.inner('R', 24);
        expect(firstChar()).toBe('Z'); // precondition

        await unit.panel.inner('R', 1);

        expect(firstChar()).toBe('0');
    });

    // The characters wrap around in both directions, so 0 is followed by Z counterclockwise (checked in the KLN 89
    // trainer, 2026-10-15, for the first character). B to 0 is eleven clicks counterclockwise (A, then 9 down to 0)
    it('steps from 0 to Z counterclockwise (checked in the KLN 89 trainer, 2026-10-15, #374)', async () => {
        const unit = await b19WithCursor();
        await unit.panel.inner('R', -11);
        expect(firstChar()).toBe('0'); // precondition

        await unit.panel.inner('R', -1);

        expect(firstChar()).toBe('Z');
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

    // The first character offers no blank on the knob (#374), so the keyboard does not take one either. Only an aircraft's
    // H event can send a blank (the PC keyboard path passes A to Z and 0 to 9). The rejected key changes nothing: the
    // cursor stays and the ident stays
    it('rejects a blank typed into the first character (#374)', async () => {
        const unit = await b19WithCursor();

        await unit.panel.press('KLN90B_Internal_Key:RIGHT: ');

        expect(identRow()).toBe(' B19       ');
        expect(unit.panel.focused('R')).toEqual({row: 0, col: 13, text: 'B'});
    });

    // The cells after the first still take a typed blank (the second cell of B19 shows the 1)
    it('takes a blank typed into the second character (#374)', async () => {
        const unit = await b19WithCursor();
        await unit.panel.outer('R', 1);

        await unit.panel.press('KLN90B_Internal_Key:RIGHT: ');

        expect(identRow().slice(0, 4)).toBe(' B  ');
    });
});

// The KLN 89 trainer (2026-10-15): a character entered after a blank cell stays in its cell with the blank before it,
// and the unit searches that ident (#343). The 89 showed the kept blank, no autofill, and the ident searched and offered
// for creation. The 89 has no CREATE NEW / WPT AT: rows, so the rows of the second test are a characterization
describe('waypoint selector, a character after a blank cell (#343)', () => {
    it('keeps the blank before a character entered after it (checked in the KLN 89 trainer, 2026-10-15, #343)', async () => {
        const unit = await abWithCursorOnFourthCell();

        await unit.panel.inner('R', 1);

        expect(identRow().slice(1, 5)).toBe('AB A');
        expect(unit.props.memory.aptPage.ident).toBe('AB A');
    });

    // Background: 5-16 has an ident in no database offer the creation of a user waypoint (held by the spec tests of
    // CreateWaypointMessage.test.ts). What is pinned here is that the ident with the kept blank is the one searched and
    // reaches that state: the world holds the airport ABA, so the rows show only for AB A and not for the ident without
    // its blank
    it('offers the creation for the ident with the kept blank (characterization, #343)', async () => {
        const unit = await abWithCursorOnFourthCell();

        await unit.panel.inner('R', 1);

        expect(Screen.read().rows('R').slice(2, 4)).toEqual(['CREATE NEW ', 'WPT AT:    ']);
    });
});
