import {describe, expect, it, vi} from 'vitest';
import {Facility, FixTypeFlags, VorClass} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../../harness/boot';
import {airport, intersection, ndb, vor} from '../../../harness/navdata/builders';
import {approach, Leg, withProcedures} from '../../../harness/navdata/procedures';
import {canvasToAscii, downsampled} from '../../../harness/render/canvas';
import {SuperNav5} from '../../../harness/render/superNav5';
import {recordMap} from '../../../harness/render/mapRecorder';
import {Screen} from '../../../harness/render/screen';
import {savedFlightplan, storedSetting} from '../../../harness/storage';
import {standardRoute} from '../../../harness/fixtures';
import {courseDeg, pointFrom} from '../../../harness/flight/geo';
import {MainPage} from '../../../../kln90b/pages/MainPage';
import {SuperNav5Page} from '../../../../kln90b/pages/left/SuperNav5Page';

const HEADING_INPUT_XML = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input><HeadingInput>true</HeadingInput></Input></Instrument></PlaneHTMLConfig>';

/** NAV 5 on both sides. The right side first: its shorter way passes NAV 5, which is Super NAV 5 once the left shows NAV 5 */
async function showSuperNav5(unit: HeadlessUnit): Promise<void> {
    await unit.panel.selectPage('R', 'NAV 4');
    await unit.panel.selectPage('L', 'NAV 5');
    await unit.panel.inner('R', 1);
    await vi.advanceTimersByTimeAsync(1000);
    expect((unit.props.pageManager.getCurrentPage() as MainPage).getOverlayPage()).toBeInstanceOf(SuperNav5Page);
}

/** The text of the field the cursor is on, in the left column or the right menu: the inverted span other than msg */
function focusedIn(selector: string): string[] {
    return [...document.querySelectorAll(`#pageContainer ${selector} .inverted`)]
        .filter(e => e.closest('.d-none') === null && e.textContent !== 'msg')
        .map(e => e.textContent!.replace(/ /g, ' '));
}

const focusedLeft = () => focusedIn('.super-nav5-left-controls');
const focusedRight = () => focusedIn('.super-nav5-right-controls');

/**
 * The standard route KAAA, ABC, KBBB in FPL 0, the aircraft at KAAA, plus a low altitude VOR LOW, a high altitude VOR
 * HIG, the NDB AB and the airport KAAB near it, so that every layer of the map has something to draw.
 */
function world() {
    const w = standardRoute();
    const low = vor('LOW', 47.1, 7.9, {vorClass: VorClass.LowAlt});
    const hig = vor('HIG', 46.9, 8.1);
    const ab = ndb('AB', 47.05, 8.15);
    const kaab = airport('KAAB', 46.95, 7.85);
    return {...w, low, hig, ab, kaab, facilities: [w.kaaa, w.abc, w.kbbb, low, hig, ab, kaab] as Facility[]};
}

async function superNav5OnRoute(o: { storage?: Record<string, unknown>, panelXml?: string } = {}) {
    const w = world();
    const map = recordMap({KAAA: w.kaaa, ABC: w.abc, KBBB: w.kbbb, LOW: w.low, HIG: w.hig, AB: w.ab, KAAB: w.kaab});
    const unit = await bootUnit({
        facilities: w.facilities, position: {lat: w.kaaa.lat, lon: w.kaaa.lon}, panelXml: o.panelXml,
        storage: {...savedFlightplan(0, [w.kaaa, w.abc, w.kbbb]), ...o.storage},
    });
    await settle(unit);
    await vi.advanceTimersByTimeAsync(12_000); // the nearest lists search every 10 s
    await showSuperNav5(unit);
    return {unit, map, w};
}

const ALL_LAYERS = {superNav5Vor: 3, superNav5Ndb: true, superNav5Apt: true}; // 3 = TLH

/** The labels of the last frame, in the order drawn */
const labels = (drawn: string[]) => drawn.filter(d => d.startsWith('label ')).map(d => d.split(' ')[1]);

