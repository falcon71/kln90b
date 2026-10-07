import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../../harness/boot';
import {airport} from '../../../harness/navdata/builders';
import {readRows, Screen} from '../../../harness/render/screen';
import {MainPage} from '../../../../kln90b/pages/MainPage';
import {Nav1Page} from '../../../../kln90b/pages/left/Nav1Page';
import {savedFlightplan} from '../../../harness/storage';
import {pointFrom} from '../../../harness/flight/geo';

// An invented world: KDDD, with KAAA 200 NM west of it on the great circle that leaves KDDD on 270 true, so every point
// west(nm) lies on the leg KAAA to KDDD (no cross track). FPL 0 is KAAA, KDDD; KDDD is active.
const KDDD = airport('KDDD', 47.0, 9.0);
const KAAA = airport('KAAA', pointFrom(KDDD, 270, 200).lat, pointFrom(KDDD, 270, 200).lon);
/** The point `nm` west of KDDD, on the leg from KAAA */
const west = (nm: number) => pointFrom(KDDD, 270, nm);

/**
 * Boots on the leg 5 NM further west, selects NAV 1 on the left, then holds the position `nm` west of KDDD at
 * `groundspeedKt` with the track of the leg. The page is selected first, because selectPage reads the screen, and a
 * screen that overflows its half page (the DIS pin) cannot be read.
 */
async function onLeg(nm: number, groundspeedKt: number, magvar = 0): Promise<HeadlessUnit> {
    const unit = await bootUnit({
        facilities: [KAAA, KDDD], position: west(nm + 5), magvar,
        storage: savedFlightplan(0, [KAAA, KDDD]),
    });
    await settle(unit);
    await unit.panel.selectPage('L', 'NAV 1');
    await moveAircraft(unit, west(nm), {groundspeedKt, trackTrue: 90});
    expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()?.icaoStruct.ident).toBe('KDDD'); // Precondition
    await vi.advanceTimersByTimeAsync(1000);
    return unit;
}

/** The raw text of a row of the left half page, read without the width check of Screen */
const rawLeftRow = (i: number) => readRows(document.querySelector('.left-page')!).map(r => r.map(c => c.ch).join(''))[i];

