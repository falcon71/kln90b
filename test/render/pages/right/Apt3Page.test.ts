import {describe, expect, it, vi} from 'vitest';
import {AirportFacility, RunwayLightingType, RunwaySurfaceType} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {airport, RunwayOptions} from '../../../harness/navdata/builders';
import {Screen} from '../../../harness/render/screen';
import {recordMap} from '../../../harness/render/mapRecorder';
import {canvasToAscii, downsampled} from '../../../harness/render/canvas';
import {pointFrom} from '../../../harness/flight/geo';

describe('APT 3 page (characterization)', () => {
    it('is offered for an airport without runways, with a note instead of the map (#38)', async () => {
        const kaaa = {...airport('KAAA', 47.1, 8.0), runways: []};
        const unit = await bootUnit({facilities: [kaaa]});

        await unit.panel.selectPage('R', 'APT 3');

        const screen = Screen.read();
        expect(unit.errors).toEqual([]);
        expect(screen.status().right).toBe('APT 3');
        expect(screen.rows('R').slice(2, 5)).toEqual(['  RUNWAY   ', ' DATA NOT  ', ' AVAILABLE ']);
    });
});

const CENTER = {lat: 47.1, lon: 12.0};

/** An airport at CENTER with the given runways, the lighting of each set by index (airport() leaves it unknown) */
function withRunways(ident: string, runways: RunwayOptions[], lighting: RunwayLightingType[] = []): AirportFacility {
    const apt = airport(ident, CENTER.lat, CENTER.lon, {runways});
    lighting.forEach((l, i) => (apt.runways[i] as { lighting: RunwayLightingType }).lighting = l);
    return apt;
}

/** KAAA with runways 06/24 (6200 ft, lit) and 14/32 (4300 ft, pilot-controlled lighting), both hard */
const twoRunways = () => withRunways('KAAA', [{heading: 240, lengthFt: 6200}, {heading: 320, lengthFt: 4300}],
    [RunwayLightingType.FullTime, RunwayLightingType.Frequency]);

/** The rows of the right half after the inner knob turned `clicks` times from the runway diagram */
async function listPage(unit: HeadlessUnit, clicks: number): Promise<string[]> {
    await unit.panel.inner('R', clicks);
    return Screen.read().rows('R');
}

