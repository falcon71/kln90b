import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {airport, vor} from '../../../harness/navdata/builders';
import {blinkCycle} from '../../../harness/render/blink';
import {Screen} from '../../../harness/render/screen';
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
        const masks: string[] = [];
        for (let i = 0; i < 4; i++) {
            await vi.advanceTimersByTimeAsync(250);
            masks.push(Screen.read().maskRows('L')[1].slice(4, 9));
        }
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

/** D-> on a unit without an active waypoint: the DIRECT TO page with five blank cells under the cursor (3-27 rule 5) */
async function blankDirectTo(): Promise<HeadlessUnit> {
    const unit = await bootUnit(world());
    await unit.panel.selectPage('R', 'NAV 1');
    await unit.panel.dct();
    expect(unit.panel.focused('L')).toEqual({row: 2, col: 3, text: '     '}); // precondition
    return unit;
}

/**
 * The first inner click starts the entry. What the first cell shows after it is #311's subject (a blank today, an
 * A after the fix), so the knob tests do not start from it: they turn the first cell clockwise until it shows `ch`.
 */
async function startEntryAt(unit: HeadlessUnit, ch: string): Promise<void> {
    await unit.panel.inner('L', 1);
    for (let clicks = 0; dctIdent()[3] !== ch; clicks++) {
        if (clicks > 40) throw new Error(`startEntryAt: the first cell does not reach ${ch}\n${Screen.read().dump()}`);
        await unit.panel.inner('L', 1);
    }
}

