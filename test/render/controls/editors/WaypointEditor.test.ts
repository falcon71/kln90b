import {describe, expect, it, vi} from 'vitest';
import {Facility} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {airport, vor} from '../../../harness/navdata/builders';
import {blinkCycle} from '../../../harness/render/blink';
import {Screen} from '../../../harness/render/screen';
import {activeIdent, fplIdents} from '../../../harness/readers';
import {collectStatusMessages} from '../../../harness/statusLine';
import {savedFlightplan} from '../../../harness/storage';

describe('waypoint editor', () => {
    // 3-14: an entered waypoint is shown on the right for confirmation, and the waypoint on the left flashes meanwhile
    it('flashes the ident of an FPL leg that awaits confirmation (8c3b2e0)', async () => {
        const unit = await bootUnit({facilities: [airport('KAAA', 47.1, 8.0)]});
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.enterIdent('L', 'KAAA');

        await unit.panel.ent();

        // Awaiting the confirmation: the waypoint page of KAAA is on the right
        expect(Screen.read().status().right).toBe('APT 1');
        expect(Screen.read().rows('L')[1].slice(0, 9)).toBe('  1:KAAA ');
        // The ident cells are inverted, and flash (inverted blink) on one display tick in four
        const masks = await blinkCycle(() => Screen.read().maskRows('L')[1].slice(4, 9));
        expect(masks.slice().sort()).toEqual(['FFFFF', 'IIIII', 'IIIII', 'IIIII']);
    });
});

// The example of 3-20 and 3-21, laid out for an editor that searches every waypoint type: the airports K00, KS01 and
// KSAT, and the VOR KSA, which sorts between KS01 and KSAT. Digits sort before letters (3-21). KAAA is the first
// waypoint of the plan tests. The idents that begin with A (the airport AMID and the VOR ALF, which sorts first) are
// for the first click of the inner knob. All lie north of the aircraft.
const kaaa = () => airport('KAAA', 47.1, 8.0);
const world = () => ({
    facilities: [
        airport('K00', 47.3, 8.0), airport('KS01', 47.4, 8.0), airport('KSAT', 47.5, 8.0), vor('KSA', 47.6, 8.1),
        kaaa(), airport('AMID', 47.7, 8.0), vor('ALF', 47.8, 8.1),
    ],
    position: {lat: 47.0, lon: 8.0},
});

/** The identifier row of the DIRECT TO page: three blanks, the five cells of the editor, three blanks */
const dctIdent = () => Screen.read().rows('L')[2];

/**
 * D-> on a unit without an active waypoint: the DIRECT TO page with five blank cells under the cursor (3-27 rule 5).
 * `extra` adds facilities to the world
 */
async function blankDirectTo(extra: Facility[] = []): Promise<HeadlessUnit> {
    const unit = await bootUnit({...world(), facilities: [...world().facilities, ...extra]});
    await unit.panel.selectPage('R', 'NAV 1');
    await unit.panel.dct();
    expect(unit.panel.focused('L')).toEqual({row: 2, col: 3, text: '     '}); // precondition
    return unit;
}

/**
 * The first inner click starts the entry and gives an A (#311). The knob tests start from the first cell showing `ch`:
 * they turn it clockwise from there until it does.
 */
async function startEntryAt(unit: HeadlessUnit, ch: string): Promise<void> {
    await unit.panel.inner('L', 1);
    for (let clicks = 0; dctIdent()[3] !== ch; clicks++) {
        if (clicks > 40) throw new Error(`startEntryAt: the first cell does not reach ${ch}\n${Screen.read().dump()}`);
        await unit.panel.inner('L', 1);
    }
}

