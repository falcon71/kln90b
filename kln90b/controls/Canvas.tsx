import {NO_CHILDREN, UiElement} from "../pages/Page";
import {CHAR_HEIGHT, CHAR_HEIGHT_MAP, CHAR_WIDTH, CHAR_WIDTH_MAP, ZOOM_FACTOR} from "../data/Constants";
import {
    FSComponent,
    GeoCircle,
    GeoCircleResampler, GeoCircleResamplerVector,
    GeoPoint,
    GeoPointInterface, LatLonInterface,
    MapProjection,
    NodeReference, ReadonlyFloat64Array,
    UnitType,
    VNode,
} from "@microsoft/msfs-sdk";
import {Degrees, Latitude, Longitude, NauticalMiles} from "../data/Units";

/**
 * The canvas works with x and y coordinates in pixels, but we use it in a map drawing context, where the coordinate
 * systems uses latitude and longitude and maybe even rotation. This wrapper class takes care of the conversion between both systems.
 */
export class CoordinateCanvasDrawContext {
    private out1 = new Float64Array(2);
    private out2 = new Float64Array(2);
    private resampler: GeoCircleResampler;

    public constructor(private readonly ctx: CanvasDrawContext, private readonly projection: MapProjection) {
        const resampleDistance = projection.getRange() / 20; //Eyeballed this until it looked "nice"

        this.resampler = new GeoCircleResampler(resampleDistance, 0.25, 8);
    }

    public drawLine(from: LatLonInterface, to: LatLonInterface) {
        this.projection.project(from, this.out1);
        this.projection.project(to, this.out2);

        this.ctx.drawLine(Math.round(this.out1[0]), Math.round(this.out1[1]), Math.round(this.out2[0]), Math.round(this.out2[1]));
    }

    /**
     * Draws a line for a flightplanleg. The line will be shortened
     * @param from
     * @param to
     */
    public drawFlightplanLine(from: LatLonInterface, to: LatLonInterface) {
        this.projection.project(from, this.out1);
        this.projection.project(to, this.out2);

        this.ctx.drawLine(...this.shortenLine(Math.round(this.out1[0]), Math.round(this.out1[1]), Math.round(this.out2[0]), Math.round(this.out2[1]), 4));
    }


    public drawArc(circle: GeoCircle, from: LatLonInterface, to: LatLonInterface, dashed: boolean = false) {
        const lines: ReadonlyFloat64Array[] = [];


        const handler = (vector: Readonly<GeoCircleResamplerVector>) => {
            const copy = new Float64Array(2);
            copy[0] = vector.projected[0];
            copy[1] = vector.projected[1];
            lines.push(copy);
        };

        this.resampler.resample(this.projection.getGeoProjection(), circle, from, to, handler);

        for (let i = 1; i < lines.length; i++) {
            const from = lines[i - 1];
            const to = lines[i];
            this.ctx.drawLine(Math.round(from[0]), Math.round(from[1]), Math.round(to[0]), Math.round(to[1]), dashed);
        }

    }

    public drawArcWithArrow(circle: GeoCircle, from: LatLonInterface, to: LatLonInterface) {
        const lines: ReadonlyFloat64Array[] = [];

        const handler = (vector: Readonly<GeoCircleResamplerVector>) => {
            const copy = new Float64Array(2);
            copy[0] = vector.projected[0];
            copy[1] = vector.projected[1];
            lines.push(copy);
        };

        this.resampler.resample(this.projection.getGeoProjection(), circle, from, to, handler);

        for (let i = 1; i < lines.length; i++) {
            const from = lines[i - 1];
            const to = lines[i];
            if (i === lines.length - 1) {
                this.ctx.drawArrow(Math.round(from[0]), Math.round(from[1]), Math.round(to[0]), Math.round(to[1]));
            } else {
                this.ctx.drawLine(Math.round(from[0]), Math.round(from[1]), Math.round(to[0]), Math.round(to[1]));
            }
        }

    }

