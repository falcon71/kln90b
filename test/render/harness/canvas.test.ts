import {GlobalFonts} from '@napi-rs/canvas';
import {describe, expect, it} from 'vitest';
import {canvasToAscii} from '../../harness/render/canvas';

function canvas(width: number, height: number): HTMLCanvasElement {
    const el = document.createElement('canvas');
    el.width = width;
    el.height = height;
    return el;
}

describe('canvas backing', () => {
    it('draws exact pixels', () => {
        const el = canvas(6, 4);
        const ctx = el.getContext('2d')!;
        ctx.fillStyle = '#00D109';
        ctx.fillRect(1, 1, 3, 2);
        expect(canvasToAscii(el)).toBe(['......', '.###..', '.###..', '......'].join('\n'));
    });

    it('renders the map font inside the text box only', () => {
        expect(GlobalFonts.has('KLN90BMap')).toBe(true);
        const draw = (font: string): HTMLCanvasElement => {
            const c = canvas(40, 12);
            const g = c.getContext('2d')!;
            g.fillStyle = '#00D109';
            g.font = font;
            g.textBaseline = 'top';
            g.fillText('KLN', 2, 2);
            return c;
        };
        const el = draw('7px KLN90BMap');
        // A fallback font must not produce the same pixels, or the map font is not the one being used
        expect(canvasToAscii(el)).not.toBe(canvasToAscii(draw('7px sans-serif')));
        expect(canvasToAscii(el)).toMatchInlineSnapshot(`
          "........................................
          ........................................
          ..#...#.#.....#...#.....................
          ..#..#..#.....##..#.....................
          ..#.#...#.....##..#.....................
          ..##....#.....#.#.#.....................
          ..#.#...#.....#..##.....................
          ..#..#..#.....#..##.....................
          ..#...#.#####.#...#.....................
          ........................................
          ........................................
          ........................................"
        `);
        const rows = canvasToAscii(el).split('\n');
        const lit = rows.flatMap((r, y) => [...r].map((c, x) => ({c, x, y}))).filter(p => p.c === '#');
        expect(lit.length).toBeGreaterThan(10);
        // 3 glyphs of the 6-px map font start at x=2; nothing may be drawn left of x=2 or below row 11
        expect(lit.every(p => p.x >= 2 && p.x < 2 + 3 * 6 + 2 && p.y >= 2 && p.y < 11)).toBe(true);
    });
});
