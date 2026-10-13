import {describe, expect, it, vi} from 'vitest';
import {ICAO, UserFacility} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {insertLeg} from '../../../harness/flightplan';
import {courseDeg, pointFrom} from '../../../harness/flight/geo';
import {vor} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';
import {collectStatusMessages} from '../../../harness/statusLine';
import {savedUserWaypoints} from '../../../harness/storage';
import {activeIdent} from '../../../harness/readers';
import {muteConsoleError} from '../../../harness/console';
import {KLNFacilityRepository} from '../../../../kln90b/data/navdata/KLNFacilityRepository';

// Invented facilities on the meridian 10.5 E (longitudes of 10 degrees or more keep the coordinate rows clear of #230).
// ABC is the only VOR near the user waypoints, 0.2 degrees (12.0 NM) south of USUP and 0.3 degrees (18.0 NM) south of
// USUQ; the aircraft is 12.0 NM south of ABC. The variation of ABC is given in degrees east, which the sim stores
// negated (builders.ts, Nav2Page). "C-1" and "C-2" in the titles are pages of Appendix C of the Pilot's Guide (the
// message list).
const POSITION = {lat: 46.8, lon: 10.5};
const abc = (variationEast = 0) => vor('ABC', 47.0, 10.5, {magneticVariation: 0 - variationEast});
const SUPS = () => savedUserWaypoints([
    {kind: 'sup', ident: 'USUP', lat: 47.2, lon: 10.5},
    {kind: 'sup', ident: 'USUQ', lat: 47.3, lon: 10.5},
]);

/** The REF calculation of the page takes 8 s (REF_CALCULATION_TIME) */
const REF_DELAY_MS = 9000;

const rightRows = () => Screen.read().rows('R');

/**
 * Enters an east longitude below 100 degrees into the open longitude field. E is typed, the inner knob selects the
 * hundreds 0 (the open field shows it, #304), and the remaining digits (tens and units of the degrees, then the
 * minutes) are typed in the cells after it. A pilot could type that 0 as well since #304 (the PC keyboard sends A to Z
 * and 0 to 9, KLN90BCore.handleKeyboardEvent); the knob step stays as it is.
 */
async function typeEastBelow100(unit: HeadlessUnit, digits: string): Promise<void> {
    await unit.panel.type('R', 'E');
    await unit.panel.inner('R', 1);
    // The knob step happened: the hundreds cell is no longer the dash of the typed E. The open field shows the
    // hundreds 0 (#304)
    expect(rightRows()[5].slice(0, 2)).toBe('E0');
    await unit.panel.outer('R', 1);
    await unit.panel.type('R', digits);
}

/**
 * The SUP page on the right, showing USUP (the first user waypoint), once its reference VOR has been computed.
 * `magvar` is the variation of the aircraft's position, `vorVariation` the one of ABC, both in degrees east.
 */
async function supPage(o: { magvar?: number, vorVariation?: number, extra?: ReturnType<typeof vor>[] } = {}): Promise<HeadlessUnit> {
    const unit = await bootUnit({
        facilities: [abc(o.vorVariation ?? 0), ...(o.extra ?? [])], position: POSITION, magvar: o.magvar ?? 0, storage: SUPS(),
    });
    await unit.panel.selectPage('R', 'SUP  ');
    await vi.advanceTimersByTimeAsync(REF_DELAY_MS);
    expect(rightRows()[0]).toBe(' USUP      '); // precondition
    return unit;
}

/** The SUP page with the cursor on and the unknown ident QQ entered: the CREATE NEW WPT AT: prompt (5-18, 5-19) */
async function createNewQq(o: { magvar?: number, vorVariation?: number } = {}): Promise<HeadlessUnit> {
    const unit = await bootUnit({facilities: [abc(o.vorVariation ?? 0)], position: POSITION, magvar: o.magvar ?? 0});
    await unit.panel.selectPage('R', 'SUP  ');
    await unit.panel.cursor('R');
    await unit.panel.enterIdent('R', 'QQ');
    return unit;
}

/** QQ is entered, USER POS? chosen and the reference waypoint ABC approved on its waypoint page (5-19 steps 3 to 8) */
async function qqWithApprovedRefAbc(o: { magvar?: number, vorVariation?: number } = {}): Promise<HeadlessUnit> {
    const unit = await createNewQq(o);
    await unit.panel.cursorTo('R', 'USER POS?');
    await unit.panel.ent();
    await unit.panel.outer('R', -3);
    expect(unit.panel.focused('R')).toEqual({row: 1, col: 18, text: '_____'}); // precondition: the REF field
    await unit.panel.enterIdent('R', 'ABC');
    await unit.panel.ent();
    expect(Screen.read().status()).toEqual({left: 'NAV 2', mode: 'enr-leg ent', right: 'VOR'}); // the waypoint page asks for ENT
    await unit.panel.ent();
    expect(rightRows()[1]).toBe('REF:  ABC  ');
    return unit;
}

