import {describe, expect, it, vi} from 'vitest';
import {Facility, FacilityType, ICAO, VorClass, VorType} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {intersection, vor} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';
import {savedUserWaypoints} from '../../../harness/storage';
import {distanceNm, pointFrom} from '../../../harness/flight/geo';
import {KLNFacilityRepository} from '../../../../kln90b/data/navdata/KLNFacilityRepository';

describe('INT page', () => {
    // 3-14 to 3-15: a reference waypoint is confirmed on its waypoint page, and the second ENT accepts it
    it('takes a REF waypoint through the confirmation page (#72)', async () => {
        const unit = await bootUnit({
            facilities: [intersection('INTA', 47.1, 8.0), vor('ABC', 47.2, 8.0), vor('XYZ', 48.5, 8.0)],
            position: {lat: 47.0, lon: 8.0},
        });
        await unit.panel.selectPage('R', 'INT  ');
        await vi.advanceTimersByTimeAsync(9000); // the REF calculation takes 8 s (REF_CALCULATION_TIME)
        await unit.panel.cursor('R');
        await unit.panel.cursorTo('R', 'ABC'); // the REF field, which shows the nearest VOR
        await unit.panel.enterIdent('R', 'XYZ');

        await unit.panel.ent();

        // The confirmation page offers ENT (the "ent" message of the status line) and shows the VOR page of XYZ
        expect(Screen.read().status().right).toBe('VOR');
        expect(Screen.read().status().mode).toBe('enr-leg ent');

        await unit.panel.ent();

        const screen = Screen.read();
        expect(unit.errors).toEqual([]);
        expect(screen.status().right).toBe('CRSR');
        expect(screen.rows('R')[1]).toBe('REF:  XYZ  ');
    });
});

/** The INT page of INTA (47.1 N 8.0 E) once its REF calculation has run (REF_CALCULATION_TIME is 8 s); returns the REF row */
async function refRow(unit: HeadlessUnit): Promise<string> {
    await unit.panel.selectPage('R', 'INT  ');
    await vi.advanceTimersByTimeAsync(9000);
    expect(Screen.read().rows('R')[0]).toBe(' INTA      '); // precondition
    return Screen.read().rows('R')[1];
}

// 3-50: the INT page gives the position of the intersection as radial and distance from the closest VOR (NearestUtils
// .getNearestVor). Only NAV 2 is said to leave terminal VORs out (3-8, 3-32).
describe('INT page reference VOR (3-50)', () => {
    const inta = () => intersection('INTA', 47.1, 8.0);
    const far = () => vor('FAR', 47.3, 8.0); // 12 NM from INTA, high altitude

    it('takes the closest VOR', async () => {
        const unit = await bootUnit({facilities: [inta(), far(), vor('NER', 47.15, 8.0)], position: {lat: 47.0, lon: 8.0}});

        expect(await refRow(unit)).toBe('REF:  NER  ');
    });

    it('takes a closer terminal VOR', async () => {
        const unit = await bootUnit({facilities: [inta(), far(), vor('TRM', 47.15, 8.0, {vorClass: VorClass.Terminal})], position: {lat: 47.0, lon: 8.0}});

        expect(await refRow(unit)).toBe('REF:  TRM  ');
    });

    // A user VOR in the repository has the class and type the user waypoint loaders give it (Unknown, Unknown).
    // IntPage.tsx:221 computes the REF itself because the database field "does not respect user VORs".
    it.fails('takes a closer user VOR (#206)', async () => {
        const unit = await bootUnit({facilities: [inta(), far()], position: {lat: 47.0, lon: 8.0}});
        KLNFacilityRepository.getRepository(unit.props.bus).add(vor('QQV', 47.12, 8.0, {region: 'XX', vorClass: VorClass.Unknown, type: VorType.Unknown}));

        expect(await refRow(unit)).toBe('REF:  QQV  ');
    });
});

