import {describe, expect, it, vi} from 'vitest';
import {AirportFacility, AirportPrivateType, BoundaryType, RunwayLightingType} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {airport, intersection, ndb, vor} from '../../../harness/navdata/builders';
import {airspace} from '../../../harness/navdata/airspaces';
import {savedFlightplan, storedSetting} from '../../../harness/storage';

describe('APT 1 page', () => {
    // 5-17: a user airport is created by entering its latitude and longitude, and the cursor goes to the latitude
    it('creates a user airport at the user position without an error (5-17, #65)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('R', 'APT 1');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'ZZZZ');
        await unit.panel.cursorTo('R', 'USER POS?');
        await unit.panel.ent();

        const screen = Screen.read();
        expect(unit.errors).toEqual([]);
        expect(screen.status().right).toBe('CRSR');
        expect(screen.rows('R')[0]).toBe(' ZZZZ      ');
        // The latitude is the focused field (row 4), the longitude (row 5) is not
        expect(unit.panel.focused('R').row).toBe(4);

        await unit.panel.outer('R', 1);

        expect(unit.errors).toEqual([]);
        expect(unit.panel.focused('R').row).toBe(5);
    });
});

/**
 * Scanning after the shown nearest entry dropped off the nearest list (#39, c2e7b8e, d202f4a).
 * The nearest search radius is 500 NM, so a teleport of 10 degrees of latitude drops an entry at once; flying there
 * would take hundreds of NM.
 */
describe('APT 1 page on a nearest entry', () => {
    // Invented airports on one meridian, 0.2 degrees (12 NM) apart; KZZZ is far out of the 500 NM search radius
    const kaaa = airport('KAAA', 47.0, 8.0);
    const kbbb = airport('KBBB', 47.2, 8.0);
    const kccc = airport('KCCC', 47.4, 8.0);
    const kzzz = airport('KZZZ', 57.1, 8.0);

    /** The aircraft is 0.6 NM from KBBB; the emergency nearest function (3-23) shows the nearest airport on APT 1 */
    async function bootAtNearest(): Promise<HeadlessUnit> {
        const unit = await bootUnit({facilities: [kaaa, kbbb, kccc, kzzz], position: {lat: 47.19, lon: 8.0}});
        // The nearest search runs every 10 s. The booted unit has its boot messages, so MSG then ENT has an effect.
        await vi.advanceTimersByTimeAsync(12000);
        await unit.panel.msg();
        await unit.panel.ent();
        // Precondition, not the claim
        expect(Screen.read().rows('R')[0]).toBe(' KBBB  nr 1');
        return unit;
    }

    /** KBBB is removed from the list, the page still holds the object. KZZZ, 6 NM away, is the only entry then. */
    async function dropEntry(unit: HeadlessUnit): Promise<void> {
        unit.env.sim.set('PLANE LATITUDE', 'degrees', 57.0);
        await vi.advanceTimersByTimeAsync(25000);
    }

    // 3-24: with the cursor off, the airport stays displayed and its nr changes with the aircraft's position. (The case
    // with the cursor parked on nr 1 is another one; its pin is in "APT 1 page with the cursor on the nearest rank".)
    it('follows the aircraft with the nr of the shown airport (3-24, d202f4a)', async () => {
        const unit = await bootAtNearest();

        // KCCC (47.4) is the nearest now, so KBBB is the second: 0.19 degrees of latitude (11.4 NM) south, bearing 180
        unit.env.sim.set('PLANE LATITUDE', 'degrees', 47.39);
        await vi.advanceTimersByTimeAsync(12000);

        expect(Screen.read().rows('R')[0]).toBe(' KBBB  nr 2');
        expect(Screen.read().rows('R')[4]).toBe('     180°to');
        expect(Screen.read().rows('R')[5]).toBe('     11.4nm');
    });

    describe('after the entry dropped off the list (characterization)', () => {
        it('shows the airport with a blank nr and its coordinates (c2e7b8e, d202f4a)', async () => {
            const unit = await bootAtNearest();
            await dropEntry(unit);

            expect(Screen.read().rows('R')[0]).toBe(' KBBB      ');
            // KBBB's coordinates, no longer bearing and distance. The longitude row (row 5) is left out of these three
            // tests: it shows a degree below 10 written with a zero (#230). The latitude row holds the coordinates.
            expect(Screen.read().rows('R')[4]).toBe('N 47°12.00\'');
        });

        // The checks are independent: the ident, the coordinates and the error channels (unit.errors and
        // unit.consoleErrors) each catch a different break (see the commit message)
        it('scans left to the previous airport of the complete list (c2e7b8e, d202f4a)', async () => {
            const unit = await bootAtNearest();
            await dropEntry(unit);

            await unit.panel.scan();
            await unit.panel.inner('R', -1);

            expect(Screen.read().rows('R')[0]).toBe(' KAAA      ');
            expect(Screen.read().rows('R')[4]).toBe('N 47°00.00\'');
            expect(unit.errors).toEqual([]);
            expect(unit.consoleErrors).toEqual([]);
        });

        it('scans right to the next airport of the complete list (c2e7b8e, d202f4a)', async () => {
            const unit = await bootAtNearest();
            await dropEntry(unit);

            await unit.panel.scan();
            await unit.panel.inner('R', 1);

            expect(Screen.read().rows('R')[0]).toBe(' KCCC      ');
            expect(Screen.read().rows('R')[4]).toBe('N 47°24.00\'');
            expect(unit.errors).toEqual([]);
            expect(unit.consoleErrors).toEqual([]);
        });
    });
});