describe('Super NAV 5 page (characterization)', () => {
    // The middle waypoint is an intersection where the VOR ABC of the other tests lies: a VOR of FPL 0 is labeled twice
    // with the VORs on (#NEW-2-2), and the snapshot must not hold that
    it('shows FPL 0 with every layer on, the aircraft 10 NM along the first leg at 120 kt', async () => {
        const w = world();
        const mid = intersection('ABCDE', w.abc.lat, w.abc.lon);
        const unit = await bootUnit({
            facilities: [...w.facilities.filter(f => f !== w.abc), mid], position: {lat: w.kaaa.lat, lon: w.kaaa.lon},
            storage: {...savedFlightplan(0, [w.kaaa, mid, w.kbbb]), ...ALL_LAYERS, superNav5MapRange: 15},
        });
        await settle(unit);
        const course = courseDeg(w.kaaa, mid);
        await moveAircraft(unit, pointFrom(w.kaaa, course, 10), {groundspeedKt: 120, trackTrue: course});
        await vi.advanceTimersByTimeAsync(12_000);
        await showSuperNav5(unit);

        expect(SuperNav5.read()).toMatchInlineSnapshot(`
          {
            "directTo": null,
            "left": [
              "37.5 È",
              "ABCDE",
              "Ê-Ë",
              " 120 É",
              "Ð0:19",
              "Ó051°",
              "Ö050°",
            ],
            "msg": "msg",
            "range": "15  ",
            "right": null,
          }
        `);
        const ascii = canvasToAscii(document.querySelector('canvas.canvas-fullpage') as HTMLCanvasElement);
        await expect(downsampled(ascii)).toMatchFileSnapshot('./__snapshots__/superNav5Route.txt');
    });

    // The scales between 1 and 1000 NM are not known to be those of the real unit (the code says so itself), so this
    // pins the list the inner knob offers today, in its order, and claims nothing about the real unit.
    // the scales between 1 and 1000 NM are a question: #NEW-2-5
    // The list has no 7 NM scale, although a figure of the guide's approach chapter shows AUTO at 7 NM; that goes into
    // the question as well.
    it('Super NAV 5 range scales (characterization)', async () => {
        const {unit} = await superNav5OnRoute({storage: {superNav5MapRange: 0}});
        await unit.panel.cursor('L');

        const seen: string[] = [];
        for (let i = 0; i < 21; i++) {
            seen.push(focusedLeft().join('').trim());
            await unit.panel.inner('L', 1);
        }
        expect(seen).toEqual([
            'AUTO', '1', '2', '3', '5', '10', '15', '20', '25', '30', '40', '60', '80', '100', '120', '160', '240', '320', '480', '1000',
            'AUTO',
        ]);
    });

    // The fourth row of the right menu shows 000 and N^ with north up. The menu figures only show a track value there,
    // so this is what the code shows, not what the real unit shows.
    it('shows the north-up menu row as 000° N^ (characterization)', async () => {
        const {unit} = await superNav5OnRoute();
        await unit.panel.cursor('R');

        expect(SuperNav5.read().right![3]).toBe(' 000° N^');
    });
});