/** The INT page of the first intersection given, after the REF calculation (8 s, REF_CALCULATION_TIME) */
async function intPageOf(facilities: Facility[], magvar = 0): Promise<HeadlessUnit> {
    const unit = await bootUnit({facilities, position: {lat: 47, lon: 8}, magvar});
    await unit.panel.selectPage('R', 'INT  ');
    await vi.advanceTimersByTimeAsync(9000);
    return unit;
}

/** The user waypoints of the repository as [type, region, ident, lat, lon] */
function userWaypoints(unit: HeadlessUnit): [FacilityType, string, string, number, number][] {
    const out: [FacilityType, string, string, number, number][] = [];
    KLNFacilityRepository.getRepository(unit.props.bus).forEach(f => out.push([ICAO.getFacilityTypeFromValue(f.icaoStruct), f.icaoStruct.region, f.icaoStruct.ident, f.lat, f.lon]));
    return out;
}

// KENZY 6.0 NM due north of the VOR MKC (haversine)
const kenzy = () => intersection('KENZY', 47.1, 11.0);
const mkc = (magneticVariation = 0) => vor('MKC', 47.0, 11.0, {magneticVariation});

describe('INT page (characterization)', () => {
    // Row 3 (DIS) is left out: its leading zeros and its label are #NEW-3-8 and #NEW-3-9
    it('shows a database intersection with its reference VOR, cursor off', async () => {
        const unit = await intPageOf([kenzy(), mkc()]);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('R').filter((_, i) => i !== 3)).toMatchInlineSnapshot(`
          [
            " KENZY     ",
            "REF:  MKC  ",
            "RAD: 000.0°",
            "N 47°06.00'",
            "E 11°00.00'",
          ]
        `);
        expect(Screen.read().maskRows('R')).toMatchInlineSnapshot(`
          [
            "...........",
            "...........",
            "...........",
            "...........",
            "...........",
            "...........",
          ]
        `);
    });

    it('shows dashes for REF and RAD until the REF calculation has run', async () => {
        const unit = await bootUnit({facilities: [kenzy(), mkc()], position: {lat: 47, lon: 8}});
        await unit.panel.selectPage('R', 'INT  ');

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('R').slice(1, 3)).toMatchInlineSnapshot(`
          [
            "REF:  _____",
            "RAD: ___._°",
          ]
        `);
    });
});

describe('INT page reference waypoint (3-50, 3-51)', () => {
    // 3-50, step 3, figure 3-156: from the identifier the outer knob moves the cursor to the REF identifier. RAD, DIS and
    // the position of a database intersection cannot be changed, so the click after REF does not reach them: today it
    // wraps to the ident (row 0), and with #218 fixed it would stay on REF (row 1)
    it('moves the cursor from the fifth ident character to REF and no further (3-50)', async () => {
        const unit = await intPageOf([kenzy(), mkc()]);
        await unit.panel.cursor('R');

        const visited: number[] = [];
        for (let i = 0; i < 6; i++) {
            visited.push(unit.panel.focused('R').row);
            await unit.panel.outer('R', 1);
            if (i === 4) expect(unit.panel.focused('R')).toEqual({row: 1, col: 18, text: 'MKC  '});
        }
        expect(visited).toEqual([0, 0, 0, 0, 0, 1]);
        expect([0, 1]).toContain(unit.panel.focused('R').row);
    });

    /** The INT page of KENZY with the REF RIS (12.0 NM due north of KENZY) entered and approved (3-50 steps 2 to 6) */
    async function withRefRis(): Promise<HeadlessUnit> {
        const unit = await intPageOf([kenzy(), mkc(), vor('RIS', 47.3, 11.0)]);
        await unit.panel.cursor('R');
        await unit.panel.cursorTo('R', 'MKC');
        await unit.panel.enterIdent('R', 'RIS');
        await unit.panel.ent(); // the VOR page of RIS
        await unit.panel.ent(); // approved
        return unit;
    }

    // 3-51, step 6, figure 3-158: after the approval the page shows the radial and distance from the new reference
    // waypoint. The KLN 89 trainer (2026-10-07) changed both at once on ENT, ENT with another REF. KENZY lies on the
    // 180° radial of RIS (no variation at RIS); IntPage.setRef keeps MKC's radial
    it.fails('computes the radial from the entered REF waypoint (3-51, figure 3-158, the KLN 89 trainer, #NEW-3-5)', async () => {
        await withRefRis();

        expect(Screen.read().rows('R')[2]).toBe('RAD: 180.0°');
    });

    // The distance from the new reference: RIS lies 0.2° of latitude (12.0 NM) north of KENZY, MKC 6.0 NM south of it.
    // The digits are parsed, so that the leading zero of #NEW-3-8 and the label of #NEW-3-9 do not matter here
    it.fails('computes the distance from the entered REF waypoint (3-51, figure 3-158, the KLN 89 trainer, #NEW-3-5)', async () => {
        await withRefRis();

        expect(parseFloat(Screen.read().rows('R')[3].slice(4))).toBe(12.0);
    });

    // Sibling of the pin: the REF field takes RIS
    it('shows the entered REF waypoint (3-51)', async () => {
        const unit = await withRefRis();

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('R')[1]).toBe('REF:  RIS  ');
    });

    // 3-50: the entered reference is not stored and is lost when the page is left; the page shows the closest VOR again
    it('shows the closest VOR again after the page was left (3-50)', async () => {
        const unit = await withRefRis();
        await unit.panel.cursor('R');
        await unit.panel.selectPage('R', 'NDB  ');
        await unit.panel.selectPage('R', 'INT  ');
        await vi.advanceTimersByTimeAsync(9000);

        expect(Screen.read().rows('R')[1]).toBe('REF:  MKC  ');
    });
});