describe('NAV 1 page (characterization)', () => {
    it('shows the leg, the deviation bar, DIS, GS, ETE and BRG on an FPL 0 leg', async () => {
        await onLeg(64.8, 145);

        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          "KAAA ›KDDD 
          ηηηηηΟηηηηη
          DIS  64.8nm
          GS    145kt
          ETE     :27
          BRG    089°"
        `);
    });
});

describe('NAV 1 page', () => {
    // 5-7, figures 5-21 and 5-22: 64.8 NM from the active waypoint at 145 kt NAV 1 shows DIS 64.8nm, GS 145kt and an ETE
    // of :27 (26.8 minutes, so the minutes are rounded and a time under an hour has no hour digit). 3-31: BRG is the
    // bearing to the active waypoint. The aircraft is on the great circle west of KDDD, so the bearing to KDDD is the
    // course from the aircraft to KDDD: 088.8 true (the textbook course formula of geo.ts, worked by hand), 089 at
    // magvar 0.
    it('shows DIS, GS and ETE as in the manual\'s VNAV example (5-7, 3-31)', async () => {
        await onLeg(64.8, 145);

        expect(Screen.read().rows('L').slice(2)).toEqual([
            'DIS  64.8nm',
            'GS    145kt',
            'ETE     :27',
            'BRG    089°',
        ]);
    });

    // 3-31, figure 3-97: from 100 NM on DIS shows whole nautical miles, and an ETE of an hour or more is hours:minutes.
    // 150.4 NM at 145 kt is 62.2 minutes.
    it('shows whole NM from 100 NM on and an ETE in hours and minutes (3-31)', async () => {
        await onLeg(150.4, 145);

        const rows = Screen.read().rows('L');
        expect(rows[2]).toBe('DIS   150nm');
        expect(rows[4]).toBe('ETE    1:02');
    });

    // 3-31, figure 3-97: the whole-NM display starts at 100 NM, so 101.4 NM shows 101 and not 101.4 (five cells)
    it('shows whole NM just above 100 NM (3-31)', async () => {
        await onLeg(101.4, 145);

        expect(Screen.read().rows('L')[2]).toBe('DIS   101nm');
    });

    // 5-7, 3-31: an ETE under an hour has no hour digit and shows the minutes to the cell. 60 NM at 80 kt is 45 minutes,
    // which an hour taken by rounding would turn into 1:45
    it('shows an ETE of 45 minutes without an hour digit (5-7, 3-31)', async () => {
        await onLeg(60, 80);

        expect(Screen.read().rows('L').slice(2, 5)).toEqual(['DIS  60.0nm', 'GS     80kt', 'ETE     :45']);
    });

    // 3-31 gives BRG as the bearing to the active waypoint, and 5-44 says everything is referenced to true north only
    // outside the coverage area, so inside it the bearing is magnetic. At a variation of 10 degrees east the 088.8 true
    // bearing of the example reads 079
    it('shows BRG magnetic (3-31, 5-44)', async () => {
        await onLeg(64.8, 145, 10);

        expect(Screen.read().rows('L')[5]).toBe('BRG    079°');
    });

    // The setup sibling of the ETE pin: 99.5 NM at 100 kt is 59.7 minutes
    it('reaches an ETE of 59.7 minutes (3-31)', async () => {
        const unit = await onLeg(99.5, 100);

        expect(unit.props.memory.navPage.eteToActive! / 60).toBeCloseTo(59.7, 3);
        const rows = Screen.read().rows('L');
        expect(rows[2]).toBe('DIS  99.5nm');
        expect(rows[3]).toBe('GS    100kt');
        expect(rows[4].startsWith('ETE ')).toBe(true);
    });

    // 3-31, 5-7: the ETE is hours and minutes, so the minutes are 00 to 59. 59.7 minutes rounds to 1:00 (the figures of
    // 5-7 round); a unit that truncates would show :59 (the KLN 89 trainer, 2026-10-07, truncates its NAV 1 ETE and
    // never showed :60 across the hour). The code rounds the minutes alone and shows :60.
    it.fails('never shows 60 minutes in the ETE (3-31, 5-7, #223)', async () => {
        await onLeg(99.5, 100);

        expect(['ETE    1:00', 'ETE     :59']).toContain(Screen.read().rows('L')[4]);
    });

    // The setup sibling of the DIS pin: 99.97 NM from KDDD
    it('reaches a distance of 99.97 NM (3-31)', async () => {
        const unit = await onLeg(99.97, 145);

        expect(unit.props.memory.navPage.distToActive!).toBeCloseTo(99.97, 3);
        expect(unit.errors).toEqual([]);
        // NAV 1 is on the left (asserted as the row's label only, so that no passing test claims the value is right)
        expect((unit.props.pageManager.getCurrentPage() as MainPage).getLeftPage()).toBeInstanceOf(Nav1Page);
        expect(rawLeftRow(2).startsWith('DIS ')).toBe(true);
    });

    // 3-31: DIS fills four cells, tenths below 100 NM and whole NM above (figures 3-97, 5-21). Just below 100 NM the
    // tenths round up to 100.0, five cells, which runs past the edge of the half page (Screen.read() throws on it).
    // Expected: 100 (rounded) or 99.9 (truncated), in the four cells.
    it.fails('keeps DIS in its four cells just below 100 NM (3-31, #226)', async () => {
        await onLeg(99.97, 145);

        expect(['DIS   100nm', 'DIS  99.9nm']).toContain(Screen.read().rows('L')[2]);
    });
});

/** Boots on the leg 30 NM west of KDDD and makes a direct-to KDDD from the DIR page; NAV 1 comes up on the right */
async function directToKddd(): Promise<HeadlessUnit> {
    const unit = await bootUnit({
        facilities: [KAAA, KDDD], position: west(30), storage: savedFlightplan(0, [KAAA, KDDD]),
    });
    await settle(unit);
    // The boot right page is SUP without a facility, so the DIR page opens blank
    await unit.panel.dct();
    await unit.panel.enterIdent('L', 'KDDD');
    await unit.panel.ent(); // the APT 1 confirmation
    await unit.panel.ent();
    await vi.advanceTimersByTimeAsync(1000);
    return unit;
}

describe('NAV 1 page, direct-to', () => {
    // The setup sibling of the pin below: a direct-to KDDD, NAV 1 on the right, the arrow before KDDD in cell 5
    it('shows the active waypoint after the arrow on a direct-to (3-31)', async () => {
        const unit = await directToKddd();

        expect(unit.props.memory.navPage.activeWaypoint.isDctNavigation()).toBe(true);
        const screen = Screen.read();
        expect(screen.status().right).toBe('NAV 1');
        expect(screen.rows('R')[0].slice(5)).toBe('›KDDD ');
    });

    // 3-31, figure 3-97 (and the Super NAV 1 of figure 5-21): on a direct-to the leg is the Direct To symbol followed by
    // the waypoint, the symbol (the font's d plus the arrow, docs/architecture.md) directly in front of the ident; a
    // photo of a real unit (reference-photos-index.md, the approach select page) shows it the same way. The code pads
    // the "d" FROM ident to five cells like a waypoint ident, so the d stands in cell 0, four cells away from its arrow.
    it.fails('draws the Direct To symbol directly in front of the waypoint (3-31, figure 3-97, #227)', async () => {
        await directToKddd();

        expect(Screen.read().rows('R')[0]).toBe('    d›KDDD ');
    });
});

describe('NAV 1 deviation bar', () => {
    /** On the leg 30 NM west of KDDD, then `nm` north of it (left of the eastbound course) */
    async function leftOfCourse(nm: number): Promise<HeadlessUnit> {
        const unit = await onLeg(30, 120);
        await moveAircraft(unit, pointFrom(west(30), 0, nm), {groundspeedKt: 120, trackTrue: 90});
        await vi.advanceTimersByTimeAsync(500);
        return unit;
    }

    /** On the leg 30 NM west of KDDD, then `nm` away from the course on `bearingTrue` (0 is left of the eastbound course) */
    async function offCourse(bearingTrue: number, nm: number): Promise<HeadlessUnit> {
        const unit = await onLeg(30, 120);
        await moveAircraft(unit, pointFrom(west(30), bearingTrue, nm), {groundspeedKt: 120, trackTrue: 90});
        await vi.advanceTimersByTimeAsync(500);
        return unit;
    }

    // 3-31: the CDI has five dots each side with 1 NM a dot, and the bar moves like the needle of a CDI: the aircraft
    // left of the course puts the bar right of the center. The triangle in the center points up for TO. 2 NM left is two
    // dots right of the center. The bar sits on a dot, which the font draws as the dot glyph with the bar through its middle.
    it('draws the bar two dots right of the center 2 NM left of the course flying TO (3-31)', async () => {
        const unit = await offCourse(0, 2);

        expect(unit.props.memory.navPage.toFrom).toBe(true);
        expect(Screen.read().rows('L')[1]).toBe('ηηηηηθηΕηηη');
    });

    // 3-31: the same 2 NM on the other side puts the bar two dots left of the center
    it('draws the bar two dots left of the center 2 NM right of the course flying TO (3-31)', async () => {
        await offCourse(180, 2);

        expect(Screen.read().rows('L')[1]).toBe('ηηηΕηθηηηηη');
    });

    // 3-31: the bar stops at the outer dot, 5 NM off the course, on either side
    it('stops the bar at the outer dot on the right 7 NM left of the course (3-31)', async () => {
        await offCourse(0, 7);
        expect(Screen.read().rows('L')[1]).toBe('ηηηηηθηηηηΕ');
    });

    it('stops the bar at the outer dot on the left 7 NM right of the course (3-31)', async () => {
        await offCourse(180, 7);
        expect(Screen.read().rows('L')[1]).toBe('Εηηηηθηηηηη');
    });

    /** 3 NM past KDDD, `nm` left of the course (the great circle of the leg continues through KDDD) */
    async function pastWaypoint(nm: number): Promise<HeadlessUnit> {
        const unit = await onLeg(30, 120);
        await moveAircraft(unit, pointFrom(pointFrom(KDDD, 90, 3), 0, nm), {groundspeedKt: 120, trackTrue: 90});
        await vi.advanceTimersByTimeAsync(500);
        return unit;
    }

    // 3-31: past the waypoint the triangle in the center points down for FROM; the bar moves the same way
    it('shows the FROM triangle past the waypoint with the bar two dots right of the center (3-31)', async () => {
        const unit = await pastWaypoint(2);

        expect(unit.props.memory.navPage.toFrom).toBe(false);
        expect(Screen.read().rows('L')[1]).toBe('ηηηηηιηΕηηη');
    });

    // 3-31: on the course the bar sits in the triangle, which the font draws as the FROM triangle with the bar through it
    it('draws the bar in the FROM triangle on the course past the waypoint (3-31)', async () => {
        const unit = await pastWaypoint(0);

        expect(unit.props.memory.navPage.toFrom).toBe(false);
        expect(Screen.read().rows('L')[1]).toBe('ηηηηηαηηηηη');
    });

    // The setup sibling of the pin: 0.55 NM left of the course, TO the active waypoint, on the 5 NM scale
    it('reaches 0.55 NM left of the course flying TO (3-31)', async () => {
        const unit = await leftOfCourse(0.55);

        const nav = unit.props.memory.navPage;
        expect(nav.xtkToActive!).toBeCloseTo(-0.55, 2);
        expect(nav.toFrom).toBe(true);
        expect(nav.xtkScale).toBe(5);
        expect(Screen.read().rows('L')[1].length).toBe(11);
    });

    // 3-31: the bar works like the needle of a CDI, the center triangle shows TO or FROM only. 0.55 NM left of the course
    // puts the bar between the triangle and the first dot right of it, which the font draws with two glyphs: the
    // triangle with the bar at its right edge (TO: Υ, FROM: ζ) and the dot with the bar at its left edge (Α). The FROM
    // case draws both; the TO case drops the second glyph (DeviationBar.ts:72, an operator precedence slip), so half of
    // the bar is missing.
    it.fails('draws the whole bar next to the TO triangle (3-31, #225)', async () => {
        await leftOfCourse(0.55);

        expect(Screen.read().rows('L')[1]).toBe('ηηηηηΥΑηηηη');
    });
});