/**
 * Scanning from a typed ident that matches no waypoint. Checked in the KLN 89 trainer (2026-10-07; the 89 shows dashes
 * and no CREATE NEW state, but its scan is the same): the scan is relative to the last waypoint the ident entry matched,
 * not to the typed ident. Clockwise shows that waypoint's successor, counterclockwise its predecessor. In the trainer
 * the typed ident sorted after its last match, and counterclockwise showed the predecessor of the last match, where a
 * scan from the typed ident would have shown the last match itself. 3-21 gives the alphabetical order of the scan.
 */
describe('APT 1 page scanning from a typed ident that matches no airport (3-21)', () => {
    // Invented airports, a few NM apart. Typing KC matches KCCC; KCZ matches nothing, and KCCC was the last match.
    const world = () => ({
        facilities: [airport('KAAA', 47.0, 8.0), airport('KBBB', 47.02, 8.0), airport('KCCC', 47.04, 8.0), airport('KDDD', 47.06, 8.0)],
        position: {lat: 47.0, lon: 8.0},
    });
    const CHARSET = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ' ', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

    /** APT 1 with KCZ entered with the knobs (enterIdent) and the cursor off: the state the pins scan from */
    async function enterKcz(): Promise<HeadlessUnit> {
        const unit = await bootUnit(world());
        await unit.panel.selectPage('R', 'APT 1');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'KCZ');
        await unit.panel.cursor('R');
        return unit;
    }

    /** KCZ entered as above, the scan knob pulled; one slow click of the inner knob follows */
    async function scanFromKcz(clicks: number): Promise<HeadlessUnit> {
        const unit = await enterKcz();
        await unit.panel.scan();
        await unit.panel.inner('R', clicks);
        await vi.advanceTimersByTimeAsync(400);
        return unit;
    }

    /** Sets the character of the focused selector cell with the inner knob, the shorter way around the selector's characters */
    async function setChar(unit: HeadlessUnit, ch: string): Promise<void> {
        for (let guard = 0; unit.panel.focused('R').text[0] !== ch; guard++) {
            expect(guard).toBeLessThan(CHARSET.length);
            let delta = CHARSET.indexOf(ch) - CHARSET.indexOf(unit.panel.focused('R').text[0]);
            if (delta > CHARSET.length / 2) delta -= CHARSET.length;
            if (delta < -CHARSET.length / 2) delta += CHARSET.length;
            await unit.panel.inner('R', delta > 0 ? 1 : -1);
        }
    }

    /** APT 1 with K and C typed char by char: the page shows KCCC, the last match */
    async function typeKc(): Promise<HeadlessUnit> {
        const unit = await bootUnit(world());
        await unit.panel.selectPage('R', 'APT 1');
        await unit.panel.cursor('R');
        await setChar(unit, 'K');
        await unit.panel.outer('R', 1);
        await setChar(unit, 'C');
        return unit;
    }

    // The passing siblings of the pins: after KC the page shows KCCC, the last match, and after KCZ the page offers to
    // create a waypoint, typed char by char and (below) on the pins' own path. Without them the scans could start anywhere.
    // The name row of KCCC is not asserted here: the pin below holds it.
    it('shows KCCC after KC and the CREATE NEW state after KCZ (3-21, 5-16)', async () => {
        const unit = await typeKc();
        expect(Screen.read().rows('R')[0]).toBe(' KCCC      ');

        await unit.panel.outer('R', 1);
        await setChar(unit, 'Z');

        const rows = Screen.read().rows('R');
        expect([rows[0], rows[2], rows[3]]).toEqual([' KCZ       ', 'CREATE NEW ', 'WPT AT:    ']);
    });

    // 3-26: names are shortened only where they are too long for the display, and "KCCC AIRPORT" (the builder names every
    // airport "<ident> AIRPORT") fits the two name rows. Figures 3-71 and 3-84 show a listed word inside a longer word
    // (WESTCHESTER, NEWPORT) staying whole. So the name stays whole and continues on the second row after the eleventh
    // cell (figure 3-85). The code replaces PORT inside AIRPORT and shows KCCC AIRPT.
    it.fails('shows the name KCCC AIRPORT with the word AIRPORT whole (3-26, #NEW-1-2)', async () => {
        const unit = await typeKc();

        expect(Screen.read().rows('R').slice(1, 3)).toEqual(['KCCC AIRPOR', 'T          ']);
    });

    it('shows the CREATE NEW state for KCZ entered the way the pins enter it (5-16)', async () => {
        const unit = await enterKcz();

        const rows = Screen.read().rows('R');
        expect([rows[0], rows[2], rows[3]]).toEqual([' KCZ       ', 'CREATE NEW ', 'WPT AT:    ']);
    });

    it.fails('scans clockwise to the waypoint after the last match (3-21, #202)', async () => {
        const unit = await scanFromKcz(1);

        expect(Screen.read().rows('R')[0]).toBe(' KDDD      ');
    });

    // A scan from the typed ident would show KCCC (the airport before KCZ), so this case tells the two readings apart
    it.fails('scans counterclockwise to the waypoint before the last match (3-21, #202)', async () => {
        const unit = await scanFromKcz(-1);

        expect(Screen.read().rows('R')[0]).toBe(' KBBB      ');
    });
});