describe('waypoint editor, the knobs (3-14, 3-20)', () => {
    // 3-20 step 3: from the second character on the blank lies between 9 and A (the first character has none, see the first-character
    // tests below; checked in the KLN 89 trainer, 2026-10-15, #374). The fifth cell after K00 is blank; the character
    // that follows the fourth is not offered an autocompletion
    it('keeps the blank between 9 and A in the fifth character '
        + '(3-20, checked in the KLN 89 trainer, 2026-10-15, #374)', async () => {
        const unit = await blankDirectTo();
        await startEntryAt(unit, 'K');
        await unit.panel.outer('L', 4);
        const seen: string[] = [];

        for (const click of [-1, 1, 1]) {
            await unit.panel.inner('L', click);
            seen.push(dctIdent()[7]);
        }

        expect(seen).toEqual(['9', ' ', 'A']);
    });

    // 3-14 step 6 and 3-21: after each character the unit offers the first identifier in the database that begins with
    // the characters entered so far, numbers before letters (K00 before the K-letter idents). The DIRECT TO page takes
    // a waypoint of any type, so KSA (a VOR) comes between KS01 and KSAT. The clicks follow the wheel of 3-20: S is
    // eight before 0, A eleven after 0 and T twenty after the blank.
    it('offers the first identifier that begins with the characters entered, digits first (3-14, 3-21)', async () => {
        const unit = await blankDirectTo();
        await startEntryAt(unit, 'K');
        const offered: string[] = [dctIdent()];

        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', -8);
        offered.push(dctIdent());
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 11);
        offered.push(dctIdent());
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 20);
        offered.push(dctIdent());

        expect(offered).toEqual(['   K00     ', '   KS01    ', '   KSA     ', '   KSAT    ']);
    });

    // 3-28 step 3 (3-14 step 4): the outer knob moves the flashing part of the cursor to the next character; the other
    // cells of the identifier stay inverted
    it('flashes the character under the cursor and keeps the rest inverted (3-14, 3-28)', async () => {
        const unit = await blankDirectTo();
        await startEntryAt(unit, 'K');
        await unit.panel.outer('L', 1);

        const masks = await blinkCycle(() => Screen.read().maskRows('L')[2].slice(3, 8));

        expect(masks.slice().sort()).toEqual(['IFIII', 'IIIII', 'IIIII', 'IIIII']);
    });
});

describe('waypoint editor, the first character (checked in the KLN 89 trainer, 2026-10-15, #374)', () => {
    // 3-20 step 3 puts a blank between 9 and A for the general wheel. The first character of the ident has none: in the
    // KLN 89 trainer (2026-10-15, #374) it ran A to Z, 0 to 9 and back to A in the D-> field, in an FPL 0 insert and at
    // the FPL 0 end position (Z to 0, 9 to A, and A to 9, 0 to Z counterclockwise). The other cells keep the blank (the
    // test of the fifth character below)
    it('steps from A to 9 counterclockwise and from 9 to A clockwise, with no blank in the first character '
        + '(checked in the KLN 89 trainer, 2026-10-15, #374)', async () => {
        const unit = await blankDirectTo();
        await startEntryAt(unit, 'A');

        await unit.panel.inner('L', -1);
        const below = dctIdent()[3];
        await unit.panel.inner('L', 1);

        expect([below, dctIdent()[3]]).toEqual(['9', 'A']);
    });

    // The same trainer check, a whole turn: from A clockwise every character once, none of them a blank. The characters
    // that no identifier of the world begins with blank the rest, so only the first cell is read
    it('turns through the 36 characters of the first character with no blank '
        + '(checked in the KLN 89 trainer, 2026-10-15, #374)', async () => {
        const unit = await blankDirectTo();
        await startEntryAt(unit, 'A');
        let seen = '';

        for (let click = 0; click < 36; click++) {
            await unit.panel.inner('L', 1);
            seen += dctIdent()[3];
        }

        expect(seen).toBe('BCDEFGHIJKLMNOPQRSTUVWXYZ0123456789A');
    });

    // 3-20: letters and digits wrap around: Z is followed by 0 (checked in the KLN 89 trainer, 2026-10-15, for the first
    // character)
    it('steps from Z to 0 clockwise (checked in the KLN 89 trainer, 2026-10-15, #374)', async () => {
        const unit = await blankDirectTo();
        await startEntryAt(unit, 'Z');

        await unit.panel.inner('L', 1);

        expect(dctIdent()[3]).toBe('0');
    });

    // The same wheel counterclockwise: 0 is followed by Z
    it('steps from 0 to Z counterclockwise (checked in the KLN 89 trainer, 2026-10-15, #374)', async () => {
        const unit = await blankDirectTo();
        await startEntryAt(unit, '0');

        await unit.panel.inner('L', -1);

        expect(dctIdent()[3]).toBe('Z');
    });
});

