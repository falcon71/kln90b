import {NO_CHILDREN, UiElement} from "../pages/Page";
import {CHAR_HEIGHT, CHAR_HEIGHT_MAP, CHAR_WIDTH, CHAR_WIDTH_MAP, ZOOM_FACTOR} from "../data/Constants";
import {
    FSComponent,
    GeoCircle,
    GeoCircleResampler,
    GeoCircleResamplerVector,
    GeoPoint,
    GeoPointInterface,
    LatLonInterface,
    MapProjection,
    NodeReference,
    UnitType,
    VNode,
} from "@microsoft/msfs-sdk";
import {Degrees, Latitude, Longitude, NauticalMiles} from "../data/Units";


const ARROWLENGTH = 5; //The length of the arms of the arrow in pixels
const DASH_LENGTH = 3;
const SHORTEN_LENGTH = 4; //Gap between flightplan lines and the icons

/**
 * The canvas works with x and y coordinates in pixels, but we use it in a map drawing context, where the coordinate
 * systems uses latitude and longitude and maybe even rotation. This wrapper class takes care of the conversion between both systems.
 */
export class CoordinateCanvasDrawContext {
    private start = new Float64Array(2);
    private end = new Float64Array(2);
    private readonly circle = GeoCircle.createGreatCircle(this.start, this.end);

    private readonly lineResampler: GeoCircleResampler = new GeoCircleResampler(UnitType.NMILE.convertTo(10, UnitType.GA_RADIAN), 0.25, 8); //Only great circles here, does not need to be that accurate
    private readonly arcResampler: GeoCircleResampler;

    private readonly resamplerHandler: ResamplerHandler;


    public constructor(private readonly ctx: CanvasDrawContext, private readonly projection: MapProjection) {
        this.resamplerHandler = new ResamplerHandler(ctx);

        const arcResampleDistance = projection.getRange() / 20; //Eyeballed this until it looked "nice"
        this.arcResampler = new GeoCircleResampler(arcResampleDistance, 0.25, 8);
    }


    /**
     * Draws a simple line
     * @param from
     * @param to
     */
    public drawLine(from: LatLonInterface, to: LatLonInterface) {
        if (GeoPoint.equals(from, to)) {
            return;
        }

        this.projection.project(from, this.start);
        this.projection.project(to, this.end);
        if (!this.resamplerHandler.isLineVisible(Math.round(this.start[0]), Math.round(this.start[1]), Math.round(this.end[0]), Math.round(this.end[1]))) {
            return;
        }

        this.circle.setAsGreatCircle(from, to);
        this.resamplerHandler.initDraw(this.start, this.end, false, 0);
        this.lineResampler.resample(this.projection.getGeoProjection(), this.circle, from, to, this.resamplerHandler.handle.bind(this.resamplerHandler));
    }

    /**
     * Draws a line for a flightplanleg. The line will be shortened
     * @param from
     * @param to
     */
    public drawFlightplanLine(from: LatLonInterface, to: LatLonInterface) {
        if (GeoPoint.equals(from, to)) {
            return;
        }

        this.projection.project(from, this.start);
        this.projection.project(to, this.end);
        if (!this.resamplerHandler.isLineVisible(Math.round(this.start[0]), Math.round(this.start[1]), Math.round(this.end[0]), Math.round(this.end[1]))) {
            return;
        }

        this.circle.setAsGreatCircle(from, to);

        this.resamplerHandler.initDraw(this.start, this.end, false, SHORTEN_LENGTH);
        this.lineResampler.resample(this.projection.getGeoProjection(), this.circle, from, to, this.resamplerHandler.handle.bind(this.resamplerHandler));
    }

    /**
     * Draws an arrow for a flightplanleg. The arrow will be shortened
     * @param from
     * @param to
     */
    public drawFlightplanArrow(from: LatLonInterface, to: LatLonInterface) {
        if (GeoPoint.equals(from, to)) {
            return;
        }

        this.projection.project(from, this.start);
        this.projection.project(to, this.end);
        if (!this.resamplerHandler.isLineVisible(Math.round(this.start[0]), Math.round(this.start[1]), Math.round(this.end[0]), Math.round(this.end[1]))) {
            return;
        }

        this.circle.setAsGreatCircle(from, to);

        this.resamplerHandler.initDraw(this.start, this.end, false, SHORTEN_LENGTH);
        this.lineResampler.resample(this.projection.getGeoProjection(), this.circle, from, to, this.resamplerHandler.handle.bind(this.resamplerHandler));
        this.resamplerHandler.drawArrow();
    }

    public drawArc(circle: GeoCircle, from: LatLonInterface, to: LatLonInterface, dashed: boolean = false) {
        if (GeoPoint.equals(from, to)) {
            return;
        }

        this.projection.project(from, this.start);
        this.projection.project(to, this.end);

        this.resamplerHandler.initDraw(this.start, this.end, dashed, SHORTEN_LENGTH);
        this.arcResampler.resample(this.projection.getGeoProjection(), circle, from, to, this.resamplerHandler.handle.bind(this.resamplerHandler));

    }