describe('APT 3 page, runway diagram and list (characterization)', () => {
    it('draws the runway diagram', async () => {
        const unit = await bootUnit({facilities: [twoRunways()], position: {lat: 47.0, lon: 12.0}});
        await unit.panel.selectPage('R', 'APT 3');

        const canvas = document.querySelector('canvas') as HTMLCanvasElement;
        await expect(downsampled(canvasToAscii(canvas))).toMatchFileSnapshot('./__snapshots__/apt3Diagram.txt');
    });

    it('lists the runways', async () => {
        const unit = await bootUnit({facilities: [twoRunways()], position: {lat: 47.0, lon: 12.0}});
        await unit.panel.selectPage('R', 'APT 3');

        expect(await listPage(unit, 1)).toMatchInlineSnapshot(`
          [
            " KAAA      ",
            "           ",
            "06 /24  L  ",
            "  6200' HRD",
            "14 /32  LPC",
            "  4300' HRD",
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

    // The code gives the sim's macadam surface no abbreviation, so the surface cells stay blank
    it('shows a blank surface for a macadam runway', async () => {
        const unit = await bootUnit({facilities: [withRunways('KAAA', [{surface: RunwaySurfaceType.Macadam}])], position: {lat: 47.0, lon: 12.0}});
        await unit.panel.selectPage('R', 'APT 3');

        expect((await listPage(unit, 1))[3]).toBe("  5000'    ");
    });
});

describe('APT 3 page, runway diagram', () => {
    // 3-43, figure 3-136: the diagram draws each runway as a line between its two ends and labels each end with the
    // designation of the runway that starts there (runway 09 at the west end of 09/27). The ends are laid out from the
    // runway's center, heading and length (2500 ft each way of 5000 ft). The headings are those of the ends 27 and 36.
    it('draws each runway between its ends and labels each end (3-43)', async () => {
        const half = 2500 / 6076.12;
        const map = recordMap({
            W: pointFrom(CENTER, 270, half), E: pointFrom(CENTER, 90, half),
            N: pointFrom(CENTER, 0, half), S: pointFrom(CENTER, 180, half),
        });
        const unit = await bootUnit({facilities: [withRunways('KAAA', [{heading: 270}, {heading: 360}])], position: {lat: 47.0, lon: 12.0}});
        await unit.panel.selectPage('R', 'APT 3');
        expect(Screen.read().status().right).toBe('APT+3');

        const lines = map.drawn.filter(d => d.startsWith('plain')).map(d => d.split(' ').slice(1).sort().join('-')).sort();
        const labels = map.drawn.filter(d => d.startsWith('label')).sort();
        expect(lines).toEqual(['E-W', 'N-S']);
        expect(labels).toEqual(['label 09 W', 'label 18 N', 'label 27 E', 'label 36 S']);
    });
});

describe('APT 3 page, runway list', () => {
    // 3-44, figure 3-137: after the diagram, the runways in order of length, longest first, two rows each: both
    // designations and the lighting, then the length in feet and the surface. With more runways than one page holds,
    // further APT 3 pages follow (APT+3, 3-9, 3-10).
    it('lists the runways longest first, two per page (3-44)', async () => {
        const kaaa = withRunways('KAAA', [{heading: 60, lengthFt: 6200}, {heading: 140, lengthFt: 4300, surface: RunwaySurfaceType.Grass}, {heading: 180, lengthFt: 8000}],
            [RunwayLightingType.FullTime, RunwayLightingType.Frequency]);
        const unit = await bootUnit({facilities: [kaaa], position: {lat: 47.0, lon: 12.0}});
        await unit.panel.selectPage('R', 'APT 3');

        const first = await listPage(unit, 1);
        expect(Screen.read().status().right).toBe('APT+3');
        expect(first[0]).toBe(' KAAA      ');
        expect([first[2].trim().split(/ +/), first[3].trim()]).toEqual([['18', '/36'], '8000\' HRD']);
        expect([first[4].trim().split(/ +/), first[5].trim()]).toEqual([['06', '/24', 'L'], '6200\' HRD']);

        const second = await listPage(unit, 1);
        expect(Screen.read().status().right).toBe('APT+3');
        expect([second[2].trim().split(/ +/), second[3].trim()]).toEqual([['14', '/32', 'LPC'], '4300\' TRF']);
        expect(second.slice(4)).toEqual(['           ', '           ']);

        await unit.panel.inner('R', 1);
        expect(Screen.read().status().right).toBe('APT 4');
    });

    // 3-44: up to five runways are listed; a sixth, the shortest, is not
    it('lists five runways of six (3-44)', async () => {
        const runways = [9000, 8000, 7000, 6000, 5000, 4000].map((lengthFt, i) => ({heading: 10 + i * 30, lengthFt}));
        const unit = await bootUnit({facilities: [withRunways('KAAA', runways)], position: {lat: 47.0, lon: 12.0}});
        await unit.panel.selectPage('R', 'APT 3');

        const lengths: string[] = [];
        for (let page = 0; page < 3; page++) {
            const rows = await listPage(unit, 1);
            lengths.push(rows[3].trim(), rows[5].trim());
        }

        expect(lengths).toEqual(['9000\' HRD', '8000\' HRD', '7000\' HRD', '6000\' HRD', '5000\' HRD', '']);
        await unit.panel.inner('R', 1);
        expect(Screen.read().status().right).toBe('APT 4');
    });

    // 3-44: the surface abbreviations, for the sim's surfaces that have one (in the order of the sim's enum)
    it.each([
        ['Concrete', RunwaySurfaceType.Concrete, 'HRD'],
        ['ShortGrass', RunwaySurfaceType.ShortGrass, 'TRF'],
        ['Snow', RunwaySurfaceType.Snow, 'SNW'],
        ['Ice', RunwaySurfaceType.Ice, 'ICE'],
        ['Dirt', RunwaySurfaceType.Dirt, 'DRT'],
        ['Gravel', RunwaySurfaceType.Gravel, 'GRV'],
        ['SteelMats', RunwaySurfaceType.SteelMats, 'MAT'],
        ['Bituminous', RunwaySurfaceType.Bituminous, 'HRD'],
        ['Brick', RunwaySurfaceType.Brick, 'HRD'],
        ['Sand', RunwaySurfaceType.Sand, 'SND'],
        ['Shale', RunwaySurfaceType.Shale, 'SHL'],
        ['Tarmac', RunwaySurfaceType.Tarmac, 'HRD'],
    ])('abbreviates the surface %s (3-44)', async (_name, surface, abbreviation) => {
        const unit = await bootUnit({facilities: [withRunways('KAAA', [{surface}])], position: {lat: 47.0, lon: 12.0}});
        await unit.panel.selectPage('R', 'APT 3');

        expect((await listPage(unit, 1))[3].trim()).toBe(`5000' ${abbreviation}`);
    });

    // 3-44: L, LPC and LPT for the lighting, a blank for none
    it.each([
        ['FullTime', RunwayLightingType.FullTime, ['09', '/27', 'L']],
        ['Frequency', RunwayLightingType.Frequency, ['09', '/27', 'LPC']],
        ['PartTime', RunwayLightingType.PartTime, ['09', '/27', 'LPT']],
        ['None', RunwayLightingType.None, ['09', '/27']],
    ])('abbreviates the lighting %s (3-44)', async (_name, lighting, tokens) => {
        const unit = await bootUnit({facilities: [withRunways('KAAA', [{}], [lighting])], position: {lat: 47.0, lon: 12.0}});
        await unit.panel.selectPage('R', 'APT 3');

        expect((await listPage(unit, 1))[2].trim().split(/ +/)).toEqual(tokens);
    });
});

describe('APT 3 page while scanning', () => {
    /** KAAA's runway diagram is shown; the scan knob then moves on to KBBB, a heliport without runways */
    async function scanFromDiagramToHeliport(): Promise<HeadlessUnit> {
        const unit = await bootUnit({facilities: [twoRunways(), airport('KBBB', 47.2, 12.0, {runways: []})], position: {lat: 47.0, lon: 12.0}});
        await unit.panel.selectPage('R', 'APT 3');
        expect(Screen.read().rows('R')[0]).toBe('           '); // the diagram has no ident row
        await unit.panel.scan();
        await unit.panel.inner('R', 1);
        await vi.advanceTimersByTimeAsync(1000);
        await unit.panel.scan();
        return unit;
    }

    // 3-44, the sibling of the pin: the scan reached KBBB, whose APT 3 page has no diagram
    it('scans from the diagram to the next airport (3-44)', async () => {
        const unit = await scanFromDiagramToHeliport();

        expect(Screen.read().rows('R')[0]).toBe(' KBBB      ');
        expect(Screen.read().status().right).toBe('APT 3');
        expect(unit.errors).toEqual([]);
    });

    // 3-44: an airport without runway data shows RUNWAY DATA NOT AVAILABLE on APT 3, also when the scan came from the
    // diagram of an airport with one. Continues #38.
    it.fails('shows the note of an airport without runways after a scan from a diagram (3-44, #NEW-1-6)', async () => {
        await scanFromDiagramToHeliport();

        const text = Screen.read().rows('R').join(' ').replace(/ +/g, ' ').trim();
        expect(text).toBe('KBBB RUNWAY DATA NOT AVAILABLE');
    });
});
