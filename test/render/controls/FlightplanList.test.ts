import {describe, expect, it} from 'vitest';
import {Facility} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';
import {fplIdents} from '../../harness/readers';
import {savedFlightplan} from '../../harness/storage';
import {intersection} from '../../harness/navdata/builders';
import {pointFrom} from '../../harness/flight/geo';
import {approachWorld} from '../../harness/fixtures';

// FlightplanList (kln90b/controls/FlightplanList.tsx) is the list of the FPL 0 to FPL 25 pages: a six-row List whose
// bottom row keeps the last waypoint, a first line with USE? INVRT?, LOAD FPL 0? or DELETE FPL?, and a blank position
// behind the last waypoint. The page tests (test/render/pages/left/FplPage.test.ts) hold the prompts, the insert and
// delete flows and the active leg; this file holds the scrolling of the list with the cursor

const left = () => Screen.read().rows('L');

/** Eight intersections FX1AA to FX8AA north of the aircraft, like the waypoints of the guide's figures 4-8 to 4-11 */
const eight = (): Facility[] => Array.from({length: 8}, (_, i) => intersection(`FX${i + 1}AA`, 47 + i * 0.1, 8));

/** A numbered plan stored in FPL 4, shown on the left with the cursor on */
async function fpl4(legs: Facility[], facilities: Facility[] = legs): Promise<HeadlessUnit> {
    const unit = await bootUnit({facilities, position: {lat: 46.5, lon: 8}, storage: savedFlightplan(4, legs)});
    await settle(unit);
    await unit.panel.selectPage('L', 'FPL 4');
    await unit.panel.cursor('L');
    return unit;
}

/** Twelve fixes FB00 to FB11, 5 NM apart on a line north of 47N 8E; the aircraft 7 NM along it, on leg FB01 to FB02 */
const START = {lat: 47, lon: 8};
const line12 = (): Facility[] => Array.from({length: 12}, (_, i) => {
    const p = pointFrom(START, 0, 5 * i);
    return intersection(`FB${String(i).padStart(2, '0')}`, p.lat, p.lon);
});

async function fpl0OnLine12(): Promise<HeadlessUnit> {
    const fixes = line12();
    const position = pointFrom(START, 0, 7);
    const unit = await bootUnit({facilities: fixes, position, storage: savedFlightplan(0, fixes)});
    await settle(unit);
    expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(2); // Precondition: FB01 to FB02
    await unit.panel.selectPage('L', 'FPL 0');
    return unit;
}

