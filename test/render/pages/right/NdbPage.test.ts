import {describe, expect, it, vi} from 'vitest';
import {FacilityType, ICAO} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {ndb} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';
import {KLNFacilityRepository} from '../../../../kln90b/data/navdata/KLNFacilityRepository';

/** The NDB page of a world whose first NDB (in ident order) is the first one given, cursor off */
async function ndbPageOf(...facilities: ReturnType<typeof ndb>[]): Promise<HeadlessUnit> {
    const unit = await bootUnit({facilities, position: {lat: 47, lon: 8}});
    await unit.panel.selectPage('R', 'NDB  ');
    return unit;
}

/** The user waypoints of the repository as [type, region, ident, lat, lon, frequency] */
function userWaypoints(unit: HeadlessUnit): [FacilityType, string, string, number, number, number][] {
    const out: [FacilityType, string, string, number, number, number][] = [];
    KLNFacilityRepository.getRepository(unit.props.bus).forEach(f => out.push([ICAO.getFacilityTypeFromValue(f.icaoStruct),
        f.icaoStruct.region, f.icaoStruct.ident, f.lat, f.lon, (f as any).freqMHz]));
    return out;
}

describe('NDB page (characterization)', () => {
    // A half kHz frequency: a whole kHz shows a tenth too, which is #287
    it('shows a database NDB with the cursor off', async () => {
        const unit = await ndbPageOf(ndb('OWI', 47.5, 11.25, {name: 'OTTAWA', frequencyKHz: 251.5}));

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('R')).toMatchInlineSnapshot(`
          [
            " OWI       ",
            "OTTAWA     ",
            "           ",
            "FREQ  251.5",
            "N 47°30.00'",
            "E 11°15.00'",
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

    // The half page has 11 columns: a longer name is cut at the edge
    it('cuts a long name at the edge of the half page', async () => {
        await ndbPageOf(ndb('OWI', 47.5, 11.25, {name: 'GREATER OTTAWA'}));

        expect(Screen.read().rows('R')[1]).toBe('GREATER OTT');
    });

    // The frequency is optional: a user NDB made from the latitude and longitude alone shows dashes after FREQ
    it('shows dashes for the frequency of a user NDB made without one', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('R', 'NDB  ');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'ND1');
        await unit.panel.ent();
        await unit.panel.outer('R', 1);
        await unit.panel.type('R', 'N4730000');
        await unit.panel.ent();
        await unit.panel.type('R', 'E1001500');
        await unit.panel.ent();

        expect(Screen.read().rows('R')[3]).toBe('FREQ ____._');
    });
});

describe('NDB page frequency with a half kHz (characterization)', () => {
    // How a database NDB on a half kHz shows its frequency is not settled (#287); this holds the code's format, the
    // tenth after a decimal point in the last column
    it('shows a frequency with a half kHz (characterization)', async () => {
        await ndbPageOf(ndb('OWI', 47.5, 11.25, {frequencyKHz: 362.5}));

        expect(Screen.read().rows('R')[3]).toBe('FREQ  362.5');
    });
});

describe('NDB page contents (3-50)', () => {
    // 3-50: the identifier, the name and the position of the NDB
    it('shows the ident, the name and the position (3-50)', async () => {
        await ndbPageOf(ndb('OWI', 47.5, 11.25, {name: 'OTTAWA'}));

        const rows = Screen.read().rows('R');
        expect([rows[0], rows[1], rows[4], rows[5]]).toEqual([' OWI       ', 'OTTAWA     ', "N 47°30.00'", "E 11°15.00'"]);
    });

    // Figures 3-153 and 3-154 show the frequency of a database NDB on a whole kHz without a decimal point or a tenth, and
    // so did every NDB of the KLN 89 trainer (2026-10-07, medium confidence: no half kHz NDB in its database). The page
    // shows FREQ  251.0. The digits are compared without the blanks, so that the column of the whole number is open
    it.fails('shows a database NDB on a whole kHz without tenths (3-50, figures 3-153, 3-154, the KLN 89 trainer, #287)', async () => {
        await ndbPageOf(ndb('OWI', 47.5, 11.25, {frequencyKHz: 251}));

        expect(Screen.read().rows('R')[3].replace(/ /g, '')).toBe('FREQ251');
    });

    // Sibling of the pin above: the page shows the NDB with the whole kHz frequency
    it('shows the ident and the frequency row of an NDB on a whole kHz (3-50)', async () => {
        await ndbPageOf(ndb('OWI', 47.5, 11.25, {frequencyKHz: 251}));

        const rows = Screen.read().rows('R');
        expect(rows[0]).toBe(' OWI       ');
        expect(rows[3].startsWith('FREQ ')).toBe(true);
        expect(parseFloat(rows[3].slice(5))).toBe(251);
    });

    // 3-21, 5-18: the cursor of a database NDB visits the ident characters only; only a user NDB has editable fields.
    // Past the third character the cursor wraps to the first one today (#218 says the real unit stops at the end); both
    // stay in the ident row, which is what this test holds
    it('keeps the cursor in the ident row (3-21, 5-18)', async () => {
        const unit = await ndbPageOf(ndb('OWI', 47.5, 11.25));
        await unit.panel.cursor('R');

        const visited: number[] = [];
        for (let i = 0; i < 5; i++) {
            visited.push(unit.panel.focused('R').row);
            await unit.panel.outer('R', 1);
        }
        expect(visited).toEqual([0, 0, 0, 0, 0]);
    });

    // C-2: NO NDB WPTS when the NDB pages are selected and there is no NDB at all
    it('shows NO NDB WPTS without any NDB (C-2)', async () => {
        const unit = await bootUnit({defaultNavdata: false});
        await unit.panel.selectPage('R', 'NDB  ');

        expect(Screen.read().status().mode).toBe('NO NDB WPTS');
    });
});

describe('NDB page nearest view (3-22, 3-50)', () => {
    /** The NDB at the given position as NR 1 (3-22: counterclockwise from the first NDB of the complete list) */
    async function nearest(lat: number, lon: number, magvar = 0) {
        const unit = await bootUnit({facilities: [ndb('OWI', lat, lon, {name: 'OTTAWA'})], position: {lat: 47, lon: 8}, magvar});
        await unit.panel.selectPage('R', 'NDB  ');
        await vi.advanceTimersByTimeAsync(12_000); // the nearest list searches every 10 s
        await unit.panel.scan();
        await unit.panel.inner('R', -1);
        return unit;
    }

    // 3-50, figure 3-154: NR 1 after the ident, the bearing to and the distance of the NDB instead of the position. OWI
    // lies 17.1 NM away on a true course of 028.5° (haversine); with 5° E the magnetic bearing is 023° (5-44: magnetic)
    it('shows NR 1 and the magnetic bearing and distance instead of the position (3-22, 3-50)', async () => {
        await nearest(47.25, 8.2, 5);

        const rows = Screen.read().rows('R');
        expect(rows[0]).toBe(' OWI   nr 1');
        expect(rows[4].trim()).toBe('023°to');
        expect(rows[5].trim()).toBe('17.1nm');
    });

    // Figure 3-154 shows an NDB 6.5 NM away as 06.5nm, and the nearest airport figures agree (04.1nm on 3-22 and 3-24,
    // 03.1nm on 3-42); the KLN 89 trainer pads with a blank (6.5nm), but its nearest page has another layout, and the
    // maintainer ruled for the 90B figures. OWI lies 7.3 NM away (haversine), the page shows 7.3nm (DistanceDisplay pads
    // with a blank)
    it.fails('shows a distance below 10 NM with a leading zero (3-22, figure 3-154, #266)', async () => {
        await nearest(47.1, 8.1);

        expect(Screen.read().rows('R')[5].trim()).toBe('07.3nm');
    });

    // Sibling of the pin: the NDB is NR 1 at 7.3 NM
    it('shows a near NDB as NR 1 at 7.3 NM (3-22)', async () => {
        await nearest(47.1, 8.1);

        const rows = Screen.read().rows('R');
        expect(rows[0]).toBe(' OWI   nr 1');
        expect(parseFloat(rows[5].trim())).toBe(7.3);
    });
});

describe('user NDB (5-18)', () => {
    /** NDB page, cursor, the unknown ident ND1, ENT: the cursor is on the frequency */
    async function undefinedNdb(): Promise<HeadlessUnit> {
        const unit = await bootUnit();
        await unit.panel.selectPage('R', 'NDB  ');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'ND1');
        return unit;
    }

    /**
     * Enters a frequency below 1000 kHz into the open frequency field: the thousands cell shows a blank only with the
     * inner knob, because a pilot cannot type a blank (the PC keyboard sends A to Z and 0 to 9,
     * KLN90BCore.handleKeyboardEvent, #109). The first click opens the edit on the blank, the outer knob moves to the
     * hundreds cell, and the digits are typed from there.
     */
    async function typeBelow1000(unit: HeadlessUnit, digits: string): Promise<void> {
        await unit.panel.inner('R', 1);
        expect(Screen.read().rows('R')[3]).toBe('FREQ  ___._'); // the thousands cell shows the blank, not a dash
        await unit.panel.outer('R', 1);
        await unit.panel.type('R', digits);
    }

    // 5-18, figure 5-65: a user NDB that is not defined yet shows the ident and three lines of dashes: the frequency
    // after FREQ, the latitude and the longitude
    it('shows the ident and three lines of dashes for an unknown ident (5-18)', async () => {
        await undefinedNdb();

        expect(Screen.read().rows('R')).toEqual([' ND1       ', '           ', '           ', 'FREQ ____._', "_ __°__.__'", "____°__.__'"]);
    });

    // 5-18, figure 5-65: ENT on the ident of an unknown NDB puts the cursor over the frequency dashes (the field reads
    // across its decimal point, which the editor does not invert)
    it('puts the cursor on the frequency after the ident of an unknown NDB (5-18)', async () => {
        const unit = await undefinedNdb();
        await unit.panel.ent();

        expect(unit.panel.focused('R')).toEqual({row: 3, col: 17, text: '____._'});
    });

    // 5-18: the latitude and longitude complete the waypoint; it is stored as a user NDB, and the page shows it with the
    // cursor off (the page name NDB on the status line, as figure 5-66). The longitude is 100 E: the keyboard cannot
    // type a leading zero there (#109).
    it('creates the user NDB from the latitude and longitude (5-18)', async () => {
        const unit = await undefinedNdb();
        await unit.panel.ent();
        await unit.panel.outer('R', 1); // from the frequency to the latitude
        await unit.panel.type('R', 'N4730000');
        await unit.panel.ent();
        await unit.panel.type('R', 'E1001500');
        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        expect(userWaypoints(unit).map(w => w.slice(0, 5))).toEqual([[FacilityType.NDB, 'XX', 'ND1', 47.5, 100.25]]);
        expect(Screen.read().rows('R').slice(4)).toEqual(["N 47°30.00'", "E100°15.00'"]);
        expect(Screen.read().status().right).toBe('NDB');
    });

    // C-1: ENT LAT/LON reminds the pilot of the position while the waypoint is created: the latitude alone does not
    // complete it
    it('shows ENT LAT/LON after the latitude alone (C-1)', async () => {
        const unit = await undefinedNdb();
        await unit.panel.ent();
        await unit.panel.outer('R', 1);
        await unit.panel.type('R', 'N4730000');
        await unit.panel.ent();

        expect(Screen.read().status().mode).toBe('ENT LAT/LON');
        expect(userWaypoints(unit)).toEqual([]);
    });

    // 5-18, figure 5-66: an NDB frequency may be stored with the user NDB (328.0 kHz in the figure). NdbFreqEditor
    // .convertToValue adds the digits as numbers (0 + 3 + 2 + 8 = 13, so 13.0 kHz) and refuses every frequency with
    // INVALID ENT.
    it.fails('accepts the frequency 328.0 of figure 5-66 (5-18, #277)', async () => {
        const unit = await undefinedNdb();
        await unit.panel.ent();
        await typeBelow1000(unit, '3280');
        await unit.panel.ent();

        expect(Screen.read().status().mode).not.toBe('INVALID ENT');
        expect(Screen.read().rows('R')[3]).toBe('FREQ  328.0');
    });

    // Sibling of the pin: the keyboard reaches the frequency field and shows the typed frequency before ENT
    it('shows the typed frequency 328.0 before ENT (5-18)', async () => {
        const unit = await undefinedNdb();
        await unit.panel.ent();
        await typeBelow1000(unit, '3280');

        expect(Screen.read().rows('R')[3]).toBe('FREQ  328.0');
    });
});
