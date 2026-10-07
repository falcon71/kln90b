import {describe, expect, it, vi} from 'vitest';
import {FixTypeFlags, LegTurnDirection} from '@microsoft/msfs-sdk';
import {bootUnit, moveAircraft, settle} from '../../../harness/boot';
import {airport, intersection, vor} from '../../../harness/navdata/builders';
import {approach, Leg, withProcedures} from '../../../harness/navdata/procedures';
import {canvasToAscii, downsampled} from '../../../harness/render/canvas';
import {Screen} from '../../../harness/render/screen';
import {savedFlightplan} from '../../../harness/storage';
import {courseDeg, LatLon, pointFrom} from '../../../harness/flight/geo';
import {standardRoute} from '../../../harness/fixtures';
import {recordMap} from '../../../harness/render/mapRecorder';

const RNAV = ApproachType.APPROACH_TYPE_RNAV;

describe('NAV 5 page', () => {
    // The same waypoint twice in a row (#19, #8) gives a flight plan leg without length, and the map projects it to
    // two identical points. Drawing it threw before the map skipped such legs (9f0b7e1).
    it('draws FPL 0 with the same waypoint twice in a row without an error (#8 9f0b7e1, characterization)', async () => {
        const kaaa = airport('KAAA', 46, 7);
        const abc = vor('ABC', 46.05, 7.05);
        const kbbb = airport('KBBB', 46.1, 7.1);
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb],
            position: {lat: 46, lon: 7},
            storage: savedFlightplan(0, [kaaa, abc, abc, kbbb]),
        });
        // The FPL activates at the first calculation tick with a GPS fix
        await settle(unit);
        await unit.panel.selectPage('L', 'NAV 5');
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.props.memory.navPage.activeWaypoint.getFutureLegs().map(l => l.wpt.icaoStruct.ident)).toEqual(['ABC', 'ABC', 'KBBB']);
        expect(unit.errors).toEqual([]);
        expect(Screen.read().status().left).toBe('NAV 5');
    });
});

/**
 * A DME arc around ABC from the 180 to the 270 radial (right, clockwise) or from the 270 to the 180 radial (left,
 * counterclockwise), through the south-west quarter. `arcEndNm` places the arc's end fix on its radial (on the circle,
 * 10 NM, by default); the rest of the approach lies on that radial, away from the VOR, unless `rest` places it.
 */
function arcApproach(turn: LegTurnDirection, o: {
    arcEndNm?: number, rest?: { faf: LatLon, map: LatLon, kprc: LatLon }
} = {}) {
    const abc = vor('ABC', 47.3, 8.3);
    const at = (bearing: number, nm: number) => pointFrom(abc, bearing, nm);
    const [from, to] = turn === LegTurnDirection.Right ? [180, 270] : [270, 180];
    const rest = o.rest ?? {faf: at(to, 14), map: at(to, 18), kprc: at(to, 18)};
    const arcbg = intersection('ARCBG', at(from, 10).lat, at(from, 10).lon);
    const arcen = intersection('ARCEN', at(to, o.arcEndNm ?? 10).lat, at(to, o.arcEndNm ?? 10).lon);
    const fafaa = intersection('FAFAA', rest.faf.lat, rest.faf.lon);
    const mapaa = intersection('MAPAA', rest.map.lat, rest.map.lon);
    const kprc = withProcedures(airport('KPRC', rest.kprc.lat, rest.kprc.lon), {
        approaches: [approach({
            type: RNAV, runway: '27',
            transitions: [{
                name: 'ARCBG', legs: [
                    Leg.IF(arcbg, FixTypeFlags.IAF),
                    Leg.AF(arcen, abc, {radiusNm: 10, fromRadial: from, toRadial: to, turn}),
                    Leg.TF(fafaa, FixTypeFlags.FAF),
                ],
            }],
            final: [Leg.TF(mapaa, FixTypeFlags.MAP)],
        })],
    });
    return {abc, at, kprc, facilities: [kprc, abc, arcbg, arcen, fafaa, mapaa]};
}