const userWaypoint = (unit: HeadlessUnit, ident: string) =>
    KLNFacilityRepository.getRepository(unit.props.bus).get(ICAO.value('U', 'XX', '', ident));

// The DIS row (row 3) is left out: the DIS format has its own tests (#282).
// With no magnetic variation the RAD row shows the same value either way (#280).
describe('SUP page (characterization)', () => {
    it('shows a user waypoint with its reference VOR, radial and coordinates', async () => {
        await supPage();

        const screen = Screen.read();
        expect({rows: [0, 1, 2, 4, 5].map(r => screen.rows('R')[r]), status: screen.status()}).toMatchInlineSnapshot(`
          {
            "rows": [
              " USUP      ",
              "REF:  ABC  ",
              "RAD: 000.0°",
              "N 47°12.00'",
              "E 10°30.00'",
            ],
            "status": {
              "left": "NAV 2",
              "mode": "enr-leg msg",
              "right": "SUP",
            },
          }
        `);
    });
});

describe('SUP page without a user waypoint', () => {
    // Checked in the KLN 89 trainer, 2026-10-07: with no user waypoint its user page shows a 0 as the ident and offers to
    // create a waypoint. The 90B offers USER POS? and PRES POS? (5-18, 5-19 figure 5-68); the 89 has a third choice.
    it('shows the ident 0 and the creation choices (the KLN 89 trainer, 5-18)', async () => {
        const unit = await bootUnit({facilities: [abc()], position: POSITION});
        await unit.panel.selectPage('R', 'SUP  ');
        await vi.advanceTimersByTimeAsync(500); // the page hides its REF rows at its first redraw

        expect(rightRows()).toEqual([' 0         ', '           ', 'CREATE NEW ', 'WPT AT:    ', 'USER POS?  ', 'PRES POS?  ']);
    });

    // Appendix C, page C-2: NO SUP WPTS appears when the SUP page type is selected, and the unit has no database cartridge
    // and no user (supplemental) waypoint. The harness always has navdata, so the user waypoints decide here. The 89 shows
    // no message, so the trainer is not cited.
    it('posts NO SUP WPTS when the SUP page is selected (C-2)', async () => {
        const unit = await bootUnit({facilities: [abc()], position: POSITION});
        await unit.panel.selectPage('R', 'NAV 1');
        await vi.advanceTimersByTimeAsync(6000); // the messages of the boot and the page change have gone
        const messages = collectStatusMessages(unit);

        await unit.panel.selectPage('R', 'SUP  ');

        expect(messages).toEqual(['NO SUP WPTS']);
    });
});

