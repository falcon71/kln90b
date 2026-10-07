import {onTestFinished, vi} from 'vitest';
import {LatLonInterface} from '@microsoft/msfs-sdk';
import {CanvasDrawContext, CoordinateCanvasDrawContext} from '../../../kln90b/controls/Canvas';

/**
 * Records what the maps (NAV 5, Super NAV 5, APT 3) draw, one frame per redraw, at the level of the drawing context:
 * which symbol or label is drawn at which point, and which flight plan legs are drawn as lines or arrows. The calls
 * still draw, so the canvas is unchanged. A point is named after the first entry of `names` it equals (to 1e-6
 * degrees), and written as "lat,lon" otherwise. `pixels` holds the pixel position of every symbol of the frame
 * (CanvasDrawContext.drawIcon: the center in map pixels, 4 canvas pixels each).
 *
 * Install it before the boot: the spies are restored when the test finishes, after the teardown.
 */
export function recordMap(names: Record<string, LatLonInterface> = {}) {
    let frame: string[] = [];
    let pixels: [string, number, number][] = [];
    let last: { drawn: string[], pixels: [string, number, number][] } = {drawn: [], pixels: []};

    const name = (p: LatLonInterface): string => {
        for (const [n, q] of Object.entries(names)) {
            if (Math.abs(p.lat - q.lat) < 1e-6 && Math.abs(p.lon - q.lon) < 1e-6) return n;
        }
        return `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;
    };

    const geo = CoordinateCanvasDrawContext.prototype as any;
    const wrap = (proto: any, method: string, log: (...args: any[]) => void) => {
        const orig = proto[method];
        const spy = vi.spyOn(proto, method).mockImplementation(function (this: unknown, ...args: unknown[]) {
            log(...args);
            return orig.apply(this, args);
        });
        onTestFinished(() => spy.mockRestore());
    };
    wrap(geo, 'drawIcon', (c: LatLonInterface, t: string) => frame.push(`icon ${t} ${name(c)}`));
    wrap(geo, 'drawLabel', (c: LatLonInterface, t: string) => frame.push(`label ${t} ${name(c)}`));
    wrap(geo, 'drawFlightplanLine', (a: LatLonInterface, b: LatLonInterface) => frame.push(`line ${name(a)} ${name(b)}`));
    wrap(geo, 'drawFlightplanArrow', (a: LatLonInterface, b: LatLonInterface) => frame.push(`arrow ${name(a)} ${name(b)}`));
    wrap(geo, 'drawLine', (a: LatLonInterface, b: LatLonInterface) => frame.push(`plain ${name(a)} ${name(b)}`));
    wrap(geo, 'fill', () => {
        last = {drawn: frame, pixels};
        frame = [];
        pixels = [];
    });
    wrap(CanvasDrawContext.prototype, 'drawIcon', (x: number, y: number, t: string) => pixels.push([t, x, y]));

    return {
        /** The calls of the last complete redraw, in order */
        get drawn(): string[] {
            return last.drawn;
        },
        /** [symbol, x, y] of every symbol of the last complete redraw, in map pixels */
        get pixels(): [string, number, number][] {
            return last.pixels;
        },
        /** Forgets the last frame, so that a test can tell a map that stopped drawing from an old frame */
        reset(): void {
            last = {drawn: [], pixels: []};
            frame = [];
            pixels = [];
        },
    };
}