/** The aircraft sits at 47 N 12 E, so that no coordinate on the right half has a degree below 10 (#230) */
const POS = {lat: 47.0, lon: 12.0};

/** Shows the first airport of the scan list on APT 1 and lets the airspace search finish */
async function showApt1(unit: HeadlessUnit): Promise<string[]> {
    await unit.panel.selectPage('R', 'APT 1');
    await vi.advanceTimersByTimeAsync(2000);
    return Screen.read().rows('R');
}

const military = (lon = 12.0) => ({...airport('KAAA', 47.1, lon), airportPrivateType: AirportPrivateType.Military} as AirportFacility);
/** A Class B triangle over 47.1 N 11.9 E (the triangle of NearestUtils.test.ts, moved to 12 E) */
const classB = () => airspace('TEST CLASS B', BoundaryType.ClassB, [[47.2, 11.8], [47.2, 12.2], [46.8, 11.8]]);

describe('APT 1 page (characterization)', () => {
    // The database view is held cell by cell by the spec test below; this holds the nearest view as a whole. The mask is
    // left out: the rank flashes.
    it('shows a nearest airport', async () => {
        const kaaa = airport('KAAA', 47.2, 12.0, {name: 'SPRINGFIELD MUNICIPAL'});
        const unit = await bootUnit({facilities: [kaaa], position: POS});
        await vi.advanceTimersByTimeAsync(12000);
        await unit.panel.msg();
        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('R')).toMatchInlineSnapshot(`
          [
            " KAAA  nr 1",
            "SPRINGFIELD",
            " MUNICIPAL ",
            "  5000' HRD",
            "     000°to",
            "     12.0nm",
          ]
        `);
    });

    // The cursor on the ident of a database airport
    it('shows the cursor on the ident', async () => {
        const unit = await bootUnit({facilities: [airport('KAAA', 47.1, 12.0, {name: 'SPRINGFIELD MUNICIPAL'})], position: POS});
        await showApt1(unit);
        await unit.panel.cursor('R');

        expect(Screen.read().maskRows('R')).toMatchInlineSnapshot(`
          [
            ".I.........",
            "...........",
            "...........",
            "...........",
            "...........",
            "...........",
          ]
        `);
    });
});

