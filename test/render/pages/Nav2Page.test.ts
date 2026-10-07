import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../harness/boot';
import {vor} from '../../harness/navdata/builders';
import {Screen} from '../../harness/render/screen';

/** Boots at `position` with the facilities given, then waits for the nearest VOR list (it searches every 10 s) */
async function nav2At(position: { lat: number, lon: number }, facilities: ReturnType<typeof vor>[] = [], magvar = 0) {
    const unit = await bootUnit({facilities, position, magvar});
    await vi.advanceTimersByTimeAsync(12_000);
    return unit;
}

describe('NAV 2 page (characterization)', () => {
    it('shows radial and distance from the nearest VOR and the present position', async () => {
        await bootUnit({facilities: [vor('ABC', 47.2, 8.0, {magneticVariation: 0})], position: {lat: 47.0, lon: 8.0}});
        // The nearest VOR list searches every 10 s (NEAREST_TICK_TIME in NearestList.ts)
        await vi.advanceTimersByTimeAsync(12_000);

        const screen = Screen.read();
        // Row 5, the longitude, is left out of this test and of the snapshot: it shows a degree below 10 written with a
        // zero, the bug of the pin below (#230)
        expect(screen.half('L').split('\n').slice(0, 5)).toEqual([
            'PRESENT POS',
            '           ',
            'ABC  180°fr',
            '     12.0nm',
            "N 47°00.00'",
        ]);
        expect(screen.leftName()).toBe('NAV 2');
        // The snapshot also pins the SUP page and the lit MSG annunciator from the engine-running boot (docs/testing.md, limitations)
        const dump = screen.dump().split('\n');
        dump.splice(13, 1); // the mask of row 5
        dump.splice(5, 1); // the text of row 5
        expect(dump).toMatchInlineSnapshot(`
          [
            "PRESENT POS| 0         ",
            "           |           ",
            "ABC  180°fr|CREATE NEW ",
            "     12.0nm|WPT AT:    ",
            "N 47°00.00'|USER POS?  ",
            "NAV 2|enr-leg msg|SUP  ",
            "",
            ".......................",
            ".......................",
            ".......................",
            ".......................",
            ".......................",
            "..............III......",
          ]
        `);
        // The right half of row 5 is not part of the bug
        expect(screen.rows('R')[5]).toBe('PRES POS?  ');
    });

    it('shows a VOR and a position south of the equator and west of the zero meridian', async () => {
        // Invented VOR ABC 0.3 degrees north of the aircraft at 33 30.25 S, 122 15.50 W
        const position = {lat: -(33 + 30.25 / 60), lon: -(122 + 15.5 / 60)};
        await nav2At(position, [vor('ABC', position.lat + 0.3, position.lon, {magneticVariation: 0})]);

        expect(Screen.read().rows('L')).toEqual([
            'PRESENT POS',
            '           ',
            'ABC  180°fr',
            '     18.0nm',
            "S 33°30.25'",
            "W122°15.50'",
        ]);
    });

    // A radial is referenced to the station's own magnetic variation, not to the variation at the aircraft: ABC is
    // declared 10 degrees east (stored -10 in the sim's VOR record, see the builder), the variation at the aircraft is 3
    // degrees east. The aircraft is due south, the radial 180 true, 170 magnetic at the station (177 at the aircraft's
    // variation would be wrong). The code does this; the test claims nothing about the real unit.
    it('shows the radial from the VOR in the station\'s magnetic variation', async () => {
        await nav2At({lat: 47.0, lon: 8.0}, [vor('ABC', 47.2, 8.0, {magneticVariation: -10})], 3);

        expect(Screen.read().rows('L')[2]).toBe('ABC  170°fr');
    });
});

