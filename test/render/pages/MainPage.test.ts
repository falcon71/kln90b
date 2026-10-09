import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';
import {airport} from '../../harness/navdata/builders';
import {MainPage} from '../../../kln90b/pages/MainPage';
import {MessagePage} from '../../../kln90b/controls/MessagePage';
import {SuperNav1Page} from '../../../kln90b/pages/left/SuperNav1Page';
import {SuperNav5Page} from '../../../kln90b/pages/left/SuperNav5Page';

/** The left half page's row n (11 characters) */
function left(n: number): string {
    return Screen.read().half('L').split('\n')[n];
}

describe('pushed pages close when they do not handle a knob (characterization, KLN 89 trainer, #56)', () => {
    it('pops the ALT page and passes the outer knob on to the page below', async () => {
        const unit = await bootUnit();
        await unit.panel.alt();
        await unit.panel.cursor('L');
        expect(Screen.read().leftName()).toBe('ALT  ');
        expect(Screen.read().rightName()).toBe('CRSR ');

        await unit.panel.outer('L', 1);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().leftName()).toBe('CAL 1');
        expect(Screen.read().rightName()).toBe('SUP  ');
    });

    it('keeps the DIR page open with the cursor off, then pops it on the outer knob', async () => {
        const unit = await bootUnit();
        await unit.panel.dct();
        await unit.panel.cursor('L');
        // A page that closes itself in a tick shows it one display tick later
        await vi.advanceTimersByTimeAsync(500);
        expect(Screen.read().leftName()).toBe('DIR  ');
        expect(left(0)).toBe('DIRECT TO: ');

        await unit.panel.outer('L', 1);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().leftName()).toBe('CAL 1');
    });
});

describe('the inner knob with SCAN pulled (characterization, KLN 89 trainer, 8e9a7c4)', () => {
    it('changes the field under the cursor instead of scanning', async () => {
        const unit = await bootUnit();
        await unit.panel.outer('R', -5);
        await unit.panel.inner('R', 3);
        expect(Screen.read().rightName()).toBe('NAV 4');
        await unit.panel.cursor('R');
        expect(Screen.read().half('R').split('\n')[3]).toBe('SEL:00000ft');

        await unit.panel.scan();
        await unit.panel.inner('R', 1);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().half('R').split('\n')[3]).toBe('SEL:10000ft');
        expect(unit.props.memory.navPage.nav4SelectedAltitude).toBe(10000);
    });
});

/** The page names of the left and the right status line field, trimmed */
function names(): string[] {
    const s = Screen.read().status();
    return [s.left, s.right];
}

/** The full-screen page MainPage shows, or null */
function overlay(unit: HeadlessUnit) {
    return (unit.props.pageManager.getCurrentPage() as MainPage).getOverlayPage();
}

/** The DIR page with its cursor turned off, over NAV 2 on the left */
async function dirCursorOff(unit: HeadlessUnit): Promise<void> {
    await unit.panel.dct();
    await unit.panel.cursor('L');
    // A page that closes itself in a tick shows it one display tick later
    await vi.advanceTimersByTimeAsync(500);
    expect(Screen.read().rows('L')[0]).toBe('DIRECT TO: '); // Precondition
    expect(names()).toEqual(['DIR', 'SUP']); // Precondition
}

