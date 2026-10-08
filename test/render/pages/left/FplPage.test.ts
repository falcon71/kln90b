import {describe, expect, it, onTestFinished, vi} from 'vitest';
import {Facility, FixTypeFlags, LegTurnDirection} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {savedFlightplan, storedSetting} from '../../../harness/storage';
import {airport, intersection, vor} from '../../../harness/navdata/builders';
import {approach, Leg, sid, withProcedures} from '../../../harness/navdata/procedures';
import {approachWorld} from '../../../harness/fixtures';
import {pointFrom} from '../../../harness/flight/geo';

/** Seven waypoints north-east of KAAA. Idents sort before the default navdata (ZZXA, ZZV, ZZN, ZZXIN) */
function route7(): Facility[] {
    return [
        airport('KAAA', 47.0, 8.0), vor('ABC', 47.5, 8.9), airport('KBBB', 48.2, 9.2), intersection('DEFAA', 48.5, 9.5),
        intersection('EFGAA', 48.8, 9.8), airport('KCCC', 49.0, 10.0), intersection('GHIAA', 49.2, 10.2),
    ];
}

// Glyphs of kln90b.ttf the tests below assert as code points (the font is not rendered in the tests): U+00C0 is the head
// of the active leg symbol, U+00C1 its tail, U+00C2 the shaft drawn on a procedure header between the two, U+203A the
// arrow of a direct-to target, and U+00E0 U+00E1 U+00E3 U+00E2 the suffixes -i, -f, -m and -h of the approach fixes.
// A header row is read with its column 0 sliced off: the shaft glyph there is not legible in the guide's figures.
const idents = (unit: HeadlessUnit, fpl: number) => unit.props.memory.fplPage.flightplans[fpl].getLegs().map(l => l.wpt.icaoStruct.ident);
const left = () => Screen.read().rows('L');

/** The rows of the left half that carry the cursor: a run of inverted or flashing cells */
const cursorRows = () => Screen.read().maskRows('L').flatMap((m, i) => /[IF]/.test(m) ? [i] : []);
/** The left half and its mask, for the snapshots: the right half shows the empty SUP page of the boot */
const leftDump = () => {
    const s = Screen.read();
    return [...s.rows('L'), '', ...s.maskRows('L')].join('\n');
};

/** Boots with a stored plan and the aircraft 0.2 degrees north and 0.3 east of KAAA, on the leg KAAA to ABC */
async function bootRoute(storage: Record<string, unknown>) {
    const unit = await bootUnit({facilities: route7(), position: {lat: 47.2, lon: 8.3}, storage});
    await settle(unit);
    return unit;
}

describe('FPL 0 page (characterization)', () => {
    it('shows a plan of seven waypoints flown on its first leg', async () => {
        const unit = await bootRoute(savedFlightplan(0, route7()));
        await unit.panel.selectPage('L', 'FPL 0');

        expect(leftDump()).toMatchInlineSnapshot(`
          "Á 1:KAAA   
          À 2:ABC    
            3:KBBB   
            4:DEFAA  
            5:EFGAA  
            7:GHIAA  

          ...........
          ...........
          ...........
          ...........
          ...........
          ..........."
        `);
    });
});

describe('FPL 1 to FPL 25 pages (characterization)', () => {
    it('shows a numbered plan of seven waypoints', async () => {
        const unit = await bootRoute(savedFlightplan(3, route7()));
        await unit.panel.selectPage('L', 'FPL 3');

        expect(leftDump()).toMatchInlineSnapshot(`
          "USE? INVRT?
            1:KAAA   
            2:ABC    
            3:KBBB   
            4:DEFAA  
            7:GHIAA  

          ...........
          ...........
          ...........
          ...........
          ...........
          ..........."
        `);
    });
});

/** Twelve fixes 5 NM apart on a line north of 47N 8E: FB00 at the start */
const START = {lat: 47, lon: 8};
const line12 = () => Array.from({length: 12}, (_, i) => {
    const p = pointFrom(START, 0, 5 * i);
    return intersection(`FB${String(i).padStart(2, '0')}`, p.lat, p.lon);
});