describe('NAV 2 page', () => {
    // 3-8 (figure 3-27) and 3-32 (figure 3-103): latitude as N or S, a blank and two digits of degrees, longitude as E
    // or W and three digits of degrees with no blank, both with minutes to the hundredth
    it('shows latitude and longitude in degrees and minutes to the hundredth (3-8, 3-32)', async () => {
        await nav2At({lat: -(33 + 30.25 / 60), lon: -(122 + 15.5 / 60)});

        expect(Screen.read().rows('L').slice(4)).toEqual(["S 33°30.25'", "W122°15.50'"]);
    });

    // The Pilot's Guide has no figure of a degree below 10, so the KLN 89 trainer decides (2026-10-07): a user waypoint
    // at 8 degrees west showed "W  8°" with two blanks once confirmed, and the zeros ("W008°") only in the open edit
    // field. A photo of a KLN 90 (reference-photos-index.md, 0260952.jpg) shows the same blank on NAV 2. The code pads the
    // degrees with zeros (LongitudeDisplay). The sibling is the characterization above, which boots the same position.
    it.fails('shows a longitude below 10 degrees with a blank, not a zero (checked in the KLN 89 trainer, 2026-10-07, #230)', async () => {
        await nav2At({lat: 47.0, lon: 8.0}, [vor('ABC', 47.2, 8.0, {magneticVariation: 0})]);

        expect(Screen.read().rows('L')[5]).toBe("E  8°00.00'");
    });

    // The same for the latitude: the trainer showed "N  8°" blank-padded once confirmed (2026-10-07)
    it.fails('shows a latitude below 10 degrees with a blank, not a zero (checked in the KLN 89 trainer, 2026-10-07, #230)', async () => {
        await nav2At({lat: 8.5, lon: 47});

        expect(Screen.read().rows('L')[4]).toBe("N  8°30.00'");
    });

    // The setup sibling of the latitude pin: the position 8 30 N 47 E, whose longitude row has two digits of degrees
    it('reads a position 8°30\' north (3-32)', async () => {
        const unit = await nav2At({lat: 8.5, lon: 47});

        expect(unit.props.sensors.in.gps.coords.lat).toBeCloseTo(8.5, 9);
        expect(Screen.read().rows('L')[5]).toBe("E 47°00.00'");
    });

    // The setup sibling of the longitude pin: the position 47 N 8 E (8 degrees, which the first characterization above no
    // longer shows in row 5), with the VOR 12 NM north
    it('reads a position 8 degrees east with the VOR 12 NM north (3-32)', async () => {
        const unit = await nav2At({lat: 47.0, lon: 8.0}, [vor('ABC', 47.2, 8.0, {magneticVariation: 0})]);

        expect(unit.props.sensors.in.gps.coords.lon).toBeCloseTo(8.0, 9);
        expect(Screen.read().rows('L').slice(2, 5)).toEqual(['ABC  180°fr', '     12.0nm', "N 47°00.00'"]);
    });

    // 3-8, 3-32: the reference VOR is the nearest one. Two invented VORs, the nearer one sorting after the farther one
    it('shows the nearer of two VORs (3-8, 3-32)', async () => {
        await nav2At({lat: 47.0, lon: 8.0}, [vor('BBB', 47.4, 8.0), vor('CCC', 47.2, 8.0)]);

        expect(Screen.read().rows('L').slice(2, 4)).toEqual(['CCC  180°fr', '     12.0nm']);
    });

    // The real unit keeps the radial in its cells for a two-letter VOR ident: the reference photo image3-2-scaled.jpeg
    // of a real unit shows a two-letter VOR with the radial in cells 5 to 8, the cells of a three-letter ident in
    // figure 3-103 (3-32). The code writes the ident without padding, so the radial moves one cell to the left.
    it('shows the radial of a three-letter VOR in cells 5 to 8 (3-32)', async () => {
        await nav2At({lat: 47.0, lon: 8.0}, [vor('ABC', 47.2, 8.0)]);

        expect(Screen.read().rows('L')[2]).toBe('ABC  180°fr');
    });

    it.fails('shows the radial of a two-letter VOR in cells 5 to 8 (3-32, #228)', async () => {
        await nav2At({lat: 47.0, lon: 8.0}, [vor('AB', 47.2, 8.0)]);

        expect(Screen.read().rows('L')[2]).toBe('AB   180°fr');
    });
});

// #99: the minutes are rounded on their own after the degrees were floored, so a position just below a whole degree
// reads 60.00 minutes. 3-8, 3-32: the minutes run from 00.00 to 59.99. Whether the real unit rounds or truncates is
// not known, so both readings are accepted (the KLN 89 trainer never showed 60.00 minutes either, 2026-10-07).
describe('NAV 2 coordinates next to a whole degree (#99)', () => {
    // 0.00006 minutes below 48 N and below 11 E (two-digit degrees, so that the blank-padding bug stays out)
    const justBelow = {lat: 48 - 0.000001, lon: 11 - 0.000001};

    // The setup sibling of the pins: the GPS position is just below the whole degrees and NAV 2 shows it
    it('reads a position just below a whole degree (3-32)', async () => {
        const unit = await nav2At(justBelow);

        const coords = unit.props.sensors.in.gps.coords;
        expect(coords.lat).toBeCloseTo(48 - 0.000001, 9);
        expect(coords.lon).toBeCloseTo(11 - 0.000001, 9);
        const screen = Screen.read();
        expect(screen.leftName()).toBe('NAV 2');
        expect(screen.rows('L')[4].startsWith('N 4')).toBe(true);
        expect(screen.rows('L')[5].startsWith('E 1')).toBe(true);
    });

    // Just above a whole degree the display is right today: the passing half of the rule
    it('shows 00.00 minutes just above a whole degree (3-8, 3-32)', async () => {
        await nav2At({lat: 48 + 0.000001, lon: 11 + 0.000001});

        expect(Screen.read().rows('L').slice(4)).toEqual(["N 48°00.00'", "E 11°00.00'"]);
    });

    it.fails('never shows 60 minutes of latitude (3-8, 3-32, #99)', async () => {
        await nav2At(justBelow);

        expect(["N 48°00.00'", "N 47°59.99'"]).toContain(Screen.read().rows('L')[4]);
    });

    it.fails('never shows 60 minutes of longitude (3-8, 3-32, #99)', async () => {
        await nav2At(justBelow);

        expect(["E 11°00.00'", "E 10°59.99'"]).toContain(Screen.read().rows('L')[5]);
    });
});

// 3-8, figure 3-26: until the unit is NAV ready, NAV 2 shows the VOR, radial, distance and position as dashes. The
// latitude keeps its blank after the hemisphere letter; the longitude has none (three degree digits), so its dashes run
// through the first four cells. The reference photo KLN90B 2.jpg of a real unit shows the same.
describe('NAV 2 before the first fix (3-8)', () => {
    it('shows the reference VOR, the distance and the latitude as dashes (3-8)', async () => {
        const unit = await bootUnit({coldGps: true});
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.props.sensors.in.gps.isValid()).toBe(false);
        expect(Screen.read().rows('L').slice(0, 5)).toEqual([
            'PRESENT POS',
            '           ',
            '---  ---°fr',
            '   ----.-nm',
            "- --°--.--'",
        ]);
    });

    it.fails('shows the longitude dashes in the cells of the three degree digits (3-8, #224)', async () => {
        await bootUnit({coldGps: true});
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L')[5]).toBe("----°--.--'");
    });
});
