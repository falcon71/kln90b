import {describe, expect, it, vi} from 'vitest';
import {VorClass, VorType} from '@microsoft/msfs-sdk';
import {bootUnit} from '../../../harness/boot';
import {vor} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';

/** The first two rows of the right half page: ident row and name row */
function identAndName(): string[] {
    return Screen.read().rows('R').slice(0, 2);
}

describe('VOR page with duplicate idents (d3228dd)', () => {
    // 3-21: the scan knob steps through every VOR in alphanumeric order. Two VORs share the ident ABC in different
    // regions; neither may be skipped, and the facility the unit picks for a typed ident must be the first of them
    // in the list order (region K1 before K2, the code's own order for equal idents). The names tell them apart.
    it('selects and scans through both VORs with the ident ABC', async () => {
        const unit = await bootUnit({
            // Database order: the K2 VOR comes first, so a search result that is not sorted by region shows ABC SOUTH
            facilities: [
                vor('ABC', 47.3, 8.3, {region: 'K2', name: 'ABC SOUTH', frequencyMHz: 117.0}),
                vor('ABC', 47.2, 8.2, {region: 'K1', name: 'ABC NORTH', frequencyMHz: 116.0}),
                vor('ABD', 47.1, 8.1),
            ],
        });
        await unit.panel.selectPage('R', 'VOR  ');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'ABC'); // the fresh page shows ABC SOUTH already, so the helper makes the unit search
        await unit.panel.cursor('R');
        expect(identAndName()).toEqual([' ABC D     ', 'ABC NORTH  ']);

        await unit.panel.scan();
        await unit.panel.inner('R', 1);
        expect(identAndName()).toEqual([' ABC D     ', 'ABC SOUTH  ']);

        // Another scan step within 350 ms would speed the scan up (WaypointPage SPEEDSTEP)
        await vi.advanceTimersByTimeAsync(400);
        await unit.panel.inner('R', 1);
        expect(identAndName()).toEqual([' ABD D     ', 'ABD        ']);
        expect(unit.errors).toEqual([]);
    });
});

/** The VOR page of a world whose first VOR (in ident order) is the first one given, cursor off */
async function vorPageOf(...facilities: ReturnType<typeof vor>[]) {
    const unit = await bootUnit({facilities, position: {lat: 47, lon: 8}});
    await unit.panel.selectPage('R', 'VOR  ');
    return unit;
}

