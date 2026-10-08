import {describe, expect, it, vi} from 'vitest';
import {Facility} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {airport, intersection, vor} from '../../../harness/navdata/builders';
import {savedFlightplan} from '../../../harness/storage';
import {Screen} from '../../../harness/render/screen';
import {courseDeg, distanceNm} from '../../../harness/flight/geo';
import {collectStatusMessages} from '../../../harness/statusLine';

// The world of the REF tests: a leg KAAA to KBBB due north along 10 E, a VOR TXK 0.3 degree east of the middle of the
// leg (a perpendicular to the leg exists, 5-21) and a VOR GRW beyond the end of the leg (only a perpendicular to the
// extension of the leg exists, 5-21 and figure 5-81). East longitudes of 10 and more keep the coordinate rows free of
// the leading zero of #230.
function refWorld() {
    return {
        kaaa: airport('KAAA', 47.0, 10.0),
        kbbb: airport('KBBB', 48.0, 10.0),
        txk: vor('TXK', 47.5, 10.3),
        grw: vor('GRW', 48.5, 10.3),
    };
}

/** Boots with FPL 0 and FPL 2 both KAAA, KBBB, shows the FPL page on the left and REF on the right */
async function bootOnRef(fpl: 'FPL 0' | 'FPL 2', extra: Facility[] = [], opts: { magvar?: number } = {}): Promise<HeadlessUnit> {
    const {kaaa, kbbb, txk, grw} = refWorld();
    const unit = await bootUnit({
        facilities: [kaaa, kbbb, txk, grw, ...extra], position: {lat: 47.1, lon: 10.0}, magvar: opts.magvar,
        storage: {...savedFlightplan(0, [kaaa, kbbb]), ...savedFlightplan(2, [kaaa, kbbb])},
    });
    await settle(unit);
    await unit.panel.selectPage('L', fpl);
    await unit.panel.selectPage('R', 'REF');
    return unit;
}

/** 5-21 steps 3 to 6: the right cursor, the ident, ENT for its waypoint page, ENT for the reference waypoint */
async function enterReference(unit: HeadlessUnit, ident: string): Promise<void> {
    await unit.panel.cursor('R');
    await unit.panel.type('R', ident);
    await unit.panel.ent();
    await unit.panel.ent();
    await vi.advanceTimersByTimeAsync(500);
}

/**
 * FPL 2 KAAA to KBBB along 10 E across the equator, TXK 0.3 degree east of it. The area has 10 degrees of easterly
 * variation, the station TXK its own 4 degrees east, so a conversion with the local variation cannot pass for one with
 * the station's.
 */
async function bootOnEquator(): Promise<HeadlessUnit> {
    const kaaa = airport('KAAA', -0.5, 10.0);
    const kbbb = airport('KBBB', 0.5, 10.0);
    const txk = vor('TXK', 0.0, 10.3, {magneticVariation: -4}); // 4 E as NAV 2 reads a VOR (Nav2Page.tsx:79)
    const unit = await bootUnit({
        facilities: [kaaa, kbbb, txk], position: {lat: -0.4, lon: 10.0}, magvar: 10,
        storage: savedFlightplan(2, [kaaa, kbbb]),
    });
    await settle(unit);
    await unit.panel.selectPage('L', 'FPL 2');
    await unit.panel.selectPage('R', 'REF');
    return unit;
}

/** FPL 2 KAAA (59 N) to KBBB (61 N) along 10 E, TXK at 60 N 12 E */
async function bootAt60North(): Promise<{ unit: HeadlessUnit, txk: Facility }> {
    const kaaa = airport('KAAA', 59.0, 10.0);
    const kbbb = airport('KBBB', 61.0, 10.0);
    const txk = vor('TXK', 60.0, 12.0);
    const unit = await bootUnit({
        facilities: [kaaa, kbbb, txk], position: {lat: 59.1, lon: 10.0},
        storage: savedFlightplan(2, [kaaa, kbbb]),
    });
    await settle(unit);
    await unit.panel.selectPage('L', 'FPL 2');
    await unit.panel.selectPage('R', 'REF');
    return {unit, txk};
}