// 3-14 says an editor is entered by turning the inner knob, and the KLN 89 trainer (2026-10-08, T6) shows what the
// first click does: it puts an A in the first cell and offers the first identifier that begins with A, as it does for a
// blank DIRECT TO field, a blank FPL 0 position and an inserted FPL position. The 90B has no SET 5 (the 89's default
// first character), so the 89's A is taken for the 90B. The first click counterclockwise gives a 9 and the first
// identifier that begins with 9 (checked in the KLN 89 trainer, 2026-10-15)
describe('waypoint editor, the first inner click (3-14, checked in the KLN 89 trainer, 2026-10-08 and 2026-10-15)', () => {
    // The sibling below holds the setup (the same click on the same page)
    it('shows an A and the first identifier that begins with A after the first click '
        + '(3-14, checked in the KLN 89 trainer, 2026-10-08, #311)', async () => {
        const unit = await blankDirectTo();

        await unit.panel.inner('L', 1);

        expect(dctIdent()).toBe('   ALF     ');
    });

    // The same click the other way round (checked in the KLN 89 trainer, 2026-10-15, evening block, #311): a 9 and the
    // first identifier that begins with 9. The airport 9A4 is added to the world; the others begin with letters
    it('shows a 9 and the first identifier that begins with 9 after the first click counterclockwise '
        + '(checked in the KLN 89 trainer, 2026-10-15, #311)', async () => {
        const unit = await blankDirectTo([airport('9A4', 47.9, 8.0)]);

        await unit.panel.inner('L', -1);

        expect(dctIdent()).toBe('   9A4     ');
    });

    // The same, in a world where no identifier begins with 9: the 9 shows and the other cells are blank
    it('shows a 9 and blanks after the first click counterclockwise when no identifier begins with 9 '
        + '(checked in the KLN 89 trainer, 2026-10-15, #311)', async () => {
        const unit = await blankDirectTo();

        await unit.panel.inner('L', -1);

        expect(dctIdent()).toBe('   9       ');
    });

    // 3-14: the inner knob over an editor starts the entry with the first character under the cursor (it
    // flashes, the other cells stay inverted). The ent annunciation is shown at this point in the KLN 89 trainer
    // (2026-10-08, its Ent prompt while an edit is open); the 90B figures show ent only for a complete identifier
    // (figure 3-45). Only the flashing cell is asserted, not the run's text (the test above)
    it('starts the entry under the cursor with the first click (3-14)', async () => {
        const unit = await blankDirectTo();

        await unit.panel.inner('L', 1);
        await vi.advanceTimersByTimeAsync(6000); // the status line messages of the page change

        const masks = await blinkCycle(() => Screen.read().maskRows('L')[2].slice(3, 8));
        expect(masks.slice().sort()).toEqual(['FIIII', 'IIIII', 'IIIII', 'IIIII']);
        expect(Screen.read().status()).toEqual({left: 'CRSR', mode: 'enr-leg ent', right: 'NAV 1'});
    });
});

describe('waypoint editor, the outer knob (checked in the KLN 89 trainer, 2026-10-08)', () => {
    /** K00 entered with the first cell under the cursor */
    async function k00Entered(): Promise<HeadlessUnit> {
        const unit = await blankDirectTo();
        await startEntryAt(unit, 'K');
        expect(dctIdent()).toBe('   K00     '); // precondition
        return unit;
    }

    // The 90B guide is silent on the outer knob past the last character. The KLN 89 trainer (2026-10-08, T1: an FPL 0
    // ident typed to its fifth character, two more clicks) kept the cursor on the fifth. Sibling: the test below, the
    // same turns up to the fifth cell
    it('keeps the cursor on the fifth character when the outer knob goes on '
        + '(checked in the KLN 89 trainer, 2026-10-08, #306)', async () => {
        const unit = await k00Entered();
        await unit.panel.outer('L', 5);

        await unit.panel.inner('L', 1);

        expect(dctIdent()).toBe('   K00 A   ');
    });

    // The same trainer check, counterclockwise: before the first character the cursor stays on it, so the next inner
    // click turns the first character (K to L) and not the fifth
    it('keeps the cursor on the first character when the outer knob turns back '
        + '(checked in the KLN 89 trainer, 2026-10-08, #306)', async () => {
        const unit = await k00Entered();
        await unit.panel.outer('L', -1);

        await unit.panel.inner('L', 1);

        expect(dctIdent()).toBe('   L       ');
    });

    // 3-14 and 3-28: the outer knob moves the cursor over the five characters; on the fifth a click turns that cell
    // (the blank after K00 becomes A; the autocompletion stops at the fifth cell)
    it('turns the fifth character after four clicks of the outer knob (3-14, 3-28)', async () => {
        const unit = await k00Entered();
        await unit.panel.outer('L', 4);

        await unit.panel.inner('L', 1);

        expect(dctIdent()).toBe('   K00 A   ');
    });
});

