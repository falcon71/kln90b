import {describe, expect, it} from 'vitest';
import {CanvasDrawContext} from '../../../kln90b/controls/Canvas';
import {ZOOM_FACTOR} from '../../../kln90b/data/Constants';
import {canvasToAscii, downsampled} from '../../harness/render/canvas';

/** A map of width x height display pixels, with the context set up as Canvas.tsx sets it up */
function map(width: number, height: number): {el: HTMLCanvasElement; ctx: CanvasDrawContext} {
    const el = document.createElement('canvas');
    el.width = width * ZOOM_FACTOR;
    el.height = height * ZOOM_FACTOR;
    const g = el.getContext('2d')!;
    g.font = `${7 * ZOOM_FACTOR}px KLN90BMap`;
    g.textBaseline = 'top';
    g.fillStyle = '#00D109';
    return {el, ctx: new CanvasDrawContext(g, width, height)};
}

describe('CanvasDrawContext.drawIcon', () => {
    // The real unit has whole pixels only. The aircraft diamond is rows 1 to 5 and columns 0 to 4 of its 7-pixel high,
    // 6-pixel wide cell, so centered on (5, 5) it covers display rows 3 to 7 and columns 3 to 7 (#446), each stroke one
    // pixel high.
    it('draws a symbol on whole display pixels, with its middle row on the center', () => {
        const {el, ctx} = map(11, 11);
        ctx.drawIcon(5, 5, '$');

        expect(downsampled(canvasToAscii(el)).split('\n')).toEqual([
            '...........',
            '...........',
            '...........',
            '.....#.....',
            '....###....',
            '...#####...',
            '....###....',
            '.....#.....',
            '...........',
            '...........',
            '...........',
            '',
        ]);
    });

    // Two digits take columns 0 to 4 and 6 to 10 of their two cells: the gap between them goes on the center (#446)
    it('centers a symbol of two characters on the gap between them', () => {
        const {el, ctx} = map(15, 9);
        ctx.drawIcon(7, 4, '25');

        expect(downsampled(canvasToAscii(el)).split('\n')).toEqual([
            '...............',
            '...###..#####..',
            '..#...#.#......',
            '......#.#......',
            '.....#..####...',
            '....#.......#..',
            '...#........#..',
            '..#####.####...',
            '...............',
            '',
        ]);
    });
});

/** The lit columns of the map, in order, as `downsampled` reads them */
function litColumns(el: HTMLCanvasElement): number[] {
    const rows = downsampled(canvasToAscii(el)).split('\n');
    return [...rows[0]].map((_, x) => x).filter(x => rows.some(row => row[x] === '#'));
}

// A map 7 pixels high leaves a label of a symbol on row 3 only the places left of, on, and right of the symbol: above
// and below it would leave the map. The + covers columns 18 to 22 of the symbol at column 20.
describe('CanvasDrawContext.drawLabel', () => {
    it('puts a label left of its symbol as far from it as one to the right would be (#446)', () => {
        const {el, ctx} = map(40, 7);
        ctx.drawIcon(20, 3, '+');
        ctx.drawLabel(20, 3, 'A');

        // The A in columns 13 to 17, the + in 19 to 21; on the right the A would be in 23 to 27
        expect(litColumns(el)).toEqual([13, 14, 15, 16, 17, 19, 20, 21]);
    });

    it('puts the label right of its symbol when a pixel is lit where it would go on the left (#446)', () => {
        const {el, ctx} = map(40, 7);
        ctx.drawLine(13, 3, 13, 4); // lights only (13, 3): a line leaves out its end point
        ctx.drawIcon(20, 3, '+');
        ctx.drawLabel(20, 3, 'A');

        expect(litColumns(el)).toEqual([13, 19, 20, 21, 23, 24, 25, 26, 27]);
    });
});

/** The lit rows of the map, in order, as `downsampled` reads them */
function litRows(el: HTMLCanvasElement): number[] {
    return downsampled(canvasToAscii(el)).split('\n').flatMap((row, y) => row.includes('#') ? [y] : []);
}

// A map 11 pixels wide leaves a label of the symbol at column 5 only the places above, on, and below the symbol: left
// and right of it would leave the map. The & is 5 pixels high, rows 13 to 17 of the symbol on row 15.
describe('CanvasDrawContext.drawLabel above and below', () => {
    it('puts a label above its symbol, its last row next to the top of the symbol', () => {
        const {el, ctx} = map(11, 30);
        ctx.drawIcon(5, 15, '&');
        ctx.drawLabel(5, 15, 'A');

        // The A in rows 6 to 12, the & in 13 to 17
        expect(litRows(el)).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
    });

    it('puts a label below its symbol as far from it as one above, when a pixel is lit where it would go above', () => {
        const {el, ctx} = map(11, 30);
        ctx.drawLine(5, 8, 5, 9); // lights only (5, 8): a line leaves out its end point
        ctx.drawIcon(5, 15, '&');
        ctx.drawLabel(5, 15, 'A');

        // The & in rows 13 to 17, the A in 18 to 24, not over the last row of the &
        expect(litRows(el)).toEqual([8, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]);
    });

    // The A fills columns 0 to 4 of its cell, so centered on column 5 it covers columns 3 to 7, as the & does
    it('centers a label above or below its symbol on its column (#446)', () => {
        const columnsOfRows = (el: HTMLCanvasElement, from: number, to: number) => {
            const rows = downsampled(canvasToAscii(el)).split('\n').slice(from, to + 1);
            return [...rows[0]].map((_, x) => x).filter(x => rows.some(row => row[x] === '#'));
        };
        const above = map(11, 30);
        above.ctx.drawIcon(5, 15, '&');
        above.ctx.drawLabel(5, 15, 'A');
        const below = map(11, 30);
        below.ctx.drawLine(5, 8, 5, 9);
        below.ctx.drawIcon(5, 15, '&');
        below.ctx.drawLabel(5, 15, 'A');

        expect(columnsOfRows(above.el, 13, 17)).toEqual([3, 4, 5, 6, 7]);
        expect(columnsOfRows(above.el, 6, 12)).toEqual([3, 4, 5, 6, 7]);
        expect(columnsOfRows(below.el, 18, 24)).toEqual([3, 4, 5, 6, 7]);
    });
});