const idents = (unit: HeadlessUnit, idx: number) => unit.props.memory.fplPage.flightplans[idx].getLegs().map(l => l.wpt.icaoStruct.ident);

describe('REF page', () => {
    // 5-21, figure 5-82: without a flight plan page on the left, the REF page asks for one
    it('asks for a flight plan page on the left when the left page is not an FPL page (5-21)', async () => {
        const unit = await bootOnRef('FPL 0');
        await unit.panel.selectPage('L', 'NAV 2');

        expect(Screen.read().rows('R')).toEqual([
            '           ',
            'DISPLAY    ',
            'DESIRED    ',
            'FPL ON     ',
            'LEFT PAGE  ',
            '           ',
        ]);
    });

    // 5-21, figure 5-83: with a flight plan page on the left, the REF page asks for the waypoint, the field empty
    it('asks for the reference waypoint with a flight plan page on the left (5-21)', async () => {
        await bootOnRef('FPL 2');

        expect(Screen.read().rows('R')).toEqual([
            '           ',
            '           ',
            'ENTER REF  ',
            'WPT:       ',
            '           ',
            '           ',
        ]);
    });

    // 5-21 and 5-22, steps 5 to 8, figures 5-85 and 5-86: the second ENT shows the page of the new reference waypoint
    // TXKA with its REF, while the left page already shows where it goes; the third ENT inserts it between KAAA and
    // KBBB and leaves the REF page ready for the next one, the right cursor still on
    it('inserts the reference waypoint into a numbered flight plan after the approval (5-21, 5-22)', async () => {
        const unit = await bootOnRef('FPL 2');

        await enterReference(unit, 'TXK');

        let screen = Screen.read();
        expect(screen.status().right).toBe('SUP');
        expect(screen.rows('R')[0].trim()).toBe('TXKA');
        expect(screen.rows('R')[1]).toBe('REF:  TXK  ');
        expect(screen.rows('L')[2]).toBe('  2:TXKA   ');
        expect(idents(unit, 2)).toEqual(['KAAA', 'KBBB']); // not yet inserted before the approval

        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);

        screen = Screen.read();
        expect(idents(unit, 2)).toEqual(['KAAA', 'TXKA', 'KBBB']);
        expect(screen.rows('R')[2]).toBe('ENTER REF  ');
        expect(screen.rows('R')[3]).toBe('WPT:       ');
        expect(screen.status().left).toBe('FPL 2');
        expect(screen.status().right).toBe('CRSR');
        expect(unit.errors).toEqual([]);
    });

    // 5-21 step 2: the reference waypoint works on the active flight plan as well. The page of the reference waypoint
    // is cancelled as soon as it is shown: FlightplanList turns the left cursor off when the confirmation page is up,
    // which unfocuses the waiting entry, and WaypointEditor.setEntered(false) cancels the confirmation. FPL 2 escapes
    // only because its focus lands on the wrong entry (#242)
    it.fails('inserts the reference waypoint into FPL 0 after the approval (5-21, #291)', async () => {
        const unit = await bootOnRef('FPL 0');
        expect(Screen.read().status().left).toBe('FPL 0'); // precondition: the REF page asks for the waypoint beside FPL 0
        expect(Screen.read().rows('R')[2]).toBe('ENTER REF  ');

        await enterReference(unit, 'TXK');
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);

        expect(idents(unit, 0)).toEqual(['KAAA', 'TXKA', 'KBBB']);
    });

    // Figure 5-85: while the reference waypoint waits for its approval, the left cursor is on over the new entry of the
    // flight plan (status line CRSR on the left). The code turns it off as soon as the waypoint page is up (#291)
    it.fails('keeps the left cursor on while the reference waypoint waits for approval (figure 5-85, #291)', async () => {
        const unit = await bootOnRef('FPL 2');

        await enterReference(unit, 'TXK');

        expect(Screen.read().status().right).toBe('SUP');
        expect(Screen.read().status().left).toBe('CRSR');
    });

    // 5-21 note, figure 5-81, C-1: a waypoint from which a perpendicular reaches only the extension of a leg is not a
    // valid reference
    it('refuses a waypoint whose perpendicular misses every leg with INVALID REF (5-21, C-1)', async () => {
        const unit = await bootOnRef('FPL 2');

        await enterReference(unit, 'GRW');

        const screen = Screen.read();
        expect(screen.status().mode).toBe('INVALID REF');
        expect(screen.rows('R')[2]).toBe('ENTER REF  ');
        expect(idents(unit, 2)).toEqual(['KAAA', 'KBBB']);
    });

    // C-1: a waypoint is no valid reference either when no letter A to Z gives a free identifier
    it('refuses a waypoint whose identifiers with A to Z are all taken with INVALID REF (C-1)', async () => {
        const taken = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(c => intersection('TXK' + c, 46.0, 12.0));
        const unit = await bootOnRef('FPL 2', taken);

        await enterReference(unit, 'TXK');

        expect(Screen.read().status().mode).toBe('INVALID REF');
        expect(idents(unit, 2)).toEqual(['KAAA', 'KBBB']);
    });

    // 5-22 calls the reference waypoint a supplemental waypoint; C-2: NO SUP WPTS belongs to selecting the SUP page type
    // when there are no supplemental waypoints. The page of the new reference waypoint is a SUP page built for the
    // confirmation, and its constructor posts the message because the SUP scan list does not hold TXKA (yet)
    it.fails('does not post NO SUP WPTS while it shows the new reference waypoint (5-22, C-2, #293)', async () => {
        const unit = await bootOnRef('FPL 2');
        const messages = collectStatusMessages(unit);

        await enterReference(unit, 'TXK');

        expect(Screen.read().status().right).toBe('SUP');
        expect(messages).toEqual([]);
        expect(Screen.read().status().mode).toMatch(/^enr-leg/);
    });
});