describe('waypoint editor, the confirmation (3-14, 3-28)', () => {
    /** KSAT typed on the blank DIRECT TO page and ENT: the APT 1 page of KSAT awaits the approval */
    async function ksatAwaitingApproval(): Promise<HeadlessUnit> {
        const unit = await blankDirectTo();
        await unit.panel.enterIdent('L', 'KSAT');
        await unit.panel.ent();
        expect(Screen.read().status()).toEqual({left: 'CRSR', mode: 'enr-leg ent', right: 'APT 1'}); // precondition
        return unit;
    }

    // 3-28 steps 6 and 7: ENT shows the waypoint page, the second ENT approves it and KSAT is the active Direct To
    // waypoint; the right side shows NAV 1
    it('makes the typed waypoint the Direct To waypoint with the second ENT (3-28)', async () => {
        const unit = await ksatAwaitingApproval();

        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        expect(activeIdent(unit)).toBe('KSAT');
        expect(unit.props.memory.navPage.activeWaypoint.isDctNavigation()).toBe(true);
        expect(Screen.read().status().right).toBe('NAV 1');
    });

    // 3-29 (D->, CLR, ENT cancels a Direct To) and 4-2 step 7 (CLR after a wrong identifier, then begin again): CLR
    // while the waypoint page awaits approval removes that page and blanks the identifier
    it('closes the waypoint page and blanks the identifier on CLR (3-29, 4-2)', async () => {
        const unit = await ksatAwaitingApproval();

        await unit.panel.clr();

        expect(Screen.read().status().right).toBe('NAV 1');
        expect(dctIdent()).toBe('           ');
        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()).toBeNull();
    });

    // Checked in the KLN 89 trainer, 2026-10-08 (T19): with a Direct To active, D-> and another identifier, ENT (its
    // waypoint page), CLR, ENT cancelled the Direct To. The KLN 89 trainer and 3-29 agree (D->, CLR, ENT cancels)
    it('cancels the active Direct To with ENT after CLR on the confirmation of another identifier '
        + '(3-29, checked in the KLN 89 trainer, 2026-10-08)', async () => {
        const unit = await bootUnit(world());
        await unit.panel.selectPage('R', 'NAV 1');
        await unit.panel.directTo('KAAA');
        expect(activeIdent(unit)).toBe('KAAA'); // precondition
        await unit.panel.dct();
        await unit.panel.inner('L', 1); // 3-28 note: the knob over the shown identifier starts another entry
        await unit.panel.enterIdent('L', 'KSAT');
        await unit.panel.ent();
        expect(Screen.read().status().right).toBe('APT 1'); // precondition
        await unit.panel.clr();
        expect(Screen.read().status().right).toBe('NAV 1'); // precondition
        expect(dctIdent()).toBe('           ');

        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        const aw = unit.props.memory.navPage.activeWaypoint;
        expect(aw.getActiveWpt()).toBeNull();
        expect(aw.isDctNavigation()).toBe(false);
    });
});

describe('waypoint editor on FPL 0 (4-2)', () => {
    /** FPL 0 holds KAAA, the cursor is on the blank position 2, KSAT is typed and ENT pressed: APT 1 awaits approval */
    async function ksatOnPosition2(): Promise<HeadlessUnit> {
        const unit = await bootUnit({...world(), storage: savedFlightplan(0, [kaaa()])});
        await unit.panel.selectPage('R', 'NAV 1');
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 1);
        await unit.panel.enterIdent('L', 'KSAT');
        await unit.panel.ent();
        expect(Screen.read().status().right).toBe('APT 1'); // precondition: the waypoint page awaits approval
        return unit;
    }

    // 4-2 steps 7 and 8 (figures 4-6 and 4-7): the second ENT approves the waypoint page, the waypoint is in the plan,
    // and the cursor moves to the next (blank) position
    it('adds the approved waypoint to the plan and moves the cursor to the next position (4-2)', async () => {
        const unit = await ksatOnPosition2();

        await unit.panel.ent();

        expect(fplIdents(unit)).toEqual(['KAAA', 'KSAT']);
        expect(Screen.read().rows('L').slice(1, 4)).toEqual(['  1:KAAA   ', '  2:KSAT   ', '  3:       ']);
        expect(unit.panel.focused('L')).toEqual({row: 3, col: 4, text: '     '});
        expect(Screen.read().status().right).toBe('NAV 1');
    });

    // 4-2 step 7: if the wrong identifier was entered, CLR (while its waypoint page is shown) and begin again. Checked
    // in the KLN 89 trainer, 2026-10-08 (T18): CLR took the waypoint page away, left the blank position under the
    // cursor with no typed identifier, and the next ENT added nothing. Sibling: the test above (the same setup)
    it('removes the waypoint page on CLR and leaves the blank position under the cursor, so ENT adds nothing '
        + '(4-2, checked in the KLN 89 trainer, 2026-10-08, #310)', async () => {
        const unit = await ksatOnPosition2();

        await unit.panel.clr();

        expect(Screen.read().status().right).toBe('NAV 1');
        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['  1:KAAA   ', '  2:       ']);
        expect(unit.panel.focused('L')).toEqual({row: 2, col: 4, text: '     '});
        await unit.panel.ent();
        expect(fplIdents(unit)).toEqual(['KAAA']);
    });
});