describe('FlightplanList, scrolling with the cursor (4-3, 4-8)', () => {
    // 4-3 step 9 (figure 4-8): with five or more waypoints the page scrolls so that the next waypoint can be entered.
    // After the eighth waypoint is approved the page shows waypoints 4 to 8 and the blank position 9 under the cursor
    it('shows waypoints 4 to 8 and the blank position 9 under the cursor after the eighth is entered (4-3, figure 4-8)',
        async () => {
            const unit = await fpl4(eight().slice(0, 7), eight());
            await unit.panel.outer('L', 9); // USE? INVRT?, waypoints 1 to 7, the blank position 8
            expect(unit.panel.focused('L').text).toBe('     '); // Precondition

            await unit.panel.enterIdent('L', 'FX8AA');
            await unit.panel.ent(); // the waypoint page
            await unit.panel.ent(); // approved

            expect(fplIdents(unit, 4)).toEqual(['FX1AA', 'FX2AA', 'FX3AA', 'FX4AA', 'FX5AA', 'FX6AA', 'FX7AA', 'FX8AA']);
            expect(left()).toEqual([
                '  4:FX4AA  ', '  5:FX5AA  ', '  6:FX6AA  ', '  7:FX7AA  ', '  8:FX8AA  ', '  9:       ',
            ]);
            expect(unit.panel.focused('L')).toEqual({row: 5, col: 4, text: '     '});
        });

    // 4-3 step 10 (figure 4-9): the outer knob turned all the way counterclockwise puts the cursor on USE?, and the
    // page shows the first four waypoints followed by the last. The cursor comes from the blank position at the end
    it('shows USE? INVRT?, waypoints 1 to 4 and the last one when the cursor goes back to USE? (4-3, figure 4-9)',
        async () => {
            const unit = await fpl4(eight());
            await unit.panel.outer('L', 10); // to the blank position 9
            expect(left()[5]).toBe('  9:       '); // Precondition: the page is scrolled to the end

            await unit.panel.outer('L', -10); // the blank, waypoints 8 to 1, USE? INVRT?, USE?

            expect(unit.panel.focused('L')).toEqual({row: 0, col: 0, text: 'USE?'});
            expect(left()).toEqual([
                'USE? INVRT?', '  1:FX1AA  ', '  2:FX2AA  ', '  3:FX3AA  ', '  4:FX4AA  ', '  8:FX8AA  ',
            ]);
        });

    // 4-8: FPL 0 keeps its final waypoint in the bottom row while the cursor scrolls through the rest. At every step
    // the waypoint under the cursor is on the page and the bottom row holds the final one, until the cursor reaches it
    it('keeps the last waypoint in the bottom row while the cursor scrolls down FPL 0 (4-8)', async () => {
        const unit = await fpl0OnLine12();
        await unit.panel.cursor('L');
        await unit.panel.cursorTo('L', 'FB00'); // wherever the cursor comes on

        const steps: string[] = [];
        for (let i = 0; i < 11; i++) {
            steps.push(`${unit.panel.focused('L').text.trim()} ${left()[5].slice(1).trimEnd()}`);
            await unit.panel.outer('L', 1);
        }

        expect(steps).toEqual([
            'FB00 12:FB11', 'FB01 12:FB11', 'FB02 12:FB11', 'FB03 12:FB11', 'FB04 12:FB11', 'FB05 12:FB11',
            'FB06 12:FB11', 'FB07 12:FB11', 'FB08 12:FB11', 'FB09 12:FB11', 'FB10 12:FB11',
        ]);
    });

    // 4-8 (figure 4-33): scrolled all the way to the end, FPL 0 shows a blank position after the last waypoint, under
    // the cursor, with the four waypoints before the last above it
    it('shows the blank position after the last waypoint of FPL 0 at the end of the scroll (4-8, figure 4-33)',
        async () => {
            const unit = await fpl0OnLine12();
            await unit.panel.cursor('L');

            await unit.panel.outer('L', 12); // waypoints 1 to 12, the blank position 13

            expect(left().map(r => r.slice(1))).toEqual([
                ' 8:FB07   ', ' 9:FB08   ', '10:FB09   ', '11:FB10   ', '12:FB11   ', '13:       ',
            ]);
            expect(unit.panel.focused('L')).toEqual({row: 5, col: 4, text: '     '});
        });

    // 4-8: with the cursor off, the page follows the active leg: after a manual scroll to the end, turning the cursor
    // off brings the leg back into view, its from waypoint (FB01) in the top row
    it('brings the active leg back when the cursor is turned off after a manual scroll (4-8)', async () => {
        const unit = await fpl0OnLine12();
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 12);
        expect(left()[0].slice(1)).toBe(' 8:FB07   '); // Precondition: the active leg is off the page

        await unit.panel.cursor('L');

        const rows = left();
        expect(rows[0]).toBe('Á 2:FB01   ');
        expect(rows.filter(r => /^[ÁÀ]/.test(r))).toEqual(['Á 2:FB01   ', 'À 3:FB02   ']);
        expect(rows[5]).toBe(' 12:FB11   ');
    });
});

describe('FlightplanList, the cursor row while the page scrolls (characterization)', () => {
    // Going down the plan the cursor moves down the page to the row above the last waypoint (row 4, counted from 0) and
    // stays there while the page scrolls under it
    it('characterization: the cursor goes down to the fifth row and stays there while the page scrolls down FPL 0',
        async () => {
            const unit = await fpl0OnLine12();
            await unit.panel.cursor('L');
            await unit.panel.cursorTo('L', 'FB00');

            const rows: number[] = [];
            for (let i = 0; i < 11; i++) {
                rows.push(unit.panel.focused('L').row);
                await unit.panel.outer('L', 1);
            }

            expect(rows).toEqual([0, 1, 2, 3, 4, 4, 4, 4, 4, 4, 4]);
        });
});

/**
 * FPL 0 holds the eight FX waypoints and the aircraft is at `lat` on their meridian. The cursor goes to FX3AA, BUGLE is
 * typed there (the first click opens the insert in front of FX3AA) and approved on the waypoint page. Returns the rows
 * before the insertion
 */
async function insertBugleBeforeFx3(unit: HeadlessUnit): Promise<string[]> {
    await unit.panel.selectPage('L', 'FPL 0');
    await unit.panel.cursor('L');
    await unit.panel.cursorTo('L', 'FX3AA');
    const before = left();
    await unit.panel.enterIdent('L', 'BUGLE');
    await unit.panel.ent(); // the waypoint page
    await unit.panel.ent(); // approved
    expect(fplIdents(unit, 0)).toEqual(['FX1AA', 'FX2AA', 'BUGLE', 'FX3AA', 'FX4AA', 'FX5AA', 'FX6AA', 'FX7AA', 'FX8AA']);
    expect(Screen.read().status().left).toBe('CRSR'); // the cursor is still on
    return before;
}