describe('SUP page', () => {
    // Checked in the KLN 89 trainer, 2026-10-07: the page of a waypoint type keeps its waypoint over a change of type
    it('keeps the waypoint it showed over a page change (the KLN 89 trainer)', async () => {
        const unit = await supPage();
        await unit.panel.scan();
        await unit.panel.inner('R', 1);
        await unit.panel.scan();
        expect(rightRows()[0]).toBe(' USUQ      '); // precondition

        await unit.panel.outer('R', -1); // INT
        await unit.panel.outer('R', 1); // SUP

        expect(rightRows()[0]).toBe(' USUQ      ');
    });

    // 3-51 (figure 3-159) and 5-19 (figure 5-76): a SUP waypoint shows the radial and distance from the nearest VOR,
    // which takes a few seconds (3-50). USUP is 12.0 NM due north of ABC: radial 000.0. XYZ is farther from the waypoint
    // (0.6 degrees, 36 NM) and must not be taken; NEA is nearer to the aircraft (6 NM) than ABC (12 NM) but 30 NM from the
    // waypoint, so the search is made from the waypoint and not from the aircraft.
    it('shows the radial and distance from the nearest VOR (3-50, 3-51, 5-19)', async () => {
        await supPage({extra: [vor('XYZ', 47.8, 10.5), vor('NEA', 46.7, 10.5)]});

        const rows = rightRows();
        expect(rows[1]).toBe('REF:  ABC  ');
        expect(rows[2]).toBe('RAD: 000.0°');
        expect(rows[3].slice(5, 9)).toBe('12.0'); // the digits only: the format has its own tests (#282)
    });

    // A radial is the course out of the VOR, the initial bearing at the station (figure 5-76; the KLN 89 trainer,
    // 2026-10-07, on the INT page). USUR lies 48.1 NM out on ABC's true 090 course (pointFrom, flight/geo.ts); the
    // final bearing at the waypoint would show 090.9.
    it('shows the radial as the bearing at the VOR (5-19, figure 5-76, #281)', async () => {
        const p = pointFrom({lat: 47.0, lon: 10.5}, 90, 48.1);
        const unit = await bootUnit({
            facilities: [abc()], position: POSITION, storage: savedUserWaypoints([{kind: 'sup', ident: 'USUR', lat: p.lat, lon: p.lon}]),
        });
        await unit.panel.selectPage('R', 'SUP  ');
        await vi.advanceTimersByTimeAsync(REF_DELAY_MS);
        expect(rightRows().slice(0, 2)).toEqual([' USUR      ', 'REF:  ABC  ']); // precondition

        expect(rightRows()[2]).toBe('RAD: 090.0°');
    });

    // 5-18, 5-19 (figure 5-68): an ident without a waypoint offers CREATE NEW WPT AT: with USER POS? and PRES POS?
    it('offers to create a waypoint for an ident that has none (5-18, 5-19)', async () => {
        await createNewQq();

        expect(rightRows()).toEqual([' QQ        ', '           ', 'CREATE NEW ', 'WPT AT:    ', 'USER POS?  ', 'PRES POS?  ']);
    });

    // 5-16 step 7 (figure 5-55) for the airport, 5-18 for SUP ("the first method is similar"): PRES POS? creates the
    // waypoint at the present position and the cursor goes off
    it('creates the waypoint at the present position with PRES POS? (5-16, 5-18)', async () => {
        const unit = await createNewQq();
        await unit.panel.cursorTo('R', 'PRES POS?');

        await unit.panel.ent();

        expect(rightRows().slice(4)).toEqual(["N 46°48.00'", "E 10°30.00'"]);
        expect(Screen.read().status().right).toBe('SUP');
        expect(userWaypoint(unit, 'QQ')!.lat).toBeCloseTo(46.8, 9);
        // A waypoint of the user database is not a temporary one (the region XX; XY marks the temporary ones, CLAUDE.md)
        expect((userWaypoint(unit, 'QQ') as UserFacility).isTemporary).toBe(false);
    });

    // Checked in the KLN 89 trainer, 2026-10-07: the page of a waypoint type keeps its waypoint over a change of type, a
    // created one too
    it('shows the waypoint created with PRES POS? when the page comes back (the KLN 89 trainer)', async () => {
        const unit = await createNewQq();
        await unit.panel.cursorTo('R', 'PRES POS?');
        await unit.panel.ent();

        await unit.panel.outer('R', -1); // INT
        await unit.panel.outer('R', 1); // SUP

        expect(rightRows()[0]).toBe(' QQ        ');
        expect(rightRows().slice(4)).toEqual(["N 46°48.00'", "E 10°30.00'"]);
    });

    // 5-17 step 8 (figures 5-56 to 5-58), 5-18: USER POS? puts the cursor on the dashed latitude, ENT on the latitude moves
    // it to the longitude, and ENT on the longitude creates the waypoint with the cursor off. C-1: ENT LAT/LON reminds the
    // pilot of the missing position. The keyboard types the digits (the editors have their own tests).
    it('creates the waypoint at a typed latitude and longitude with USER POS? (5-17, 5-18, C-1)', async () => {
        const unit = await createNewQq();
        await unit.panel.cursorTo('R', 'USER POS?');

        await unit.panel.ent();
        expect(unit.panel.focused('R')).toEqual({row: 4, col: 12, text: '_ __°__.__'});
        await unit.panel.type('R', 'N470600');
        await unit.panel.ent();
        expect(unit.panel.focused('R').row).toBe(5);
        expect(Screen.read().status().mode).toBe('ENT LAT/LON');
        await typeEastBelow100(unit, '103000');
        await unit.panel.ent();

        expect(rightRows().slice(4)).toEqual(["N 47°06.00'", "E 10°30.00'"]);
        expect(Screen.read().status().right).toBe('SUP');
        // The page shows what was typed, so the stored waypoint is read too
        expect(userWaypoint(unit, 'QQ')!.lat).toBeCloseTo(47.1, 9);
        expect(userWaypoint(unit, 'QQ')!.lon).toBeCloseTo(10.5, 9);
    });

    // Checked in the KLN 89 trainer, 2026-10-07: the page of a waypoint type keeps its waypoint over a change of type, a
    // created one too
    it('shows the waypoint created with USER POS? when the page comes back (the KLN 89 trainer)', async () => {
        const unit = await createNewQq();
        await unit.panel.cursorTo('R', 'USER POS?');
        await unit.panel.ent();
        await unit.panel.type('R', 'N470600');
        await unit.panel.ent();
        await typeEastBelow100(unit, '103000');
        await unit.panel.ent();

        await unit.panel.outer('R', -1); // INT
        await unit.panel.outer('R', 1); // SUP

        expect(rightRows()[0]).toBe(' QQ        ');
        expect(rightRows().slice(4)).toEqual(["N 47°06.00'", "E 10°30.00'"]);
    });

    // 5-19 steps 3 to 12 (figures 5-69 to 5-75): after USER POS? the cursor turns counterclockwise to REF; the reference
    // waypoint is approved on its waypoint page; ENT on the radial moves the cursor to DIS; ENT on the distance computes
    // the position and the cursor goes off. 120.0 NM on the radial 090 from ABC (47 N, 10.5 E) is 46.96272 N, 13.42596 E
    // on the sphere the unit computes on (computed by hand from the textbook formula, as flight/geo.ts does). The
    // distance has three digits, so that the leading digit of the distance field is typed as a digit.
    it('creates the waypoint from a reference waypoint, radial and distance (5-19)', async () => {
        const unit = await qqWithApprovedRefAbc();
        await unit.panel.cursorTo('R', '___._'); // RAD; the cursor is there already after the approval (#284)
        await unit.panel.type('R', '0900');
        await unit.panel.ent();
        expect(unit.panel.focused('R')).toEqual({row: 3, col: 16, text: '___._'}); // DIS
        await unit.panel.type('R', '1200');
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(REF_DELAY_MS); // the page must not calculate the nearest VOR over them

        expect(rightRows().slice(4)).toEqual(["N 46°57.76'", "E 13°25.56'"]);
        // Figure 5-75: the reference waypoint, radial and distance stay on the page. Only the numbers are read: the format
        // around them has its own tests (#282)
        expect(rightRows()[1]).toBe('REF:  ABC  ');
        expect(rightRows()[2].slice(6, 10)).toBe('90.0');
        expect(rightRows()[3].slice(4, 9)).toBe('120.0');
        expect(Screen.read().status().right).toBe('SUP');
        const qq = userWaypoint(unit, 'QQ')!;
        const expected = pointFrom({lat: 47.0, lon: 10.5}, 90, 120);
        expect(qq.lat).toBeCloseTo(expected.lat, 6);
        expect(qq.lon).toBeCloseTo(expected.lon, 6);
    });

    // 5-19 step 8 (figure 5-72) and the KLN 89 trainer (2026-10-07): after the reference waypoint is approved, the page
    // returns with the cursor on RAD. Sibling: the creation test above passes the same approval.
    it('puts the cursor on RAD after the reference waypoint is approved (5-19, the KLN 89 trainer, #284)', async () => {
        const unit = await qqWithApprovedRefAbc();

        expect(unit.panel.focused('R')).toEqual({row: 2, col: 17, text: '___._'});
    });

    // 3-51 (and 3-50 for INT): a waypoint entered in the REF field of an existing SUP waypoint shows the radial and
    // distance from that waypoint. USUP is 0.3 degrees (18.0 NM) due south of XYZ: radial 180.0.
    async function enterRefXyz(): Promise<HeadlessUnit> {
        const unit = await supPage({extra: [vor('XYZ', 47.5, 10.5)]});
        await unit.panel.cursor('R');
        await unit.panel.cursorTo('R', 'ABC'); // the REF field, after the ident's five cells
        expect(unit.panel.focused('R')).toEqual({row: 1, col: 18, text: 'ABC  '}); // precondition
        await unit.panel.enterIdent('R', 'XYZ');
        await unit.panel.ent();
        await unit.panel.ent();
        return unit;
    }

    it('takes a REF waypoint through its confirmation (3-51)', async () => {
        await enterRefXyz();

        expect(rightRows()[1]).toBe('REF:  XYZ  ');
    });

    // Checked in the KLN 89 trainer, 2026-10-07: the radial and distance change at once to those of the new reference
    it('shows the radial and distance from the entered REF waypoint (3-51, the KLN 89 trainer, #279)', async () => {
        await enterRefXyz();

        const rows = rightRows();
        expect(rows[2]).toBe('RAD: 180.0°');
        expect(rows[3].slice(5, 9)).toBe('18.0');
    });

    // A distance typed after the new REF is measured from that REF on the radial the page shows (the pair of the pin
    // above), not from the first VOR: USUP goes to 10.0 NM south of XYZ, 47.5 N minus the arc, by hand with the textbook
    // formula of flight/geo.ts
    it('moves the waypoint along the radial of the entered REF waypoint when a distance is typed (characterization, #279)', async () => {
        const unit = await enterRefXyz();
        await unit.panel.cursorTo('R', '180.0');
        await unit.panel.outer('R', 1);
        expect(unit.panel.focused('R').row).toBe(3); // precondition: the DIS field

        await unit.panel.type('R', '0100');
        await unit.panel.ent();

        const expected = pointFrom({lat: 47.5, lon: 10.5}, 180, 10.0);
        expect(userWaypoint(unit, 'USUP')!.lat).toBeCloseTo(expected.lat, 6);
        expect(userWaypoint(unit, 'USUP')!.lon).toBeCloseTo(expected.lon, 6);
    });

    // 3-50, 3-51: the nearest VOR is only the default; the entered reference is what the page shows afterwards. The
    // search for the nearest VOR takes 8 s (REF_CALCULATION_TIME) from the page build, and a REF entered before it ends
    // must not be replaced when it does. XYZ is entered 1 s after the page was selected
    it('keeps a REF entered before the search for the nearest VOR ended (3-50, 3-51)', async () => {
        const unit = await bootUnit({facilities: [abc(), vor('XYZ', 47.5, 10.5)], position: POSITION, storage: SUPS()});
        await unit.panel.selectPage('R', 'SUP  ');
        await vi.advanceTimersByTimeAsync(1000);
        await unit.panel.cursor('R');
        await unit.panel.cursorTo('R', '_____'); // the REF field, still dashed
        expect(unit.panel.focused('R').row).toBe(1); // precondition
        await unit.panel.enterIdent('R', 'XYZ');
        await unit.panel.ent();
        await unit.panel.ent();
        expect(rightRows().slice(1, 3)).toEqual(['REF:  XYZ  ', 'RAD: 180.0°']); // precondition: taken at once

        await vi.advanceTimersByTimeAsync(REF_DELAY_MS);

        expect(rightRows().slice(1, 3)).toEqual(['REF:  XYZ  ', 'RAD: 180.0°']);
        expect(rightRows()[3].slice(5, 9)).toBe('18.0');
    });

    /** USUP (47.2 N) with the REF FAR entered and approved; FAR is 20 degrees of latitude (1200 NM) north of it */
    async function farReferenceEntered(): Promise<HeadlessUnit> {
        const unit = await supPage({extra: [vor('FAR', 67.2, 10.5)]});
        await unit.panel.cursor('R');
        await unit.panel.cursorTo('R', 'ABC');
        await unit.panel.enterIdent('R', 'FAR');
        await unit.panel.ent();
        await unit.panel.ent();
        return unit;
    }

    // Sibling of the pin below: the far REF is taken, with the radial due south
    it('takes a reference 1200 NM away (characterization)', async () => {
        const unit = await farReferenceEntered();

        expect(rightRows().slice(1, 3)).toEqual(['REF:  FAR  ', 'RAD: 180.0°']);
        expect(unit.errors).toEqual([]);
    });

    // The DIS field has four cells, so 1200 NM does not fit: the page shows `DIS:120.nm ` with a blank tenth and the unit
    // moved one cell left (DistanceEditor.convertFromValue takes the characters of "1200.0" by position). What the real unit
    // shows is not known, so the pin asserts the shape of the row only: three cells, the point, one cell, then nm
    it.fails('does not garble the DIS row for a distance that does not fit the field (#341)', async () => {
        await farReferenceEntered();

        expect(rightRows()[3]).toMatch(/^DIS:[ 0-9_]{3}\.[0-9_]nm$/);
    });

    // 3-51, 5-19 note: the REF, radial and distance are not stored and are lost when another page is viewed; the page
    // then shows the nearest VOR again
    it('forgets the entered REF waypoint when another page is viewed (3-51, 5-19)', async () => {
        const unit = await enterRefXyz();
        await unit.panel.cursor('R');

        await unit.panel.outer('R', -1); // INT
        await unit.panel.outer('R', 1); // SUP
        await vi.advanceTimersByTimeAsync(REF_DELAY_MS);

        expect(rightRows().slice(1, 3)).toEqual(['REF:  ABC  ', 'RAD: 000.0°']);
    });

    // A radial is magnetic: inside the coverage area the unit references everything to magnetic north (5-44). Checked in
    // the KLN 89 trainer, 2026-10-07: it is the true bearing at the reference VOR minus that VOR's own variation, on the
    // page and for an entry. Here ABC has a variation of 10 degrees east, the aircraft's position 4 degrees east, so only
    // the VOR's variation gives the expected value: USUP is due north of ABC, radial 350.0 (the local variation would
    // give 356.0). Sibling: 'shows the radial and distance from the nearest VOR' (no variation).
    it.fails('shows the radial magnetic with the variation of the reference VOR (5-44, the KLN 89 trainer, #280)', async () => {
        await supPage({magvar: 4, vorVariation: 10});

        expect(rightRows()[2]).toBe('RAD: 350.0°');
    });

    // The same for an entered radial: 350.0 magnetic with 10 degrees east at ABC is 000 true, so QQ is 100.0 NM due north
    // of ABC, 48.66369 N on the sphere the unit computes on (by hand, the textbook formula of the creation test, course
    // 000); the local variation would give another longitude. The distance has three places before the point, so that
    // this pin does not depend on the blank of the leading distance place (#282). Sibling: the creation test above.
    it.fails('takes an entered radial as magnetic with the variation of the reference VOR (5-19, 5-44, the KLN 89 trainer, #280)', async () => {
        const unit = await qqWithApprovedRefAbc({magvar: 4, vorVariation: 10});
        await unit.panel.cursorTo('R', '___._');
        await unit.panel.type('R', '3500');
        await unit.panel.ent();
        await unit.panel.type('R', '1000');
        await unit.panel.ent();

        expect(rightRows().slice(4)).toEqual(["N 48°39.82'", "E 10°30.00'"]);
    });

    // The distance is followed by nm in the small glyphs (lowercase in the font, as NAV 2 writes it): figures 3-155 to
    // 3-159 and 5-67 to 5-76, checked in the KLN 89 trainer, 2026-10-07.
    it('writes nm in the small glyphs after the distance (3-51, the KLN 89 trainer, #283)', async () => {
        await supPage();

        expect(rightRows()[3].slice(9)).toBe('nm');
    });

    // Figures 5-75 and 5-76 show a distance below 100 NM with a blank in front ("DIS: 48.1"), and the KLN 89 trainer
    // (2026-10-07) shows blanks, never zeros, outside the edit field (figure 5-74 shows the zero only in the open edit
    // field). Figure 3-159 shows a distance below 10 NM as 09.1; the 12.0 NM of this page is above that, so the test does not
    // touch the disagreement.
    it('shows a blank instead of a leading zero in front of a distance below 100 NM (5-19, the KLN 89 trainer, #282)', async () => {
        await supPage();

        expect(rightRows()[3].slice(0, 9)).toBe('DIS: 12.0');
    });

    // 3-20: the characters wrap with a blank between 9 and A, so one click clockwise turns a blank into an A. USUP
    // has four characters; the fifth cell of the ident is blank.
    it('turns the fourth character of the ident with the inner knob (3-20)', async () => {
        const unit = await supPage();
        await unit.panel.cursor('R');
        await unit.panel.outer('R', 3);

        await unit.panel.inner('R', 1);

        expect(rightRows()[0]).toBe(' USUQ      ');
    });

    // Checked in the KLN 89 trainer, 2026-10-07 (medium confidence): the first click clockwise from a blank cell gives A
    it('turns the blank fifth character into an A clockwise (3-20, the KLN 89 trainer, #290)', async () => {
        const unit = await supPage();
        await unit.panel.cursor('R');
        await unit.panel.outer('R', 4);

        await unit.panel.inner('R', 1);

        expect(rightRows()[0]).toBe(' USUPA     ');
    });

    // 3-21: the scan steps through the waypoints in alphabetical order. 3-22 says there is no nearest list for SUP; that
    // the complete list stops at its first and last waypoint and does not wrap is an inference from 3-21 and 3-22 (the
    // nearest list is the one that does not wrap)
    it('scans the user waypoints in order and stops at both ends (3-21, 3-22)', async () => {
        const unit = await supPage();
        await unit.panel.scan();
        const step = async (clicks: number) => {
            await vi.advanceTimersByTimeAsync(400); // a slow turn: no speed-up (WaypointPage SPEEDSTEP)
            await unit.panel.inner('R', clicks);
            return rightRows()[0];
        };

        expect(await step(-1)).toBe(' USUP      ');
        expect(await step(1)).toBe(' USUQ      ');
        expect(await step(1)).toBe(' USUQ      ');
    });

    // 3-29: an arrow before the ident marks the active waypoint on the waypoint pages (figure 3-155 shows it on the INT
    // page, 3-50 says it for the NDB page). FPL 0 is USUP, USUQ with the aircraft south of both: USUQ is active.
    it('shows the arrow before the ident of the active waypoint only (3-29, 3-50)', async () => {
        const unit = await bootUnit({facilities: [abc()], position: POSITION, storage: SUPS()});
        insertLeg(unit, 0, userWaypoint(unit, 'USUP')!);
        insertLeg(unit, 1, userWaypoint(unit, 'USUQ')!);
        await settle(unit);
        expect(activeIdent(unit)).toBe('USUQ'); // precondition
        await unit.panel.selectPage('R', 'SUP  ');
        expect(rightRows()[0]).toBe(' USUP      ');

        await unit.panel.scan();
        await unit.panel.inner('R', 1);

        expect(rightRows()[0]).toBe('›USUQ      ');
    });

    // C-2: USR DB FULL appears when a user waypoint is to be created while the user database holds 250 waypoints
    // (2-8, 5-16), and the waypoint is not created
    /** 250 user waypoints far away, the SUP page with QQ entered, and PRES POS? */
    async function createQqWithFullDatabase(): Promise<HeadlessUnit> {
        muteConsoleError(); // the page logs the refusal
        const full = savedUserWaypoints(Array.from({length: 250}, (_, i) => ({
            kind: 'sup' as const, ident: `S${String(i).padStart(3, '0')}`, lat: 40 + i * 0.01, lon: 20,
        })));
        const unit = await bootUnit({facilities: [abc()], position: POSITION, storage: full});
        expect(KLNFacilityRepository.getRepository(unit.props.bus).size()).toBe(250); // precondition
        await unit.panel.selectPage('R', 'SUP  ');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'QQ');
        await unit.panel.cursorTo('R', 'PRES POS?');
        await unit.panel.ent();
        return unit;
    }

    it('refuses a 251st user waypoint with USR DB FULL (C-2, 2-8)', async () => {
        const unit = await createQqWithFullDatabase();

        expect(Screen.read().status().mode).toBe('USR DB FULL');
        expect(KLNFacilityRepository.getRepository(unit.props.bus).size()).toBe(250);
        expect(userWaypoint(unit, 'QQ')).toBeUndefined();
    });

    // C-2: the waypoint is not created, so the page still has no waypoint for QQ and offers to create it (5-18, 5-19).
    // The page shows QQ with the present position instead, and D-> then makes it the active waypoint although it is
    // in no database. Sibling: the test above (the refusal itself).
    it.fails('still offers to create the refused waypoint (C-2, 5-19, #289)', async () => {
        await createQqWithFullDatabase();

        expect(rightRows().slice(0, 4)).toEqual([' QQ        ', '           ', 'CREATE NEW ', 'WPT AT:    ']);
    });

    // 5-19 step 12: after the radial or the distance is entered, the latitude and longitude are calculated and displayed.
    // The page of a stored user waypoint is the same page, so a changed radial shows its new position too. USUP
    // is moved to the radial 270 from ABC, 12.0215 NM away (the arc of 0.2 degrees):
    // 46°59.98' N, 10°12.40' E by hand with the textbook formula of flight/geo.ts. Sibling: 'moves the waypoint to a typed
    // radial from its reference VOR' (the stored position).
    it('shows the new position after a typed radial (5-19, #285)', async () => {
        const unit = await supPageWithCursorOn('000.0');

        await unit.panel.type('R', '2700');
        await unit.panel.ent();

        expect(rightRows().slice(4)).toEqual(["N 46°59.98'", "E 10°12.40'"]);
    });

    // As above, for the distance: USUP is moved to 200.0 NM due north of ABC. Sibling: 'moves the waypoint to a typed
    // distance from its reference VOR'.
    it('shows the new position after a typed distance (5-19, #285)', async () => {
        const unit = await supPageWithCursorOnDis();

        await unit.panel.type('R', '2000');
        await unit.panel.ent();

        expect(rightRows().slice(4)).toEqual(["N 50°19.64'", "E 10°30.00'"]);
    });
});