    public drawArcWithArrow(circle: GeoCircle, from: LatLonInterface, to: LatLonInterface) {
        if (GeoPoint.equals(from, to)) {
            return;
        }

        this.projection.project(from, this.start);
        this.projection.project(to, this.end);

        this.resamplerHandler.initDraw(this.start, this.end, false, SHORTEN_LENGTH);
        this.arcResampler.resample(this.projection.getGeoProjection(), circle, from, to, this.resamplerHandler.handle.bind(this.resamplerHandler));
        this.resamplerHandler.drawArrow();
    }

    /**
     * Draws a label at the next convenient location
     * @param coord
     * @param text
     */
    public drawLabel(coord: LatLonInterface, text: string) {
        this.projection.project(coord, this.start);
        this.ctx.drawLabel(Math.round(this.start[0]), Math.round(this.start[1]), text);
    }

    /**
     * Draws an icon with the center at the coordinates
     * @param coord
     * @param text
     */
    public drawIcon(coord: LatLonInterface, text: string) {
        this.projection.project(coord, this.start);
        this.ctx.drawIcon(Math.round(this.start[0]), Math.round(this.start[1]), text);
    }

    public fill() {
        this.ctx.fill();
    }
}

/**
 * Draws a GC line after being process by the GeoCircleResampler
 */
class ResamplerHandler {

    private start: Int32Array = new Int32Array(2); //Start point of the whole GC line. Used when the line is shortened at the start and end
    private end: Int32Array = new Int32Array(2); //End point of the whole GC line. Used when the line is shortened at the start and end
    private dashed: boolean = false;
    private shorten: number = 0; //The KLN does not draw the flight plan lines right up to the waypoints, but leaves a few pixels of space

    private from: Int32Array | null = null; //The waypoint from the last section

    //Points that were last drawn, used to draw the arrow
    private lastDrawnFrom: Int32Array | null = null;
    private lastDrawnTo: Int32Array | null = null;

    constructor(private readonly ctx: CanvasDrawContext) {
    }

    public initDraw(start: Float64Array, end: Float64Array, dashed: boolean = false, shorten: number = 0): void {
        this.start.set([Math.round(start[0]), Math.round(start[1])]);
        this.end.set([Math.round(end[0]), Math.round(end[1])]);
        this.dashed = dashed;
        this.shorten = shorten;
        this.from = null;
        this.lastDrawnFrom = null;
        this.lastDrawnTo = null;
    }

    public handle(vector: Readonly<GeoCircleResamplerVector>): void {
        const from = this.from;
        const to = new Int32Array([Math.round(vector.projected[0]), Math.round(vector.projected[1])]);
        if (from === null || from == to) {
            this.from = to;
            return;
        }

        if (!this.isLineVisible(from[0], from[1], to[0], to[1])) {
            this.lastDrawnFrom = from; //We pretend we have drawn it, because the arrow would otherwise always be at the edge of the screen
            this.lastDrawnTo = to;
            this.from = to;
            return;
        }

        if (this.shorten == 0) {
            //The easy part, draw the line as it is
            this.drawLine(from, to);
            this.from = to;
            return;
        }

        //Now it gets hairy, we need to check if we need to shorten this line

        if (Math.abs(this.end[0] - this.start[0]) <= 2 * this.shorten && Math.abs(this.end[1] - this.start[1]) <= 2 * this.shorten) {
            this.from = to;
            return; //Line too short, we can't see anything. Also sanity check
        }

        const dx = to[0] - from[0];
        const dy = to[1] - from[1];

        //We only need to check one direction since we know dx and dy
        const startFromXDiff = (from[0] - this.start[0]) * Math.sign(dx);
        const startToXDiff = (to[0] - this.start[0]) * Math.sign(dx);

        const startFromYDiff = (from[1] - this.start[1]) * Math.sign(dy);
        const startToYDiff = (to[1] - this.start[1]) * Math.sign(dy);

        const endFromXDiff = (this.end[0] - from[0]) * Math.sign(dx);
        const endToXDiff = (this.end[0] - to[0]) * Math.sign(dx);

        const endFromYDiff = (this.end[1] - from[1]) * Math.sign(dy);
        const endToYDiff = (this.end[1] - to[1]) * Math.sign(dy);

        let shortenedFrom = from;
        let shortenedTo = to;

        if ((startToXDiff <= this.shorten && startToYDiff <= this.shorten) || (endFromXDiff <= this.shorten && endFromYDiff <= this.shorten)) {
            //Do nothing, whole segment in the no fly zone
            this.from = to;
            return;
        } else {
            //check start
            if (startFromXDiff > this.shorten || startFromYDiff > this.shorten) {
                //ok, draw like this
            } else {
                //Shorten start
                if (Math.abs(dx) > Math.abs(dy)) {
                    //X is more critical
                    const newX = this.start[0] + this.shorten * Math.sign(dx);
                    const newY = from[1] + dy * (newX - from[0]) / dx;

                    shortenedFrom = new Int32Array([newX, newY]);
                } else {
                    //Y is more critical
                    const newY = this.start[1] + this.shorten * Math.sign(dy);
                    const newX = from[0] + dx * (newY - from[1]) / dy;

                    shortenedFrom = new Int32Array([newX, newY]);
                }
            }

            //check end
            if (endToXDiff > this.shorten || endToYDiff > this.shorten) {
                //ok, draw like this
            } else {
                //We are near the end, shorten the end point and add it
                if (Math.abs(dx) > Math.abs(dy)) {
                    //X is more critical
                    const newX = this.end[0] - this.shorten * Math.sign(dx);
                    const newY = from[1] + dy * (newX - from[0]) / dx;

                    shortenedTo = new Int32Array([newX, newY]);
                } else {
                    //Y is more critical
                    const newY = this.end[1] - this.shorten * Math.sign(dy);
                    const newX = from[0] + dx * (newY - from[1]) / dy;

                    shortenedTo = new Int32Array([newX, newY]);
                }
            }
        }

        this.drawLine(shortenedFrom, shortenedTo);
        this.from = to;
    };