describe('INT page radial and distance (3-50, 5-19)', () => {
    // The radial is magnetic, with the variation published for the VOR station: in the guide's own examples the numbers
    // fit the station declination, not the true bearing or the local variation (figure 5-76: JOT, declination 2° E, true
    // bearing 270.1°, shown 268.1°; figure 5-67: RSW, 2° W, true 180.8°, shown 182.7°; checked against a current
    // navigation database). The KLN 89 trainer (2026-10-07) agrees on four published intersections: the true initial
    // bearing at the VOR minus the variation of that VOR, within 0.05°, where the local variation would be off by
    // several degrees. NAV 2 uses the station's variation for its radial too (Nav2Page.tsx:79). MKC has 10° E, the
    // world 5° E; KENZY lies on the true 000° bearing, so the magnetic radial is 350.0°. IntPage.calculateRef shows the
    // true bearing.
    it.fails('shows the magnetic radial with the VOR station declination (3-50, figure 5-76, the KLN 89 trainer, #NEW-3-6)', async () => {
        await intPageOf([kenzy(), mkc(-10)], 5);

        expect(Screen.read().rows('R')[2]).toBe('RAD: 350.0°');
    });

    // Sibling of the pin: the reference VOR is MKC
    it('takes MKC as the reference of KENZY (3-50)', async () => {
        await intPageOf([kenzy(), mkc(-10)], 5);

        expect(Screen.read().rows('R')[1]).toBe('REF:  MKC  ');
    });

    // A radial is the course out of the VOR, the initial bearing at the station. QQI lies 48.1 NM out on MKC's true
    // 090° course (pointFrom, flight/geo.ts). IntPage.calculateRef takes GeoPoint.bearingFrom, the final bearing at the
    // intersection, 090.9° here; in figure 5-76 the initial bearing gives the 268.1° shown and the final one 268.4°. The
    // KLN 89 trainer shows the initial bearing too: the bearing measured at the intersection was off by 0.4° to 0.7° on
    // its four intersections. 5-19 says the original reference may be entered again later, which only makes sense if it
    // gives the same radial.
    it.fails('shows the radial as the bearing at the VOR (3-50, 5-19, the KLN 89 trainer, #NEW-3-7)', async () => {
        const p = pointFrom({lat: 47.0, lon: 11.0}, 90, 48.1);
        await intPageOf([intersection('QQI', p.lat, p.lon), mkc()]);

        expect(Screen.read().rows('R')[2]).toBe('RAD: 090.0°');
    });

    // Figures 3-155, 3-158, 5-67, 5-75 and 5-76 and a photo of a real unit (the SUP page, same layout) show DIS without
    // leading zeros (48.1, 3.7); the KLN 89 trainer pads its distances with blanks as well (` 11.0nm`, `  6.8nm`).
    // KENZY lies 12.0 NM north of MKC; the page shows DIS:012.0
    it.fails('shows the distance without leading zeros (figures 3-155, 5-75, the KLN 89 trainer, #NEW-3-8)', async () => {
        await intPageOf([intersection('KENZY', 47.2, 11.0), mkc()]);

        expect(Screen.read().rows('R')[3].slice(0, 9)).toBe('DIS: 12.0');
    });

    // The same figures and the photo show the unit in the small nm glyphs that every other distance of the code uses, as
    // does the KLN 89 trainer; IntPage.tsx:125 writes NM in full-size letters (SupPage.tsx:117 too)
    it.fails('labels the distance with the small nm (figures 3-155, 5-75, the KLN 89 trainer, #NEW-3-9)', async () => {
        await intPageOf([intersection('KENZY', 47.2, 11.0), mkc()]);

        expect(Screen.read().rows('R')[3].slice(9)).toBe('nm');
    });

    // Sibling of the two pins: the distance digits are those of 12.0 NM
    it('shows the distance of 12.0 NM (3-50)', async () => {
        await intPageOf([intersection('KENZY', 47.2, 11.0), mkc()]);

        expect(Screen.read().rows('R')[3]).toContain('12.0');
    });
});

