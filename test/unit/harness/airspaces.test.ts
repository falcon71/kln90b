import {describe, expect, it} from 'vitest';
import {BitFlags, BoundaryFacility, BoundaryType, DefaultLodBoundaryCache, FacilitySearchType, LodBoundary, UnitType} from '@microsoft/msfs-sdk';
import {airspace, arcSectorAirspace, circularAirspace, distanceToBoxNm, multiShapeAirspace} from '../../harness/navdata/airspaces';
import {distanceNm} from '../../harness/flight/geo';
import {MemoryFacilityClient} from '../../harness/navdata/MemoryFacilityClient';
import {BoundaryUtils} from '../../../kln90b/data/navdata/BoundaryUtils';
import {resetSingletons} from '../../harness/singletons';

const nm = (n: number) => UnitType.NMILE.convertTo(n, UnitType.METER);
const mask = (...types: BoundaryType[]) => BitFlags.union(...types.map(t => BitFlags.createFlag(t)));
const names = (list: readonly BoundaryFacility[]) => list.map(a => a.name);

/** A square of half-size d degrees */
const square = (lat: number, lon: number, d: number): [number, number][] => [[lat + d, lon - d], [lat + d, lon + d], [lat - d, lon + d], [lat - d, lon - d]];

async function boundarySession(...airspaces: BoundaryFacility[]) {
    return await new MemoryFacilityClient([], airspaces).startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Boundary);
}

describe('MemoryFacilityClient boundary session', () => {
    const restricted = airspace('R-NEAR', BoundaryType.Restricted, square(47.0, 8.0, 0.1));

    it('returns an airspace whose bounding box meets the search circle, and not one beyond it', async () => {
        const far = airspace('R-FAR', BoundaryType.Restricted, square(49.0, 8.0, 0.1));
        const session = await boundarySession(restricted, far);

        // The box of R-NEAR reaches up to 47.1N, 24 NM from 47.5N; R-FAR starts at 48.9N, 84 NM away
        const result = await session.searchNearest(47.5, 8.0, nm(30), 10);

        expect(names(result.added)).toEqual(['R-NEAR']);
    });

    it('selects by bounding box, not by the polygon', async () => {
        // A triangle: the north-east corner of its box is empty, several NM from the nearest edge (the search radius is 1 NM)
        const triangle = airspace('R-TRI', BoundaryType.Restricted, [[47.1, 8.0], [47.0, 8.1], [47.0, 8.0]]);
        const session = await boundarySession(triangle);

        const result = await session.searchNearest(47.1, 8.1, nm(1), 10);

        expect(names(result.added)).toEqual(['R-TRI']);
    });

    it('measures the distance to the box as zero inside and as the distance to the nearest box point outside', () => {
        expect(distanceToBoxNm(47.0, 8.0, restricted)).toBe(0);
        expect(distanceToBoxNm(47.5, 8.0, restricted)).toBeCloseTo(24, 0);
        expect(distanceToBoxNm(47.1, 8.5, restricted)).toBeCloseTo(0.4 * 60 * Math.cos(47.1 * Math.PI / 180), 0);
    });

    it('does not return a type outside the mask', async () => {
        const moa = airspace('MOA-1', BoundaryType.MOA, square(47.0, 8.0, 0.1));
        const session = await boundarySession(restricted, moa);
        session.setBoundaryFilter(mask(BoundaryType.MOA));

        const result = await session.searchNearest(47.0, 8.0, nm(10), 10);

        expect(names(result.added)).toEqual(['MOA-1']);
    });

    it('lists an airspace as added once and as removed by id when the search moves away', async () => {
        const session = await boundarySession(restricted);

        const first = await session.searchNearest(47.0, 8.0, nm(10), 10);
        const second = await session.searchNearest(47.0, 8.0, nm(10), 10);
        const away = await session.searchNearest(49.0, 8.0, nm(10), 10);
        const again = await session.searchNearest(49.0, 8.0, nm(10), 10);

        expect(names(first.added)).toEqual(['R-NEAR']);
        expect([second.added, second.removed]).toEqual([[], []]);
        expect([away.added, away.removed]).toEqual([[], [restricted.id]]);
        expect([again.added, again.removed]).toEqual([[], []]);
    });

    it('lists an airspace hidden by a new type mask as removed', async () => {
        const session = await boundarySession(restricted);
        await session.searchNearest(47.0, 8.0, nm(10), 10);
        session.setBoundaryFilter(mask(BoundaryType.MOA));

        const result = await session.searchNearest(47.0, 8.0, nm(10), 10);

        expect(result.removed).toEqual([restricted.id]);
    });

    it('sorts by distance and cuts the farther ones at maxItems', async () => {
        const a = airspace('A-NEAR', BoundaryType.Restricted, square(47.0, 8.0, 0.05));
        const b = airspace('B-MID', BoundaryType.Restricted, square(47.3, 8.0, 0.05));
        const c = airspace('C-FAR', BoundaryType.Restricted, square(47.6, 8.0, 0.05));
        const session = await boundarySession(c, a, b);

        const result = await session.searchNearest(47.0, 8.0, nm(100), 2);

        expect(names(result.added)).toEqual(['A-NEAR', 'B-MID']);
    });

    it('serves an airspace added after the session started', async () => {
        const client = new MemoryFacilityClient();
        const session = await client.startNearestSearchSessionWithIcaoStructs(FacilitySearchType.Boundary);
        client.addAirspace(restricted);

        const result = await session.searchNearest(47.0, 8.0, nm(10), 10);

        expect(names(result.added)).toEqual(['R-NEAR']);
    });
});