    /**
     * Draws an arrow a flightplanleg. The arrow will be shortened
     * @param from
     * @param to
     */
    public drawFlightplanArrow(from: LatLonInterface, to: LatLonInterface) {
        this.projection.project(from, this.out1);
        this.projection.project(to, this.out2);


        this.ctx.drawArrow(...this.shortenLine(Math.round(this.out1[0]), Math.round(this.out1[1]), Math.round(this.out2[0]), Math.round(this.out2[1]), 4));
    }

    /**
     * Draws a label at the next convenient location
     * @param coord
     * @param text
     */
    public drawLabel(coord: LatLonInterface, text: string) {
        this.projection.project(coord, this.out1);
        this.ctx.drawLabel(Math.round(this.out1[0]), Math.round(this.out1[1]), text);
    }

    /**
     * Draws an icon with the center at the coordinates
     * @param coord
     * @param text
     */
    public drawIcon(coord: LatLonInterface, text: string) {
        this.projection.project(coord, this.out1);
        this.ctx.drawIcon(Math.round(this.out1[0]), Math.round(this.out1[1]), text);
    }

    public fill() {
        this.ctx.fill();
    }

    /**
     * In the KLN, the lines don't got all the way to the label, instead leaving small gaps
     * @param x0
     * @param y0
     * @param x1
     * @param y1
     * @param distance
     * @private
     */
    private shortenLine(x0: number, y0: number, x1: number, y1: number, distance: number): [number, number, number, number] {
        let dx = x1 - x0;
        let dy = y1 - y0;
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length > 0) {
            dx /= length;
            dy /= length;
        }
        dx *= length - distance;
        dy *= length - distance;
        return [Math.round(x1 - dx), Math.round(y1 - dy), Math.round(x0 + dx), Math.round(y0 + dy)];
    }
}

const WORDSIZE = 32;

/**
 * We don't want to draw labels over lines. This set keeps track of painted pixels in a bitset and
 * can be queried how many pixels are empty in a rectangle in order to find a free space for labels.
 */
class Bitset {


    private readonly words: number[];

    constructor(public width: number, public height: number) {
        const size = width * height;

        this.words = Array(Math.ceil(size / WORDSIZE)).fill(0);

    }


    public fillPixel(x: number, y: number) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return;
        }

        const idx = y * this.width + x;
        const wordIdx = Math.floor(idx / WORDSIZE);
        const subIdx = idx % WORDSIZE;

        const word = this.words[wordIdx];
        const mask = 1 << subIdx;
        this.words[wordIdx] = (word | mask);
    }

    public fillRect(x: number, y: number, width: number, height: number) {
        for (let xx = x; xx < x + width; xx++) {
            for (let yy = y; yy < y + height; yy++) {
                this.fillPixel(xx, yy);
            }
        }
    }

    public isPixelClear(x: number, y: number): boolean {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return false;
        }
        const idx = y * this.width + x;
        const wordIdx = Math.floor(idx / WORDSIZE);
        const subIdx = idx % WORDSIZE;

        const word = this.words[wordIdx];
        const mask = 1 << subIdx;
        return (word & mask) == 0;

    }

    public getFreePixelsInRect(x: number, y: number, width: number, height: number): number {
        let freePixels = 0;

        for (let xx = x; xx < x + width; xx++) {
            for (let yy = y; yy < y + height; yy++) {
                if (this.isPixelClear(xx, yy)) {
                    freePixels++;
                }
            }
        }
        return freePixels;
    }

}

const ARROWLENGTH = 5; //The length of the arms of the arrow in pixels
const DASH_LENGTH = 3;

/**
 * Abstraction over the CanvasRenderingContext2D. This mainly converts between the kln pixel coordinates and the
 * actual pixel size of the HTML instrument. It draws pixelated lines and places smart labels.
 */
export class CanvasDrawContext {

    private readonly bitset;
    private dash: number = 0;

    constructor(private ctx: CanvasRenderingContext2D, public width: number, public height: number) {
        this.bitset = new Bitset(width, height);
    }