describe('APT 1 page of a database airport', () => {
    // 3-42, figure 3-133: the ident, the name on two rows, the airspace and type row (blank for a public airport under
    // no airspace), then the latitude and longitude. Figure 3-71 shows a name longer than a row cut after eleven cells,
    // the blank between the words starting the second row.
    it('shows the ident, the name, the type row and the position (3-42)', async () => {
        const unit = await bootUnit({facilities: [airport('KAAA', 47.1, 12.0, {name: 'SPRINGFIELD MUNICIPAL'})], position: POS});

        expect(await showApt1(unit)).toEqual([
            ' KAAA      ',
            'SPRINGFIELD',
            ' MUNICIPAL ',
            '           ',
            'N 47°06.00\'',
            'E 12°00.00\'',
        ]);
    });

    // 3-42: MILTRY and PRIVAT appear on the type row of a military and of a private airport
    it.each([
        ['military', AirportPrivateType.Military, 'MILTRY'],
        ['private', AirportPrivateType.Private, 'PRIVAT'],
    ])('names a %s airport on the type row (3-42)', async (_kind, type, word) => {
        const unit = await bootUnit({facilities: [{...airport('KAAA', 47.1, 12.0), airportPrivateType: type} as AirportFacility], position: POS});

        expect((await showApt1(unit))[3].trim()).toBe(word);
    });

    // 3-42: MILTRY stands on the right side of the type row; CL B, CL C, CTA or TMA on its left
    it.fails('puts MILTRY on the right side of the type row (3-42, #NEW-1-1)', async () => {
        const unit = await bootUnit({facilities: [military()], position: POS});

        expect((await showApt1(unit))[3]).toBe('     MILTRY');
    });

    // The same rule with a Class B airspace above the airport: both words fit on the row, with a blank between them
    it.fails('shows CL B and MILTRY apart on the type row (3-42, #NEW-1-1)', async () => {
        const unit = await bootUnit({facilities: [military(11.9)], position: POS, altitudeFt: 0, airspaces: [classB()]});

        expect((await showApt1(unit))[3]).toBe('CL B MILTRY');
    });

    // 3-42, the sibling of the second pin: the airspace is found and the type shows, so the pin fails on the layout only
    it('shows CL B and MILTRY for a military airport under Class B (3-42)', async () => {
        const unit = await bootUnit({facilities: [military(11.9)], position: POS, altitudeFt: 0, airspaces: [classB()]});

        expect((await showApt1(unit))[3].trim()).toMatch(/^CL B ?MILTRY$/);
    });

    // 3-26: whole words are abbreviated (Fort to FT, Saint to ST, Regional to REG), and the name is cut after eleven
    // cells (figure 3-85)
    it.each([
        ['FORT SMITH REGIONAL', ['FT SMITH RE', 'G          ']],
        ['SAINT CLAIR COUNTY', ['ST CLAIR CO', 'UNTY       ']],
    ])('abbreviates the words of %s (3-26)', async (name, rows) => {
        const unit = await bootUnit({facilities: [airport('KAAA', 47.1, 12.0, {name})], position: POS});

        expect((await showApt1(unit)).slice(1, 3)).toEqual(rows);
    });

    // 3-26 abbreviates the words West and Port; figures 3-71 and 3-84 show WESTCHESTER and NEWPORT MUN, so a word that
    // only contains them stays whole. The spec test above is the sibling: the same page shortens whole words.
    it.fails('keeps WESTCHESTER whole (3-26, #NEW-1-2)', async () => {
        const unit = await bootUnit({facilities: [airport('KAAA', 47.1, 12.0, {name: 'WESTCHESTER COUNTY'})], position: POS});

        expect((await showApt1(unit))[1]).toBe('WESTCHESTER');
    });

    it.fails('keeps NEWPORT whole (3-26, #NEW-1-2)', async () => {
        const unit = await bootUnit({facilities: [airport('KAAA', 47.1, 12.0, {name: 'NEWPORT MUNICIPAL'})], position: POS});

        expect((await showApt1(unit))[1]).toBe('NEWPORT MUN');
    });

    // 3-26 deletes the word The; the name then starts with the next word, not with a blank
    it.fails('deletes a leading THE without leaving a blank (3-26, #NEW-1-2)', async () => {
        const unit = await bootUnit({facilities: [airport('KAAA', 47.1, 12.0, {name: 'THE HARTSFIELD'})], position: POS});

        expect((await showApt1(unit))[1]).toBe('HARTSFIELD ');
    });

    // 3-42: an arrow precedes the ident of the active waypoint. FPL 0 KBBB to KAAA makes KAAA active.
    it('shows the arrow before the ident of the active airport (3-42)', async () => {
        const kaaa = airport('KAAA', 47.1, 12.0);
        const kbbb = airport('KBBB', 47.3, 12.0);
        const unit = await bootUnit({facilities: [kaaa, kbbb], position: POS, storage: savedFlightplan(0, [kbbb, kaaa])});
        await settle(unit);

        expect((await showApt1(unit))[0]).toBe('›KAAA      ');
    });

    // C-1: NO APT WPTS when the APT pages are selected and there is no airport, neither in the database nor a user one
    it('says NO APT WPTS without any airport (C-1)', async () => {
        const unit = await bootUnit({
            facilities: [vor('ABC', 47.1, 12.1), ndb('NDA', 47.1, 12.2), intersection('ALPHA', 47.1, 12.3)],
            defaultNavdata: false, position: POS,
        });
        await unit.panel.selectPage('R', 'APT 1');

        expect(Screen.read().status().mode).toBe('NO APT WPTS');
    });
});