describe('airspace builders and the SDK LodBoundary', () => {
    const corners: [number, number][] = [[47.2, 7.9], [47.2, 8.3], [46.9, 8.3], [46.9, 7.9]];

    it('gives every airspace its own id', () => {
        const a = airspace('ONE', BoundaryType.MOA, corners);
        const b = airspace('TWO', BoundaryType.MOA, corners);

        expect(a.id).not.toBe(b.id);
    });

    it('converts the limits from feet to meters and fills the bounding box from the corners', () => {
        const a = airspace('LIM', BoundaryType.MOA, corners, {minFt: 1000, maxFt: 5000});

        expect(a.minAlt).toBeCloseTo(304.8, 6);
        expect(a.maxAlt).toBeCloseTo(1524, 6);
        expect([a.topLeft, a.bottomRight]).toEqual([{lat: 47.2, long: 7.9}, {lat: 46.9, long: 8.3}]);
    });

    it('builds a LodBoundary whose LOD 0 is the exact closed ring', () => {
        const lod = new LodBoundary(airspace('RING', BoundaryType.MOA, corners));

        expect(lod.lods.length).toBe(1);
        expect(lod.lods[0].length).toBe(1);
        // GeoPoint stores unit vectors, so the degrees come back with rounding noise
        const ring = lod.lods[0][0].map(p => [p.end.lat, p.end.lon]);
        expect(ring.length).toBe(corners.length + 1);
        [...corners, corners[0]].forEach(([lat, lon], i) => {
            expect(ring[i][0]).toBeCloseTo(lat, 9);
            expect(ring[i][1]).toBeCloseTo(lon, 9);
        });
    });

    it('builds the same LodBoundary through the SDK cache', () => {
        const fac = airspace('CACHED', BoundaryType.MOA, corners);

        const lod = DefaultLodBoundaryCache.getCache().get(fac);

        expect(lod.lods[0][0].length).toBe(corners.length + 1);
        expect(DefaultLodBoundaryCache.getCache().get(fac)).toBe(lod);
    });

    // Without the facility's lods array the SDK would simplify the shape to the vector target of the default cache
    // (500 vectors), and the instrument would test against a coarser polygon than the one that was built
    it('keeps every vector of a large polygon in LOD 0 of the SDK cache', () => {
        const count = 600;
        const ring: [number, number][] = Array.from({length: count}, (_, i) => [47 + 0.1 * Math.cos(2 * Math.PI * i / count), 8 + 0.1 * Math.sin(2 * Math.PI * i / count)]);

        const lod = DefaultLodBoundaryCache.getCache().get(airspace('BIG', BoundaryType.MOA, ring));

        expect(lod.lods[0][0].length).toBe(count + 1);
    });

    it('starts the next unit with an empty SDK boundary cache', () => {
        const before = DefaultLodBoundaryCache.getCache();
        before.get(airspace('STALE', BoundaryType.MOA, corners));

        resetSingletons(false);

        expect(DefaultLodBoundaryCache.getCache()).not.toBe(before);
    });

    it('agrees with the polygon in BoundaryUtils.isInside', () => {
        const lod = new LodBoundary(airspace('POLY', BoundaryType.MOA, corners));

        expect(BoundaryUtils.isInside(lod, 47.0, 8.1)).toBe(true);
        expect(BoundaryUtils.isInside(lod, 47.3, 8.1)).toBe(false);
        expect(BoundaryUtils.isInside(lod, 47.0, 8.4)).toBe(false);
    });

    // The SDK turns the circle into a two-point shape that carries the circle, and BoundaryUtils cuts it into a polyline
    it('builds a circular airspace that BoundaryUtils sees as a circle (#209)', () => {
        const circle = circularAirspace('CIRC', BoundaryType.MOA, [47.0, 8.0], 10);
        const lod = new LodBoundary(circle);

        expect(lod.lods[0][0].length).toBe(2);
        expect(BoundaryUtils.isInside(lod, 47.0, 8.0)).toBe(true);
    });

    // The SDK reads the sector as one shape: the start, the line out, the arc (the Origin only names its center) and the
    // line back. Its arc is a small circle, its lines are great circles.
    it('builds an arc sector the SDK reads as a line, an arc and a line (#209)', () => {
        const lod = new LodBoundary(arcSectorAirspace('SECTOR', BoundaryType.MOA, [47.0, 8.0], 10, 0, 90));
        const shape = lod.lods[0][0];

        expect(lod.lods[0]).toHaveLength(1);
        expect(shape.map(v => v.circle === undefined ? 'start' : v.circle.isGreatCircle() ? 'line' : 'arc')).toEqual(['start', 'line', 'arc', 'line']);
        expect(shape[0].end.lat).toBe(47.0);
        expect(shape[0].end.lon).toBe(8.0);
        // The line out ends 10 NM north, the arc ends 10 NM east
        expect(distanceNm({lat: 47.0, lon: 8.0}, shape[1].end)).toBeCloseTo(10, 6);
        expect(distanceNm({lat: 47.0, lon: 8.0}, shape[2].end)).toBeCloseTo(10, 6);
        expect(shape[2].end.lat).toBeLessThan(47.0);
        expect(shape[2].end.lon).toBeGreaterThan(8.1);
    });

    // The counterclockwise twin of the sector above, from bearing 90 to bearing 0: the SDK's arc runs on a circle of the
    // opposite orientation, which it reads as a small circle with a radius below a quarter of the globe; the ArcCW above
    // gets the reversed circle
    it('builds a counterclockwise arc sector the SDK reads as an arc of the opposite orientation (#209)', () => {
        const ccw = new LodBoundary(arcSectorAirspace('CCW', BoundaryType.MOA, [47.0, 8.0], 10, 90, 0, {counterClockwise: true})).lods[0][0];
        const cw = new LodBoundary(arcSectorAirspace('CW', BoundaryType.MOA, [47.0, 8.0], 10, 0, 90)).lods[0][0];

        expect(ccw.map(v => v.circle === undefined ? 'start' : v.circle.isGreatCircle() ? 'line' : 'arc')).toEqual(['start', 'line', 'arc', 'line']);
        expect(ccw[2].circle!.radius).toBeLessThan(Math.PI / 2);
        expect(cw[2].circle!.radius).toBeGreaterThan(Math.PI / 2);
        // The line out ends 10 NM east, the arc ends 10 NM north
        expect(ccw[1].end.lat).toBeLessThan(47.0);
        expect(ccw[1].end.lon).toBeGreaterThan(8.1);
        expect(distanceNm({lat: 47.0, lon: 8.0}, ccw[2].end)).toBeCloseTo(10, 6);
        expect(ccw[2].end.lon).toBeCloseTo(8.0, 9);
    });

    it('moves the start of the arc outward by startOffsetNm (#209)', () => {
        const lod = new LodBoundary(arcSectorAirspace('OFF', BoundaryType.MOA, [47.0, 8.0], 10, 0, 90, {startOffsetNm: 0.5}));

        expect(distanceNm({lat: 47.0, lon: 8.0}, lod.lods[0][0][1].end)).toBeCloseTo(10.5, 6);
        expect(distanceNm({lat: 47.0, lon: 8.0}, lod.lods[0][0][2].end)).toBeCloseTo(10, 6);
    });

    it('gives an arc sector the bounding box of its full circle (#209)', () => {
        expect(arcSectorAirspace('SECTOR', BoundaryType.MOA, [47.0, 8.0], 60, 0, 90)).toMatchObject({
            topLeft: circularAirspace('CIRC', BoundaryType.MOA, [47.0, 8.0], 60).topLeft,
            bottomRight: circularAirspace('CIRC', BoundaryType.MOA, [47.0, 8.0], 60).bottomRight,
        });
    });

    it('builds an airspace of a polygon and a circle as two shapes (#209)', () => {
        const lod = new LodBoundary(multiShapeAirspace('TWO', BoundaryType.MOA, square(47.0, 8.0, 0.1), [47.0, 9.0], 5));

        expect(lod.lods[0].map(s => s.length)).toEqual([5, 2]);
        // The square reaches farther north, south and west than the circle; the circle reaches farther east
        expect(lod.facility.topLeft).toEqual({lat: 47.1, long: 7.9});
        expect(lod.facility.bottomRight).toEqual({lat: 46.9, long: circularAirspace('C', BoundaryType.MOA, [47.0, 9.0], 5).bottomRight.long});
    });

    it('gives a circular airspace a bounding box that contains the circle', () => {
        const circle = circularAirspace('CIRC', BoundaryType.MOA, [47.0, 8.0], 60);

        expect(circle.topLeft.lat).toBeCloseTo(48.0, 1);
        expect(circle.bottomRight.lat).toBeCloseTo(46.0, 1);
        // 60 NM east-west at 47N are about 1.46 degrees of longitude
        expect(circle.bottomRight.long - 8.0).toBeCloseTo(1.47, 1);
        expect(8.0 - circle.topLeft.long).toBeCloseTo(1.47, 1);
    });

    it('carries a center frequency only when given', () => {
        // The frequency carries the name that OTH 2 reads: the airspace's own unless frequencyName says otherwise
        expect((airspace('CTR', BoundaryType.Center, corners, {frequencyMHz: 132.5}) as any).frequency).toEqual({freqMHz: 132.5, name: 'CTR'});
        expect((airspace('CTR', BoundaryType.Center, corners, {frequencyMHz: 132.5, frequencyName: 'ZURICH'}) as any).frequency).toEqual({freqMHz: 132.5, name: 'ZURICH'});
        expect('frequency' in airspace('NOFQ', BoundaryType.Center, corners)).toBe(false);
    });
});