    public drawArrow() {
        if (this.lastDrawnFrom === null || this.lastDrawnTo === null) {
            return;
        }
        this.ctx.drawArrow(this.lastDrawnFrom[0], this.lastDrawnFrom[1], this.lastDrawnTo[0], this.lastDrawnTo[1]);
    }

    public isLineVisible(x0: number, y0: number, x1: number, y1: number): boolean {
        return (x0 >= 0 || x1 >= 0) &&
            (x0 <= this.ctx.width || x1 <= this.ctx.width) &&
            (y0 >= 0 || y1 >= 0) &&
            (y0 <= this.ctx.height || y1 <= this.ctx.height);
    }

    private drawLine(from: Int32Array, to: Int32Array) {
        this.ctx.drawLine(from[0], from[1], to[0], to[1], this.dashed);
        this.lastDrawnFrom = from;
        this.lastDrawnTo = to;
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

    /**
     * Draws only the arrow head, you will still need to call drawLine
     * @param x0
     * @param y0
     * @param x1
     * @param y1
     */
    public drawArrow(x0: number, y0: number, x1: number, y1: number) {
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
     * x and y are the positon of the element that the text describes. The actual position will be different,
     * because a location will be choosen where the least pixels are overdrawn.
     * @param x
     * @param y
     * @param text
     */
    public drawLabel(x: number, y: number, text: string) {
        const width = text.length * CHAR_WIDTH_MAP;
        const height = CHAR_HEIGHT_MAP;
        //Add a little bit of spacing for the symbol
        const offsetX = CHAR_WIDTH_MAP / 3;
        const offsetY = CHAR_HEIGHT_MAP / 3;

        //Our coordinate system uses x and y for top left!

        const checks = [
            [x - offsetX - width, y - offsetY - height], //top left
            [x - width / 2, y - offsetY - height], //top
            [x + offsetX, y - offsetY - height], //top right
            [x - offsetX - width, y - height / 2], //left
            [x - width / 2, y - height / 2], //center
            [x + offsetX, y - height / 2], //right
            [x - offsetX - width, y + offsetY], //bottom left
            [x - width / 2, y + offsetY], //bottom
            [x + offsetX, y + offsetY], //bottom right
        ];

        const scores = checks.map(c => ({
            pos: c,
            score: this.getTextPositionScore(Math.round(c[0]), Math.round(c[1]), width, height),
        })).sort((a, b) => b.score - a.score);

        const bestX = Math.round(scores[0].pos[0]);
        const bestY = Math.round(scores[0].pos[1]);

        //In the real device, the labels have an outline of one pixel. This here does not look exactly right, but is still quite convincing
        //this.ctx.strokeText(text, bestX * ZOOM_FACTOR, bestY * ZOOM_FACTOR);

        this.ctx.fillText(text, bestX * ZOOM_FACTOR, bestY * ZOOM_FACTOR);

        this.bitset.fillRect(bestX, bestY, width, height);

    }

    public drawIcon(centerX: number, centerY: number, text: string) {
        //The canvas coordinate system uses x and y for bottom left
        const length = text.length;
        const leftX = centerX - (CHAR_WIDTH_MAP * length / 2);
        const topY = centerY - CHAR_HEIGHT_MAP / 2;


        //In the real device, the labels have an outline of one pixel. This here does not look exactly right, but is still quite convincing
        //this.ctx.strokeText(text, leftX * ZOOM_FACTOR, topY * ZOOM_FACTOR);

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


        //ctx.fillStyle = "#000000";
        //ctx.fillRect(0, 0, this.ref.instance.width, this.ref.instance.height);
        ctx.clearRect(0, 0, this.ref.instance.width, this.ref.instance.height);

        ctx.font = `${7 * ZOOM_FACTOR}px KLN90BMap`;
        ctx.textBaseline = "top";
        ctx.fillStyle = "#00D109";

        //  ctx.strokeStyle = "#000000";
        //ctx.strokeStyle = "#FF0000";
        //There seems to be a maximum that is rendered for strokeText
        //ctx.lineWidth = ZOOM_FACTOR * 10;

        return new CanvasDrawContext(ctx, this.getWidth(), this.getHeight());
    }

}