/** The SUP page of USUP with the cursor on the field that shows `text` */
async function supPageWithCursorOn(text: string): Promise<HeadlessUnit> {
    const unit = await supPage();
    await unit.panel.cursor('R');
    await unit.panel.cursorTo('R', text);
    return unit;
}

/** The SUP page of USUP with the cursor on the distance, reached from the radial */
async function supPageWithCursorOnDis(): Promise<HeadlessUnit> {
    const unit = await supPageWithCursorOn('000.0');
    await unit.panel.outer('R', 1);
    expect(unit.panel.focused('R').row).toBe(3); // precondition: the DIS field
    return unit;
}

// The guide does not describe changing the fields of a stored user waypoint, so these only hold what the code does. USUP
// is 12.0 NM due north of its reference VOR ABC (47 N, 10.5 E), and the stored waypoint is read, not the page: the page
// shows the new position, which the tests of #285 above hold.
describe('SUP page, changing a stored user waypoint (characterization)', () => {
    it('moves the waypoint to a typed latitude', async () => {
        const unit = await supPageWithCursorOn('N 47°12.00');

        await unit.panel.type('R', 'N471800');
        await unit.panel.ent();

        expect(rightRows()[4]).toBe("N 47°18.00'");
        expect(userWaypoint(unit, 'USUP')!.lat).toBeCloseTo(47.3, 9);
        expect(userWaypoint(unit, 'USUP')!.lon).toBeCloseTo(10.5, 9);
    });

    it('moves the waypoint to a typed longitude', async () => {
        const unit = await supPageWithCursorOn('E 10°30.00');

        await typeEastBelow100(unit, '103600');
        await unit.panel.ent();

        expect(rightRows()[5]).toBe("E 10°36.00'");
        expect(userWaypoint(unit, 'USUP')!.lon).toBeCloseTo(10.6, 9);
        expect(userWaypoint(unit, 'USUP')!.lat).toBeCloseTo(47.2, 9);
    });

    // The stored distance of USUP is the arc of 0.2 degrees on the sphere the unit computes on (12.0215 NM, which the
    // page shows as 12.0); 270 from ABC (47 N, 10.5 E) on that distance, by hand with the textbook formula of flight/geo.ts
    it('moves the waypoint to a typed radial from its reference VOR', async () => {
        const unit = await supPageWithCursorOn('000.0');

        await unit.panel.type('R', '2700');
        await unit.panel.ent();

        const expected = pointFrom({lat: 47.0, lon: 10.5}, 270, 0.2 * Math.PI / 180 * 6378100 / 1852);
        expect(userWaypoint(unit, 'USUP')!.lat).toBeCloseTo(expected.lat, 6);
        expect(userWaypoint(unit, 'USUP')!.lon).toBeCloseTo(expected.lon, 6);
    });

    // 200.0 NM on the radial 000 from ABC: 50.32738 N (hand computation, course 000). The first place of the distance
    // is a 2, which the field must take.
    it('moves the waypoint to a typed distance from its reference VOR', async () => {
        const unit = await supPageWithCursorOnDis();

        await unit.panel.type('R', '2000');
        await unit.panel.ent();

        expect(userWaypoint(unit, 'USUP')!.lat).toBeCloseTo(50.32738, 5);
        expect(userWaypoint(unit, 'USUP')!.lon).toBeCloseTo(10.5, 9);
    });
});

