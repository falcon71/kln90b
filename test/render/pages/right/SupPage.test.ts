import {describe, expect, it, onTestFinished, vi} from 'vitest';
import {ICAO, UserFacility} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {insertLeg} from '../../../harness/flightplan';
import {pointFrom} from '../../../harness/flight/geo';
import {vor} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';
import {collectStatusMessages} from '../../../harness/statusLine';
import {savedUserWaypoints} from '../../../harness/storage';
import {KLNFacilityRepository} from '../../../../kln90b/data/navdata/KLNFacilityRepository';

// Invented facilities on the meridian 10.5 E (longitudes of 10 degrees or more keep the coordinate rows clear of #230).
// ABC is the only VOR near the user waypoints, 0.2 degrees (12.0 NM) south of USUP and 0.3 degrees (18.0 NM) south of
// USUQ; the aircraft is 12.0 NM south of ABC. The variation of ABC is given in degrees east, which the sim stores
// negated (builders.ts, Nav2Page). "C-1" and "C-2" in the titles are pages of Appendix C of the Pilot's Guide (the
// message list), not research items.
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

// The DIS row (row 3) is left out: it shows the distance with a leading zero (#NEW-3-8) and NM in large letters
// (#NEW-3-9). With no magnetic variation the RAD row shows the same value either way (#NEW-3-6).
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
        expect(rows[3].slice(5, 9)).toBe('12.0'); // the digits only: the format around them is #NEW-3-9 and #NEW-3-8
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
    // pilot of the missing position. The keyboard types the digits (the editors themselves are Session 9b's).
    it('creates the waypoint at a typed latitude and longitude with USER POS? (5-17, 5-18, C-1)', async () => {
        const unit = await createNewQq();
        await unit.panel.cursorTo('R', 'USER POS?');

        await unit.panel.ent();
        expect(unit.panel.focused('R')).toEqual({row: 4, col: 12, text: '_ __°__.__'});
        await unit.panel.type('R', 'N470600');
        await unit.panel.ent();
        expect(unit.panel.focused('R').row).toBe(5);
        expect(Screen.read().status().mode).toBe('ENT LAT/LON');
        await unit.panel.type('R', 'E 103000');
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
        await unit.panel.type('R', 'E 103000');
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
        await unit.panel.cursorTo('R', '___._'); // RAD; the cursor stays on REF today (#NEW-3-10)
        await unit.panel.type('R', '0900');
        await unit.panel.ent();
        expect(unit.panel.focused('R')).toEqual({row: 3, col: 16, text: '___._'}); // DIS
        await unit.panel.type('R', '1200');
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(REF_DELAY_MS); // the page must not calculate the nearest VOR over them

        expect(rightRows().slice(4)).toEqual(["N 46°57.76'", "E 13°25.56'"]);
        // Figure 5-75: the reference waypoint, radial and distance stay on the page. Only the numbers are read: the format
        // around them is #NEW-3-9 and #NEW-3-8
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
    it.fails('puts the cursor on RAD after the reference waypoint is approved (5-19, the KLN 89 trainer, #NEW-3-10)', async () => {
        const unit = await qqWithApprovedRefAbc();

        expect(unit.panel.focused('R')).toEqual({row: 2, col: 17, text: '___._'});
    });

    // 3-51 (and 3-50 for INT): a waypoint entered in the REF field of an existing SUP waypoint shows the radial and
    // distance from that waypoint. USUP is 0.3 degrees (18.0 NM) due south of XYZ: radial 180.0.
    async function enterRefXyz(): Promise<HeadlessUnit> {
        const unit = await supPage({extra: [vor('XYZ', 47.5, 10.5)]});
        await unit.panel.cursor('R');
        await unit.panel.outer('R', 5); // the ident's five cells, then REF
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
    it.fails('shows the radial and distance from the entered REF waypoint (3-51, the KLN 89 trainer, #NEW-3-5)', async () => {
        await enterRefXyz();

        const rows = rightRows();
        expect(rows[2]).toBe('RAD: 180.0°');
        expect(rows[3].slice(5, 9)).toBe('18.0');
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
    it.fails('shows the radial magnetic with the variation of the reference VOR (5-44, the KLN 89 trainer, #NEW-3-6)', async () => {
        await supPage({magvar: 4, vorVariation: 10});

        expect(rightRows()[2]).toBe('RAD: 350.0°');
    });

    // The same for an entered radial: 350.0 magnetic with 10 degrees east at ABC is 000 true, so QQ is 100.0 NM due north
    // of ABC, 48.66369 N on the sphere the unit computes on (by hand, the textbook formula of the creation test, course
    // 000); the local variation would give another longitude. The distance has three places before the point, so that
    // this pin still turns red when the leading distance place is fixed too (#NEW-3-8). Sibling: the creation test above.
    it.fails('takes an entered radial as magnetic with the variation of the reference VOR (5-19, 5-44, the KLN 89 trainer, #NEW-3-6)', async () => {
        const unit = await qqWithApprovedRefAbc({magvar: 4, vorVariation: 10});
        await unit.panel.cursorTo('R', '___._');
        await unit.panel.type('R', '3500');
        await unit.panel.ent();
        await unit.panel.type('R', '1000');
        await unit.panel.ent();

        expect(rightRows().slice(4)).toEqual(["N 48°39.82'", "E 10°30.00'"]);
    });

    // The distance is followed by nm in the small glyphs (lowercase in the font, as NAV 2 writes it): figures 3-155 to
    // 3-159 and 5-67 to 5-76, checked in the KLN 89 trainer, 2026-10-07. The page writes NM in large letters.
    it.fails('writes nm in the small glyphs after the distance (3-51, the KLN 89 trainer, #NEW-3-9)', async () => {
        await supPage();

        expect(rightRows()[3].slice(9)).toBe('nm');
    });

    // Figures 5-75 and 5-76 show a distance below 100 NM with a blank in front ("DIS: 48.1"), and the KLN 89 trainer
    // (2026-10-07) shows blanks, never zeros, outside the edit field (figure 5-74 shows the zero only in the open edit
    // field). Figure 3-159 shows a distance below 10 NM as 09.1, so this pin asserts the hundreds digit only.
    it.fails('shows a blank instead of a leading zero in front of a distance below 100 NM (5-19, the KLN 89 trainer, #NEW-3-8)', async () => {
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
    it.fails('turns the blank fifth character into an A clockwise (3-20, the KLN 89 trainer, #NEW-4-2)', async () => {
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
        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('USUQ'); // precondition
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
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined); // the page logs the refusal
        onTestFinished(() => spy.mockRestore());
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
    it.fails('still offers to create the refused waypoint (C-2, 5-19, #NEW-4-1)', async () => {
        await createQqWithFullDatabase();

        expect(rightRows().slice(0, 4)).toEqual([' QQ        ', '           ', 'CREATE NEW ', 'WPT AT:    ']);
    });

    // 5-19 step 12: after the radial or the distance is entered, the latitude and longitude are calculated and displayed.
    // The page of a stored user waypoint is the same page, so a changed radial shows its new position too (#NEW-3-11 is
    // the issue for INT and SUP). USUP is moved to the radial 270 from ABC, 12.0215 NM away (the arc of 0.2 degrees):
    // 46°59.98' N, 10°12.40' E by hand with the textbook formula of flight/geo.ts. Sibling: 'moves the waypoint to a typed
    // radial from its reference VOR' (the stored position).
    it.fails('shows the new position after a typed radial (5-19, #NEW-3-11)', async () => {
        const unit = await supPageWithCursorOn('000.0');

        await unit.panel.type('R', '2700');
        await unit.panel.ent();

        expect(rightRows().slice(4)).toEqual(["N 46°59.98'", "E 10°12.40'"]);
    });

    // As above, for the distance: USUP is moved to 200.0 NM due north of ABC. Sibling: 'moves the waypoint to a typed
    // distance from its reference VOR'.
    it.fails('shows the new position after a typed distance (5-19, #NEW-3-11)', async () => {
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

/** The SUP page of USUP with the cursor on the distance, reached from the radial (the text of the distance field changes with #NEW-3-8) */
async function supPageWithCursorOnDis(): Promise<HeadlessUnit> {
    const unit = await supPageWithCursorOn('000.0');
    await unit.panel.outer('R', 1);
    expect(unit.panel.focused('R').row).toBe(3); // precondition: the DIS field
    return unit;
}

// The guide does not describe changing the fields of a stored user waypoint, so these only hold what the code does. USUP
// is 12.0 NM due north of its reference VOR ABC (47 N, 10.5 E), and the stored waypoint is read, not the page: the page
// shows the typed value (latitude, longitude) or the old position (radial, distance, #NEW-3-11).
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

        await unit.panel.type('R', 'E 103600');
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