describe('APT 1 page in the nearest list', () => {
    /** One airport north of the aircraft, its runway lit, shown by MSG then ENT (3-23) */
    async function bootNearest(latitude: number): Promise<HeadlessUnit> {
        const kaaa = airport('KAAA', latitude, 12.0, {name: 'SPRINGFIELD'});
        (kaaa.runways[0] as { lighting: RunwayLightingType }).lighting = RunwayLightingType.FullTime;
        const unit = await bootUnit({facilities: [kaaa], position: POS});
        await vi.advanceTimersByTimeAsync(12000); // the nearest search runs every 10 s
        await unit.panel.msg();
        await unit.panel.ent();
        return unit;
    }

    // 3-22, 3-42, figures 3-71 and 3-134: nr and the rank after the ident, the longest runway's length, surface and
    // lighting instead of the type row, the bearing and distance instead of the coordinates. KAAA 0.2 degrees north is
    // 12.0 NM away.
    it('shows the longest runway, the bearing and the distance (3-22, 3-42)', async () => {
        const unit = await bootNearest(47.2);

        const rows = Screen.read().rows('R');
        expect(rows[0]).toBe(' KAAA  nr 1');
        expect(rows[3].trim()).toBe('5000\' HRD');
        expect(rows[4]).toBe('L    000°to');
        expect(rows[5]).toBe('     12.0nm');
    });

    // Figures 3-71, 3-76, 3-134 and 3-154 show a nearest distance below 10 NM with a leading zero (04.1nm, 03.1nm,
    // 06.5nm). KAAA 0.068 degrees north is 4.1 NM away. (The KLN 89 trainer shows 4.0nm without the zero; the
    // maintainer ruled for the 90B figures.)
    it.fails('shows a distance below 10 NM with a leading zero (3-22, #NEW-1-3)', async () => {
        const unit = await bootNearest(47.068);

        expect(Screen.read().rows('R')[5]).toBe('     04.1nm');
    });

    // 3-22, the sibling of the pin: the page shows KAAA in the nearest format at that distance
    it('shows the nearest format 4.1 NM from the airport (3-22)', async () => {
        const unit = await bootNearest(47.068);

        expect(Screen.read().rows('R')[0]).toBe(' KAAA  nr 1');
        expect(Screen.read().rows('R')[5].trim()).toMatch(/^0?4\.1nm$/);
    });
});