// #56: the maintainer's observation in the KLN 89 trainer, written down in the issue. A page that does not handle a
// knob is taken off and the knob goes on to the page below it, until a page handles it; the inner knob on the Direct To
// page turns the pages of the page shown before it. The page order is 3-12: the inner knob runs through NAV 1 to
// NAV 5 and wraps, the outer knob through the groups TRI MOD FPL NAV CAL STA SET OTH.
describe('a pushed page hands an unhandled knob to the page below (KLN 89 trainer, #56, 3-12)', () => {
    it.each([
        ['the outer knob counterclockwise', 'FPL 0', 'KLN90B_LeftLargeKnob_Left'],
        ['the inner knob counterclockwise', 'NAV 1', 'KLN90B_LeftSmallKnob_Left'],
        ['the inner knob clockwise', 'NAV 3', 'KLN90B_LeftSmallKnob_Right'],
    ])('closes the DIR page on %s and turns NAV 2 to %s', async (_, page, evt) => {
        const unit = await bootUnit();
        await dirCursorOff(unit);

        await unit.panel.press(evt);

        expect(unit.errors).toEqual([]);
        expect(names()).toEqual([page, 'SUP']);
    });

    // #56, the maintainer's comment: ALT with its cursor on, then D->, the DIR cursor off and the outer knob: the DIR
    // page closes and the ALT page shows again and takes the knob. With the cursor on, the outer knob moves it from the
    // first two digits of the baro to the next of its three positions (3-55, step 2)
    it('closes the DIR page and lets the ALT page below it move its cursor (#56, 3-55)', async () => {
        const unit = await bootUnit();
        await unit.panel.alt();
        await unit.panel.dct();
        await unit.panel.cursor('L');
        await vi.advanceTimersByTimeAsync(500);
        expect(Screen.read().status().left).toBe('DIR'); // Precondition

        await unit.panel.outer('L', 1);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L').slice(0, 2)).toEqual([' ALTITUDE  ', 'BARO:29.92"']);
        expect(unit.panel.focused('L')).toEqual({row: 1, col: 8, text: '9'});
    });

    // #56, the maintainer's comment: ALT with its cursor turned off, then D->, the DIR cursor off and the outer knob:
    // both pages close and the page below them turns, NAV 2 to CAL 1 (3-12). The right side shows SUP again: 3-56
    // step 6 says that leaving the ALT page brings back the pages in view before it, which this test extends from the
    // ALT key to the knob
    it('closes the DIR page and the ALT page below it when neither has its cursor on (#56, 3-12, 3-56)', async () => {
        const unit = await bootUnit();
        await unit.panel.alt();
        await unit.panel.cursor('L');
        expect(Screen.read().status().left).toBe('ALT'); // Precondition
        await unit.panel.dct();
        await unit.panel.cursor('L');
        await vi.advanceTimersByTimeAsync(500);
        expect(Screen.read().status().left).toBe('DIR'); // Precondition

        await unit.panel.outer('L', 1);

        expect(unit.errors).toEqual([]);
        expect(names()).toEqual(['CAL 1', 'SUP']);
    });
});

// No source covers the right knobs on a pushed page. The NAV 4 page that ALT pushes on the right, with its cursor
// turned off, is closed by a right knob, which then turns the right page below it (NAV 2); the ALT page stays on the
// left
describe('a pushed right page hands an unhandled knob to the page below (characterization)', () => {
    it.each([
        ['the outer knob counterclockwise', 'D/T 1', 'KLN90B_RightLargeKnob_Left'],
        ['the outer knob clockwise', 'APT 1', 'KLN90B_RightLargeKnob_Right'],
        ['the inner knob counterclockwise', 'NAV 1', 'KLN90B_RightSmallKnob_Left'],
        ['the inner knob clockwise', 'NAV 3', 'KLN90B_RightSmallKnob_Right'],
    ])('characterization: closes the NAV 4 page of ALT on %s and turns NAV 2 to %s', async (_, page, evt) => {
        const unit = await bootUnit();
        await unit.panel.selectPage('R', 'NAV 2');
        await unit.panel.alt();
        await unit.panel.cursor('R');
        expect(names()).toEqual(['CRSR', 'NAV 4']); // Precondition

        await unit.panel.press(evt);

        expect(unit.errors).toEqual([]);
        expect(names()).toEqual(['CRSR', page]);
        expect(Screen.read().rows('L')[0]).toBe(' ALTITUDE  ');
    });
});

/** NAV 1 on both sides: Super NAV 1, whose status line names NAV 1 on both sides (3-32, figure 3-102) */
async function superNav1(unit: HeadlessUnit): Promise<void> {
    await unit.panel.selectPage('L', 'NAV 1');
    await unit.panel.selectPage('R', 'NAV 1');
    expect(overlay(unit)).toBeInstanceOf(SuperNav1Page); // Precondition
    expect(names()).toEqual(['NAV 1', 'NAV 1']);
}