describe('FPL 0 page, the active leg', () => {
    // 4-7: the active leg symbol runs from the "from" waypoint to the "to" waypoint: its tail stands left of the from
    // waypoint, its head left of the active one. Glyphs of kln90b.ttf: À is the head (an arrowhead with the shaft
    // coming from above), Á the tail (the shaft turning down)
    it('marks the from waypoint with the tail and the active waypoint with the head of the leg symbol (4-7)', async () => {
        const unit = await bootRoute(savedFlightplan(0, route7()));
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(1); // Precondition: KAAA to ABC
        await unit.panel.selectPage('L', 'FPL 0');

        expect(left().map(r => r.slice(0, 2))).toEqual(['Á ', 'À ', '  ', '  ', '  ', '  ']);
        expect(left().slice(0, 2)).toEqual(['Á 1:KAAA   ', 'À 2:ABC    ']);
    });

    // 4-8: the page follows the active leg without the cursor, and the plan's last waypoint stays in the bottom row;
    // 4-3: with more than five waypoints the ones in between are not shown
    it('keeps the active leg in view and the last waypoint at the bottom of a long plan (4-3, 4-8)', async () => {
        const fixes = line12();
        const unit = await bootUnit({facilities: fixes, position: pointFrom(START, 0, 22), storage: savedFlightplan(0, fixes)});
        await settle(unit);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(5); // Precondition: FB04 to FB05
        await unit.panel.selectPage('L', 'FPL 0');

        const rows = left();
        expect(rows.filter(r => r.startsWith('Á'))).toEqual(['Á 5:FB04   ']);
        expect(rows.filter(r => r.startsWith('À'))).toEqual(['À 6:FB05   ']);
        expect(rows[5]).toBe(' 12:FB11   ');
        expect(rows.some(r => r.includes('FB10'))).toBe(false); // the waypoint before the last is skipped
    });

    // 4-8: the page follows the active leg. The KLN 89 trainer (2026-10-07) puts the waypoint
    // before the active one in the top row after a Direct To, even when the target was already on the page (it stood in
    // the third row). The plan has twelve waypoints: in a short plan the page cannot scroll that far, and the clamp at
    // the end of the list would hide the rule. Glyph: the arrow of the direct-to target is the code point U+203A
    it('puts the waypoint before the active one in the top row after a Direct To (4-8, checked in the KLN 89 trainer, 2026-10-07)', async () => {
        const fixes = line12();
        const unit = await bootUnit({facilities: fixes, position: pointFrom(START, 0, 2), storage: savedFlightplan(0, fixes)});
        await settle(unit);
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 2);
        expect(unit.panel.focused('L').text).toBe('FB02 '); // Precondition: waypoint 3
        expect(left()[2]).toBe('  3:FB02   '); // Precondition: it shows in the third row of the page

        await unit.panel.dct();
        await unit.panel.ent();
        await unit.panel.cursor('L'); // The unit leaves the cursor on after the approval (#82); the page scrolls with it off
        await vi.advanceTimersByTimeAsync(1000);

        const aw = unit.props.memory.navPage.activeWaypoint;
        expect(aw.getActiveFplIdx()).toBe(2); // Precondition: FB02 is the direct-to target
        expect(aw.isDctNavigation()).toBe(true);
        expect(Screen.read().status().left).toBe('FPL 0'); // Precondition: the cursor is off (the status line shows the page name)
        expect(left().slice(0, 2)).toEqual(['  2:FB01   ', '› 3:FB02   ']);
    });

    // 4-8 (figure 4-32): with the active leg near the end of the plan, the page shows the from waypoint in its second
    // row and ends with the last waypoint; it does not scroll on to show a blank position below it. The aircraft is on
    // the leg EFGAA to KCCC of the seven-waypoint plan, the cursor is off
    it('ends the page with the last waypoint when the active leg is near the end of the plan (4-8)', async () => {
        const unit = await bootUnit({facilities: route7(), position: {lat: 48.9, lon: 9.85}, storage: savedFlightplan(0, route7())});
        await settle(unit);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(5); // Precondition: EFGAA to KCCC
        await unit.panel.selectPage('L', 'FPL 0');

        expect(left()).toEqual(['  2:ABC    ', '  3:KBBB   ', '  4:DEFAA  ', 'Á 5:EFGAA  ', 'À 6:KCCC   ', '  7:GHIAA  ']);
    });
});