describe('waypoint editor on FPL 0, the first inner click (4-2, checked in the KLN 89 trainer, 2026-10-15)', () => {
    // The end position of FPL 0 behaves as the D-> field does (the evening block of 2026-10-15): the first click
    // clockwise gives an A and the first identifier that begins with A (the VOR ALF sorts before the airport AMID)
    it('shows an A and the first identifier that begins with A at the blank end position after the first click '
        + '(checked in the KLN 89 trainer, 2026-10-15, #311)', async () => {
        const unit = await bootUnit({...world(), storage: savedFlightplan(0, [kaaa()])});
        await unit.panel.selectPage('R', 'NAV 1');
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 1);
        expect(unit.panel.focused('L')).toEqual({row: 2, col: 4, text: '     '}); // precondition

        await unit.panel.inner('L', 1);

        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['  1:KAAA   ', '  2:ALF    ']);
    });
});

describe('waypoint editor on FPL 0, CLR on a blank position (characterization)', () => {
    // 4-2 step 7 has CLR reject the typed identifier of a waypoint page. What follows is the code's behavior, not shown
    // by the manual: on an insert in front of a waypoint the ENT that confirms the blank ends the insert, the row goes,
    // nothing is added, and the cursor rests on the waypoint the insert was in front of (#310). The trainer check T18
    // (docs/kln89-trainer-record.md) records only that CLR during the FPL 0 confirmation returns to the blank position
    // with the cursor on it. That position at the end of FPL 0 is the setup of the #310 test in the describe above
    // ('removes the waypoint page on CLR ...'), not of this one.
    it('characterization: ends an insert in the middle on CLR and ENT, with the cursor on the following waypoint (#310)', async () => {
        const unit = await bootUnit({...world(), storage: savedFlightplan(0, [kaaa(), airport('KSAT', 47.5, 8.0)])});
        await unit.panel.selectPage('R', 'NAV 1');
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.cursorTo('L', 'KSAT');
        await unit.panel.inner('L', 1); // opens a blank position in front of KSAT
        await unit.panel.enterIdent('L', 'AMID');
        await unit.panel.ent();
        expect(Screen.read().status().right).toBe('APT 1'); // Precondition: AMID awaits approval

        await unit.panel.clr();
        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        expect(fplIdents(unit)).toEqual(['KAAA', 'KSAT']);
        expect(unit.panel.focused('L').text).toBe('KSAT ');
        expect(Screen.read().status().right).toBe('NAV 1');
    });

    // CLR is accepted on a blank position while an identifier is typed and not yet entered: the editor's default CLR
    // blanks the typed text and waits for ENT, as on the DIRECT TO page. The blank row reads like the #310 test above.
    // Before #310 CLR was ignored here
    it('characterization: CLR while typing on a blank position blanks the ident, and ENT then adds nothing (#310)', async () => {
        const unit = await bootUnit({...world(), storage: savedFlightplan(0, [kaaa()])});
        await unit.panel.selectPage('R', 'NAV 1');
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 1);
        await unit.panel.enterIdent('L', 'KSAT');

        await unit.panel.clr();

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')[2]).toBe('  2:       ');

        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        expect(fplIdents(unit)).toEqual(['KAAA']);
    });
});

describe('waypoint editor, the alternative entry (3-15)', () => {
    // 3-15 (figures 3-48 to 3-50): with the cursor over a waypoint field on the left and a waypoint page on the right,
    // ENT puts that page's identifier into the field, flashing; the second ENT approves it. TRI 3 is the host (its
    // first field is a waypoint, 5-5); after the approval the cursor moves on to the second waypoint
    it('takes the waypoint of the right page with ENT and approves it with the second ENT (3-15)', async () => {
        const unit = await bootUnit(world());
        await unit.panel.selectPage('R', 'APT 1');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'KSAT');
        await unit.panel.cursor('R');
        await unit.panel.selectPage('L', 'TRI 3');
        await vi.advanceTimersByTimeAsync(6000); // the status line messages of the page change
        await unit.panel.cursor('L');
        expect(Screen.read().rows('L')[0]).toBe('     -     '); // precondition: no waypoint yet

        await unit.panel.ent();
        const masks = await blinkCycle(() => Screen.read().maskRows('L')[0].slice(0, 5));
        expect(Screen.read().rows('L')[0]).toBe('KSAT -     ');
        expect(masks.slice().sort()).toEqual(['FFFFF', 'IIIII', 'IIIII', 'IIIII']);
        expect(unit.props.memory.triPage.tri3From).toBeNull();

        await unit.panel.ent();

        expect(unit.props.memory.triPage.tri3From!.icaoStruct.ident).toBe('KSAT');
        expect(unit.panel.focused('L')).toEqual({row: 0, col: 6, text: '     '});
    });
});