async function bootEightWithBugle(lat: number): Promise<HeadlessUnit> {
    const fixes = [...eight(), intersection('BUGLE', 47.15, 8.1)];
    const unit = await bootUnit({facilities: fixes, position: {lat, lon: 8}, storage: savedFlightplan(0, eight())});
    await settle(unit);
    return unit;
}

const AFTER_FIGURE_4_18 = ['          ', ' 1:FX1AA  ', ' 2:FX2AA  ', ' 3:BUGLE  ', ' 4:FX3AA  ', ' 9:FX8AA  '];

describe('FlightplanList, an insertion (4-4)', () => {
    // 4-4 (figures 4-15 to 4-18): FPL 0 shows its blank top line, waypoints 1 to 4 and the last one; a waypoint
    // inserted in front of waypoint 3 takes number 3, the others move down, and after the approval the page shows the
    // blank top line, waypoints 1 to 4 and the last waypoint, now number 9. A Direct To FX1AA makes the first waypoint
    // the active one, so that the page is at its top before the insertion, as in figure 4-15
    it('shows the new waypoint 3 and the last one renumbered after the approval (4-4, figures 4-15, 4-18)',
        async () => {
            const unit = await bootEightWithBugle(46.9);
            await unit.panel.directTo('FX1AA', {waitMs: 0});
            await unit.panel.cursor('L'); // the cursor stays on after the Direct To (#82)
            expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(0); // Precondition

            const before = await insertBugleBeforeFx3(unit);

            expect(before.map(r => r.slice(1))).toEqual([
                '          ', ' 1:FX1AA  ', ' 2:FX2AA  ', ' 3:FX3AA  ', ' 4:FX4AA  ', ' 8:FX8AA  ',
            ]);
            expect(left().map(r => r.slice(1))).toEqual(AFTER_FIGURE_4_18);
        });
});

describe('FlightplanList, an insertion made with the page scrolled down (#319)', () => {
    // On the leg FX2AA to FX3AA the page of FPL 0 follows the active leg while the cursor is off (4-8); with the cursor
    // on over FX1AA the page shows waypoint 1 in its top row, the blank top line off the page. The sibling of the pin
    // below holds that state and the insertion itself
    it('inserts the waypoint in front of FX3AA and renumbers the last one, the page scrolled down by the active leg ' +
        '(4-4, 4-8)',
        async () => {
            const unit = await bootEightWithBugle(47.12);
            expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(2); // Precondition: FX2AA to FX3AA

            const before = await insertBugleBeforeFx3(unit);

            expect(before[0].slice(1)).toBe(' 1:FX1AA  '); // the blank top line was scrolled off
            expect(left()[5].slice(1)).toBe(' 9:FX8AA  ');
        });

    // An insertion made with the page scrolled down leaves the page where it was; the unit rebuilds the list and jumps
    // to its top, to the blank top line (trainer T28: FPL 0 scrolled down, a waypoint inserted in the middle and
    // approved, the page stayed, checked in the KLN 89 trainer, 2026-10-08). The expected rows are the same page with
    // BUGLE as the third waypoint, the rest one position down
    it.fails('keeps the page where it was after an insertion (checked in the KLN 89 trainer, 2026-10-08, #319)',
        async () => {
            const unit = await bootEightWithBugle(47.12);

            await insertBugleBeforeFx3(unit);

            expect(left().map(r => r.slice(1))).toEqual([
                ' 1:FX1AA  ', ' 2:FX2AA  ', ' 3:BUGLE  ', ' 4:FX3AA  ', ' 5:FX4AA  ', ' 9:FX8AA  ',
            ]);
        });
});

describe('FlightplanList, the first waypoint of an empty plan (4-2)', () => {
    // 4-2 steps 3 to 8 (figures 4-3 to 4-7): on an empty numbered plan the cursor comes on over the blank first
    // position; the ident is entered, ENT shows its waypoint page, and the second ENT approves it and moves the cursor
    // to the second waypoint position, under USE? INVRT? and the new waypoint 1
    it('moves the cursor to the blank second position after the first waypoint is approved (4-2, figure 4-7)',
        async () => {
            const fx1 = intersection('FX1AA', 47.0, 8);
            const unit = await bootUnit({facilities: [fx1], position: {lat: 46.5, lon: 8}});
            await settle(unit);
            await unit.panel.selectPage('L', 'FPL 7');
            await unit.panel.cursor('L');
            expect(unit.panel.focused('L')).toEqual({row: 1, col: 4, text: '     '}); // Precondition: figure 4-3

            await unit.panel.enterIdent('L', 'FX1AA');
            await unit.panel.ent(); // the waypoint page
            await unit.panel.ent(); // approved

            expect(fplIdents(unit, 7)).toEqual(['FX1AA']);
            expect(left().slice(0, 3)).toEqual(['USE? INVRT?', '  1:FX1AA  ', '  2:       ']);
            expect(unit.panel.focused('L')).toEqual({row: 2, col: 4, text: '     '});
        });
});