describe('APT 1 page with the cursor on the nearest rank', () => {
    /**
     * KBBB is the nearest airport at the start: MSG, ENT shows it as nr 1 (3-23), the right cursor is parked on nr 1
     * (3-24). Then the aircraft moves north next to KCCC and the nearest search runs again.
     */
    async function parkOnNr1ThenMove(): Promise<HeadlessUnit> {
        const unit = await bootUnit({facilities: [airport('KBBB', 47.2, 12.0), airport('KCCC', 47.6, 12.0)], position: {lat: 47.19, lon: 12.0}});
        await vi.advanceTimersByTimeAsync(12000);
        await unit.panel.msg();
        await unit.panel.ent();
        await unit.panel.cursor('R');
        await unit.panel.cursorTo('R', 'nr 1');
        expect(Screen.read().rows('R')[0]).toBe(' KBBB  nr 1');

        unit.env.sim.set('PLANE LATITUDE', 'degrees', 47.59);
        await vi.advanceTimersByTimeAsync(12000);
        return unit;
    }

    // 3-24, the sibling of the pin: the cursor stays on the rank, and the unit's nearest list has KCCC first, so the pin
    // fails on the page only
    it('keeps the cursor on the rank while the nearest list changes (3-24)', async () => {
        const unit = await parkOnNr1ThenMove();

        expect(unit.panel.focused('R').text).toMatch(/^nr [12]$/);
        expect(unit.props.nearestLists.aptNearestList.getNearestList().map(w => w.facility.icaoStruct.ident)).toEqual(['KCCC', 'KBBB']);
    });

    // 3-24: as long as the cursor stays parked on NR 1, the page keeps showing the nearest airport as the flight goes
    // on. Checked in the KLN 89 trainer (2026-10-07): the page switched to the new nearest airport at rank 1 and kept
    // tracking it. Only the parked cursor is the bug: with the cursor off, the shown airport stays and its rank counts
    // up (the spec test of "APT 1 page on a nearest entry").
    it.fails('follows the nearest airport while the cursor is parked on nr 1 (3-24, KLN 89 trainer, #NEW-1-5)', async () => {
        const unit = await parkOnNr1ThenMove();

        expect(Screen.read().rows('R')[0]).toBe(' KCCC  nr 1');
    });
});