// C-2: the Reference Waypoint page, which hosts the same editor, answers an identifier in no database with NO SUCH WPT.
// The message is also what keeps a fix of #262 (the creation offer on DIRECT TO and FPL 0) from reaching this page
describe('waypoint editor on the REF page (C-2)', () => {
    it('posts NO SUCH WPT for an identifier in no database (C-2)', async () => {
        const unit = await bootUnit(world());
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.selectPage('R', 'REF  ');
        await unit.panel.cursor('R');
        const messages = collectStatusMessages(unit);
        await unit.panel.type('R', 'QQQQ');

        await unit.panel.ent();

        expect(messages).toEqual(['NO SUCH WPT']);
    });
});

describe('waypoint editor with an unknown identifier', () => {
    // The KLN 89 trainer (2026-10-07, 2026-10-15) showed the creation offer with the knobs: an identifier that is not
    // in the database, entered with D->, offers the creation of a user waypoint on the right page, and the D-> field
    // keeps the ident. The 89 has no keyboard path, so this one is a characterization: the identifier typed with the
    // keyboard reaches the same check (WaypointEditor.enter). The knob path is held by the DIRECT TO and FPL page tests
    it('offers to create a user waypoint for an identifier typed with the keyboard '
        + '(characterization of the keyboard path, #262)', async () => {
        const unit = await blankDirectTo();
        const messages = collectStatusMessages(unit);
        await unit.panel.type('L', 'QQQQ');
        const nav1 = Screen.read().rows('R');

        await unit.panel.ent();

        expect(messages).not.toContain('NO SUCH WPT');
        expect(Screen.read().rows('R')).not.toEqual(nav1); // the right page is replaced
        expect(dctIdent()).toBe('   QQQQ    ');
    });

    // The maintainer's ruling on #262: the creation page on D-> is the SUP page in its creation state
    it('shows the creation rows of the SUP page for an identifier typed with the keyboard (characterization, #262)', async () => {
        const unit = await blankDirectTo();
        await unit.panel.type('L', 'QQQQ');

        await unit.panel.ent();

        expect(Screen.read().rows('R')).toEqual([
            ' QQQQ      ', '           ', 'CREATE NEW ', 'WPT AT:    ', 'USER POS?  ', 'PRES POS?  ',
        ]);
    });

    // The maintainer's ruling on #262: only the flight plan pages and D-> offer the creation; the other hosts of the
    // editor answer NO SUCH WPT, as REF does (C-2). TRI 3 stands for them
    it('posts NO SUCH WPT on TRI 3, which offers no creation (characterization, #262)', async () => {
        const unit = await bootUnit(world());
        await unit.panel.selectPage('R', 'NAV 1');
        await unit.panel.selectPage('L', 'TRI 3');
        await vi.advanceTimersByTimeAsync(6000); // the status line messages of the page change
        await unit.panel.cursor('L');
        const messages = collectStatusMessages(unit);
        await unit.panel.type('L', 'QQQQ');

        await unit.panel.ent();

        expect(messages).toEqual(['NO SUCH WPT']);
        expect(Screen.read().status().right).toBe('NAV 1');
    });
});