// 3-32: Super NAV 1 shows while NAV 1 is selected on both sides. A knob turned with the cursor off selects another page
// on its side (3-12 for the left order, 3-13 for the right order CTR REF ACT D/T NAV APT ...; the inner knob wraps
// within the group, 3-12), so only one NAV 1 is left and the two half pages come back
describe('the knobs on Super NAV 1 (3-32, 3-12, 3-13)', () => {
    it.each([
        ['KLN90B_LeftLargeKnob_Left', ['FPL 0', 'NAV 1']],
        ['KLN90B_LeftLargeKnob_Right', ['CAL 1', 'NAV 1']],
        ['KLN90B_LeftSmallKnob_Left', ['NAV 5', 'NAV 1']],
        ['KLN90B_LeftSmallKnob_Right', ['NAV 2', 'NAV 1']],
        ['KLN90B_RightLargeKnob_Left', ['NAV 1', 'D/T 1']],
        ['KLN90B_RightLargeKnob_Right', ['NAV 1', 'APT 1']],
        ['KLN90B_RightSmallKnob_Left', ['NAV 1', 'NAV 5']],
        ['KLN90B_RightSmallKnob_Right', ['NAV 1', 'NAV 2']],
    ])('%s leaves Super NAV 1 for %j', async (evt, pages) => {
        const unit = await bootUnit();
        await superNav1(unit);

        await unit.panel.press(evt);

        expect(unit.errors).toEqual([]);
        expect(overlay(unit)).toBeNull();
        expect(names()).toEqual(pages);
    });
});

/** The MSG page over NAV 2 and SUP, with the two messages of every booted unit (testing.md section 6) */
async function msgPage(unit: HeadlessUnit): Promise<void> {
    await unit.panel.msg();
    expect(names()).toEqual(['', '']); // Precondition: the full-width MSG page (3-16, figure 3-56)
    expect(overlay(unit)).toBeInstanceOf(MessagePage);
}

// #56 (closed) names the MSG page beside the ALT and DIR pages: in the KLN 89 trainer the outer knob leaves it and
// turns to the next page, and the inner knob turns the pages of the page shown before it. Its fix (14972b6) covers the
// pushed half pages only; on the MSG page the knobs do nothing. Checked in the KLN 89 trainer, 2026-10-09 (T3): on the
// MSG page a click of the outer or the inner knob, either direction, closes it and the knob acts on the page beneath.
// CRSR closes it as well and turns the cursor on beneath (T4). The 89 has one knob pair and no right half, so the pin
// of the right knob applies the same rule to the right side (3-13). The pages are those of 3-12 and 3-13, from NAV 2
// and SUP. CLR on the MSG page is ignored on the trainer and in the code: it has no test.
describe('the knobs and CRSR on the MSG page (#56, KLN 89 trainer 2026-10-09 T3 T4, #NEW-E-1)', () => {
    // The setup sibling of the pins below: the MSG page is up over NAV 2 and SUP (3-16)
    it('shows the MSG page over NAV 2 and SUP (3-16)', async () => {
        const unit = await bootUnit();
        const main = unit.props.pageManager.getCurrentPage() as MainPage;
        await msgPage(unit);

        expect([main.getLeftPage().name, main.getRightPage().name]).toEqual(['NAV 2', 'SUP  ']);
        expect(main.isLeftCursorActive()).toBe(false);
    });

    it.fails('leaves the MSG page on the left outer knob and turns NAV 2 to CAL 1 (#56, 3-12, #NEW-E-1)', async () => {
        const unit = await bootUnit();
        await msgPage(unit);

        await unit.panel.outer('L', 1);

        expect(overlay(unit)).toBeNull();
        expect(names()).toEqual(['CAL 1', 'SUP']);
    });

    it.fails('leaves the MSG page on the left inner knob and turns NAV 2 to NAV 3 (#56, 3-12, #NEW-E-1)', async () => {
        const unit = await bootUnit();
        await msgPage(unit);

        await unit.panel.inner('L', 1);

        expect(overlay(unit)).toBeNull();
        expect(names()).toEqual(['NAV 3', 'SUP']);
    });

    it.fails('leaves the MSG page on the right outer knob and turns SUP to CTR 1 (#56, 3-13, #NEW-E-1)', async () => {
        const unit = await bootUnit();
        await msgPage(unit);

        await unit.panel.outer('R', 1);

        expect(overlay(unit)).toBeNull();
        expect(names()).toEqual(['NAV 2', 'CTR 1']);
    });

    // NAV 2 has no cursor field, so the pin and its siblings use NAV 4 on the left (5-7 step 3: cursor on SEL)
    it('shows the MSG page over NAV 4 and SUP with the left cursor off (3-16, 5-7)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'NAV 4');
        await msgPage(unit);

        expect(names()).toEqual(['', '']);
        expect((unit.props.pageManager.getCurrentPage() as MainPage).isLeftCursorActive()).toBe(false);
    });

    it('turns the left cursor on in NAV 4 when CRSR is pressed without the MSG page (5-7)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'NAV 4');

        await unit.panel.cursor('L');

        expect(overlay(unit)).toBeNull();
        expect(names()).toEqual(['CRSR', 'SUP']);
    });

    it.fails('closes the MSG page on CRSR and turns the left cursor on beneath (T4, #NEW-E-1)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'NAV 4');
        await msgPage(unit);

        await unit.panel.cursor('L');

        expect(overlay(unit)).toBeNull();
        expect(names()).toEqual(['CRSR', 'SUP']);
    });
});