describe('user intersection (5-18, 5-19)', () => {
    /** INT page, cursor, the unknown ident INT15; ORD is a VOR at 47 N 11 E */
    async function unknownInt(position = {lat: 47, lon: 8}, ord = vor('ORD', 47.0, 11.0), magvar = 0): Promise<HeadlessUnit> {
        const unit = await bootUnit({facilities: [kenzy(), ord], position, magvar});
        await unit.panel.selectPage('R', 'INT  ');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'INT15');
        return unit;
    }

    /** unknownInt, then USER POS? (5-19 step 3) */
    async function userPos(ord = vor('ORD', 47.0, 11.0), magvar = 0): Promise<HeadlessUnit> {
        const unit = await unknownInt({lat: 47, lon: 8}, ord, magvar);
        await unit.panel.cursorTo('R', 'USER POS?');
        await unit.panel.ent();
        return unit;
    }

    /** userPos, then the REF ORD entered and approved (5-19 steps 4 to 8) */
    async function refOrd(ord = vor('ORD', 47.0, 11.0), magvar = 0): Promise<HeadlessUnit> {
        const unit = await userPos(ord, magvar);
        await unit.panel.outer('R', -3);
        await unit.panel.enterIdent('R', 'ORD');
        await unit.panel.ent(); // the waypoint page of ORD
        await unit.panel.ent(); // approved
        return unit;
    }

    // 5-19 step 3, figure 5-68: an unknown ident offers to create the waypoint at a user position or the present position
    it('offers CREATE NEW WPT AT for an unknown ident (5-19)', async () => {
        await unknownInt();

        expect(Screen.read().rows('R')).toEqual([' INT15     ', '           ', 'CREATE NEW ', 'WPT AT:    ', 'USER POS?  ', 'PRES POS?  ']);
    });

    // 5-19 step 3, figure 5-69: USER POS? shows REF and RAD with dashes and the dashed position, the cursor on the
    // latitude. Row 3 (DIS) is left out: #NEW-3-9
    it('shows the dashed fields with the cursor on the latitude after USER POS? (5-19)', async () => {
        const unit = await userPos();

        const rows = Screen.read().rows('R');
        expect([rows[0], rows[1], rows[2], rows[4], rows[5]]).toEqual([' INT15     ', 'REF:  _____', 'RAD: ___._°', "_ __°__.__'", "____°__.__'"]);
        expect(unit.panel.focused('R').row).toBe(4);
    });

    // 5-19 step 4, figure 5-70: the outer knob turned counterclockwise moves from the latitude up through DIS and RAD to REF
    it('moves the cursor from the latitude up to REF (5-19)', async () => {
        const unit = await userPos();

        const visited: number[] = [];
        for (let i = 0; i < 3; i++) {
            await unit.panel.outer('R', -1);
            visited.push(unit.panel.focused('R').row);
        }
        expect(visited).toEqual([3, 2, 1]);
    });

    // 5-19 step 8, figure 5-72: after the approval of the reference waypoint the page returns with the cursor over the
    // RAD dashes; the KLN 89 trainer does the same (Ref, ENT, ENT, then the cursor is on Rad). The cursor stays on REF
    it.fails('moves the cursor to RAD after the REF approval (5-19, figure 5-72, the KLN 89 trainer, #NEW-3-10)', async () => {
        const unit = await refOrd();

        expect(unit.panel.focused('R').row).toBe(2);
    });

    // Sibling of the pin: the approval returns to the page with ORD in REF
    it('returns with ORD in REF after the approval (5-19)', async () => {
        const unit = await refOrd();

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('R').slice(0, 2)).toEqual([' INT15     ', 'REF:  ORD  ']);
    });

    // 5-19 step 10: ENT on the radial moves the cursor to DIS. The cursor is on REF after the approval today
    // (#NEW-3-10), so the test turns the knob to the dashes of RAD, the first match going clockwise
    it('moves the cursor to DIS after the radial (5-19)', async () => {
        const unit = await refOrd();
        await unit.panel.cursorTo('R', '___._');
        await unit.panel.type('R', '0900');
        await unit.panel.ent();

        expect(Screen.read().rows('R')[2]).toBe('RAD: 090.0°');
        expect(unit.panel.focused('R')).toEqual({row: 3, col: 16, text: '___._'});
    });

    // 5-19 step 12, figure 5-75: ENT on the distance computes and shows the position, and the waypoint is defined (the
    // cursor is off, INT on the status line). 48.1 NM on the 090° radial of ORD (no variation) is 46°59.64' N
    // 12°10.40' E (pointFrom, flight/geo.ts: 46.99401, 12.17328)
    it('computes the position from REF, RAD and DIS (5-19)', async () => {
        const unit = await refOrd();
        await unit.panel.cursorTo('R', '___._');
        await unit.panel.type('R', '0900');
        await unit.panel.ent();
        await unit.panel.type('R', '0481'); // the first cell takes a 0 today; #NEW-3-8 would blank it
        await unit.panel.ent();

        const p = pointFrom({lat: 47.0, lon: 11.0}, 90, 48.1);
        expect(Screen.read().rows('R').slice(4)).toEqual(["N 46°59.64'", "E 12°10.40'"]);
        expect(Screen.read().status().right).toBe('INT');
        const [w] = userWaypoints(unit);
        expect(w.slice(0, 3)).toEqual([FacilityType.Intersection, 'XX', 'INT15']);
        expect(w[3]).toBeCloseTo(p.lat, 6);
        expect(w[4]).toBeCloseTo(p.lon, 6);
    });

    /** refOrd, then the radial 090° and the distance typed as four digits and entered; returns the unit */
    async function distanceEntered(digits: string): Promise<HeadlessUnit> {
        const unit = await refOrd();
        await unit.panel.cursorTo('R', '___._');
        await unit.panel.type('R', '0900');
        await unit.panel.ent();
        await unit.panel.type('R', digits);
        await unit.panel.ent();
        return unit;
    }

    // Figure 5-74 shows three digits before the point of DIS, and the KLN 89 trainer (2026-10-07) accepted 400.0 (and
    // 999.9) without a message. DistanceEditor refuses 360 and more, and its first cell takes only 0 to 3. ORD has no
    // variation, so the waypoint lies 400.0 NM out on the true 090° course (pointFrom, flight/geo.ts)
    it.fails('accepts a distance of 400.0 NM (5-19, figure 5-74, the KLN 89 trainer, #NEW-3-14)', async () => {
        const unit = await distanceEntered('4000');

        const p = pointFrom({lat: 47.0, lon: 11.0}, 90, 400);
        const [w] = userWaypoints(unit);
        expect(w.slice(0, 3)).toEqual([FacilityType.Intersection, 'XX', 'INT15']);
        expect(w[3]).toBeCloseTo(p.lat, 6);
        expect(w[4]).toBeCloseTo(p.lon, 6);
    });

    // Sibling of the pin above: a distance below 360 NM is accepted and places the waypoint
    it('accepts a distance of 350.0 NM (5-19, figure 5-74)', async () => {
        const unit = await distanceEntered('3500');

        const p = pointFrom({lat: 47.0, lon: 11.0}, 90, 350);
        const [w] = userWaypoints(unit);
        expect(w.slice(0, 3)).toEqual([FacilityType.Intersection, 'XX', 'INT15']);
        expect(w[3]).toBeCloseTo(p.lat, 6);
        expect(w[4]).toBeCloseTo(p.lon, 6);
    });

    /** The reference ORD has 10° E (the sim's -10), the world 5° E; the radial 080° is entered and approved, the cursor on DIS */
    async function radial080(): Promise<HeadlessUnit> {
        const unit = await refOrd(vor('ORD', 47.0, 11.0, {magneticVariation: -10}), 5);
        await unit.panel.cursorTo('R', '___._');
        await unit.panel.type('R', '0800');
        await unit.panel.ent();
        return unit;
    }

    // A radial is magnetic (#NEW-3-6, the KLN 89 trainer: a waypoint made on Rad 000 from a VOR with 3° E variation lay
    // on the true 003° course). With 10° E at ORD the entered 080° is the true 090°, and 48.1 NM out the waypoint lies
    // where the true 090° course of the previous test puts it (pointFrom, flight/geo.ts). The entered radial is taken
    // as the true bearing today, which puts the waypoint on the true 080° course
    it.fails('creates the waypoint on the magnetic radial entered (5-19, the KLN 89 trainer, #NEW-3-6)', async () => {
        const unit = await radial080();
        await unit.panel.type('R', '0481');
        await unit.panel.ent();

        expect(Screen.read().rows('R').slice(4)).toEqual(["N 46°59.64'", "E 12°10.40'"]);
    });

    // Sibling of the pin above: the radial 080° is accepted for the reference ORD, and the cursor moves on to DIS
    it('accepts the radial 080 with the reference ORD (5-19)', async () => {
        const unit = await radial080();

        expect(Screen.read().rows('R').slice(1, 3)).toEqual(['REF:  ORD  ', 'RAD: 080.0°']);
        expect(unit.panel.focused('R')).toEqual({row: 3, col: 16, text: '___._'});
    });

    // 5-18: the first method needs only the latitude and longitude. 5-19, note and figure 5-76: viewed later, the page
    // shows the radial and distance from the VOR nearest the waypoint. INT15 is 6.0 NM north of the VOR ORD at 100° E
    // (the keyboard cannot type a longitude below 100°, #109)
    it('shows the nearest VOR as REF of a waypoint created from its position (5-18, 5-19)', async () => {
        const unit = await bootUnit({facilities: [kenzy(), vor('ORD', 47.0, 100.0)], position: {lat: 47, lon: 8}});
        await unit.panel.selectPage('R', 'INT  ');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'INT15');
        await unit.panel.cursorTo('R', 'USER POS?');
        await unit.panel.ent();
        await unit.panel.type('R', 'N4706000');
        await unit.panel.ent();
        await unit.panel.type('R', 'E1000000');
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(9000);

        expect(Screen.read().status().right).toBe('INT');
        expect(Screen.read().rows('R').slice(1, 3)).toEqual(['REF:  ORD  ', 'RAD: 000.0°']);
        expect(userWaypoints(unit).map(w => w.slice(0, 3))).toEqual([[FacilityType.Intersection, 'XX', 'INT15']]);
    });

    // 5-16 step 7 (5-18: the same for an intersection): PRES POS? creates the waypoint at the present position of NAV 2
    it('creates the waypoint at the present position (5-16, 5-18)', async () => {
        const unit = await unknownInt({lat: 47.05, lon: 10.05});
        await unit.panel.cursorTo('R', 'PRES POS?');
        await unit.panel.ent();

        expect(Screen.read().rows('R').slice(4)).toEqual(["N 47°03.00'", "E 10°03.00'"]);
        expect(Screen.read().status().right).toBe('INT');
        const [w] = userWaypoints(unit);
        expect(w[3]).toBeCloseTo(47.05, 6);
        expect(w[4]).toBeCloseTo(10.05, 6);
    });
});