describe('FlightplanList, after a deletion (characterization)', () => {
    // On FPL 0 the cursor stays in the position of the deleted waypoint, now on the one that moved up into it (OTH 3
    // does the same, #26). The aircraft is south of the plan; FX1AA, FX2AA and the blank top line stay in view
    it('characterization: keeps the cursor of FPL 0 in the position of the deleted waypoint, on the next one',
        async () => {
            const storage = savedFlightplan(0, eight().slice(0, 4));
            const unit = await bootUnit({facilities: eight(), position: {lat: 46.9, lon: 8}, storage});
            await settle(unit);
            await unit.panel.selectPage('L', 'FPL 0');
            await unit.panel.cursor('L');
            await unit.panel.cursorTo('L', 'FX2AA');
            await unit.panel.clr();
            expect(left()[2]).toBe('DEL FX2AA ?'); // Precondition: the question

            await unit.panel.ent();

            expect(fplIdents(unit, 0)).toEqual(['FX1AA', 'FX3AA', 'FX4AA']);
            expect(unit.panel.focused('L')).toEqual({row: 2, col: 4, text: 'FX3AA'});
        });
});

describe('FlightplanList, after a deletion on a numbered plan', () => {
    async function deleteFx2OfFpl4(): Promise<HeadlessUnit> {
        const unit = await fpl4(eight().slice(0, 4));
        await unit.panel.outer('L', 3); // USE? INVRT?, FX1AA, FX2AA
        await unit.panel.clr();
        expect(left()[2]).toBe('DEL FX2AA ?'); // Precondition
        await unit.panel.ent();
        return unit;
    }

    // 4-5: ENT deletes the waypoint and the later ones move up (figure 4-21); this holds the deletion, the cursor is
    // the pin below
    it('deletes the waypoint and moves the later ones up on a numbered plan (4-5)', async () => {
        const unit = await deleteFx2OfFpl4();

        expect(fplIdents(unit, 4)).toEqual(['FX1AA', 'FX3AA', 'FX4AA']);
        expect(left().slice(1, 4)).toEqual(['  1:FX1AA  ', '  2:FX3AA  ', '  3:FX4AA  ']);
    });

    // After ENT the cursor stays in the position of the deleted waypoint, on the one that moved up into it (checked in
    // the KLN 89 trainer, 2026-10-08, T21 c; FPL 0 and OTH 3 do the same, #26). On a numbered plan with waypoints the
    // unit puts it one position higher, on the waypoint before: the list counts one field for USE? and USE? INVRT?
    // (FPLFirstLine.refreshButtons), the cause of #242
    it.fails('keeps the cursor in the position of the deleted waypoint on a numbered plan ' +
        '(checked in the KLN 89 trainer, 2026-10-08, #242)',
        async () => {
            const unit = await deleteFx2OfFpl4();

            expect(unit.panel.focused('L')).toEqual({row: 2, col: 4, text: 'FX3AA'});
        });
});