describe('APT 1 page creating a user airport', () => {
    /** FARM typed on APT 1, which has no match, so the page offers CREATE NEW WPT AT (5-16, figure 5-54) */
    async function typeFarm(position = POS): Promise<HeadlessUnit> {
        const unit = await bootUnit({position});
        await unit.panel.selectPage('R', 'APT 1');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'FARM');
        return unit;
    }

    // 5-16, figure 5-54
    it('offers to create the waypoint at the user or the present position (5-16)', async () => {
        await typeFarm();

        expect(Screen.read().rows('R')).toEqual([
            ' FARM      ',
            '           ',
            'CREATE NEW ',
            'WPT AT:    ',
            'USER POS?  ',
            'PRES POS?  ',
        ]);
    });

    // 5-16 step 7, figure 5-55: PRES POS? creates the airport at the present position, and APT 1 shows it with the
    // cursor off
    it('creates the airport at the present position with PRES POS? (5-16)', async () => {
        const unit = await typeFarm({lat: 47.25, lon: 12.5});
        await unit.panel.cursorTo('R', 'PRES POS?');
        await unit.panel.ent();

        expect(Screen.read().status().right).toBe('APT 1');
        expect(Screen.read().rows('R')).toEqual([
            ' FARM      ',
            '           ',
            '           ',
            '           ',
            'N 47°15.00\'',
            'E 12°30.00\'',
        ]);
        expect(unit.errors).toEqual([]);
    });

    // 5-17 step 8, figures 5-56 to 5-58: USER POS? shows dashed coordinates with the cursor on the latitude; ENT on the
    // latitude moves the cursor to the longitude, ENT on the longitude approves the position. The longitude is typed
    // at 100 degrees or more, because the keyboard cannot type one below 100 (#109).
    it('creates the airport at an entered position with USER POS? (5-17)', async () => {
        const unit = await typeFarm();
        await unit.panel.cursorTo('R', 'USER POS?');
        await unit.panel.ent();
        expect(Screen.read().rows('R').slice(4)).toEqual(['_ __°__.__\'', '____°__.__\'']);
        expect(unit.panel.focused('R').row).toBe(4);

        await unit.panel.type('R', 'N4730');
        await unit.panel.ent();
        expect(unit.panel.focused('R').row).toBe(5);

        await unit.panel.type('R', 'W10215');
        await unit.panel.ent();

        expect(Screen.read().status().right).toBe('APT 1');
        expect(Screen.read().rows('R')).toEqual([
            ' FARM      ',
            '           ',
            '           ',
            '           ',
            'N 47°30.00\'',
            'W102°15.00\'',
        ]);
        expect(unit.errors).toEqual([]);

        // The airport is saved as a V2 user waypoint (docs/architecture.md, Core 7, laid out by hand): type A, region XX,
        // the ident padded to eight, latitude +4730.00, longitude -10215.00, the unknown elevation -1 m, the unknown
        // runway length -33 ft and no surface. The unit saves a moment after the change.
        await vi.advanceTimersByTimeAsync(1000);
        expect(storedSetting(unit, 'wpt0')).toBe('AXX        FARM    +4730.00-10215.00-00001-00033-');

        // APT 1 also shows the same position again after a visit to APT 2
        await unit.panel.inner('R', 1);
        await unit.panel.inner('R', -1);
        expect(Screen.read().rows('R')).toEqual([
            ' FARM      ',
            '           ',
            '           ',
            '           ',
            'N 47°30.00\'',
            'W102°15.00\'',
        ]);
    });

    // C-1: ENT LAT/LON reminds the pilot to enter the position while a user waypoint is being created; here the
    // latitude is entered and the longitude is not
    it('reminds the pilot to enter the longitude (C-1)', async () => {
        const unit = await typeFarm();
        await unit.panel.cursorTo('R', 'USER POS?');
        await unit.panel.ent();
        await unit.panel.type('R', 'N4730');
        await unit.panel.ent();

        expect(Screen.read().status().mode).toBe('ENT LAT/LON');
    });
});