describe('waypoint editor, the knobs (3-14, 3-20)', () => {
    // 3-20 step 3: the characters wrap around, with one blank between 9 and A
    it('steps from A to the blank to 9 counterclockwise and back clockwise (3-20)', async () => {
        const unit = await blankDirectTo();
        await startEntryAt(unit, 'A');

        const seen: string[] = [];
        for (const click of [-1, -1, 1, 1]) {
            await unit.panel.inner('L', click);
            seen.push(dctIdent()[3]);
        }

        expect(seen).toEqual([' ', '9', ' ', 'A']);
    });

    // 3-20: letters and digits wrap around: Z is followed by 0 (the blank lies between 9 and A only)
    it('steps from Z to 0 clockwise (3-20)', async () => {
        const unit = await blankDirectTo();
        await startEntryAt(unit, 'Z');

        await unit.panel.inner('L', 1);

        expect(dctIdent()[3]).toBe('0');
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

// 3-14 says an editor is entered by turning the inner knob, and the KLN 89 trainer (2026-10-08, T6) shows what the
// first click does: it puts an A in the first cell and offers the first identifier that begins with A, as it does for a
// blank DIRECT TO field, a blank FPL 0 position and an inserted FPL position. The 90B has no SET 5 (the 89's default
// first character), so the 89's A is taken for the 90B. The editor starts over blank cells instead.
describe('waypoint editor, the first inner click (3-14, checked in the KLN 89 trainer, 2026-10-08)', () => {
    // The sibling below holds the setup (the same click on the same page)
    it.fails('shows an A and the first identifier that begins with A after the first click '
        + '(3-14, checked in the KLN 89 trainer, 2026-10-08, #311)', async () => {
        const unit = await blankDirectTo();

        await unit.panel.inner('L', 1);

        expect(dctIdent()).toBe('   ALF     ');
    });

    // 3-14: the inner knob over an editor starts the entry with the first character under the cursor (it
    // flashes, the other cells stay inverted). The ent annunciation is shown at this point in the KLN 89 trainer
    // (2026-10-08, its Ent prompt while an edit is open); the 90B figures show ent only for a complete identifier
    // (figure 3-45). Only the flashing cell is asserted, not the run's text (the pin's subject)
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
    // ident typed to its fifth character, two more clicks) kept the cursor on the fifth. The editor wraps to the first
    // cell instead (Editor.outerRight), so the fifth click turns the first character: K to L, and the rest of the
    // identifier goes blank. Sibling: the test below, the same turns up to the fifth cell
    it.fails('keeps the cursor on the fifth character when the outer knob goes on '
        + '(checked in the KLN 89 trainer, 2026-10-08, #306)', async () => {
        const unit = await k00Entered();
        await unit.panel.outer('L', 5);

        await unit.panel.inner('L', 1);

        expect(dctIdent()).toBe('   K00 A   ');
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

        const aw = unit.props.memory.navPage.activeWaypoint;
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('KSAT');
        expect(aw.isDctNavigation()).toBe(true);
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
        await unit.panel.dct();
        await unit.panel.enterIdent('L', 'KAAA');
        await unit.panel.ent();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('KAAA'); // precondition
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

    const fpl0 = (unit: HeadlessUnit) =>
        unit.props.memory.fplPage.flightplans[0].getLegs().map(l => l.wpt.icaoStruct.ident);

    // 4-2 steps 7 and 8 (figures 4-6 and 4-7): the second ENT approves the waypoint page, the waypoint is in the plan,
    // and the cursor moves to the next (blank) position
    it('adds the approved waypoint to the plan and moves the cursor to the next position (4-2)', async () => {
        const unit = await ksatOnPosition2();

        await unit.panel.ent();

        expect(fpl0(unit)).toEqual(['KAAA', 'KSAT']);
        expect(Screen.read().rows('L').slice(1, 4)).toEqual(['  1:KAAA   ', '  2:KSAT   ', '  3:       ']);
        expect(unit.panel.focused('L')).toEqual({row: 3, col: 4, text: '     '});
        expect(Screen.read().status().right).toBe('NAV 1');
    });

    // 4-2 step 7: if the wrong identifier was entered, CLR (while its waypoint page is shown) and begin again. Checked
    // in the KLN 89 trainer, 2026-10-08 (T18): CLR took the waypoint page away, left the blank position under the
    // cursor with no typed identifier, and the next ENT added nothing. FlightplanListItem.clear refuses CLR on a
    // position without a waypoint (FlightplanListItem.tsx:161 and 218), so the waypoint page stays and the next ENT
    // adds KSAT. Sibling: the test above (the same setup)
    it.fails('removes the waypoint page on CLR and leaves the blank position under the cursor, so ENT adds nothing '
        + '(4-2, checked in the KLN 89 trainer, 2026-10-08, #310)', async () => {
        const unit = await ksatOnPosition2();

        await unit.panel.clr();

        expect(Screen.read().status().right).toBe('NAV 1');
        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['  1:KAAA   ', '  2:       ']);
        expect(unit.panel.focused('L')).toEqual({row: 2, col: 4, text: '     '});
        await unit.panel.ent();
        expect(fpl0(unit)).toEqual(['KAAA']);
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
    // The KLN 89 trainer (2026-10-07): an identifier that is not in the database, entered with D->, offers the creation
    // of a user waypoint (#262, pinned on the DIRECT TO and FPL 0 pages with the knobs). Here the identifier is typed
    // with the keyboard, which reaches the same check (WaypointEditor.enter). Sibling: the characterization of the
    // keyboard path below
    it.fails('offers to create a user waypoint for an identifier typed with the keyboard '
        + '(checked in the KLN 89 trainer, 2026-10-07, #262)', async () => {
        const unit = await blankDirectTo();
        const messages = collectStatusMessages(unit);
        await unit.panel.type('L', 'QQQQ');

        await unit.panel.ent();

        expect(messages).not.toContain('NO SUCH WPT');
        expect(Screen.read().rows('R').slice(2, 4)).toEqual(['CREATE NEW ', 'WPT AT:    ']);
    });
});

// 4-3 (section 4.1.2, step 3) sends a pilot who stayed on the page after building the plan back to USE? with the
// outer knob. So the 90B keeps the cursor where it was while the page is not left, and shows it over USE? when the
// page is shown anew. The code remembers the field
// (CursorController.setCursorActive cites the same step). The KLN 89 trainer comes back on the first field (T7),
// which is a note and not a pin: the 90B guide wins
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

    // 4-3, step 3: the cursor is where it was left while the page has not been left, so a pilot who has just created
    // the plan has to turn the outer knob back to USE?. The cursor is on the second position when it goes off
    it('puts the cursor back on the position it was left on when it is turned off and on (4-3)', async () => {
        const unit = await fpl1();
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 3);
        expect(unit.panel.focused('L')).toEqual({row: 2, col: 4, text: 'KSAT '}); // precondition: the second position

        await unit.panel.cursor('L');
        expect(Screen.read().status().left).toBe('FPL 1'); // precondition: the cursor is off
        await unit.panel.cursor('L');

        expect(unit.panel.focused('L')).toEqual({row: 2, col: 4, text: 'KSAT '});
    });

    // 4-3, step 3: once the page has been left, the cursor is over USE? again (the sibling of the test above, which
    // holds that the remembered position is a property of staying on the page)
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