describe('FlightplanList, the approach header (checked in the KLN 89 trainer, 2026-10-08)', () => {
    /** FPL 0 with ENRAA and the approach of KPRC loaded, the cursor on the header; `extra` are facilities to type */
    async function onHeader(extra: Facility[] = []): Promise<HeadlessUnit> {
        const w = approachWorld();
        const storage = savedFlightplan(0, [w.enraa, w.kprc]);
        const unit = await bootUnit({facilities: [...w.facilities, ...extra], position: w.north(40), storage});
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        expect(fplIdents(unit, 0)).toEqual(['ENRAA', 'IAFAA', 'IFAAA', 'FAFAA', 'SDFAA', 'MAPAA', 'KPRC']); // Precondition
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.cursorTo('L', 'CHANGE APR?');
        return unit;
    }

    // Trainer T27 (checked in the KLN 89 trainer, 2026-10-08): the inner knob on the CHANGE APPR? header opened an
    // entry row in front of the approach, and the ident typed and approved there became an en route waypoint before the
    // approach, marked with the en route colon
    it('the inner knob on CHANGE APR? inserts an en route waypoint in front of the approach ' +
        '(checked in the KLN 89 trainer, 2026-10-08)',
        async () => {
            const unit = await onHeader([intersection('INSAA', 47.6, 8.0)]);

            await unit.panel.enterIdent('L', 'INSAA'); // the first click opens the insert in front of the header
            await unit.panel.ent(); // the waypoint page
            await unit.panel.ent(); // approved

            expect(fplIdents(unit, 0)).toEqual(['ENRAA', 'INSAA', 'IAFAA', 'IFAAA', 'FAFAA', 'SDFAA', 'MAPAA', 'KPRC']);
            expect(left().map(r => r.slice(1)).filter(r => r.includes('INSAA'))).toEqual([' 2:INSAA  ']);
        });

    // 6-7: on the header the cursor reads CHANGE APR?, and CLR turns it into DELETE APR?. Trainer T26 (checked in the
    // KLN 89 trainer, 2026-10-08): a second CLR went back to CHANGE APPR? and the approach stayed
    it('a second CLR on DELETE APR? brings back CHANGE APR? and keeps the approach ' +
        '(6-7, checked in the KLN 89 trainer, 2026-10-08)',
        async () => {
            const unit = await onHeader();
            const loaded = fplIdents(unit, 0);
            await unit.panel.clr();
            expect(unit.panel.focused('L').text.trim()).toBe('DELETE APR?'); // Precondition

            await unit.panel.clr();

            expect(unit.panel.focused('L').text.trim()).toBe('CHANGE APR?');
            await unit.panel.ent(); // CHANGE APR? opens APT 8 and deletes nothing
            expect(fplIdents(unit, 0)).toEqual(loaded);
        });
});

describe('FlightplanList, the DEL question', () => {
    /** FPL 4 = FX1AA to FX4AA, the DEL question on FX2AA */
    async function questionOnFx2(): Promise<HeadlessUnit> {
        const unit = await fpl4(eight().slice(0, 4));
        await unit.panel.outer('L', 3); // USE? INVRT?, FX1AA, FX2AA
        await unit.panel.clr();
        expect(left()[2]).toBe('DEL FX2AA ?'); // Precondition
        return unit;
    }

    // 4-5: CLR on a waypoint asks DEL, the ident and a question mark, and ENT deletes. The sibling of the pin below:
    // the question is there, and until ENT nothing is deleted
    it('asks DEL FX2AA ? on CLR with the cursor on it and deletes nothing yet (4-5)', async () => {
        const unit = await questionOnFx2();

        expect(unit.panel.focused('L')).toEqual({row: 2, col: 0, text: 'DEL FX2AA ?'});
        expect(fplIdents(unit, 4)).toEqual(['FX1AA', 'FX2AA', 'FX3AA', 'FX4AA']);
    });

    // The outer knob on the question withdraws it and the cursor moves on to the next field (trainer T21 a, checked in
    // the KLN 89 trainer, 2026-10-08: the row was back to the waypoint and the cursor on the next field). On the 89
    // that field was the one to the right in the same row; the 90B has none, so the pin takes the next waypoint, an
    // extension of T21 a. The unit keeps the question and the cursor on it
    it.fails('drops the question and moves the cursor on when the outer knob turns ' +
        '(checked in the KLN 89 trainer, 2026-10-08, #317)',
        async () => {
            const unit = await questionOnFx2();

            await unit.panel.outer('L', 1);

            expect(left()[2]).toBe('  2:FX2AA  ');
            expect(unit.panel.focused('L')).toEqual({row: 3, col: 4, text: 'FX3AA'});
            expect(fplIdents(unit, 4)).toEqual(['FX1AA', 'FX2AA', 'FX3AA', 'FX4AA']);
        });

    // Trainer T21 b (checked in the KLN 89 trainer, 2026-10-08): the inner knob on the question: no question any more,
    // an entry row opens in front of the waypoint, which moves down. Whether the new row starts blank or with a letter
    // is not asserted, nor where the cursor stands (on a numbered plan it is on the waypoint above, #242, pinned in
    // FplPage.test.ts)
    it('opens an entry in front of the waypoint when the inner knob turns (checked in the KLN 89 trainer, 2026-10-08)',
        async () => {
            const unit = await questionOnFx2();

            await unit.panel.inner('L', 1);

            const rows = left().slice(1, 4).map((r, i) => i === 1 ? r.slice(0, 4) : r);
            expect(rows).toEqual(['  1:FX1AA  ', '  2:', '  3:FX2AA  ']);
            expect(left().some(r => r.includes('DEL'))).toBe(false);
            expect(fplIdents(unit, 4)).toEqual(['FX1AA', 'FX2AA', 'FX3AA', 'FX4AA']);
        });
});