describe('REF page, the radial of the reference waypoint', () => {
    // 5-22, figure 5-85, with figure 5-81 (the chart's 330 degree radial from TXK): RAD is the radial of the reference
    // waypoint from the waypoint used to create it. Radials are magnetic, with the variation of the reference VOR itself:
    // checked in the KLN 89 trainer, 2026-10-07 (T1, high confidence: the true initial bearing at the VOR minus the VOR's
    // own variation), and 5-44. On the equator a perpendicular to a north-south leg leaves TXK due west, 270 degrees true.
    // The area has 10 degrees of easterly variation and TXK 4, so the radial is 266.0 (a conversion with the local
    // variation would give 260.0). The SUP page shows the stored true value
    it.fails('shows RAD as a magnetic radial with the variation of the reference VOR (5-44, trainer T1, #280)', async () => {
        const unit = await bootOnEquator();

        await enterReference(unit, 'TXK');

        expect(Screen.read().status().right).toBe('SUP');
        expect(Screen.read().rows('R')[2]).toBe('RAD: 266.0°');
    });

    // The setup sibling of the pin above: the same world shows the SUP page of the new waypoint with a RAD row (5-22,
    // figure 5-85)
    it('shows the SUP page of the new reference waypoint with a RAD row on the equator (5-22)', async () => {
        const unit = await bootOnEquator();

        await enterReference(unit, 'TXK');

        expect(Screen.read().status().right).toBe('SUP');
        expect(Screen.read().rows('R')[0].trim()).toBe('TXKA');
        expect(Screen.read().rows('R')[2]).toMatch(/^RAD: \d{3}\.\d°$/);
    });

    // The setup sibling of the pin below: at 60 N the same flow shows the SUP page of the new waypoint with a RAD row near
    // the perpendicular's 270 degrees (5-22, figure 5-85)
    it('shows the SUP page of the new reference waypoint with a RAD row at 60 N (5-22)', async () => {
        const {unit} = await bootAt60North();

        await enterReference(unit, 'TXK');

        expect(Screen.read().status().right).toBe('SUP');
        expect(Screen.read().rows('R')[0].trim()).toBe('TXKA');
        const row = Screen.read().rows('R')[2];
        expect(row).toMatch(/^RAD: \d{3}\.\d°$/);
        expect(Math.abs(parseFloat(row.slice(5, 10)) - 270)).toBeLessThan(5);
    });

    // 5-22: RAD is the radial from TXK, the course measured at TXK. At 60 N a reference 2 degrees of longitude east of a
    // north-south leg leaves TXK about 1.7 degrees north of west; the code stores the course arriving at the reference
    // waypoint (exactly 270, the perpendicular), so RAD reads 270.0. The expectation is the great-circle course from TXK
    // to the foot of the perpendicular (geo.ts, independent of the SDK): the foot is the vertex of the great circle
    // through TXK that crosses the meridian of the leg at right angles, latitude atan(tan(60) / cos(2))
    it.fails('measures RAD at the waypoint used to create the reference (5-22, #292)', async () => {
        const {unit, txk} = await bootAt60North();

        await enterReference(unit, 'TXK');

        const rad = (d: number) => d * Math.PI / 180;
        const footLat = Math.atan(Math.tan(rad(60)) / Math.cos(rad(2))) * 180 / Math.PI;
        const expected = courseDeg(txk, {lat: footLat, lon: 10.0});
        expect(expected).toBeGreaterThan(271.5); // precondition of the geometry: far from 270
        const row = Screen.read().rows('R')[2];
        expect(row).toMatch(/^RAD: \d{3}\.\d°$/);
        expect(Math.abs(parseFloat(row.slice(5, 10)) - expected)).toBeLessThan(0.1);
    });
});