/** RNAV 27 of KPRC with IAF, IF, FAF, MAP and a missed approach holding point; an enroute fix ENRAA north-west */
function rnavWorld() {
    const iafaa = intersection('IAFAA', 47.3, 7.7);
    const ifaaa = intersection('IFAAA', 47.2, 7.8);
    const fafaa = intersection('FAFAA', 47.1, 7.9);
    const mapaa = intersection('MAPAA', 47.0, 8.0);
    const mahaa = intersection('MAHAA', 47.0, 8.3);
    const enraa = intersection('ENRAA', 47.6, 7.4);
    const kprc = withProcedures(airport('KPRC', 47.0, 8.0), {
        approaches: [approach({
            type: ApproachType.APPROACH_TYPE_RNAV, runway: '27',
            transitions: [{name: 'IAFAA', legs: [Leg.IF(iafaa, FixTypeFlags.IAF), Leg.TF(ifaaa, FixTypeFlags.IF)]}],
            final: [Leg.IF(ifaaa, FixTypeFlags.IF), Leg.TF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
            missed: [Leg.CA(270), Leg.DF(mahaa), Leg.HM(mahaa, 90, LegTurnDirection.Right, FixTypeFlags.MAHP)],
        })],
    });
    return {kprc, enraa, facilities: [kprc, iafaa, ifaaa, fafaa, mapaa, mahaa, enraa]};
}

/** FPL 0 is ENRAA, KPRC with RNAV 27 loaded; the aircraft is beyond ENRAA, on the leg ENRAA to IAFAA */
async function bootWithApproach() {
    const w = rnavWorld();
    const unit = await bootUnit({facilities: w.facilities, position: {lat: 47.7, lon: 7.3}, storage: savedFlightplan(0, [w.enraa, w.kprc])});
    await settle(unit);
    await unit.panel.loadProcedure('APT 8');
    expect(idents(unit, 0)).toEqual(['ENRAA', 'IAFAA', 'IFAAA', 'FAFAA', 'MAPAA', 'MAHAA', 'KPRC']); // Precondition
    return unit;
}

describe('FPL 0 page with an approach', () => {
    // 6-5: a header ABBBB-CCCC above the approach waypoints (type letter, runway, airport). 6-7: approach waypoints
    // have a blank instead of the colon after their number. 6-6 to 6-7: the IAF, FAF, MAP and missed approach holding
    // point carry a suffix (i, f, m, h); the font kln90b.ttf draws à, á, ã and â as a dash and that small letter
    // (rendered with Skia during the research for this test)
    it('shows the approach header, the approach waypoints without colon and the fix suffixes (6-5 to 6-7)', async () => {
        const unit = await bootWithApproach();
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L'); // on ENRAA, the first waypoint: the page shows the top of the plan

        expect(left().map(r => r.slice(1))).toEqual([' 1:ENRAA  ', 'R27-KPRC  ', ' 2 IAFAAà ', ' 3 IFAAA  ', ' 4 FAFAAá ', ' 7:KPRC   ']);

        await unit.panel.outer('L', 6); // header, IAFAA, IFAAA, FAFAA, MAPAA, MAHAA
        expect(unit.panel.focused('L').text).toBe('MAHAAâ');
        // 6-7: the fence after the MAP: no automatic sequencing past it
        expect(left().slice(1, 5)).toEqual(['  4 FAFAAá ', '  5 MAPAAã ', '*NO WPT SEQ', '  6 MAHAAâ ']);
    });

    // C-1: INVALID ADD when a waypoint is to be added inside the approach, INVALID DEL when an approach waypoint is to
    // be deleted (6-7: approach waypoints can be neither added nor deleted)
    it('answers INVALID ADD to the inner knob on an approach waypoint and leaves the plan alone (C-1, 6-7)', async () => {
        const unit = await bootWithApproach();
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 2);
        expect(unit.panel.focused('L').text).toBe('IAFAAà'); // Precondition
        const before = left();

        await unit.panel.inner('L', 1);

        expect(Screen.read().status().mode).toBe('INVALID ADD');
        expect(left()).toEqual(before); // no blank entry opened
        expect(unit.errors).toEqual([]);
        expect(idents(unit, 0)).toEqual(['ENRAA', 'IAFAA', 'IFAAA', 'FAFAA', 'MAPAA', 'MAHAA', 'KPRC']);
    });

    it('answers INVALID DEL to CLR on an approach waypoint and leaves the plan alone (C-1, 6-7)', async () => {
        const unit = await bootWithApproach();
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 2);
        expect(unit.panel.focused('L').text).toBe('IAFAAà'); // Precondition
        const before = left();

        await unit.panel.clr();

        expect(Screen.read().status().mode).toBe('INVALID DEL');
        expect(left()).toEqual(before); // no DEL prompt opened
        expect(unit.errors).toEqual([]);
        expect(idents(unit, 0)).toEqual(['ENRAA', 'IAFAA', 'IFAAA', 'FAFAA', 'MAPAA', 'MAHAA', 'KPRC']);
    });

    // 6-7: approach waypoints can be neither added nor deleted, and C-1 answers INVALID ADD and INVALID DEL where the
    // knobs try. ENT on one is not answered at all: the unit throws while it rebuilds the list. The sibling holds the
    // setup and takes the rejection the ENT leaves; the pin holds that there is none
    async function enterOnApproachWaypoint() {
        const unit = await bootWithApproach();
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 2);
        expect(unit.panel.focused('L').text).toBe('IAFAAà'); // Precondition: an approach waypoint under the cursor
        expect(left().map(r => r.slice(1))).toContain(' 2 IAFAAà ');
        await unit.panel.ent();
        return unit;
    }

    it('takes ENT on an approach waypoint and leaves the plan alone (6-7, C-1)', async () => {
        const unit = await enterOnApproachWaypoint();

        unit.takeRejections(); // the rejection of the ENT, see the pin below
        expect(idents(unit, 0)).toEqual(['ENRAA', 'IAFAA', 'IFAAA', 'FAFAA', 'MAPAA', 'MAHAA', 'KPRC']);
    });

    it.fails('does not throw on ENT on an approach waypoint (6-7, C-1, #243)', async () => {
        const unit = await enterOnApproachWaypoint();

        expect(unit.takeRejections()).toEqual([]);
        expect(idents(unit, 0)).toEqual(['ENRAA', 'IAFAA', 'IFAAA', 'FAFAA', 'MAPAA', 'MAHAA', 'KPRC']);
    });
});