// The first character offers no blank on the knob (#374), so the keyboard does not take one either. The 89 has no
// keyboard, and only an aircraft's H event can send a blank (the PC keyboard path passes A to Z and 0 to 9), so these
// are characterizations
describe('waypoint editor, a blank typed into the first character (characterization, #374)', () => {
    const BLANK_KEY = 'KLN90B_Internal_Key:LEFT: ';

    // The key is refused before the edit opens: nothing is half-entered, the field is still the idle blank field and
    // the status line shows no ent
    it('rejects the key on an idle field and leaves no open edit (characterization, #374)', async () => {
        const unit = await blankDirectTo();

        await unit.panel.press(BLANK_KEY);

        expect(unit.panel.focused('L')).toEqual({row: 2, col: 3, text: '     '});
        expect(Screen.read().status().mode.split(' ')).not.toContain('ent'); // an open edit shows ent
    });

    // The cursor is on the first character of an open edit: the key changes nothing
    it('rejects the key on the first character of an open edit (characterization, #374)', async () => {
        const unit = await blankDirectTo();
        await startEntryAt(unit, 'K');

        await unit.panel.press(BLANK_KEY);

        expect(dctIdent()).toBe('   K00     ');
    });

    /** FPL 0 holds KAAA; the left cursor is on `onBlankEnd ? the blank end position : KAAA` */
    async function fpl0WithCursor(onBlankEnd: boolean): Promise<HeadlessUnit> {
        const unit = await bootUnit({...world(), storage: savedFlightplan(0, [kaaa()])});
        await unit.panel.selectPage('R', 'NAV 1');
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        if (onBlankEnd) {
            await unit.panel.outer('L', 1);
            expect(unit.panel.focused('L')).toEqual({row: 2, col: 4, text: '     '}); // precondition
        } else {
            await unit.panel.cursorTo('L', 'KAAA');
        }
        return unit;
    }

    // An FPL row opens its edit itself before it hands the key to the editor, so the refusal is asked first: nothing is
    // entered, no row is inserted and the status line shows no ent
    it('rejects the key at the blank end position of FPL 0, entering nothing (characterization, #374)', async () => {
        const unit = await fpl0WithCursor(true);

        await unit.panel.press(BLANK_KEY);

        expect(Screen.read().rows('L').slice(1, 4)).toEqual(['  1:KAAA   ', '  2:       ', '           ']);
        expect(unit.panel.focused('L')).toEqual({row: 2, col: 4, text: '     '});
        expect(Screen.read().status().mode.split(' ')).not.toContain('ent');
    });

    // The same on a waypoint: the key would insert an entry in front of it
    it('rejects the key on a waypoint of FPL 0, inserting nothing (characterization, #374)', async () => {
        const unit = await fpl0WithCursor(false);

        await unit.panel.press(BLANK_KEY);

        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['  1:KAAA   ', '  2:       ']);
        expect(fplIdents(unit)).toEqual(['KAAA']);
        expect(Screen.read().status().mode.split(' ')).not.toContain('ent');
    });

    // The characters after the first still take a blank
    it('takes the key on the second character (characterization, #374)', async () => {
        const unit = await blankDirectTo();
        await startEntryAt(unit, 'K');
        await unit.panel.outer('L', 1);

        await unit.panel.press(BLANK_KEY);

        expect(dctIdent().slice(3, 6)).toBe('K  ');
    });
});

// 4-3 (section 4.1.2, step 3): the cursor comes on over USE?, and a pilot who stayed on the page after building the
// plan turns the outer knob back to USE?. The unit does not remember the cursor field: the KLN 89 trainer comes back on
// the first field (2026-10-08, T7; 2026-10-11), and on the top visible entry of a scrolled list (2026-10-08, T23). A
// plan long enough to scroll leaves USE? out of view, which is why step 3 sends the pilot back to it (#355)
describe('waypoint editor on a numbered flight plan, the cursor field (4-3, section 4.1.2 step 3)', () => {
    /** FPL 1 holds KAAA, KSAT and KS01, shown with the cursor off */
    async function fpl1(): Promise<HeadlessUnit> {
        const legs = [kaaa(), airport('KSAT', 47.5, 8.0), airport('KS01', 47.4, 8.0)];
        const unit = await bootUnit({...world(), storage: savedFlightplan(1, legs)});
        await unit.panel.selectPage('R', 'NAV 1');
        await unit.panel.selectPage('L', 'FPL 1');
        expect(Screen.read().rows('L').slice(0, 4)) // precondition
            .toEqual(['USE? INVRT?', '  1:KAAA   ', '  2:KSAT   ', '  3:KS01   ']);
        return unit;
    }

    // 4-3, step 3: a page shown anew has the cursor over USE?
    it('shows the cursor over USE? when the page is shown anew (4-3)', async () => {
        const unit = await fpl1();

        await unit.panel.cursor('L');

        expect(unit.panel.focused('L')).toEqual({row: 0, col: 0, text: 'USE?'});
    });

    // The cursor does not come back where it was left: on a plan that does not scroll it comes on over USE? again
    // (checked in the KLN 89 trainer, 2026-10-11, #355)
    it('shows the cursor over USE? again when it is turned off and on (4-3, #355)', async () => {
        const unit = await fpl1();
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 3);
        expect(unit.panel.focused('L')).toEqual({row: 2, col: 4, text: 'KSAT '}); // precondition: the second position

        await unit.panel.cursor('L');
        expect(Screen.read().status().left).toBe('FPL 1'); // precondition: the cursor is off
        await unit.panel.cursor('L');

        expect(unit.panel.focused('L')).toEqual({row: 0, col: 0, text: 'USE?'});
    });

    // A long plan stays scrolled while the cursor is off, and the cursor comes back on the top visible waypoint, below
    // USE? (4-3, step 3; checked in the KLN 89 trainer, 2026-10-08, T23, #355)
    it('puts the cursor on the top visible waypoint of a scrolled plan when it is turned off and on (4-3, #355)', async () => {
        const legs = Array.from({length: 8}, (_, i) => airport(`KS0${i}`, 47.5 - i * 0.1, 8.0));
        const unit = await bootUnit({...world(), facilities: [...world().facilities, ...legs], storage: savedFlightplan(1, legs)});
        await unit.panel.selectPage('R', 'NAV 1');
        await unit.panel.selectPage('L', 'FPL 1');
        await unit.panel.cursor('L');
        await unit.panel.cursorTo('L', 'KS07');
        await unit.panel.cursor('L');
        const top = Screen.read().rows('L')[0];
        expect(top).toMatch(/^\s+\d:KS0\d/); // precondition: the plan stays scrolled, a waypoint in the top row

        await unit.panel.cursor('L');

        expect(unit.panel.focused('L')).toEqual({row: 0, col: 4, text: top.slice(4, 9)});
    });

    // 4-3, step 3: once the page has been left, the cursor is over USE? again, also when it was on a waypoint before
    it('shows the cursor over USE? again when the page was left and shown anew (4-3)', async () => {
        const unit = await fpl1();
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 3);
        await unit.panel.cursor('L');
        await unit.panel.selectPage('L', 'FPL 2');
        await unit.panel.selectPage('L', 'FPL 1');

        await unit.panel.cursor('L');

        expect(unit.panel.focused('L')).toEqual({row: 0, col: 0, text: 'USE?'});
    });
});