    /**
     * Before you start cursing, listen:
     * The normal drawline function is antialiased and way too pretty for the KLN90B.
     * Things I tried to get rid of antialiasing:
     * - Setting image-rendering: pixelated; in the css and trying different sizes together with ctx.scale (No Effect).
     * - Drawing to a smaller buffer canvas and copying it scaled up with ctx.imageSmoothingEnabled = false; (Creates huge round blobs).
     * Since the KLN Display has very few pixels, and we only need to render simple lines, I'm willing to draw them manually.
     *
     * https://en.wikipedia.org/wiki/Bresenham%27s_line_algorithm
     * @param x0
     * @param y0
     * @param x1
     * @param y1
     * @param dash If true, the line will be dashed. Only works when all dashed calles are consecutively
     * @private
     */
    public drawLine(x0: number, y0: number, x1: number, y1: number, dash: boolean = false) {
        if (Math.abs(y1 - y0) < Math.abs(x1 - x0)) {
            if (x0 > x1) {
                this.plotLineLow(x1, y1, x0, y0, dash);
            } else {
                this.plotLineLow(x0, y0, x1, y1, dash);
            }
        } else {
            if (y0 > y1) {
                this.plotLineHigh(x1, y1, x0, y0, dash)

            } else {
                this.plotLineHigh(x0, y0, x1, y1, dash)
            }
        }
    }

    public drawArrow(x0: number, y0: number, x1: number, y1: number) {
        this.drawLine(x0, y0, x1, y1);

        //Calculate the angle of the line when viewed as a right triangle
        const a = x0 - x1;
        const b = y0 - y1;
        const beta = Math.atan2(a, b);

        //Now we create two new right triangles with a 45° offset
        const newA = ARROWLENGTH * Math.cos(beta + (225 * Avionics.Utils.DEG2RAD));
        const newB = ARROWLENGTH * Math.cos(beta + (135 * Avionics.Utils.DEG2RAD));

        const roundedA = Math.round(newA);
        const roundedB = Math.round(newB);

        this.drawLine(x1, y1, x1 + roundedA, y1 - roundedB);
        this.drawLine(x1, y1, x1 - roundedB, y1 - roundedA);

    }

    /**
     * x and y are the positon of the element that the text describes. The actual position will me different,
     * because a location will be choosen where the least pixels are overdrawn.
     * @param x
     * @param y
     * @param text
     */
    public drawLabel(x: number, y: number, text: string) {
        const width = text.length * CHAR_WIDTH_MAP;
        const height = CHAR_HEIGHT_MAP;

        //Our coordinate system uses x and y for top left!

        const checks = [
            [x - width, y - height], //top left
            [x - width / 2, y - height], //top
            [x, y - height], //top right
            [x - width, Math.round(y - height / 2)], //left
            [x - width / 2, Math.round(y - height / 2)], //center
            [x, Math.round(y - height / 2)], //right
            [x - width, y], //bottom left
            [x - width / 2, y], //bottom
            [x, y], //bottom right
        ];

        const scores = checks.map(c => ({
            pos: c,
            score: this.getTextPositionScore(c[0], c[1], width, height),
        })).sort((a, b) => b.score - a.score);

        const bestX = scores[0].pos[0];
        const bestY = scores[0].pos[1];

        //In the real device, the labels have an outline of one pixel. This here does not look exactly right, but is still quite convincing
        this.ctx.strokeText(text, bestX * ZOOM_FACTOR, bestY * ZOOM_FACTOR);

        this.ctx.fillText(text, bestX * ZOOM_FACTOR, bestY * ZOOM_FACTOR);

        this.bitset.fillRect(bestX, bestY, width, height);

    }

    public drawIcon(centerX: number, centerY: number, text: string) {
        //The canvas coordinate system uses x and y for bottom left
        const length = text.length;
        const leftX = centerX - (CHAR_WIDTH_MAP * length / 2);
        const topY = centerY - CHAR_HEIGHT_MAP / 2;


        //In the real device, the labels have an outline of one pixel. This here does not look exactly right, but is still quite convincing
        this.ctx.strokeText(text, leftX * ZOOM_FACTOR, topY * ZOOM_FACTOR);

        this.ctx.fillText(text, leftX * ZOOM_FACTOR, topY * ZOOM_FACTOR);

        this.bitset.fillRect(leftX, topY, CHAR_WIDTH_MAP * length, CHAR_HEIGHT_MAP);

    }