/** FPL 0 is KPRC with the departure DEP1 loaded: KPRC, DEPAA, ENRAA */
async function bootWithSid() {
    const depaa = intersection('DEPAA', 47.0, 8.2);
    const enraa = intersection('ENRAA', 47.0, 8.4);
    const kprc = withProcedures(airport('KPRC', 47.0, 8.0), {
        departures: [sid('DEP1', {runways: [{runway: '27', legs: [Leg.CA(270), Leg.DF(depaa)]}], common: [Leg.TF(enraa)]})],
    });
    const unit = await bootUnit({facilities: [kprc, depaa, enraa], position: {lat: 47, lon: 8}, storage: savedFlightplan(0, [kprc])});
    await settle(unit);
    await unit.panel.loadProcedure('APT 7');
    expect(idents(unit, 0)).toEqual(['KPRC', 'DEPAA', 'ENRAA']); // Precondition
    return unit;
}

describe('FPL 0 page with a SID', () => {
    // 6-23: the waypoints of a SID or STAR have a period after their number, en route waypoints a colon
    it('separates the number of a SID waypoint with a period (6-23)', async () => {
        const unit = await bootWithSid();
        await unit.panel.selectPage('L', 'FPL 0');

        // The rows of the three waypoints, without the column of the active leg symbol
        const rows = left().map(r => r.slice(1)).filter(r => /^ \d/.test(r));
        expect(rows).toEqual([' 1:KPRC   ', ' 2.DEPAA  ', ' 3.ENRAA  ', ' 4:       ']);
    });
});

// 4-7: the tail of the active leg symbol stands left of the from waypoint; 4-8: the page follows the active leg.
// Figure 6-43 (6-23) shows the from waypoint above a procedure header with the tail, the header, and
// the active waypoint with the head below it. The unit scrolls to the row above the active waypoint, which is the
// header, and the from waypoint leaves the page
describe('FPL 0 page, the active leg across a procedure header', () => {
    async function bootOnTheFirstApproachLeg() {
        const w = approachWorld();
        const unit = await bootUnit({facilities: w.facilities, position: w.north(40), storage: savedFlightplan(0, [w.enraa, w.kprc])});
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        await unit.panel.selectPage('L', 'FPL 0');
        return unit;
    }

    it('flies from ENRAA to the IAF with the approach header between them (4-7, 6-23)', async () => {
        const unit = await bootOnTheFirstApproachLeg();

        const aw = unit.props.memory.navPage.activeWaypoint;
        expect(aw.getActiveFplIdx()).toBe(1);
        expect(aw.isDctNavigation()).toBe(false);
        expect(idents(unit, 0)).toEqual(['ENRAA', 'IAFAA', 'IFAAA', 'FAFAA', 'SDFAA', 'MAPAA', 'KPRC']);
        expect(Screen.read().status().left).toBe('FPL 0');
        // The active waypoint carries the head of the leg symbol, in whichever row the page puts it
        expect(left().filter(r => r.startsWith('À'))).toEqual(['À 2 IAFAAà ']);
    });

    it.fails('shows the from waypoint with the tail above the header (4-7, 4-8, 6-23, #239)', async () => {
        const unit = await bootOnTheFirstApproachLeg();

        const rows = left();
        expect(rows[0]).toBe('Á 1:ENRAA  ');
        expect(rows[1].slice(1).trimEnd()).toBe('R18-KPRC');
        expect(rows[2]).toBe('À 2 IAFAAà ');
    });
});