describe('SUP page without a reference VOR (#286)', () => {
    // Checked in the KLN 89 trainer, 2026-10-12 (USR 2 of a user waypoint far from any VOR): a radial typed without a
    // reference is shown and the cursor moves on, but the waypoint does not move (#286)
    it('shows a radial entered without a reference and moves nothing (checked in the KLN 89 trainer, 2026-10-12, #286)', async () => {
        const unit = await bootUnit({
            position: POSITION, storage: savedUserWaypoints([{kind: 'sup', ident: 'USUR', lat: 47.0, lon: 11.0}]),
        }); // no VOR in the world, so REF stays dashed
        await unit.panel.selectPage('R', 'SUP  ');
        await vi.advanceTimersByTimeAsync(REF_DELAY_MS);
        await unit.panel.cursor('R');
        await unit.panel.cursorTo('R', '___._'); // RAD

        await unit.panel.type('R', '0900');
        await unit.panel.ent();

        expect(unit.takeRejections()).toEqual([]);
        expect(unit.errors).toEqual([]);
        expect(rightRows()[2]).toBe('RAD: 090.0°');
        expect(unit.panel.focused('R').row).toBe(3); // DIS
        expect(userWaypoint(unit, 'USUR')!.lat).toBeCloseTo(47.0, 9);
        expect(userWaypoint(unit, 'USUR')!.lon).toBeCloseTo(11.0, 9);
    });

    // Checked in the KLN 89 trainer, 2026-10-12 (USR 2 of a user waypoint far from any VOR): a distance typed without a
    // reference is shown and the waypoint does not move (#286)
    it('shows a distance entered without a reference and moves nothing (checked in the KLN 89 trainer, 2026-10-12, #286)', async () => {
        const unit = await bootUnit({
            position: POSITION, storage: savedUserWaypoints([{kind: 'sup', ident: 'USUR', lat: 47.0, lon: 11.0}]),
        }); // no VOR in the world, so REF stays dashed
        await unit.panel.selectPage('R', 'SUP  ');
        await vi.advanceTimersByTimeAsync(REF_DELAY_MS);
        await unit.panel.cursor('R');
        await unit.panel.cursorTo('R', '___._'); // RAD
        await unit.panel.outer('R', 1);
        expect(unit.panel.focused('R').row).toBe(3); // precondition: the DIS field

        await unit.panel.type('R', '0100');
        await unit.panel.ent();

        expect(unit.takeRejections()).toEqual([]);
        expect(unit.errors).toEqual([]);
        expect(rightRows()[3].slice(5, 9)).toBe('10.0'); // the digits only: the format has its own tests (#282)
        expect(userWaypoint(unit, 'USUR')!.lat).toBeCloseTo(47.0, 9);
        expect(userWaypoint(unit, 'USUR')!.lon).toBeCloseTo(11.0, 9);
    });
});