    public fill() {
        //   this.ctx.fill();
    }

    private plot(x: number, y: number) {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
            return;
        }
        //using rect and a path, then the same pixel filled twice will not be rendered (E.g. runway crossings at EDDH)
        this.ctx.fillRect(x * ZOOM_FACTOR, y * ZOOM_FACTOR, ZOOM_FACTOR, ZOOM_FACTOR);
        this.bitset.fillPixel(x, y);
    }

    private plotLineLow(x0: number, y0: number, x1: number, y1: number, dash: boolean) {
        const dx = x1 - x0;
        let dy = y1 - y0;
        let yi = 1;
        if (dy < 0) {
            yi = -1;
            dy = -dy;
        }
        let D = (2 * dy) - dx;
        let y = y0;

        for (let x = x0; x < x1; x++) {
            if (dash) {
                this.dash = (this.dash + 1) % (DASH_LENGTH * 2);
                if (this.dash <= DASH_LENGTH) {
                    this.plot(x, y);
                }
            } else {
                this.plot(x, y);
            }
            if (D > 0) {
                y = y + yi;
                D = D + (2 * (dy - dx));
            } else {
                D = D + 2 * dy;
            }
        }
    }

    private plotLineHigh(x0: number, y0: number, x1: number, y1: number, dash: boolean) {
        let dx = x1 - x0;
        const dy = y1 - y0;
        let xi = 1;
        if (dx < 0) {
            xi = -1;
            dx = -dx;
        }
        let D = (2 * dx) - dy;
        let x = x0;

        for (let y = y0; y < y1; y++) {
            if (dash) {
                this.dash = (this.dash + 1) % (DASH_LENGTH * 2);
                if (this.dash <= DASH_LENGTH) {
                    this.plot(x, y);
                }
            } else {
                this.plot(x, y);
            }
            if (D > 0) {
                x = x + xi;
                D = D + (2 * (dx - dy));
            } else {
                D = D + 2 * dx;
            }
        }
    }

    private getTextPositionScore(x: number, y: number, width: number, height: number): number {
        let score = 0;

        score += Math.min(x * height, 0); //Pixels left out of Screen
        score += Math.min((this.width - (x + width)) * height, 0); //Pixels right out of Screen

        score += Math.min(y * width, 0); //Pixels top out of Screen
        score += Math.min((this.height - (y + height)) * width, 0); //Pixels bottom out of Screen

        return score + this.bitset.getFreePixelsInRect(x, y, width, height);
    }

}

export enum CanvasSize {
    HALFPAGE,
    FULLPAGE
}

export class Canvas implements UiElement {

    readonly children = NO_CHILDREN;

    protected readonly ref: NodeReference<HTMLCanvasElement> = FSComponent.createRef<HTMLCanvasElement>();

    private projection: MapProjection | undefined;

    constructor(private readonly size: CanvasSize = CanvasSize.HALFPAGE) {
    }

    /**
     * The map will be centered at lat and lon with the given range
     * Used by NAV 5 north up
     * @param center
     * @param range
     */
    public getDrawingContextWithCenterRange(center: GeoPointInterface, range: NauticalMiles): CoordinateCanvasDrawContext {
        const ctx = this.getDrawingContext();

        const offsetArr = new Float64Array(2);
        offsetArr[0] = 0;
        offsetArr[1] = 0;

        //3-35 Range is aircraft to top of the screen
        this.projection!.set({
            target: center,
            targetProjectedOffset: offsetArr,
            range: UnitType.NMILE.convertTo(range, UnitType.GA_RADIAN) * 2,
            rotation: 0,
        });


        return new CoordinateCanvasDrawContext(ctx, this.projection!);
    }