describe('FPL 1 to FPL 25 pages', () => {
    // 4-3: USE? INVRT? on the top line; with more than five waypoints the first four and then the last one (figure
    // 4-9). The waypoint number takes two cells after the column of the active leg symbol (figure 4-35 on 4-8 for one
    // digit, figure 6-8 on 6-5 for two), followed by a colon
    it('shows USE? INVRT?, the first four waypoints and the last one (4-3)', async () => {
        const unit = await bootRoute(savedFlightplan(3, route7()));
        await unit.panel.selectPage('L', 'FPL 3');

        expect(left()).toEqual(['USE? INVRT?', '  1:KAAA   ', '  2:ABC    ', '  3:KBBB   ', '  4:DEFAA  ', '  7:GHIAA  ']);
    });

    // 4-3: the cursor appears over USE?; one step clockwise puts it over USE? INVRT? (figures 4-11 and 4-13)
    it('puts the cursor on USE? and one step further on USE? INVRT? (4-3, 4-4)', async () => {
        const unit = await bootRoute(savedFlightplan(3, route7()));
        await unit.panel.selectPage('L', 'FPL 3');

        await unit.panel.cursor('L');
        expect(unit.panel.focused('L')).toEqual({row: 0, col: 0, text: 'USE?'});

        await unit.panel.outer('L', 1);
        expect(unit.panel.focused('L')).toEqual({row: 0, col: 0, text: 'USE? INVRT?'});
    });

    // 4-4: ENT on USE? activates the plan in its order and shows it as FPL 0 (figure 4-12); the numbered plan stays
    it('activates the plan in its order with USE? and shows FPL 0 (4-4)', async () => {
        const unit = await bootRoute(savedFlightplan(3, route7().slice(0, 4)));
        expect(idents(unit, 0)).toEqual([]); // Precondition: nothing active
        await unit.panel.selectPage('L', 'FPL 3');
        await unit.panel.cursor('L');

        await unit.panel.ent();

        expect(idents(unit, 0)).toEqual(['KAAA', 'ABC', 'KBBB', 'DEFAA']);
        expect(idents(unit, 3)).toEqual(['KAAA', 'ABC', 'KBBB', 'DEFAA']);
        expect(Screen.read().status().left).toBe('FPL 0');
        expect(left().slice(1, 5).map(r => r.slice(2))).toEqual(['1:KAAA   ', '2:ABC    ', '3:KBBB   ', '4:DEFAA  ']);
    });

    // 4-4: ENT on USE? INVRT? activates the plan in reverse order, the last waypoint first (figure 4-13)
    it('activates the plan in reverse order with USE? INVRT? (4-4)', async () => {
        const unit = await bootRoute(savedFlightplan(3, route7().slice(0, 4)));
        await unit.panel.selectPage('L', 'FPL 3');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 1);

        await unit.panel.ent();

        expect(idents(unit, 0)).toEqual(['DEFAA', 'KBBB', 'ABC', 'KAAA']);
        expect(idents(unit, 3)).toEqual(['KAAA', 'ABC', 'KBBB', 'DEFAA']);
        expect(Screen.read().status().left).toBe('FPL 0');
    });

    // 4-1, 4-4: changes to FPL 0 do not change the numbered plan it was activated from
    it('leaves the numbered plan alone when a waypoint of the activated FPL 0 is deleted (4-1, 4-4)', async () => {
        const unit = await bootRoute(savedFlightplan(3, route7().slice(0, 4)));
        await unit.panel.selectPage('L', 'FPL 3');
        await unit.panel.cursor('L');
        await unit.panel.ent();
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 3);
        expect(unit.panel.focused('L').text).toBe('DEFAA'); // Precondition: the cursor on FPL 0's last waypoint

        await unit.panel.clr();
        await unit.panel.ent();

        expect(idents(unit, 0)).toEqual(['KAAA', 'ABC', 'KBBB']);
        expect(idents(unit, 3)).toEqual(['KAAA', 'ABC', 'KBBB', 'DEFAA']);
    });

    // 4-2: an empty numbered plan shows LOAD FPL 0? and a blank first waypoint position (figure 4-2), and the cursor
    // turns on over that position (figure 4-3, 4-6 figure 4-26)
    it('shows LOAD FPL 0? on an empty plan and turns the cursor on over the blank first waypoint (4-2, 4-6)', async () => {
        const unit = await bootRoute({});
        await unit.panel.selectPage('L', 'FPL 7');
        expect(left()).toEqual(['LOAD FPL 0?', '  1:       ', '           ', '           ', '           ', '           ']);

        await unit.panel.cursor('L');

        expect(unit.panel.focused('L')).toEqual({row: 1, col: 4, text: '     '});
    });

    // 4-6: one step counterclockwise from the blank first waypoint is LOAD FPL 0?; ENT copies FPL 0 into the numbered
    // plan, which then shows USE? INVRT? and the waypoints with the cursor off (figure 4-28)
    it('stores FPL 0 in an empty numbered plan with LOAD FPL 0? (4-6)', async () => {
        const unit = await bootRoute(savedFlightplan(0, route7().slice(0, 3)));
        await unit.panel.selectPage('L', 'FPL 7');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', -1);
        expect(unit.panel.focused('L')).toEqual({row: 0, col: 0, text: 'LOAD FPL 0?'});

        await unit.panel.ent();

        expect(idents(unit, 7)).toEqual(['KAAA', 'ABC', 'KBBB']);
        expect(left().slice(0, 4)).toEqual(['USE? INVRT?', '  1:KAAA   ', '  2:ABC    ', '  3:KBBB   ']);
        expect(Screen.read().status().left).toBe('FPL 7');
    });

    // 6-5: approaches can be entered only into FPL 0. The KLN 89 trainer (2026-10-07) agrees: copying FPL 0 with a
    // loaded approach into an empty plan ends the copy at the destination airport, the approach waypoints are not stored
    it('stores FPL 0 without its approach waypoints (4-6, 6-5, checked in the KLN 89 trainer, 2026-10-07)', async () => {
        const unit = await bootWithApproach();
        await unit.panel.selectPage('L', 'FPL 7');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', -1);
        expect(unit.panel.focused('L').text).toBe('LOAD FPL 0?'); // Precondition

        await unit.panel.ent();

        expect(idents(unit, 7)).toEqual(['ENRAA', 'KPRC']);
        expect(idents(unit, 0)).toEqual(['ENRAA', 'IAFAA', 'IFAAA', 'FAFAA', 'MAPAA', 'MAHAA', 'KPRC']);
    });

    // 6-23: SIDs and STARs, like approaches, exist only in FPL 0, so a stored copy keeps only the en route waypoints
    it('stores FPL 0 without its SID waypoints (4-6, 6-23)', async () => {
        const unit = await bootWithSid();
        await unit.panel.selectPage('L', 'FPL 7');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', -1);
        expect(unit.panel.focused('L').text).toBe('LOAD FPL 0?'); // Precondition

        await unit.panel.ent();

        expect(idents(unit, 7)).toEqual(['KPRC']);
        expect(idents(unit, 0)).toEqual(['KPRC', 'DEPAA', 'ENRAA']);
    });

    // 4-5: with the cursor off, CLR asks DELETE FPL? at the top of the page (figure 4-23, the cursor on); ENT clears
    // the plan (figure 4-24: LOAD FPL 0? and the blank first waypoint, the cursor off). The cursor is moved down the
    // plan and turned off first, so that the prompt has to pull it back to the top line
    it('deletes a numbered plan with CLR and ENT (4-5)', async () => {
        const unit = await bootRoute(savedFlightplan(3, route7()));
        expect(String(storedSetting(unit, 'fpl3'))).toHaveLength(7 * 19); // Precondition of the #150 pin: the plan is stored
        await unit.panel.selectPage('L', 'FPL 3');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 3);
        await unit.panel.cursor('L');
        expect(Screen.read().status().left).toBe('FPL 3'); // Precondition: the cursor is off

        await unit.panel.clr();
        expect(Screen.read().status().left).toBe('CRSR');
        expect(unit.panel.focused('L')).toEqual({row: 0, col: 0, text: 'DELETE FPL?'});

        await unit.panel.ent();
        expect(idents(unit, 3)).toEqual([]);
        expect(left().slice(0, 3)).toEqual(['LOAD FPL 0?', '  1:       ', '           ']);
        expect(Screen.read().status().left).toBe('FPL 3');
    });

    // Public contract (CLAUDE.md, persisted user data): the user's flight plans are saved. The deletion is not, as on
    // FPL 0 (FlightplanEdit.test.ts); the test above is the sibling that holds the deletion itself
    it.fails('saves the deleted numbered plan as empty (#150)', async () => {
        const unit = await bootRoute(savedFlightplan(3, route7()));
        expect(String(storedSetting(unit, 'fpl3'))).toHaveLength(7 * 19); // Precondition: the plan is stored
        await unit.panel.selectPage('L', 'FPL 3');
        await unit.panel.clr();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(3000);

        expect(storedSetting(unit, 'fpl3')).toBe(''); // An empty plan is the stored empty string
    });

    // 4-5: CLR instead of ENT keeps the plan
    it('keeps the numbered plan when DELETE FPL? is answered with CLR (4-5)', async () => {
        const unit = await bootRoute(savedFlightplan(3, route7()));
        await unit.panel.selectPage('L', 'FPL 3');
        await unit.panel.clr();
        expect(left()[0]).toBe('DELETE FPL?'); // Precondition

        await unit.panel.clr();

        expect(idents(unit, 3)).toEqual(['KAAA', 'ABC', 'KBBB', 'DEFAA', 'EFGAA', 'KCCC', 'GHIAA']);
        expect(left()[0]).toBe('USE? INVRT?');
        expect(Screen.read().status().left).toBe('FPL 3');
    });

    // 4-5: CLR marks the waypoint with DEL in front and a ? behind (figure 4-20); ENT
    // deletes it and the later waypoints move up (figure 4-21). The KLN 89 trainer (2026-10-07) puts the question mark
    // in a fixed column after a five-cell ident field, not right behind the ident
    it('deletes a waypoint of a numbered plan with CLR and ENT (4-5, checked in the KLN 89 trainer, 2026-10-07)', async () => {
        const unit = await bootRoute(savedFlightplan(3, route7()));
        await unit.panel.selectPage('L', 'FPL 3');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 4); // USE? INVRT?, KAAA, ABC, KBBB
        expect(unit.panel.focused('L').text).toBe('KBBB '); // Precondition

        await unit.panel.clr();
        expect(left()[3]).toBe('DEL KBBB  ?');

        await unit.panel.ent();
        expect(idents(unit, 3)).toEqual(['KAAA', 'ABC', 'DEFAA', 'EFGAA', 'KCCC', 'GHIAA']);
        expect(left().slice(3, 6)).toEqual(['  3:DEFAA  ', '  4:EFGAA  ', '  6:GHIAA  ']);
    });

    // 4-5: CLR a second time keeps the waypoint
    it('keeps the waypoint when DEL is answered with CLR (4-5)', async () => {
        const unit = await bootRoute(savedFlightplan(3, route7()));
        await unit.panel.selectPage('L', 'FPL 3');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 4);
        await unit.panel.clr();
        expect(left()[3]).toBe('DEL KBBB  ?'); // Precondition

        await unit.panel.clr();

        expect(left()[3]).toBe('  3:KBBB   ');
        expect(idents(unit, 3)).toEqual(['KAAA', 'ABC', 'KBBB', 'DEFAA', 'EFGAA', 'KCCC', 'GHIAA']);
    });
});