describe('VOR page (characterization)', () => {
    it('shows a database VOR with the cursor off', async () => {
        const unit = await vorPageOf(vor('BUJ', 47.5, 11.25, {name: 'BLUE RIDGE', frequencyMHz: 114.9, magneticVariation: -8, vorClass: VorClass.LowAlt}));

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('R')).toMatchInlineSnapshot(`
          [
            " BUJ D     ",
            "BLUE RIDGE ",
            "          L",
            "114.90  8°E",
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
        await vorPageOf(vor('ABC', 47.2, 8.2, {name: 'GREATER OTTAWA'}));

        expect(Screen.read().rows('R')[1]).toBe('GREATER OTT');
    });
});

describe('VOR page contents (3-49)', () => {
    // 3-49: the letter D follows the identifier of a VOR with DME
    it('shows D after the ident of a VOR-DME (3-49)', async () => {
        await vorPageOf(vor('ABC', 47.2, 8.2, {type: VorType.VORDME}));

        expect(Screen.read().rows('R')[0]).toBe(' ABC D     ');
    });

    // 3-49: a DME-only station has the D too
    it('shows D after the ident of a DME-only station (3-49)', async () => {
        await vorPageOf(vor('ABC', 47.2, 8.2, {type: VorType.DME}));

        expect(Screen.read().rows('R')[0]).toBe(' ABC D     ');
    });

    // 3-49: a VOR without DME has no D
    it('shows no D after the ident of a VOR without DME (3-49)', async () => {
        await vorPageOf(vor('ABC', 47.2, 8.2, {type: VorType.VOR}));

        expect(Screen.read().rows('R')[0]).toBe(' ABC       ');
    });

    // 3-49: the class letters T (terminal), L (low), H (high) and U (undefined), at the end of the third row
    it.each([
        ['terminal', 'T', VorClass.Terminal],
        ['low altitude', 'L', VorClass.LowAlt],
        ['high altitude', 'H', VorClass.HighAlt],
        ['undefined', 'U', VorClass.Unknown],
    ])('shows the %s class as %s (3-49)', async (_name, letter, vorClass) => {
        await vorPageOf(vor('ABC', 47.2, 8.2, {vorClass}));

        expect(Screen.read().rows('R')[2]).toBe(`          ${letter}`);
    });

    // 3-49, figure 3-151: the frequency in MHz with two decimals, then the station's own variation, E or W. The builder's
    // magneticVariation is the sim's: positive is west.
    it('shows the frequency and a western magnetic variation (3-49)', async () => {
        await vorPageOf(vor('ABC', 47.2, 8.2, {frequencyMHz: 117.95, magneticVariation: 12}));

        expect(Screen.read().rows('R')[3]).toBe('117.95 12°W');
    });

    it('shows an eastern magnetic variation (3-49)', async () => {
        await vorPageOf(vor('ABC', 47.2, 8.2, {frequencyMHz: 108.0, magneticVariation: -15}));

        expect(Screen.read().rows('R')[3]).toBe('108.00 15°E');
    });

    // 3-49: the VOR's position fills the last two rows
    it('shows the position of the VOR (3-49)', async () => {
        await vorPageOf(vor('ABC', 47.5, 11.25));

        expect(Screen.read().rows('R').slice(4)).toEqual(["N 47°30.00'", "E 11°15.00'"]);
    });

    // 3-21, 5-18: the cursor of a database VOR visits the ident characters only; only a user VOR has editable fields.
    // Past the third character the cursor wraps to the first one today (#218 says the real unit stops at the end); both
    // stay in the ident row, which is what this test holds
    it('keeps the cursor in the ident row (3-21, 5-18)', async () => {
        const unit = await vorPageOf(vor('ABC', 47.5, 11.25));
        await unit.panel.cursor('R');

        const visited: number[] = [];
        for (let i = 0; i < 5; i++) {
            visited.push(unit.panel.focused('R').row);
            await unit.panel.outer('R', 1);
        }
        expect(visited).toEqual([0, 0, 0, 0, 0]);
    });

    // C-2: NO VOR WPTS when the VOR pages are selected and there is no VOR at all
    it('shows NO VOR WPTS without any VOR (C-2)', async () => {
        const unit = await bootUnit({defaultNavdata: false});
        await unit.panel.selectPage('R', 'VOR  ');

        expect(Screen.read().status().mode).toBe('NO VOR WPTS');
    });
});

describe('VOR page nearest view (3-22, 3-49)', () => {
    /** The VOR ABC as NR 1: 3-22, the nearest list sits before the complete list, so the scan knob turned counterclockwise reaches it */
    async function nearestAbc(magvar: number, lat = 47.4, lon = 8.3) {
        const unit = await bootUnit({facilities: [vor('ABC', lat, lon)], position: {lat: 47, lon: 8}, magvar});
        await unit.panel.selectPage('R', 'VOR  ');
        await vi.advanceTimersByTimeAsync(12_000); // the nearest list searches every 10 s
        await unit.panel.scan();
        await unit.panel.inner('R', -1);
        return unit;
    }

    // 3-49, figure 3-152: in the nearest list the position rows give the bearing to the VOR and its distance instead. ABC
    // lies 27.0 NM away on a true course of 026.9° (haversine); with 5° E the magnetic bearing is 022° (5-44: magnetic).
    it('shows NR 1 and the magnetic bearing and distance instead of the position (3-22, 3-49)', async () => {
        await nearestAbc(5);

        const rows = Screen.read().rows('R');
        expect(rows[0]).toBe(' ABC D nr 1');
        expect(rows[4].trim()).toBe('022°to');
        expect(rows[5].trim()).toBe('27.0nm');
    });

    // The nearest figures show a distance below 10 NM with its leading zero (06.5nm on 3-154, 04.1nm on 3-22 and 3-24,
    // 03.1nm on 3-42), and the VOR page shares the view of the NDB page; the KLN 89 trainer pads with a blank
    // (6.5nm), but its nearest page has another layout, and the maintainer ruled for the 90B figures. ABC lies 7.3 NM away
    // (haversine); the page shows 7.3nm (DistanceDisplay pads with a blank)
    it.fails('shows a distance below 10 NM with a leading zero (3-22, figure 3-154, #NEW-1-3)', async () => {
        await nearestAbc(0, 47.1, 8.1);

        expect(Screen.read().rows('R')[5].trim()).toBe('07.3nm');
    });

    // Sibling of the pin above: the VOR is NR 1 at 7.3 NM
    it('shows a near VOR as NR 1 at 7.3 NM (3-22)', async () => {
        await nearestAbc(0, 47.1, 8.1);

        const rows = Screen.read().rows('R');
        expect(rows[0]).toBe(' ABC D nr 1');
        expect(parseFloat(rows[5].trim())).toBe(7.3);
    });

    // 3-22: the NR number flashes
    it('flashes the NR number (3-22)', async () => {
        await nearestAbc(0);

        const masks: string[] = [];
        for (let i = 0; i < 4; i++) {
            masks.push(Screen.read().maskRows('R')[0].slice(7, 11));
            await vi.advanceTimersByTimeAsync(250);
        }
        expect(masks).toContain('BBBB');
        expect(masks).toContain('....');
    });

    // The guide does not give the duty cycle. The number is flashing on one display tick of four, the unit's blink phase
    it('flashes the NR number on one display tick of four (characterization)', async () => {
        await nearestAbc(0);

        const masks: string[] = [];
        for (let i = 0; i < 4; i++) {
            masks.push(Screen.read().maskRows('R')[0].slice(7, 11));
            await vi.advanceTimersByTimeAsync(250);
        }
        expect(masks.filter(m => m === 'BBBB')).toHaveLength(1);
        expect(masks.filter(m => m === '....')).toHaveLength(3);
    });
});

// The VOR page examples of the guide are VORTACs: Blue Ridge (figure 3-151) and Ardmore (figure 3-152), both shown with
// the D of a DME (3-49). The sim reports such a station as VorType.VORTAC: the SDK's own instruments draw a VORTAC
// symbol for that type.
describe('VOR page with a VORTAC (3-49)', () => {
    const adm = (type: VorType) => vor('ADM', 47.2, 8.2, {type, name: 'ARDMORE'});

    // VorPage.tsx:70, 109 and 134 give the D to DME and VOR-DME only
    it.fails('shows D after the ident of a VORTAC (3-49, #NEW-3-1)', async () => {
        await vorPageOf(adm(VorType.VORTAC));

        expect(Screen.read().rows('R')[0]).toBe(' ADM D     ');
    });

    // Sibling of the pin above: the page reaches the VORTAC without typing, because it is the first VOR of the scan list
    it('opens on a VORTAC that is the first VOR of the list (3-49)', async () => {
        await vorPageOf(adm(VorType.VORTAC));

        expect(Screen.read().rows('R')[1]).toBe('ARDMORE    ');
    });

    // 3-14, 3-21: an entered ident selects the VOR of that ident. VorSelector.isValidResult (VorSelector.tsx:13) accepts
    // only VOR, VOR-DME, DME and Unknown, so a VORTAC counts as an unknown ident and the user VOR creation opens
    it.fails('selects a VORTAC by its ident (3-14, 3-49, #NEW-3-2)', async () => {
        const unit = await vorPageOf(vor('ABC', 47.3, 8.3), adm(VorType.VORTAC));
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'ADM');

        expect(Screen.read().rows('R')[1]).toBe('ARDMORE    ');
    });

    // Sibling: the same entry selects a VOR-DME of that ident, so the pin above fails for the type alone
    it('selects a VOR-DME by its ident (3-14)', async () => {
        const unit = await vorPageOf(vor('ABC', 47.3, 8.3), adm(VorType.VORDME));
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'ADM');

        expect(Screen.read().rows('R')[1]).toBe('ARDMORE    ');
    });
});
