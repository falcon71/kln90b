import {describe, expect, it, vi} from 'vitest';
import {bootUnit, settle} from '../../harness/boot';
import {recordMap} from '../../harness/render/mapRecorder';
import {canvasToAscii, downsampled} from '../../harness/render/canvas';

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

describe('downsampled (harness)', () => {
    it('gives one character per block, lit when any pixel of the block is, also for a cut-off block', () => {
        expect(downsampled(['#.......', '........', '........', '........', '.....#..'].join('\n'))).toBe('#.\n.#\n');
    });

    it('lights a block for a pixel in any of its rows, not only the first', () => {
        expect(downsampled(['........', '........', '........', '...#....'].join('\n'))).toBe('#.\n');
    });
});