/** 31 fixes FA00 to FA30 on a line north of 47N 8E; FPL 5 holds the first 30 */
const FIXES31 = () => Array.from({length: 31}, (_, i) => intersection(`FA${String(i).padStart(2, '0')}`, 47 + i * 0.05, 8));

describe('FPL 1 to FPL 25 pages, a full plan', () => {
    /**
     * Boots with FPL 5 full, walks the cursor to the 30th waypoint, opens an insert in front of it with the inner knob,
     * enters FA30 there and confirms it on the waypoint page. The unit logs the refused insert with console.error, which
     * the test keeps out of its output.
     */
    async function insertIntoFullFpl5() {
        const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        onTestFinished(() => quiet.mockRestore());
        const fixes = FIXES31();
        const unit = await bootUnit({facilities: fixes, position: {lat: 46.5, lon: 8}, storage: savedFlightplan(5, fixes.slice(0, 30))});
        await settle(unit);
        await unit.panel.selectPage('L', 'FPL 5');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 31); // USE? INVRT?, then the 30 waypoints
        expect(left()[5]).toBe(' 30:FA29   '); // Precondition
        expect(unit.panel.focused('L').text).toBe('FA29 '); // Precondition
        await unit.panel.inner('L', 1); // the insert in front of FA29
        expect(left()[5]).toBe(' 31:FA29   '); // Precondition: FA29 moved down to make room, so an insert is open
        // The new entry is number 30. It is found by its number and not by its text (the text of the first click is
        // #311), and it is not on the page yet while the cursor stands on the waypoint before it
        const cursorOnEntry = () => cursorRows().length === 1 && /^\s*30:/.test(left()[cursorRows()[0]]);
        if (!cursorOnEntry()) {
            // The cursor stays on the waypoint before the new entry (#242); one click moves it on
            await unit.panel.outer('L', 1);
        }
        expect(cursorOnEntry()).toBe(true); // Precondition: the cursor is on the new entry
        await unit.panel.enterIdent('L', 'FA30');
        await unit.panel.ent(); // the waypoint page
        await unit.panel.ent();
        return unit;
    }

    /** The rows of the page after each of a number of outer clicks, the first ones being the current rows */
    async function walkRows(unit: HeadlessUnit, clicks: number): Promise<string[]> {
        const seen = [...left()];
        for (let i = 0; i < clicks; i++) {
            await unit.panel.outer('L', 1);
            seen.push(...left());
        }
        return seen;
    }

    /** The number and ident of every row that shows a waypoint */
    const numbered = (rows: string[]) => rows.flatMap(r => {
        const m = /^.\s*(\d+):(\S+)/.exec(r);
        return m === null ? [] : [{n: Number(m[1]), ident: m[2]}];
    });

    // 4-4: a waypoint can be added to a plan of fewer than 30 waypoints. C-1 names FPL FULL for an addition to a plan
    // of 30 whose first waypoint is on the active leg; a numbered plan has no active leg, so nothing can make room
    it('refuses a 31st waypoint with FPL FULL (4-4, C-1)', async () => {
        const unit = await insertIntoFullFpl5();

        expect(Screen.read().status().mode).toBe('FPL FULL');
        expect(idents(unit, 5)).toEqual(FIXES31().slice(0, 30).map(f => f.icaoStruct.ident));
        expect(unit.errors).toEqual([]);
    });

    // The refused waypoint stays on the page as a row until the page is left: the entry that held it is not removed
    // from the list. The sibling above holds that the plan itself is unchanged. The cursor is walked over the page: it
    // wraps today (#218), so the walk does not depend on where the cursor stands
    it.fails('does not show the refused waypoint after FPL FULL (4-4, C-1, #240)', async () => {
        const unit = await insertIntoFullFpl5();

        const rows = numbered(await walkRows(unit, 40));
        const expectedIdent = (n: number) => `FA${String(n - 1).padStart(2, '0')}`;
        expect(rows.filter(r => r.ident !== expectedIdent(r.n))).toEqual([]);
    });

    // 4-4: the plan holds 30 waypoints. The walk is a fixed number of outer clicks over the fields of the page
    it('shows the 30th waypoint of a full plan (4-4)', async () => {
        const fixes = FIXES31();
        const unit = await bootUnit({facilities: fixes, position: {lat: 46.5, lon: 8}, storage: savedFlightplan(5, fixes.slice(0, 30))});
        await settle(unit);
        await unit.panel.selectPage('L', 'FPL 5');
        await unit.panel.cursor('L');

        const seen = await walkRows(unit, 34);

        expect(seen).toContain(' 30:FA29   ');
    });

    // 4-4: only a plan of fewer than 30 offers a blank position for another waypoint; the KLN 89 trainer (2026-10-07)
    // shows no blank position behind the last waypoint of a full plan and no cursor field there either
    it.fails('shows no blank position after the 30th waypoint (4-4, checked in the KLN 89 trainer, 2026-10-07, #241)', async () => {
        const fixes = FIXES31();
        const unit = await bootUnit({facilities: fixes, position: {lat: 46.5, lon: 8}, storage: savedFlightplan(5, fixes.slice(0, 30))});
        await settle(unit);
        await unit.panel.selectPage('L', 'FPL 5');
        await unit.panel.cursor('L');

        const seen = await walkRows(unit, 34);

        expect(seen.filter(r => r.startsWith(' 31:'))).toEqual([]);
    });
});