/** Presses MSG while the MSG page shows, until it closes (at most three presses) */
async function closeMsgPage(unit: HeadlessUnit): Promise<void> {
    for (let i = 0; i < 3 && overlay(unit) instanceof MessagePage; i++) {
        await unit.panel.msg();
    }
}

// 3-27: D-> shows the Direct To page on the left with the cursor on the identifier. 3-32: Super NAV 1 shows only while
// NAV 1 is on both sides, which ends when the DIR page takes the left side
describe('D-> on the MSG page over Super NAV 1 (3-27, 3-32, #NEW-E-2)', () => {
    // The setup sibling of the pin: the MSG page covers Super NAV 1, and D-> puts the DIR page on the left
    it('puts the DIR page on the left under the full-screen pages (3-27, setup of #NEW-E-2)', async () => {
        const unit = await bootUnit();
        await superNav1(unit);
        await msgPage(unit);

        await unit.panel.dct();

        expect(unit.errors).toEqual([]);
        expect((unit.props.pageManager.getCurrentPage() as MainPage).getLeftPage().name).toBe('DIR  ');
    });

    // The code drops the top full-screen page, which is the MSG page, instead of Super NAV 1, so Super NAV 1 stays over
    // the DIR page. Whether the MSG page should stay up is #NEW-E-3; the test closes it if it is still there
    it.fails('shows the DIR page, not Super NAV 1, once the MSG page is gone (3-27, 3-32, #NEW-E-2)', async () => {
        const unit = await bootUnit();
        await superNav1(unit);
        await msgPage(unit);

        await unit.panel.dct();
        await closeMsgPage(unit);

        expect(overlay(unit)).not.toBeInstanceOf(SuperNav1Page);
        expect(Screen.read().rows('L')[0]).toBe('DIRECT TO: ');
        expect(Screen.read().status().left).toBe('CRSR');
    });
});

/** KBBB 0.6 NM north of the aircraft, after the first nearest search (every 10 s): ENT on the MSG page has a target */
async function bootNearKbbb(): Promise<HeadlessUnit> {
    const unit = await bootUnit({facilities: [airport('KBBB', 47.2, 8.0)], position: {lat: 47.19, lon: 8.0}});
    await vi.advanceTimersByTimeAsync(12000);
    return unit;
}