describe('REF page, where the reference waypoint is placed', () => {
    const rad = (d: number) => d * Math.PI / 180;
    /** The foot of the perpendicular from a point `dLonDeg` east of a meridian at latitude `latDeg` onto that meridian: tan(foot) = tan(lat) / cos(dLon) */
    const footLat = (latDeg: number, dLonDeg: number) => Math.atan(Math.tan(rad(latDeg)) / Math.cos(rad(dLonDeg))) * 180 / Math.PI;
    const stored = (unit: HeadlessUnit, fpl: number, idx: number) => unit.props.memory.fplPage.flightplans[fpl].getLegs()[idx].wpt as unknown as
        { lat: number, lon: number, reference1Distance: number };

    /** FPL 2 through the given legs, the left page FPL 2, REF on the right */
    async function bootOnPlan(legs: Facility[], facilities: Facility[]): Promise<HeadlessUnit> {
        const unit = await bootUnit({facilities, position: {lat: 47.1, lon: 10.0}, storage: savedFlightplan(2, legs)});
        await settle(unit);
        await unit.panel.selectPage('L', 'FPL 2');
        await unit.panel.selectPage('R', 'REF');
        return unit;
    }

    // 5-21, 5-22: the reference waypoint lies where the route passes closest to the chosen waypoint, on the line that
    // meets the leg at a right angle, and REF notes the distance from the waypoint to it (figure 5-85). TXK is 0.3 degree
    // east of the meridian of the leg, so the foot is at latitude atan(tan(47.5) / cos(0.3)) on 10 E, a hair north of TXK
    it('puts the reference waypoint at the foot of the perpendicular and stores its distance (5-21, 5-22)', async () => {
        const unit = await bootOnRef('FPL 2');

        await enterReference(unit, 'TXK');
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);

        const foot = {lat: footLat(47.5, 0.3), lon: 10.0};
        expect(idents(unit, 2)).toEqual(['KAAA', 'TXKA', 'KBBB']); // precondition
        expect(stored(unit, 2, 1).lat).toBeCloseTo(foot.lat, 5);
        expect(stored(unit, 2, 1).lon).toBeCloseTo(10.0, 5);
        expect(stored(unit, 2, 1).reference1Distance).toBeCloseTo(distanceNm({lat: 47.5, lon: 10.3}, foot), 2);
    });

    // 5-21: with several legs, the reference waypoint goes to the leg that passes closest. KAAA (47.0, 10.0) to KBBB
    // (48.0, 10.0) and on to KCCC (48.0, 11.0): TXK (47.7, 10.3) has a perpendicular to both legs, 12.1 NM from the first
    // (0.3 degree of longitude at 47.7) and 18.0 NM from the second (0.3 degree of latitude), so the first leg wins
    it('puts the reference waypoint on the closest of two legs that both have a perpendicular (5-21)', async () => {
        const kaaa = airport('KAAA', 47.0, 10.0);
        const kbbb = airport('KBBB', 48.0, 10.0);
        const kccc = airport('KCCC', 48.0, 11.0);
        const txk = vor('TXK', 47.7, 10.3);
        const unit = await bootOnPlan([kaaa, kbbb, kccc], [kaaa, kbbb, kccc, txk]);

        await enterReference(unit, 'TXK');
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);

        expect(idents(unit, 2)).toEqual(['KAAA', 'TXKA', 'KBBB', 'KCCC']);
        expect(stored(unit, 2, 1).lat).toBeCloseTo(footLat(47.7, 0.3), 5);
        expect(stored(unit, 2, 1).lon).toBeCloseTo(10.0, 5);
    });

    // 5-21 note, figure 5-81, C-1: the perpendicular must meet the leg itself. SGW lies south of KAAA, so its
    // perpendicular meets only the extension of the leg behind the first waypoint. The code checks only the distance from
    // the first waypoint, so it accepts it (#299)
    function southWorld() {
        const kaaa = airport('KAAA', 47.0, 10.0);
        const kbbb = airport('KBBB', 48.0, 10.0);
        return {kaaa, kbbb, txk: vor('TXK', 47.5, 10.3), sgw: vor('SGW', 46.5, 10.3)};
    }

    // The setup sibling of the pin below: the same plan accepts a waypoint beside the leg
    it('accepts a waypoint beside the leg in the world with a waypoint south of it (5-21)', async () => {
        const {kaaa, kbbb, txk, sgw} = southWorld();
        const unit = await bootOnPlan([kaaa, kbbb], [kaaa, kbbb, txk, sgw]);

        await enterReference(unit, 'TXK');
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);

        expect(idents(unit, 2)).toEqual(['KAAA', 'TXKA', 'KBBB']);
    });

    it.fails('refuses a waypoint whose perpendicular falls behind the first waypoint of the leg (5-21, C-1, #299)', async () => {
        const {kaaa, kbbb, txk, sgw} = southWorld();
        const unit = await bootOnPlan([kaaa, kbbb], [kaaa, kbbb, txk, sgw]);

        await enterReference(unit, 'SGW');

        expect(Screen.read().status().mode).toBe('INVALID REF');
        expect(idents(unit, 2)).toEqual(['KAAA', 'KBBB']);
    });
});

describe('REF page (characterization)', () => {
    // The right cursor on the empty field with the first characters of an ident typed, a flight plan page on the left
    it('shows the field of the reference waypoint with the cursor on and an ident being typed', async () => {
        const unit = await bootOnRef('FPL 2');
        await unit.panel.cursor('R');
        await unit.panel.type('R', 'TX');

        const screen = Screen.read();
        expect({rows: screen.rows('R'), mask: screen.maskRows('R'), status: screen.status().right}).toMatchInlineSnapshot(`
          {
            "mask": [
              "...........",
              "...........",
              "...........",
              "......IIIII",
              "...........",
              "...........",
            ],
            "rows": [
              "           ",
              "           ",
              "ENTER REF  ",
              "WPT:  TXK  ",
              "           ",
              "           ",
            ],
            "status": "CRSR",
          }
        `);
    });
});