describe('inserting a waypoint with the inner knob', () => {
    // 4-4 (figures 4-15 and 4-16, which show FPL 0): the inner knob on a waypoint opens an entry in front of it, the
    // waypoint moves down one position, and the cursor is on the new entry. The row of the new entry is looked up by
    // its number, not by its text (the first click shows a blank, which #311 says is wrong): the page scrolls when the
    // list is rebuilt
    it('puts the cursor on the new entry when the inner knob opens an insert on FPL 0 (4-4)', async () => {
        const unit = await bootRoute(savedFlightplan(0, route7()));
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 1);
        expect(unit.panel.focused('L').text).toBe('ABC  '); // Precondition: waypoint 2, in row 1

        await unit.panel.inner('L', 1);

        const entryRows = left().flatMap((r, i) => /^\s*2:/.test(r) ? [i] : []);
        expect(entryRows).toHaveLength(1); // exactly one entry carries the number 2
        expect(left().map(r => r.slice(1))).toContain(' 3:ABC    ');
        expect(cursorRows()).toEqual(entryRows);
    });

    /** FPL 3 holds the seven waypoints; the cursor is on ABC, waypoint 2, in row 2 (USE? INVRT?, KAAA, ABC) */
    async function cursorOnAbcOfFpl3() {
        const unit = await bootRoute(savedFlightplan(3, route7()));
        await unit.panel.selectPage('L', 'FPL 3');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 3);
        expect(unit.panel.focused('L').text).toBe('ABC  '); // Precondition
        return unit;
    }

    // 4-4: the inner knob can insert into any plan below the 30-waypoint limit, not only into FPL 0: it opens an entry
    // in front of the waypoint under the cursor and the waypoint moves down. This holds the insert of the numbered
    // plan, by the number of the new entry and not by its text (the first click shows a blank, which #311 says is
    // wrong); the cursor on it is the pin below
    it('opens an entry in front of the waypoint when the inner knob turns on a numbered plan (4-4)', async () => {
        const unit = await cursorOnAbcOfFpl3();

        await unit.panel.inner('L', 1);

        expect(left().slice(2, 4).map(r => r.slice(0, 4))).toEqual(['  2:', '  3:']);
        expect(left()[3]).toBe('  3:ABC    ');
    });

    // 4-4 puts the cursor on the entry being typed, whichever plan it is. On a numbered plan with waypoints it stays
    // on the waypoint before the new entry, which is open for typing but not under the cursor
    it.fails('puts the cursor on the new blank entry when the inner knob opens an insert on a numbered plan (4-4, #242)', async () => {
        const unit = await cursorOnAbcOfFpl3();

        await unit.panel.inner('L', 1);

        expect(cursorRows()).toEqual([2]);
    });
});

