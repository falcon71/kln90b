/// <reference types="node" />
import path from 'path';
import {Canvas as SkiaCanvas, createCanvas, GlobalFonts} from '@napi-rs/canvas';

const ASSETS = path.resolve(process.cwd(), 'resources/html_ui/Pages/VCockpit/Instruments/NavSystems/GPS/KLN90B/Assets');

/**
 * happy-dom has no 2D canvas (getContext('2d') returns null). This backs every canvas element with a Skia canvas of the
 * same size and registers the instrument's fonts under the names KLN90B.scss gives them.
 */
export function installCanvas(g: any): void {
    GlobalFonts.registerFromPath(path.join(ASSETS, 'kln90b.ttf'), 'KLN90B');
    GlobalFonts.registerFromPath(path.join(ASSETS, 'kln90b-map.ttf'), 'KLN90BMap');
    const backing = new WeakMap<object, SkiaCanvas>();
    g.HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string) {
        if (type !== '2d') return null;
        let canvas = backing.get(this);
        if (canvas === undefined || canvas.width !== this.width || canvas.height !== this.height) {
            canvas = createCanvas(this.width, this.height);
            backing.set(this, canvas);
        }
        return canvas.getContext('2d');
    };
}

/**
 * The canvas as rows of '#' (lit) and '.' (dark). A pixel is lit when its alpha reaches the threshold, which keeps
 * Skia's antialiased text edges stable.
 * @param el
 * @param threshold 0-255
 */
export function canvasToAscii(el: HTMLCanvasElement, threshold = 128): string {
    const ctx = el.getContext('2d') as unknown as CanvasRenderingContext2D;
    const {data, width, height} = ctx.getImageData(0, 0, el.width, el.height);
    const rows: string[] = [];
    for (let y = 0; y < height; y++) {
        let row = '';
        for (let x = 0; x < width; x++) {
            row += data[(y * width + x) * 4 + 3] >= threshold ? '#' : '.';
        }
        rows.push(row);
    }
    return rows.join('\n');
}

/**
 * The maps draw in blocks of ZOOM_FACTOR (4) canvas pixels (Canvas.tsx), so one character per block gives the pixels
 * the pilot sees and makes a map snapshot readable. A block is lit when at least half of its pixels are: the lines and
 * icons fill whole blocks, but where the map font lands within its block depends on the Skia version (@napi-rs/canvas
 * 1.0 drew every label one canvas row low), and lighting a block for any lit pixel would then draw each stroke of a
 * letter two pixels thick. Takes the output of canvasToAscii; a block cut off at the right or bottom edge counts the
 * pixels it has.
 */
export function downsampled(ascii: string, block = 4): string {
    const rows = ascii.split('\n');
    const out: string[] = [];
    for (let y = 0; y < rows.length; y += block) {
        let line = '';
        for (let x = 0; x < rows[y].length; x += block) {
            let lit = 0;
            let all = 0;
            for (const row of rows.slice(y, y + block)) {
                const cells = row.slice(x, x + block);
                all += cells.length;
                for (const cell of cells) if (cell === '#') lit++;
            }
            line += 2 * lit >= all ? '#' : '.';
        }
        out.push(line);
    }
    return out.join('\n') + '\n';
}