describe('SUP page, a radial just below north (characterization)', () => {
    // The only VOR NNN lies 12 NM from USUP on the true course 179.97, so the true radial from NNN to USUP is 359.97
    // (checked below), which rounds to 360.0. No variation anywhere, so the magnetic radial is the true one. The field
    // takes 000.0 to 359.9 (T10, for entry), and the code shows north as 000.0. The 89 shows a radial of 0 as 360.0 (the
    // lead in docs/testing.md, section 9), so the rounding at the top of the range is the code's own form
    it('characterization: shows a radial of 359.97 from the reference VOR as 000.0 (#340)', async () => {
        const usup = {lat: 47.2, lon: 10.5};
        const nnn = pointFrom(usup, 179.97, 12);
        const radial = courseDeg(nnn, usup);
        expect(radial).toBeGreaterThanOrEqual(359.95); // precondition: the radial rounds to 360.0 at one decimal
        expect(radial).toBeLessThan(360);
        const unit = await bootUnit({
            facilities: [vor('NNN', nnn.lat, nnn.lon)], position: POSITION, magvar: 0,
            storage: savedUserWaypoints([{kind: 'sup', ident: 'USUP', ...usup}]),
        });
        await unit.panel.selectPage('R', 'SUP  ');
        await vi.advanceTimersByTimeAsync(REF_DELAY_MS);
        expect(rightRows()[0]).toBe(' USUP      '); // precondition

        expect(rightRows()[2]).toBe('RAD: 000.0°');
    });
});