describe('FPL 0 page, an ident that is not in the database', () => {
    /** The cursor on the blank position behind the plan, the right side on APT 1 (which shows no creation rows) */
    async function cursorOnBlankPosition() {
        const unit = await bootRoute(savedFlightplan(0, route7()));
        await unit.panel.selectPage('R', 'APT 1');
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 7); // from waypoint 1 to the position behind waypoint 7
        expect(unit.panel.focused('L').text.trim()).toBe(''); // Precondition: the blank position
        return unit;
    }

    // 4-2: an ident that is not in the database, entered on the flight plan page, leads to the page that creates a user
    // waypoint. The sibling holds the entry up to ENT: QQQQ is in no database of the test world
    it('shows the typed unknown ident on FPL 0 (4-2)', async () => {
        const unit = await cursorOnBlankPosition();

        await unit.panel.enterIdent('L', 'QQQQ');

        expect(left()[5]).toBe('  8:QQQQ   ');
        expect(Screen.read().rows('R')[2]).not.toBe('CREATE NEW '); // Precondition: the right side shows no creation rows yet
    });

    it.fails('offers to create a user waypoint for an unknown ident (4-2, #262)', async () => {
        const unit = await cursorOnBlankPosition();
        await unit.panel.enterIdent('L', 'QQQQ');

        await unit.panel.ent();

        expect(Screen.read().status().mode).not.toBe('NO SUCH WPT');
        expect(Screen.read().rows('R').slice(2, 4)).toEqual(['CREATE NEW ', 'WPT AT:    ']);
    });
});