describe('stored user intersection', () => {
    // QQI, a stored user intersection 6.0 NM north of MKC
    const storage = () => savedUserWaypoints([{kind: 'int', ident: 'QQI', lat: 47.1, lon: 11.0}]);

    /** The INT page of QQI after the REF calculation, the radial 045.0 entered on RAD */
    async function radialEntered(): Promise<HeadlessUnit> {
        const unit = await bootUnit({facilities: [mkc()], storage: storage(), position: {lat: 47, lon: 8}});
        await unit.panel.selectPage('R', 'INT  ');
        await vi.advanceTimersByTimeAsync(9000);
        await unit.panel.cursor('R');
        await unit.panel.cursorTo('R', 'MKC');
        await unit.panel.cursorTo('R', '000.0'); // RAD of QQI, due north of MKC
        await unit.panel.type('R', '0450');
        await unit.panel.ent();
        return unit;
    }

    // The expected position: the 045° radial of MKC at QQI's distance (pointFrom and distanceNm, flight/geo.ts)
    const moved = () => pointFrom({lat: 47.0, lon: 11.0}, 45, distanceNm({lat: 47.0, lon: 11.0}, {lat: 47.1, lon: 11.0}));

    // Sibling of the pin below: the new radial moves the stored waypoint
    it('moves the waypoint to the entered radial (5-19)', async () => {
        const unit = await radialEntered();

        const [w] = userWaypoints(unit);
        expect(w[3]).toBeCloseTo(moved().lat, 6);
        expect(w[4]).toBeCloseTo(moved().lon, 6);
    });

    // 5-19 step 12: a new radial gives a new position, which the page shows (47.07066 N 11.10382 E). IntPage.setRad
    // updates the repository but does not redraw, so the old position stays on the page
    it.fails('shows the position of the entered radial (5-19, #NEW-3-11)', async () => {
        await radialEntered();
        await vi.advanceTimersByTimeAsync(2000);

        expect(Screen.read().rows('R').slice(4)).toEqual(["N 47°04.24'", "E 11°06.23'"]);
    });

    /** QQI with no VOR within the 100 NM of the reference search, so REF stays dashed; the cursor on RAD */
    async function withoutReference(): Promise<HeadlessUnit> {
        const unit = await bootUnit({storage: storage(), position: {lat: 47, lon: 8}});
        await unit.panel.selectPage('R', 'INT  ');
        await vi.advanceTimersByTimeAsync(9000);
        await unit.panel.cursor('R');
        await unit.panel.outer('R', 6); // the five ident characters, REF, then RAD
        return unit;
    }

    // Sibling of the pin below: the page has no reference, and the cursor is on RAD
    it('has no reference VOR and puts the cursor on RAD (characterization)', async () => {
        const unit = await withoutReference();

        expect(Screen.read().rows('R')[1]).toBe('REF:  _____');
        expect(unit.panel.focused('R')).toEqual({row: 2, col: 17, text: '___._'});
    });

    // A throw on ENT is never the real unit's behavior (the Session 8 ruling on #243). IntPage.setRad reads this.ref!
    // (null without a reference VOR, and during the 8 s of the REF calculation), and the TypeError rejects the ENT
    it.fails('does not throw on ENT of a radial without a reference (#NEW-3-12)', async () => {
        const unit = await withoutReference();
        await unit.panel.type('R', '0900');
        await unit.panel.ent();

        expect(unit.takeRejections()).toEqual([]);
    });
});