describe('Super NAV 5 page', () => {
    // 3-36: the left cursor first lands on the map scale at the bottom left of the map; turning the left outer knob
    // counterclockwise moves it up over the three lines the pilot can configure. Distance, ident, mode and ground speed
    // are not fields.
    it('visits the map scale and the three configurable lines with the left cursor (3-36)', async () => {
        const {unit} = await superNav5OnRoute();
        await unit.panel.cursor('L');

        const seen = [focusedLeft()];
        for (let i = 0; i < 4; i++) {
            await unit.panel.outer('L', -1);
            seen.push(focusedLeft());
        }

        expect(seen).toEqual([['40  '], [' TK   '], ['DTK   '], ['ETE   '], ['40  ']]);
        expect(SuperNav5.read().left[0]).toBe('47.5 È');
    });

    // 3-36: the fifth line offers ETE, XTK or VNAV, the sixth DTK, BRG or the radial, the seventh TK, BRG or the radial
    it.each([
        ['fifth', 3, ['ETE', 'XTK', 'VNAV']],
        ['sixth', 2, ['DTK', 'BRG', 'RAD']],
        ['seventh', 1, ['TK', 'BRG', 'RAD']],
    ] as const)('offers the choices of the %s line (3-36)', async (_name, clicks, choices) => {
        const {unit} = await superNav5OnRoute();
        await unit.panel.cursor('L');
        await unit.panel.outer('L', -clicks);

        const seen: string[] = [];
        for (let i = 0; i < choices.length + 1; i++) {
            seen.push(focusedLeft().join('').trim());
            await unit.panel.inner('L', 1);
        }
        expect(seen).toEqual([...choices, choices[0]]);
    });

    // 3-36: the map scales are those of NAV 5 plus AUTO, which lies between the 1 and the 1000 NM scale
    it('puts AUTO between the 1 and the 1000 NM scale (3-36)', async () => {
        const {unit} = await superNav5OnRoute({storage: {superNav5MapRange: 1}});
        await unit.panel.cursor('L');
        const seen = [focusedLeft()];
        await unit.panel.inner('L', -1);
        seen.push(focusedLeft());
        await unit.panel.inner('L', -1);
        seen.push(focusedLeft());

        expect(seen.map(s => s.join('').trim())).toEqual(['1', 'AUTO', '1000']);
        // The scale picked with the knob is the scale the map takes: the saved setting is the number shown
        await vi.advanceTimersByTimeAsync(1000);
        expect(storedSetting(unit, 'superNav5MapRange')).toBe(1000);
    });

    // 3-37: the right cursor opens the menu with the cursor on the VOR selection; the right outer knob moves it over
    // NDB, APT and the orientation on the bottom line; the right cursor again removes the menu
    it('opens the menu on the VOR selection and closes it with the right cursor (3-37)', async () => {
        // Every field shows a different value, so that the order of the visit is visible: VOR: LH, NDB: ON, APT: OFF
        const {unit} = await superNav5OnRoute({storage: {superNav5Vor: 2, superNav5Ndb: true}});
        expect(SuperNav5.read().right).toBeNull();
        await unit.panel.cursor('R');

        const seen = [focusedRight()];
        for (let i = 0; i < 4; i++) {
            await unit.panel.outer('R', 1);
            seen.push(focusedRight());
        }
        expect(seen).toEqual([[' LH'], [' ON'], ['OFF'], [' N^'], [' LH']]);
        // The fourth row, the orientation, is left to the characterization above
        expect(SuperNav5.read().right!.slice(0, 3)).toEqual(['ÜVOR: LH', 'ÝNDB: ON', 'ŸAPT:OFF']);

        await unit.panel.cursor('R');
        expect(SuperNav5.read().right).toBeNull();
    });

    // 3-37: the VOR selection is TLH, LH, H or OFF; NDB and APT are ON or OFF; the orientations are those of NAV 5
    // (3-34), N, DTK and TK up, and HDG up only with a heading input
    it.each([
        ['without', undefined, ['N^', 'Ó^', 'Ö^']], // north up, then the DTK and TK glyphs of the map font
        ['with', HEADING_INPUT_XML, ['N^', 'Ó^', 'Ö^', 'Ú^']],
    ] as const)('offers the menu choices %s a heading input (3-37, 3-34)', async (_name, panelXml, orientations) => {
        const {unit} = await superNav5OnRoute({panelXml});
        await unit.panel.cursor('R');
        const choices = async (n: number) => {
            const seen = new Set<string>();
            for (let i = 0; i < n; i++) {
                seen.add(focusedRight().join('').trim());
                await unit.panel.inner('R', 1);
            }
            return seen;
        };

        expect(await choices(8)).toEqual(new Set(['OFF', 'H', 'LH', 'TLH']));
        await unit.panel.outer('R', 1);
        expect(await choices(4)).toEqual(new Set(['OFF', 'ON']));
        await unit.panel.outer('R', 1);
        expect(await choices(4)).toEqual(new Set(['OFF', 'ON']));
        await unit.panel.outer('R', 1);
        expect(await choices(8)).toEqual(new Set(orientations));
    });

    // 3-37: H draws only high altitude VORs, LH low and high altitude VORs, OFF none. (TLH and terminal VORs: #204 in
    // NearestList.test.ts.) The VOR symbol is ")" in the map font (a circle with a dot), and each VOR is labeled with
    // its identifier.
    it.each([
        ['OFF', 0, []],
        ['H', 1, ['HIG']],
        ['LH', 2, ['HIG', 'LOW']],
    ] as const)('draws the VORs of the class VOR: %s selects (3-37)', async (_name, setting, idents) => {
        const {map} = await superNav5OnRoute({storage: {superNav5Vor: setting}});

        const vors = map.drawn.filter(d => d.startsWith('icon )')).map(d => d.split(' ')[2]).sort();
        expect(vors).toEqual([...idents, ...(setting === 0 ? [] : ['ABC'])].sort());
    });

    // 3-37: NDB: ON draws the nearest NDBs (the smaller circle, "(" in the map font) and APT: ON the nearest airports
    // (the small diamond, "&"), each with its identifier. An airport of FPL 0 is drawn once, as a flight plan waypoint.
    it('draws the nearest NDBs and airports with their identifiers (3-37)', async () => {
        const {map} = await superNav5OnRoute({storage: {superNav5Ndb: true, superNav5Apt: true}});

        expect(map.drawn.filter(d => d.startsWith('icon (') || d.startsWith('icon &'))).toEqual(['icon ( AB', 'icon & KAAB']);
        expect(labels(map.drawn)).toEqual(['AB', 'KAAB', 'KAAA', 'ABC', 'KBBB']);
    });

    // 3-37: unlike NAV 5, Super NAV 5 labels the waypoints of the route with their identifiers. The route waypoints are
    // the square ("@" in the map font), the aircraft the diamond ("$").
    it('labels the FPL 0 waypoints with their identifiers (3-37)', async () => {
        const {map} = await superNav5OnRoute();

        expect(map.drawn).toEqual([
            'arrow KAAA ABC',
            'line ABC KBBB',
            'icon @ KAAA', 'label KAAA KAAA',
            'icon @ ABC', 'label ABC ABC',
            'icon @ KBBB', 'label KBBB KBBB',
            'icon $ KAAA',
        ]);
    });

    // 3-34, 3-35: desired track up turns the map so that the course points up, and 3-35: the range is the distance from
    // the aircraft to the top of the map. Where the aircraft sits on the map is the layout of the code, not a statement
    // of those pages: three quarters down. The map is 148 x 91 map pixels, so the aircraft is at (74, 68.25) and, at
    // 10 NM, a waypoint 8 NM ahead on the desired track of 060 is 8/10 of the 68.25 pixels above it, at (74, 13.65).
    it('draws desired track up with the course pointing up (3-34, 3-35)', async () => {
        const w = world();
        const ahead = pointFrom(w.kaaa, 60, 8);
        const wpt = intersection('AHEAD', ahead.lat, ahead.lon);
        const map = recordMap();
        const unit = await bootUnit({
            facilities: [w.kaaa, wpt], position: {lat: w.kaaa.lat, lon: w.kaaa.lon},
            storage: {...savedFlightplan(0, [w.kaaa, wpt]), superNav5MapRange: 10, superNav5MapOrientation: 1},
        });
        await settle(unit);
        await vi.advanceTimersByTimeAsync(12_000);
        await showSuperNav5(unit);

        const at = (sym: string) => map.pixels.find(p => p[0] === sym)!;
        expect(Math.abs(at('$')[1] - 74)).toBeLessThanOrEqual(1);
        expect(Math.abs(at('$')[2] - 68.25)).toBeLessThanOrEqual(1);
        const squares = map.pixels.filter(p => p[0] === '@'); // KAAA, then the waypoint ahead
        expect(squares).toHaveLength(2);
        expect(Math.abs(squares[1][1] - 74)).toBeLessThanOrEqual(1);
        expect(Math.abs(squares[1][2] - 13.65)).toBeLessThanOrEqual(1);
    });

    // The sibling of the pin below: with VOR: OFF the route labels ABC once, and with VOR: H ABC is a nearest VOR
    it('labels a VOR of FPL 0 with the VORs off, and draws it as a nearest VOR with VOR: H (3-37)', async () => {
        const off = await superNav5OnRoute();
        expect(labels(off.map.drawn).filter(l => l === 'ABC')).toEqual(['ABC']);
        await off.unit.panel.cursor('R');
        await off.unit.panel.inner('R', 1); // OFF to H
        await off.unit.panel.cursor('R');
        await vi.advanceTimersByTimeAsync(500);

        expect(off.map.drawn).toContain('icon ) ABC');
    });

    // 3-37 (figures 3-121 and 3-122): with the VORs on, the flight plan VOR LRP is labeled once
    it.fails('labels a VOR of FPL 0 once with the VORs on (3-37, #NEW-2-2)', async () => {
        const {map} = await superNav5OnRoute({storage: {superNav5Vor: 1}});

        expect(labels(map.drawn).filter(l => l === 'ABC')).toEqual(['ABC']);
    });

    // 3-38: CLR declutters the map: the VORs, NDBs and airports go, the route stays; CLR again brings them back
    it('declutters with CLR and restores with CLR again (3-38)', async () => {
        const {unit, map} = await superNav5OnRoute({storage: ALL_LAYERS});
        const full = labels(map.drawn);
        expect(full).toEqual(expect.arrayContaining(['LOW', 'HIG', 'AB', 'KAAB', 'KAAA', 'ABC', 'KBBB']));

        await unit.panel.clr();
        await vi.advanceTimersByTimeAsync(500);
        expect(labels(map.drawn)).toEqual(['KAAA', 'ABC', 'KBBB']);
        expect(map.drawn).toContain('arrow KAAA ABC');

        await unit.panel.clr();
        await vi.advanceTimersByTimeAsync(500);
        expect(labels(map.drawn)).toEqual(full);
    });

    // 3-38: pulling out the right inner knob opens a small window at the bottom right that starts on the active
    // waypoint, inverted; turning the knob steps through FPL 0 up to its last and down to its first waypoint, and
    // pushing the knob in closes the window again
    it('scans FPL 0 in the window of the pulled right inner knob (3-38)', async () => {
        const {unit} = await superNav5OnRoute();
        await unit.panel.scan();
        await vi.advanceTimersByTimeAsync(250);
        const window = () => document.querySelector('.super-nav5-directto-window')!;
        expect(SuperNav5.read().directTo).toBe('ABC   ');
        expect(window().classList.contains('inverted')).toBe(true);

        const seen: string[] = [];
        for (const step of [1, 1, -1, -1, -1]) {
            await unit.panel.inner('R', step);
            seen.push(SuperNav5.read().directTo!);
        }
        expect(seen).toEqual(['KBBB  ', 'KBBB  ', 'ABC   ', 'KAAA  ', 'KAAA  ']);

        await unit.panel.scan();
        await vi.advanceTimersByTimeAsync(250);
        expect(SuperNav5.read().directTo).toBeNull();
    });

    // 3-27 rule 2, 3-38: with the right inner knob pulled, the waypoint in the window is the default of Direct To
    it('offers the waypoint of the scan window on the DIRECT TO page (3-27, 3-38)', async () => {
        const {unit} = await superNav5OnRoute();
        await unit.panel.scan();
        await unit.panel.inner('R', 1);
        expect(SuperNav5.read().directTo).toBe('KBBB  ');

        await unit.panel.dct();
        await vi.advanceTimersByTimeAsync(250);

        const rows = Screen.read().rows('L');
        expect(rows[0].trim()).toBe('DIRECT TO:');
        expect(rows[2].trim()).toBe('KBBB');
    });

    // 3-38: at the 1 NM scale an airport is drawn as its runway diagram with every runway number, at the 2 NM scale with
    // the numbers of its longest runway only, and at larger scales as the airport symbol
    it.each([
        [1, ['09', '27', '18', '36'], false],
        [2, ['09', '27'], false],
        [3, [], true],
    ] as const)('draws the runways of a nearby airport at the %i NM scale (3-38)', async (range, numbers, symbol) => {
        const kaab = airport('KAAB', 47.0, 8.005, {runways: [{heading: 90, lengthFt: 6000}, {heading: 180, lengthFt: 4000}]});
        const map = recordMap({KAAB: kaab});
        const unit = await bootUnit({
            facilities: [kaab], position: {lat: 47.0, lon: 8.0},
            storage: {superNav5Apt: true, superNav5MapRange: range},
        });
        await settle(unit);
        await vi.advanceTimersByTimeAsync(12_000);
        await showSuperNav5(unit);

        const runwayNumbers = labels(map.drawn).filter(l => l !== 'KAAB');
        expect(runwayNumbers.sort()).toEqual([...numbers].sort());
        expect(map.drawn.includes('icon & KAAB')).toBe(symbol);
    });

    // 3-29, 4-8: during the waypoint alert the whole identifier of the active waypoint flashes on Super NAV 5. The
    // aircraft moves at 120 kt 0.5 NM before ABC, 15 s out, well inside the 36 s alert of a Direct To.
    it('flashes the active identifier during the waypoint alert (3-29, 4-8)', async () => {
        const w = world();
        const unit = await bootUnit({facilities: w.facilities, position: {lat: w.kaaa.lat, lon: w.kaaa.lon}});
        await settle(unit);
        await unit.panel.dct();
        await unit.panel.enterIdent('L', 'ABC');
        await unit.panel.ent();
        await unit.panel.ent();
        await moveAircraft(unit, pointFrom(w.abc, 180, 0.5), {groundspeedKt: 120, trackTrue: 0});
        await showSuperNav5(unit);
        expect(unit.props.memory.navPage.waypointAlert).toBe(true);

        const idents = new Set<string>();
        for (let i = 0; i < 8; i++) {
            idents.add(SuperNav5.read().left[1].trim());
            await vi.advanceTimersByTimeAsync(250);
        }
        expect(idents).toEqual(new Set(['ABC', '']));
    });
});