describe('NAV 5 page with a DME arc', () => {
    /**
     * Lit pixels of the NAV 5 canvas (396 x 312) in the four quarters around its center, less a margin of 8 px, and
     * `onRing(from, to)`: the lit pixels within 6 px of the 10 NM ring around ABC between two radials. The map is north
     * up with the aircraft in the middle and its range is the distance from the aircraft to the top of the screen
     * (Pilot's Guide 3-35), so 25 NM are half the canvas height (6.24 px per NM) and the 10 NM ring has a radius of 62.4
     * px. ABC is 0.5 NM west of the aircraft, which is the center of the canvas.
     */
    function readMap() {
        const rows = canvasToAscii(document.querySelector('canvas') as HTMLCanvasElement).split('\n');
        const width = rows[0].length, height = rows.length;
        const cx = Math.floor(width / 2), cy = Math.floor(height / 2);
        const lit = (x0: number, x1: number, y0: number, y1: number) => {
            let n = 0;
            for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (rows[y][x] === '#') n++;
            return n;
        };
        const pxPerNm = (height / 2) / 25;
        const onRing = (fromRadial: number, toRadial: number) => {
            let n = 0;
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    if (rows[y][x] !== '#') continue;
                    const dx = x + 0.5 - (width / 2 - 0.5 * pxPerNm), dy = y + 0.5 - height / 2;
                    const radial = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
                    if (Math.abs(Math.hypot(dx, dy) - 10 * pxPerNm) <= 6 && radial >= fromRadial && radial <= toRadial) n++;
                }
            }
            return n;
        };
        return {
            ne: lit(cx + 8, width, 0, cy - 8), sw: lit(0, cx - 8, cy + 8, height),
            nw: lit(0, cx - 8, 0, cy - 8), se: lit(cx + 8, width, cy + 8, height), onRing,
        };
    }

    // Spec: Pilot's Guide 6-17 (the arc is flown, and so drawn, in the direction of the procedure, here through the
    // south-west quarter from the 180 to the 270 radial). 15d9b35 reverses the circle for right-hand arcs; without it
    // the right arc is drawn the long way round, through the other three quarters, and fills the north-east quarter.
    // (Reverting all of 15d9b35 only moved the arrowhead, so it is the SidStar line that the break removes.)
    // The map is north up and 25 NM, centered on the aircraft 0.5 NM east of the VOR; the rest of the plan lies far
    // south-west, so nothing but the arc can reach the north-east quarter. The north-west quarter holds labels.
    it.each([
        ['right', LegTurnDirection.Right, 240, 254],
        ['left', LegTurnDirection.Left, 196, 208],
    ] as const)('draws a %s arc through the south-west quarter only (#18)', async (_name, turn, fromRadial, toRadial) => {
        const w = arcApproach(turn);
        const unit = await bootUnit({
            facilities: w.facilities, position: w.at(225, 10),
            storage: {...savedFlightplan(0, [w.kprc]), nav5MapOrientation: 0, nav5MapRange: 25},
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('ARCEN');
        // Not exactly onto the VOR: the unit throws there
        await moveAircraft(unit, pointFrom(w.abc, 90, 0.5), {groundspeedKt: 0});
        await unit.panel.selectPage('L', 'NAV 5');
        await vi.advanceTimersByTimeAsync(2000);

        const map = readMap();
        expect(unit.errors).toEqual([]);
        // Nothing the long way round, in the north-east quarter
        expect(map.ne).toBe(0);
        // The solid arc itself, in a window of the sector between the entry (225) and the arc's end that holds no labels
        // or other lines (right 240 to 254, left 196 to 208). The line is 4 px wide (one map pixel), so a full line is
        // the window's length on the 62.4 px ring times 4 and at least half of it must be lit (measured 71 and 58 of
        // about 61 and 52). The dashed arc from the beginning to the entry lies on the other side of the entry. Without
        // the solid arc (a map that stops drawing it) no pixel is left in the window.
        const fullLine = (toRadial - fromRadial) * Math.PI / 180 * 62.4 * 4;
        expect(map.onRing(fromRadial, toRadial)).toBeGreaterThan(fullLine / 2);
    });

    // characterization: pins what NAV 5 draws today, and claims nothing about the real unit.
    // e290ea4: the arrow of the active arc ends at the point of the circle closest to the end fix, `arcData.endPoint`.
    // The map used the end fix itself, which is not on the circle when the procedure puts it off the arc, and the
    // GeoCircle threw "the specified point does not lie on this circle". The fix is 3 NM outside the circle on purpose:
    // an offset of 0.3 or 1 NM draws the same pixels with the end fix instead of the end point, so only 3 NM lets the
    // snapshot see the line to the wrong point. The rest of the approach is the one of the procedure tests.
    it('draws the arrow of an arc whose end fix is off the circle to its end point (#17, characterization)', async () => {
        const w = arcApproach(LegTurnDirection.Right, {
            arcEndNm: 13,
            rest: {faf: {lat: 47.1, lon: 7.9}, map: {lat: 47.0, lon: 8.0}, kprc: {lat: 47.0, lon: 8.0}},
        });
        const unit = await bootUnit({
            facilities: w.facilities, position: w.at(225, 10),
            storage: {...savedFlightplan(0, [w.kprc]), nav5MapRange: 10},
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        // Precondition: ARCEN is active, so the map draws the arc with its arrow
        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('ARCEN');
        await unit.panel.selectPage('L', 'NAV 5');
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.errors).toEqual([]);
        expect(unit.consoleErrors).toEqual([]);
        await expect(downsampled(canvasToAscii(document.querySelector('canvas') as HTMLCanvasElement)))
            .toMatchFileSnapshot('./__snapshots__/nav5ArcEndOffCircle.txt');
    });
});

/** The standard route KAAA, ABC, KBBB in FPL 0, the aircraft at KAAA, NAV 5 on the left. */
async function nav5OnRoute(o: { storage?: Record<string, unknown>, panelXml?: string } = {}) {
    const w = standardRoute();
    const map = recordMap({KAAA: w.kaaa, ABC: w.abc, KBBB: w.kbbb});
    const unit = await bootUnit({
        facilities: [w.kaaa, w.abc, w.kbbb], position: {lat: w.kaaa.lat, lon: w.kaaa.lon},
        storage: {...savedFlightplan(0, [w.kaaa, w.abc, w.kbbb]), ...o.storage}, panelXml: o.panelXml,
    });
    await settle(unit);
    await unit.panel.selectPage('L', 'NAV 5');
    await vi.advanceTimersByTimeAsync(1000);
    return {unit, map, w};
}

const HEADING_INPUT_XML = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input><HeadingInput>true</HeadingInput></Input></Instrument></PlaneHTMLConfig>';

describe('NAV 5 page (characterization)', () => {
    it('shows FPL 0 north up at 40 NM with the aircraft 10 NM along the first leg', async () => {
        const w = standardRoute();
        const unit = await bootUnit({
            facilities: [w.kaaa, w.abc, w.kbbb], position: pointFrom(w.kaaa, courseDeg(w.kaaa, w.abc), 10),
            storage: savedFlightplan(0, [w.kaaa, w.abc, w.kbbb]),
        });
        await settle(unit);
        await unit.panel.selectPage('L', 'NAV 5');
        await vi.advanceTimersByTimeAsync(1000);

        const screen = Screen.read();
        const blank = ' '.repeat(11);
        expect(screen.rows('L')).toEqual([blank, blank, blank, blank, blank, 'N^       40']);
        expect(screen.maskRows('L')).toEqual(Array(6).fill('.'.repeat(11)));
        await expect(downsampled(canvasToAscii(document.querySelector('canvas') as HTMLCanvasElement)))
            .toMatchFileSnapshot('./__snapshots__/nav5Route.txt');
    });

    // The scales between 1 and 1000 NM are not known to be those of the real unit (the code says so itself), so this
    // pins the list the inner knob offers today, in its order, and claims nothing about the real unit.
    // the scales between 1 and 1000 NM are a question: #NEW-2-5
    it('NAV 5 range scales (characterization)', async () => {
        const {unit} = await nav5OnRoute({storage: {nav5MapRange: 1}});
        await unit.panel.cursor('L');
        await unit.panel.cursorTo('L', '1');

        const seen: string[] = [];
        for (let i = 0; i < 20; i++) {
            seen.push(unit.panel.focused('L').text.trim());
            await unit.panel.inner('L', 1);
        }
        expect(seen).toEqual([
            '1', '2', '3', '5', '10', '15', '20', '25', '30', '40', '60', '80', '100', '120', '160', '240', '320', '480', '1000',
            '1',
        ]);
    });
});

describe('NAV 5 page', () => {
    // 3-34, 3-35: FPL 0 waypoints are drawn with their number on the FPL 0 page, lines connect them, and an arrow points to
    // the active waypoint along the active leg. 3-35: north up and DTK up draw the aircraft as a diamond ("$" in the map
    // font). The aircraft is at KAAA, so the first leg is active and ABC is the active waypoint.
    it('draws the FPL 0 waypoints by number, the active leg as an arrow and the next leg as a line (3-34, 3-35)', async () => {
        const {unit, map} = await nav5OnRoute();
        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('ABC');

        expect(map.drawn).toEqual([
            'arrow KAAA ABC',
            'line ABC KBBB',
            'icon 1 KAAA',
            'icon 2 ABC',
            'icon 3 KBBB',
            'icon $ KAAA', // the diamond
        ]);
    });

    // 3-34 (figure 3-109): a Direct To waypoint that is not in FPL 0 is marked with a star ("%" in the map font), and the
    // arrow runs to it from where the Direct To started. The FPL 0 waypoints stay numbered. Whether the route lines stay
    // during such a Direct To is not asserted.
    it('marks an off-plan Direct To waypoint with the star and draws the arrow to it (3-34)', async () => {
        const w = standardRoute();
        const xyz = vor('XYZ', 47.2, 8.0);
        const map = recordMap({KAAA: w.kaaa, ABC: w.abc, KBBB: w.kbbb, XYZ: xyz});
        const unit = await bootUnit({
            facilities: [w.kaaa, w.abc, w.kbbb, xyz], position: {lat: w.kaaa.lat, lon: w.kaaa.lon},
            storage: savedFlightplan(0, [w.kaaa, w.abc, w.kbbb]),
        });
        await settle(unit);
        await unit.panel.dct();
        await unit.panel.enterIdent('L', 'XYZ');
        await unit.panel.ent();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('XYZ');
        await unit.panel.selectPage('L', 'NAV 5');
        await vi.advanceTimersByTimeAsync(1000);

        expect(map.drawn).toContain('arrow KAAA XYZ');
        expect(map.drawn.filter(d => d.startsWith('icon'))).toEqual([
            'icon % XYZ', // the star
            'icon 1 KAAA',
            'icon 2 ABC',
            'icon 3 KBBB',
            'icon $ KAAA',
        ]);
    });

    // 3-35 (figure 3-117): with NAV 5 on the left and a waypoint page on the right, the waypoint of that page is marked
    // with a small plus ("+" in the map font)
    it('marks the waypoint of the page on the right with "+" (3-35)', async () => {
        const w = standardRoute();
        const xyz = vor('XYZ', 47.2, 8.0);
        const map = recordMap({KAAA: w.kaaa, ABC: w.abc, KBBB: w.kbbb, XYZ: xyz});
        const unit = await bootUnit({
            facilities: [w.kaaa, w.abc, w.kbbb, xyz], position: {lat: w.kaaa.lat, lon: w.kaaa.lon},
            storage: savedFlightplan(0, [w.kaaa, w.abc, w.kbbb]),
        });
        await settle(unit);
        await unit.panel.selectPage('R', 'VOR  ');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'XYZ');
        await unit.panel.cursor('R');
        await unit.panel.selectPage('L', 'NAV 5');
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().rows('R')[0].slice(0, 5)).toBe(' XYZ ');

        expect(map.drawn[0]).toBe('icon + XYZ');
    });

    // 3-35: the range is the distance from the aircraft to the top of the map. North up the aircraft is in the middle
    // of the map (99 x 78 map pixels, center 49.5, 39), so at 10 NM a point 8 NM north is 8/10 of the 39 pixels above
    // it, at y = 39 - 31.2 = 7.8, and a point 8 NM east is 31.2 pixels right of it, at x = 80.7.
    it('draws north up with the range from the aircraft to the top (3-35)', async () => {
        const w = standardRoute();
        const n = pointFrom(w.kaaa, 0, 8), e = pointFrom(w.kaaa, 90, 8);
        const north = intersection('NORTH', n.lat, n.lon);
        const east = intersection('EAST', e.lat, e.lon);
        const map = recordMap();
        const unit = await bootUnit({
            facilities: [w.kaaa, north, east], position: {lat: w.kaaa.lat, lon: w.kaaa.lon},
            storage: {...savedFlightplan(0, [w.kaaa, north, east]), nav5MapRange: 10, nav5MapOrientation: 0},
        });
        await settle(unit);
        await unit.panel.selectPage('L', 'NAV 5');
        await vi.advanceTimersByTimeAsync(1000);

        const at = (sym: string) => map.pixels.find(p => p[0] === sym)!;
        expect(Math.abs(at('$')[1] - 49.5)).toBeLessThanOrEqual(1);
        expect(Math.abs(at('$')[2] - 39)).toBeLessThanOrEqual(1);
        expect(Math.abs(at('2')[1] - 49.5)).toBeLessThanOrEqual(1);
        expect(Math.abs(at('2')[2] - 7.8)).toBeLessThanOrEqual(1);
        expect(Math.abs(at('3')[1] - 80.7)).toBeLessThanOrEqual(1);
        expect(Math.abs(at('3')[2] - 39)).toBeLessThanOrEqual(1);
    });

    // 3-34, 3-35: desired track up turns the map so that the course points up. The range is still measured from the
    // aircraft to the top. The map puts the aircraft three quarters down (y = 58.5 of 78), so at 10 NM a waypoint 8 NM
    // ahead on the desired track of 060 is 8/10 of the 58.5 pixels above the aircraft, at x = 49.5, y = 11.7.
    it('draws desired track up with the course pointing up (3-34, 3-35)', async () => {
        const w = standardRoute();
        const ahead = pointFrom(w.kaaa, 60, 8);
        const wpt = intersection('AHEAD', ahead.lat, ahead.lon);
        const map = recordMap();
        const unit = await bootUnit({
            facilities: [w.kaaa, wpt], position: {lat: w.kaaa.lat, lon: w.kaaa.lon},
            storage: {...savedFlightplan(0, [w.kaaa, wpt]), nav5MapRange: 10, nav5MapOrientation: 1},
        });
        await settle(unit);
        await unit.panel.selectPage('L', 'NAV 5');
        await vi.advanceTimersByTimeAsync(1000);

        const at = (sym: string) => map.pixels.find(p => p[0] === sym)!;
        expect(Math.abs(at('$')[1] - 49.5)).toBeLessThanOrEqual(1);
        expect(Math.abs(at('$')[2] - 58.5)).toBeLessThanOrEqual(1);
        expect(Math.abs(at('2')[1] - 49.5)).toBeLessThanOrEqual(1);
        expect(Math.abs(at('2')[2] - 11.7)).toBeLessThanOrEqual(1);
    });

    // 3-35: actual track up and heading up draw the aircraft symbol instead of the diamond ("#" in the map font)
    it('draws the aircraft symbol track up (3-35)', async () => {
        const {unit, map} = await nav5OnRoute({storage: {nav5MapOrientation: 2}});
        await moveAircraft(unit, {lat: 47.05, lon: 8.05}, {groundspeedKt: 120, trackTrue: 90});
        await vi.advanceTimersByTimeAsync(500);

        expect(map.drawn.filter(d => d.startsWith('icon $') || d.startsWith('icon #'))).toEqual(['icon # 47.0500,8.0500']);
    });

    // 3-35, 3-38: the track up map can only be shown when the aircraft moves at 2 kt or more. Standing still, nothing
    // is drawn, and the orientation field has no track to show.
    it('draws nothing track up while the aircraft stands still (3-35, 3-38)', async () => {
        const {map} = await nav5OnRoute({storage: {nav5MapOrientation: 2}});
        map.reset();
        await vi.advanceTimersByTimeAsync(1000);

        expect(map.drawn).toEqual([]);
        expect(canvasToAscii(document.querySelector('canvas') as HTMLCanvasElement)).not.toContain('#');
        expect(Screen.read().rows('L')[5].slice(0, 4)).toBe('---°');
    });

    // 3-34, 3-35: away from the orientation field, DTK, TK and HDG up show their value with the degree sign in the
    // lower left; North up shows N with the up arrow. The DTK of the first leg is the course KAAA to ABC, 049.6 by
    // geo.ts, so 050.
    it.each([
        ['north up', 0, 'N^  '],
        ['desired track up', 1, '050°'],
    ] as const)('shows %s as the orientation value (3-34, 3-35)', async (_name, orientation, text) => {
        await nav5OnRoute({storage: {nav5MapOrientation: orientation}});

        expect(Screen.read().rows('L')[5].slice(0, 4)).toBe(text);
    });

    // 3-35 (figure 3-115): track up shows the actual track, here the 090 the aircraft moves on
    it('shows the actual track as the orientation value track up (3-35)', async () => {
        const {unit} = await nav5OnRoute({storage: {nav5MapOrientation: 2}});
        await moveAircraft(unit, {lat: 47.05, lon: 8.05}, {groundspeedKt: 120, trackTrue: 90});
        await vi.advanceTimersByTimeAsync(500);

        expect(Screen.read().rows('L')[5].slice(0, 4)).toBe('090°');
    });

    // 3-35: heading up shows the heading, here the gyro's 123
    it('shows the heading as the orientation value heading up (3-35)', async () => {
        const {unit} = await nav5OnRoute({storage: {nav5MapOrientation: 3}, panelXml: HEADING_INPUT_XML});
        unit.env.sim.set('PLANE HEADING DEGREES GYRO', 'degrees', 123);
        await vi.advanceTimersByTimeAsync(1500);

        expect(Screen.read().rows('L')[5].slice(0, 4)).toBe('123°');
    });

    // 3-34, 3-35: on the orientation field the inner knob offers N, DTK and TK up, and HDG up only with a heading
    // input. While the cursor is on the field it shows the choice with the up arrow.
    it.each([
        ['without', undefined, ['N^  ', 'DTK^', 'TK^ ']],
        ['with', HEADING_INPUT_XML, ['N^  ', 'DTK^', 'TK^ ', 'HDG^']],
    ] as const)('offers the orientations %s a heading input (3-34, 3-35)', async (_name, panelXml, choices) => {
        const {unit} = await nav5OnRoute({panelXml});
        await unit.panel.cursor('L');
        await unit.panel.cursorTo('L', 'N^');

        const seen: string[] = [];
        for (let i = 0; i < choices.length + 1; i++) {
            seen.push(unit.panel.focused('L').text);
            await unit.panel.inner('L', 1);
        }
        expect(seen).toEqual([...choices, 'N^  ']);
    });

    // 3-34: the left cursor on NAV 5 visits two fields, the orientation and the range scale. This is the passing
    // sibling of the pin below.
    it('visits the orientation and the range scale with the cursor (3-34)', async () => {
        const {unit} = await nav5OnRoute();
        await unit.panel.cursor('L');
        expect(Screen.read().status().left).toBe('CRSR');

        const seen = [unit.panel.focused('L')];
        await unit.panel.outer('L', 1);
        seen.push(unit.panel.focused('L'));
        await unit.panel.outer('L', 1);
        seen.push(unit.panel.focused('L'));

        expect(new Set(seen.slice(0, 2).map(f => `${f.row},${f.col},${f.text}`))).toEqual(new Set(['5,0,N^  ', '5,7,  40']));
        expect(seen[2]).toEqual(seen[0]);
    });

    // 3-34 (figure 3-110): the cursor first lands on the range scale; the orientation is one step counterclockwise
    it.fails('puts the cursor on the range scale first (3-34, #NEW-2-1)', async () => {
        const {unit} = await nav5OnRoute();
        await unit.panel.cursor('L');

        expect(unit.panel.focused('L')).toEqual({row: 5, col: 7, text: '  40'});
    });

    // 3-35 (figures 3-110, 3-116): range scales from 1 to 1000 NM with the inner knob on the range scale; the figures
    // show 40 and 15 among them
    it('offers range scales from 1 to 1000 NM (3-35)', async () => {
        const {unit} = await nav5OnRoute();
        await unit.panel.cursor('L');
        await unit.panel.cursorTo('L', '40');

        const seen = new Set<number>();
        for (let i = 0; i < 40; i++) {
            seen.add(Number(unit.panel.focused('L').text));
            await unit.panel.inner('L', 1);
        }
        expect(Math.min(...seen)).toBe(1);
        expect(Math.max(...seen)).toBe(1000);
        expect(seen.has(15)).toBe(true);
        expect(seen.has(40)).toBe(true);
    });
});