// 3-27: D-> shows the Direct To page on the left with the cursor over the identifier. 3-39 and 3-55 step 1: ALT shows
// the Altitude page on the left and NAV 4 on the right, both with the cursor on. The guide makes no exception for the
// MSG page; the code opens either page under the MSG page, where it cannot be seen until the MSG page is closed.
// Checked in the KLN 89 trainer, 2026-10-09: D-> on the MSG page opens the Direct To page at once (T1), and ENT on its
// blank field returns to the page before, with no Direct To made and no nearest airport (T1); ALT on the MSG page
// opens the Altitude page at once (T2)
describe('D-> and ALT on the MSG page (3-27, 3-39, 3-55, KLN 89 trainer 2026-10-09 T1 T2, #NEW-E-3)', () => {
    // The setup sibling of the pins: on the MSG page, D-> and ALT are taken and their pages become the left page. It
    // says nothing about what is in view, which is the subject of the pins
    it('takes D-> and ALT on the MSG page (3-27, 3-55, setup of #NEW-E-3)', async () => {
        const unit = await bootUnit();
        const main = unit.props.pageManager.getCurrentPage() as MainPage;
        await msgPage(unit);
        await unit.panel.dct();
        expect(main.getLeftPage().name).toBe('DIR  ');
        await unit.panel.alt();

        expect(unit.errors).toEqual([]);
        expect(main.getLeftPage().name).toBe('ALT  ');
    });

    // The ENT that follows belongs to the DIR page: with the blank field it makes no Direct To and it does not show
    // the nearest airport on the right (3-23), which is what ENT on the MSG page does with KBBB in range (the sibling
    // in MessagePage.test.ts holds that). What the DIR page does with the blank field is not asserted here
    it.fails('shows the DIRECT TO page when D-> is pressed on the MSG page (3-27, T1, #NEW-E-3)', async () => {
        const unit = await bootNearKbbb();
        await msgPage(unit);

        await unit.panel.dct();

        expect(Screen.read().rows('L')[0]).toBe('DIRECT TO: ');
        expect(Screen.read().status().left).toBe('CRSR');

        await unit.panel.ent();

        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()).toBeNull();
        expect(names()[1]).toBe('SUP');
        expect(overlay(unit)).toBeNull();
    });

    it.fails('shows the ALT page when ALT is pressed on the MSG page (3-39, 3-55, T2, #NEW-E-3)', async () => {
        const unit = await bootUnit();
        await msgPage(unit);

        await unit.panel.alt();

        expect(Screen.read().rows('L')[0]).toBe(' ALTITUDE  ');
        expect(names()).toEqual(['CRSR', 'CRSR']);
    });
});

/** The status line's element: the pre around the .statusline span of MainPage */
const statusLineElement = () => document.querySelector('#pageContainer .statusline')!.parentElement!;

// 3-36: the Super NAV 5 page has no page names; its mode is at the far left and its MSG prompt at the bottom left of
// the map, so the status line row is part of the map. NAV 5 on both sides shows it (3-36), NAV 4 one step back on the
// right brings the two half pages and the status line back
describe('the status line on Super NAV 5 (3-36)', () => {
    it('hides the status line while Super NAV 5 shows and brings it back with the half pages (3-36)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('R', 'NAV 4');
        await unit.panel.selectPage('L', 'NAV 5');
        expect(statusLineElement().classList.contains('d-none')).toBe(false); // Precondition

        await unit.panel.inner('R', 1);
        await vi.advanceTimersByTimeAsync(250);
        expect(overlay(unit)).toBeInstanceOf(SuperNav5Page); // Precondition
        expect(statusLineElement().classList.contains('d-none')).toBe(true);

        await unit.panel.inner('R', -1);
        expect(overlay(unit)).toBeNull();
        expect(statusLineElement().classList.contains('d-none')).toBe(false);
        expect(names()).toEqual(['NAV 5', 'NAV 4']);
    });
});

// 3-16: a second MSG returns to the pages that were in view before the MSG page, here the ALT page and NAV 4 with their
// cursors on (3-55, step 1)
describe('the MSG page over the ALT page (3-16, 3-55)', () => {
    it('returns to the ALT page and NAV 4 with their cursors on (3-16, 3-55)', async () => {
        const unit = await bootUnit();
        await unit.panel.alt();
        await msgPage(unit);

        await unit.panel.msg();

        expect(unit.errors).toEqual([]);
        expect(overlay(unit)).toBeNull();
        expect(Screen.read().rows('L')[0]).toBe(' ALTITUDE  ');
        expect(Screen.read().rows('R')[0]).toBe('VNV INACTV ');
        expect(names()).toEqual(['CRSR', 'CRSR']);
    });
});