describe('Super NAV 5 AUTO scale', () => {
    // The scales 5 and 15 are shown in figures of the Pilot's Guide (5 NM on 6-8, 6-12 and 6-17; 15 NM in figure 3-116 on
    // 3-35), and 10 and 20 on photos of real units, so they are scales of the real unit. The list between them is not
    // known (the code's own list is a guess), so the distances below sit just under a scale (9.5 and 19.5 NM): the
    // expected scale then holds whether or not the real unit has a scale between.
    const P = {lat: 47.0, lon: 8.0};
    const at = (bearing: number, nm: number) => pointFrom(P, bearing, nm);
    const fix = (ident: string, bearing: number, nm: number) => intersection(ident, at(bearing, nm).lat, at(bearing, nm).lon);

    // 3-36: AUTO is the smallest scale that shows the active waypoint and the waypoint after it. Active A1 3 NM north,
    // A2 19.5 NM north: the smallest scale that reaches 19.5 NM north is 20. The map is drawn at the scale it shows:
    // north up, the aircraft is in the middle of the map (148 x 91 map pixels, center 74, 45.5) and the range is the
    // distance to the top, so A2 lies 19.5/20 of the 45.5 pixels above the center, at y = 45.5 - 44.36 = 1.14.
    it('takes the smallest scale that shows the waypoint after the active one (3-36)', async () => {
        const a0 = fix('AAAA', 180, 2), a1 = fix('AAAB', 0, 3), a2 = fix('AAAC', 0, 19.5);
        const map = recordMap();
        const unit = await bootUnit({
            facilities: [a0, a1, a2], position: P,
            storage: {...savedFlightplan(0, [a0, a1, a2]), superNav5MapRange: 0},
        });
        await settle(unit);
        await showSuperNav5(unit);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('AAAB');

        expect(SuperNav5.read().range.trim()).toBe('20');
        const squares = map.pixels.filter(p => p[0] === '@'); // the three waypoints of FPL 0, in order
        expect(squares).toHaveLength(3);
        expect(Math.abs(squares[2][1] - 74)).toBeLessThanOrEqual(1);
        expect(Math.abs(squares[2][2] - 1.14)).toBeLessThanOrEqual(1);
    });

    // 3-36: with no waypoint after the active one (a Direct To off the flight plan), AUTO shows the active waypoint:
    // 9.5 NM north takes the 10 NM scale. The map is drawn at that scale: the active waypoint ("%", the star of an
    // off-plan Direct To) lies 9.5/10 of the 45.5 pixels above the center, at y = 45.5 - 43.2 = 2.3.
    it('takes the smallest scale that shows the Direct To waypoint (3-36)', async () => {
        const dct = fix('AAAD', 0, 9.5);
        const map = recordMap();
        const unit = await bootUnit({facilities: [dct], position: P, storage: {superNav5MapRange: 0}});
        await settle(unit);
        await unit.panel.dct();
        await unit.panel.enterIdent('L', 'AAAD');
        await unit.panel.ent();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('AAAD');
        await showSuperNav5(unit);

        expect(SuperNav5.read().range.trim()).toBe('10');
        const star = map.pixels.find(p => p[0] === '%')!;
        expect(Math.abs(star[1] - 74)).toBeLessThanOrEqual(1);
        expect(Math.abs(star[2] - 2.3)).toBeLessThanOrEqual(1);
    });

    // The sibling of the pin below: the active waypoint is A1, 19.5 NM north, and A2 4 NM north-east comes after it.
    // 3-36 names the waypoint after the active one; which waypoint is active depends on the leg sequencing of 4-7 and
    // 4-8, here the first leg of the plan, so that the second waypoint is active and the third follows.
    it('activates the far waypoint before the near one (3-36, 4-7, 4-8)', async () => {
        const a0 = fix('AAAA', 180, 2), a1 = fix('AAAB', 0, 19.5), a2 = fix('AAAC', 45, 4);
        const unit = await bootUnit({
            facilities: [a0, a1, a2], position: P,
            storage: {...savedFlightplan(0, [a0, a1, a2]), superNav5MapRange: 0, turnAnticipation: false},
        });
        await settle(unit);
        await showSuperNav5(unit);

        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('AAAB');
        expect(unit.props.memory.navPage.activeWaypoint.getFollowingLeg()!.wpt.icaoStruct.ident).toBe('AAAC');
    });

    // 3-36: AUTO must also show the active waypoint, 19.5 NM north, when the waypoint after it is nearer (4 NM): 20
    it.fails('takes a scale that shows the active waypoint when the next one is nearer (3-36, #NEW-2-3)', async () => {
        const a0 = fix('AAAA', 180, 2), a1 = fix('AAAB', 0, 19.5), a2 = fix('AAAC', 45, 4);
        const unit = await bootUnit({
            facilities: [a0, a1, a2], position: P,
            storage: {...savedFlightplan(0, [a0, a1, a2]), superNav5MapRange: 0, turnAnticipation: false},
        });
        await settle(unit);
        await showSuperNav5(unit);

        expect(SuperNav5.read().range.trim()).toBe('20');
    });
});

