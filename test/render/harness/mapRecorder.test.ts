import {describe, expect, it, vi} from 'vitest';
import {bootUnit, settle} from '../../harness/boot';
import {recordMap} from '../../harness/render/mapRecorder';
import {canvasToAscii, downsampled} from '../../harness/render/canvas';
import {savedFlightplan} from '../../harness/storage';
import {standardRoute} from '../../harness/fixtures';
import {distanceNm, pointFrom} from '../../harness/flight/geo';

describe('recordMap (harness)', () => {
    /** NAV 5 on the left, north up at 40 NM, no flight plan: the map draws only the aircraft, at its center */
    async function nav5(names: Parameters<typeof recordMap>[0] = {}) {
        const map = recordMap(names);
        const unit = await bootUnit({position: {lat: 47, lon: 8}});
        await settle(unit);
        await unit.panel.selectPage('L', 'NAV 5');
        await vi.advanceTimersByTimeAsync(1000);
        return map;
    }

    // The map is 99 x 78 map pixels (the 396 x 312 canvas in blocks of 4); the aircraft at its center, rounded to a
    // whole map pixel
    it('records the symbols of the last complete redraw with their point and pixel', async () => {
        const map = await nav5();

        expect(map.drawn).toEqual(['icon $ 47.0000,8.0000']);
        expect(map.pixels).toEqual([['$', 50, 39]]);
    });

    it('names a point after the entry of names it equals', async () => {
        const map = await nav5({HOME: {lat: 47, lon: 8}});

        expect(map.drawn).toEqual(['icon $ HOME']);
    });

    // The first entry that matches wins, longitude counts, and the match is 1e-6 degrees, so a point 1e-3 degrees off
    // keeps its coordinates
    it('names a point by both coordinates, to 1e-6 degrees, and the first of two entries it equals', async () => {
        const map = await nav5({EAST: {lat: 47, lon: 8.5}, NEAR: {lat: 47, lon: 8.001}, HOME: {lat: 47, lon: 8}, SAME: {lat: 47, lon: 8}});

        expect(map.drawn).toEqual(['icon $ HOME']);
    });

    it('writes the coordinates of a point that is 1e-3 degrees off every name', async () => {
        const map = await nav5({NEAR: {lat: 47.001, lon: 8}, FAR: {lat: 47, lon: 8.001}});

        expect(map.drawn).toEqual(['icon $ 47.0000,8.0000']);
    });

    // The spies pass every call on: the canvas still shows the aircraft diamond around the center
    it('still draws: the canvas shows the aircraft symbol', async () => {
        await nav5();

        const lit = downsampled(canvasToAscii(document.querySelector('canvas') as HTMLCanvasElement)).split('\n')
            .flatMap((row, y) => [...row].map((c, x) => c === '#' ? `${x},${y}` : '')).filter(c => c !== '');
        expect(lit).toEqual(['49,36', '48,37', '49,37', '50,37', '47,38', '48,38', '49,38', '50,38', '51,38', '47,39', '48,39',
            '49,39', '50,39', '51,39', '48,40', '49,40', '50,40', '49,41']);
    });

    it('forgets the last frame on reset until the map draws again', async () => {
        const map = await nav5();

        map.reset();
        expect(map.drawn).toEqual([]);
        await vi.advanceTimersByTimeAsync(1000);
        expect(map.drawn).toEqual(['icon $ 47.0000,8.0000']);
    });
});

// The format of an entry (mapRecorder.ts): "icon <symbol> <point>", "label <text> <point>", "line <from> <to>" (a flight
// plan leg), "arrow <from> <to>" (the active leg, or a direct to) and "plain <from> <to>" (the OBS course line). The
// calls of one redraw are listed in the order the page makes them.
describe('recordMap with a flight plan (harness)', () => {
    /** FPL 0 is KAAA, ABC, KBBB with the aircraft at KAAA, so the active leg is KAAA to ABC */
    async function flightplan() {
        const {kaaa, abc, kbbb} = standardRoute();
        const map = recordMap({KAAA: kaaa, ABC: abc, KBBB: kbbb});
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb], position: {lat: kaaa.lat, lon: kaaa.lon}, storage: savedFlightplan(0, [kaaa, abc, kbbb]),
        });
        await settle(unit);
        return {map, unit};
    }

    // 3-35: NAV 5 draws the flight plan with the active leg as an arrow, the other legs as lines, and the waypoints
    // numbered by their leg, with the aircraft last
    it('records the arrow of the active leg, the line of the next, the numbered waypoints and the aircraft on NAV 5', async () => {
        const {map, unit} = await flightplan();
        await unit.panel.selectPage('L', 'NAV 5');
        await vi.advanceTimersByTimeAsync(1000);

        expect(map.drawn).toEqual(['arrow KAAA ABC', 'line ABC KBBB', 'icon 1 KAAA', 'icon 2 ABC', 'icon 3 KBBB', 'icon $ KAAA']);
    });

    // 3-36: Super NAV 5 labels each waypoint with its ident
    it('records the labels of the waypoints on Super NAV 5', async () => {
        const {map, unit} = await flightplan();
        await unit.panel.selectPage('R', 'NAV 4');
        await unit.panel.selectPage('L', 'NAV 5');
        await unit.panel.inner('R', 1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(map.drawn).toEqual(['arrow KAAA ABC', 'line ABC KBBB', 'icon @ KAAA', 'label KAAA KAAA', 'icon @ ABC', 'label ABC ABC',
            'icon @ KBBB', 'label KBBB KBBB', 'icon $ KAAA']);
    });

    // 5-34: in OBS mode the map shows the course line through the waypoint, one call for each side of it
    it('records the plain lines of the OBS course through the active waypoint', async () => {
        const {kaaa, abc, kbbb} = standardRoute();
        // Each line runs from the waypoint, 40 NM (the range of NAV 5) plus the distance to it, along the course and
        // back along its reciprocal; the course is the default 000 (checked below). The ends are named by the points the
        // textbook geometry (flight/geo.ts) puts there.
        const reach = 40 + distanceNm(kaaa, abc);
        const map = recordMap({KAAA: kaaa, ABC: abc, KBBB: kbbb, AHEAD: pointFrom(abc, 0, reach), BEHIND: pointFrom(abc, 180, reach)});
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb], position: {lat: kaaa.lat, lon: kaaa.lon}, storage: savedFlightplan(0, [kaaa, abc, kbbb]),
        });
        await settle(unit);
        await unit.panel.obsMode();
        expect(unit.props.modeController.getObsTrue()).toBe(0);
        await unit.panel.selectPage('L', 'NAV 5');
        await vi.advanceTimersByTimeAsync(1000);

        expect(map.drawn).toEqual(['plain ABC AHEAD', 'plain ABC BEHIND', 'icon 1 KAAA', 'icon 2 ABC', 'icon 3 KBBB', 'icon $ KAAA']);
    });
});

describe('downsampled (harness)', () => {
    it('gives one character per block, lit when any pixel of the block is, also for a cut-off block', () => {
        expect(downsampled(['#.......', '........', '........', '........', '.....#..'].join('\n'))).toBe('#.\n.#\n');
    });

    // A block of 2 pixels: the lit pixel at x = 3, y = 2 lights the block at column 1, row 1, and nothing else
    it('takes the block size as a parameter', () => {
        expect(downsampled(['........', '........', '...#....', '........'].join('\n'), 2)).toBe('....\n.#..\n');
    });

    it('lights a block for a pixel in any of its rows, not only the first', () => {
        expect(downsampled(['........', '........', '........', '...#....'].join('\n'))).toBe('#.\n');
    });
});