// The guide does not say whether the editor gives the stored waypoint back when the cursor goes off during an entry,
// and the keyboard is a simulator addition
describe('waypoint editor (characterization)', () => {
    it('shows the stored waypoint again when the cursor is turned off during an entry', async () => {
        const unit = await bootUnit(world());
        unit.props.memory.triPage.tri3From = kaaa();
        await unit.panel.selectPage('L', 'TRI 3');
        await vi.advanceTimersByTimeAsync(6000);
        await unit.panel.cursor('L');
        expect(Screen.read().rows('L')[0]).toBe('KAAA -     '); // precondition
        await unit.panel.inner('L', 1);
        expect(Screen.read().status().mode).toBe('enr-leg ent'); // precondition: the entry is open

        await unit.panel.cursor('L');

        expect(Screen.read().rows('L')[0]).toBe('KAAA -     ');
        expect(unit.props.memory.triPage.tri3From!.icaoStruct.ident).toBe('KAAA');
    });

    it('types a character per key, offers the first matching identifier and moves to the next cell', async () => {
        const unit = await blankDirectTo();
        const rows: string[] = [];

        for (const key of ['K', 'S', 'A', 'T']) {
            await unit.panel.type('L', key);
            rows.push(dctIdent());
        }

        expect(rows).toEqual(['   K00     ', '   KS01    ', '   KSA     ', '   KSAT    ']);
        const masks = await blinkCycle(() => Screen.read().maskRows('L')[2].slice(3, 8));
        expect(masks.slice().sort()).toEqual(['IIIIF', 'IIIII', 'IIIII', 'IIIII']);
    });

    // The setup of the #262 pin above, up to ENT: what happens after ENT is the pin's subject
    it('shows an identifier typed with the keyboard that is in no database', async () => {
        const unit = await blankDirectTo();

        await unit.panel.type('L', 'QQQQ');

        expect(dctIdent()).toBe('   QQQQ    ');
        expect(Screen.read().status().right).toBe('NAV 1');
    });
});

// The KLN 89 trainer (2026-10-15): the outer knob moves the cursor past a blank cell of a short ident in the D-> field,
// and a character entered there stays in its cell with the blank before it, with no autofill (#343). The creation that
// follows is #262's subject
describe('waypoint editor, a character after a blank cell (#343)', () => {
    it('keeps the blank before a character entered after it, without an autofill '
        + '(checked in the KLN 89 trainer, 2026-10-15, #343)', async () => {
        const unit = await bootUnit({facilities: [airport('AB', 47.2, 8.0), airport('ABA', 47.3, 8.0)], position: {lat: 47.0, lon: 8.0}});
        await unit.panel.selectPage('R', 'NAV 1');
        await unit.panel.dct();
        await startEntryAt(unit, 'A');
        await unit.panel.outer('L', 3); // past the B, onto the fourth cell
        expect(dctIdent()).toBe('   AB      '); // precondition: AB, the cursor on the fourth cell

        await unit.panel.inner('L', 1);

        expect(dctIdent()).toBe('   AB A    ');
    });
});
