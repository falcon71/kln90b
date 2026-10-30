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
    // The real unit has whole pixels only. The aircraft diamond is rows 1 to 5 of the 7-pixel glyph, so centered on
    // (5, 5) it covers display rows 3 to 7, each stroke one pixel high. Across, the glyph takes columns 0 to 4 of its
    // 6-pixel cell and the cell is centered, which puts the middle of the diamond one column left of the center.
    it('draws a symbol on whole display pixels, with its middle row on the center', () => {
        const {el, ctx} = map(11, 11);
        ctx.drawIcon(5, 5, '$');

        expect(downsampled(canvasToAscii(el)).split('\n')).toEqual([
            '...........',
            '...........',
            '...........',
            '....#......',
            '...###.....',
            '..#####....',
            '...###.....',
            '....#......',
            '...........',
            '...........',
            '...........',
            '',
        ]);
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
});