    /**
     * The center will offset be two thirds down the screen. Also applies the given range and rotation
     * Used by NAV 5 for everything except north up
     * @param center
     * @param range
     * @param rotation
     * @param offset How far the center point is down the screen
     */
    public getDrawingContextWithOffsetCenterRangeRotation(center: GeoPointInterface, range: NauticalMiles, rotation: Degrees, offset: number = 0.75): CoordinateCanvasDrawContext {
        const ctx = this.getDrawingContext();
        //3-35 Range is aircraft to top of the screen

        const offsetArr = new Float64Array(2);
        offsetArr[0] = 0;
        offsetArr[1] = ctx.height * (1 - offset);

        this.projection!.set({
            target: center,
            targetProjectedOffset: offsetArr,
            range: UnitType.NMILE.convertTo(range, UnitType.GA_RADIAN) / offset,
            rotation: -rotation * Avionics.Utils.DEG2RAD,
        });


        return new CoordinateCanvasDrawContext(ctx, this.projection!);
    }

    /**
     * The map will be drawn, so that all coordinates fit into the screen, together with a bit of padding for labels.
     * Used by APT 3
     * @param latMin
     * @param lonMin
     * @param latMax
     * @param lonMax
     * @param padding This factor expands the area to make space for labels around the map. A factor of two means, that only half of the screen will be drawn on.
     */
    public getDrawingContextWithBoundingBox(latMin: Latitude, lonMin: Longitude, latMax: Latitude, lonMax: Latitude, padding: number = 1.5): CoordinateCanvasDrawContext {
        const ctx = this.getDrawingContext();

        //If we want to do this exact, then we need to calculate the x range and the y range and take the larger one. This will do for now though
        const dist = new GeoPoint(latMin, lonMin).distance(new GeoPoint(latMax, lonMax));
        const latCenter = latMin + (latMax - latMin) / 2;
        const lonCenter = lonMin + (lonMax - lonMin) / 2;

        this.projection!.set({
            target: new GeoPoint(latCenter, lonCenter),
            range: dist * padding,
            rotation: 0,
        });

        return new CoordinateCanvasDrawContext(ctx, this.projection!);
    }

    public getWidth(): number {
        return this.ref.instance.width / ZOOM_FACTOR;
    }

    public getHeight(): number {
        return this.ref.instance.height / ZOOM_FACTOR;
    }

    public clear(): void {
        const ctx = this.ref.instance.getContext("2d")!;
        ctx.clearRect(0, 0, this.ref.instance.width, this.ref.instance.height);
    }

    public render(): VNode {
        return (<canvas ref={this.ref} class={this.size === CanvasSize.FULLPAGE ? "canvas-fullpage" : "canvas-halfpage"}
                        width={(this.size === CanvasSize.FULLPAGE ? CHAR_WIDTH * 17 - 5 : CHAR_WIDTH * 11) * ZOOM_FACTOR}
                        height={CHAR_HEIGHT * (this.size === CanvasSize.FULLPAGE ? 7 : 6) * ZOOM_FACTOR}>ERROR</canvas>);
    }

    tick(blink: boolean): void {
    }

    private getDrawingContext(): CanvasDrawContext {
        const ctx = this.ref.instance.getContext("2d")!;

        if (this.projection === undefined) {
            this.projection = new MapProjection(this.getWidth(), this.getHeight());
        }

        /*
        ctx.clearRect(0, 0, this.ref.instance.width, this.ref.instance.height);
        ctx.beginPath();
         */


        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, this.ref.instance.width, this.ref.instance.height);

        ctx.font = `${7 * ZOOM_FACTOR}px KLN90BMap`;
        ctx.textBaseline = "top";
        ctx.fillStyle = "#00D109";

        ctx.strokeStyle = "#000000";
        //ctx.strokeStyle = "#FF0000";
        //There seems to be a maximum that is rendered for strokeText
        ctx.lineWidth = ZOOM_FACTOR * 10;

        return new CanvasDrawContext(ctx, this.getWidth(), this.getHeight());
    }

}