describe('Super NAV 5 near the MAP', () => {
    /**
     * RNAV 18 to KPRC: FAFAA 5 NM north of MAPAA, MAPAA on the airport, the missed approach to MAHAA 5 NM east of MAPAA.
     * FPL 0 is ENRAA, KPRC with the approach loaded; the aircraft is 0.3 NM before the MAP on the final course and
     * MAPAA is active. (The world of onFinal in NavCalculator.test.ts.)
     */
    async function nearMap(storage: Record<string, unknown>) {
        const kprc = airport('KPRC', 47.0, 8.0);
        const mapaa = intersection('MAPAA', 47.0, 8.0);
        const fafPos = pointFrom(mapaa, 0, 5);
        const fafaa = intersection('FAFAA', fafPos.lat, fafPos.lon);
        const mahPos = pointFrom(mapaa, 90, 5);
        const mahaa = intersection('MAHAA', mahPos.lat, mahPos.lon);
        const enrPos = pointFrom(fafPos, 0, 20);
        const enraa = intersection('ENRAA', enrPos.lat, enrPos.lon);
        const apt = withProcedures(kprc, {
            approaches: [approach({
                type: ApproachType.APPROACH_TYPE_RNAV, runway: '18',
                transitions: [{name: 'FAFAA', legs: [Leg.IF(fafaa, FixTypeFlags.IAF)]}],
                final: [Leg.IF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
                missed: [Leg.TF(mahaa, FixTypeFlags.MAHP)],
            })],
        });
        const unit = await bootUnit({
            facilities: [apt, enraa, fafaa, mapaa, mahaa], position: pointFrom(mapaa, 0, 2),
            storage: {...savedFlightplan(0, [enraa, apt]), ...storage},
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        await moveAircraft(unit, pointFrom(mapaa, 0, 0.3), {groundspeedKt: 120, trackTrue: 180});
        await showSuperNav5(unit);
        return {unit};
    }

    // The sibling of the pin below: AUTO is selected, MAPAA is active 0.3 NM ahead and the missed approach fix MAHAA
    // follows it
    it('flies to the MAP with the missed approach after it (6-9)', async () => {
        const {unit} = await nearMap({superNav5MapRange: 0});
        const active = unit.props.memory.navPage.activeWaypoint;
        expect(active.getActiveWpt()!.icaoStruct.ident).toBe('MAPAA');
        expect(active.getFollowingLeg()!.wpt.icaoStruct.ident).toBe('MAHAA');
        expect(SuperNav5.read().left[0]).toBe(' 0.3 È');

        await unit.panel.cursor('L');
        expect(focusedLeft()).toEqual(['AUTO']);
    });

    // 6-9 (figure 6-16): 0.3 NM before the MAP the map shows the 1 NM scale, which is where the airport diagram is drawn.
    // AUTO takes the waypoint after the active one into account even when that is the missed approach.
    it.fails('takes the 1 NM scale 0.3 NM before the MAP (6-9, figure 6-16, #NEW-2-4)', async () => {
        const {unit} = await nearMap({superNav5MapRange: 0});
        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('MAPAA');

        expect(SuperNav5.read().range.trim()).toBe('1');
    });
});

describe('Super NAV 5 OBS course', () => {
    const OBS_SOURCE_0 = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input><ObsSource>0</ObsSource></Input></Instrument></PlaneHTMLConfig>';

    /**
     * The standard route with the aircraft at KAAA, in OBS mode on ABC with an OBS course of 050 (the DTK of the leg).
     * ObsSource 0: the unit has no external indicator, so the pilot enters the OBS course on the unit itself (5-34, 5-35).
     * The left cursor is on the OBS course, which is the field after the line that names the course.
     */
    async function onObsCourse() {
        const w = world();
        const unit = await bootUnit({
            facilities: w.facilities, position: {lat: w.kaaa.lat, lon: w.kaaa.lon}, panelXml: OBS_SOURCE_0,
            storage: savedFlightplan(0, [w.kaaa, w.abc, w.kbbb]),
        });
        await settle(unit);
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(2000);
        await showSuperNav5(unit);
        expect(SuperNav5.read().left[5]).toBe('Ù050°');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', -2);
        expect(focusedLeft()).toEqual(['050°']);
        return unit;
    }

    const overlay = (unit: HeadlessUnit) => (unit.props.pageManager.getCurrentPage() as MainPage).getOverlayPage();

    // 5-34, 5-35: the inner knob on the OBS course changes it by one degree. This is the passing sibling of the pin below:
    // turned left, the page stays and the course is one degree less.
    it('turns the OBS course down with the inner knob on Super NAV 5 (5-34, 5-35)', async () => {
        const unit = await onObsCourse();
        await unit.panel.inner('L', -1);

        expect(overlay(unit)).toBeInstanceOf(SuperNav5Page);
        expect(SuperNav5.read().left[5]).toBe('Ù049°');
    });

    // 5-34, 5-35: turned right, the course is one degree more and Super NAV 5 stays
    it.fails('turns the OBS course up with the inner knob and stays on Super NAV 5 (5-34, 5-35, #NEW-2-7)', async () => {
        const unit = await onObsCourse();
        await unit.panel.inner('L', 1);

        expect(overlay(unit)).toBeInstanceOf(SuperNav5Page);
        expect(SuperNav5.read().left[5]).toBe('Ù051°');
    });
});
