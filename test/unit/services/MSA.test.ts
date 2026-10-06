/// <reference types="node" />
import {beforeAll, describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {MSA} from '../../../kln90b/services/MSA';
import {distanceNm, pointFrom} from '../../harness/flight/geo';

const BASE_PATH = 'html_ui/Pages/VCockpit/Instruments/NavSystems/GPS/KLN90B';

describe('MSA with duplicate waypoints (#8 4cbe2b5)', () => {
    // The grid value is read from the first-degree grid in resources/.../Assets/msa.json (row 47 + 56, column 8 + 180).
    // It is data the project ships and no manual page states it, so the value is characterization.
    it('(characterization) gives the grid value of the cell around 47.5N 8.5E', async () => {
        const msa = new MSA();
        await msa.init(BASE_PATH);
        expect(msa.getMSA({lat: 47.5, lon: 8.5})).toBe(11400);
    });

    // 3-33: the route's ESA is the highest MSA along the route. A leg between two identical waypoints has no length,
    // so its MSA is the one of the point.
    it('gives the MSA of the point for a leg between two identical waypoints', async () => {
        const msa = new MSA();
        await msa.init(BASE_PATH);
        const p = {lat: 47.5, lon: 8.5};
        expect(msa.getMSAFromTo(p, {...p})).toBe(11400);
    });

    it('gives the MSA of the point for a route that consists of two identical waypoints', async () => {
        const msa = new MSA();
        await msa.init(BASE_PATH);
        const p = {lat: 47.5, lon: 8.5};
        expect(msa.getMSAForRoute([p, {...p}])).toBe(11400);
    });
});

// 3-33: the MSA is the Grid MORA of the one degree by one degree sector around the position, dashed where it is not
// defined; the ESA is the highest sector MSA from the present position to the active waypoint (and on along FPL 0 in
// Leg mode). The project ships its own grid (resources/.../Assets/msa.json, generated from a DEM, see MSA.ts), which
// the service reads through FakeXhr. Expected values come from the file, read here with fs, never from the service.

const GRID: number[][] = JSON.parse(readFileSync(`resources/${BASE_PATH}/Assets/msa.json`, 'utf-8'));

/**
 * The file entry of the sector whose south-west corner is (lat, lon), whole degrees. The layout (row 0 = 56S, column 0
 * = 180W) is anchored on geography by the first test below, not taken from MSA.ts.
 */
const sector = (lat: number, lon: number) => GRID[lat + 56][lon + 180];

let msa: MSA;
beforeAll(async () => {
    msa = new MSA();
    await msa.init(BASE_PATH);
});

describe('MSA grid file (characterization of the shipped data)', () => {
    // Anchors the layout of the file on two summits, independent of the service: the highest sector of the whole grid
    // is the one of Mount Everest (27.99N 86.93E, 29032 ft), and the highest sector of the Andes block around
    // Aconcagua (32.65S 70.01W, 22838 ft) is the one that contains it. 131 rows from 56S to 74N, 361 columns from 180W.
    it('has its highest sectors where Everest and Aconcagua are (characterization)', () => {
        expect(GRID.length).toBe(131);
        expect(GRID.every(r => r.length === 361)).toBe(true);
        const max = Math.max(...GRID.flat());
        expect(sector(27, 86)).toBe(max);
        expect(max).toBeGreaterThanOrEqual(29032);
        const andes = [-34, -33, -32].flatMap(lat => [-72, -71, -70].map(lon => sector(lat, lon)));
        expect(sector(-33, -71)).toBe(Math.max(...andes));
        expect(sector(-33, -71)).toBeGreaterThanOrEqual(22838);
    });
});

describe('MSA.getMSA', () => {
    // 3-33: the MSA of a position is the one of its sector
    it('gives the sector of Everest for a position on the summit (3-33)', () => {
        expect(msa.getMSA({lat: 27.99, lon: 86.93})).toBe(sector(27, 86));
    });

    // 3-33: in the southern and western hemisphere the sector is the one south and west of the position, so Aconcagua
    // at 32.65S 70.01W lies in the sector from 33S 71W. The sector a truncating index would read differs.
    it('gives the sector south-west of a position in the southern and western hemisphere (3-33)', () => {
        expect(sector(-33, -71)).not.toBe(sector(-32, -70));
        expect(msa.getMSA({lat: -32.65, lon: -70.01})).toBe(sector(-33, -71));
    });

    // 3-33: sectors are one degree: just south of 47N lies the sector from 46N, which differs from the one from 47N
    it('changes sector at a whole degree of latitude and longitude (3-33)', () => {
        expect(sector(46, 8)).not.toBe(sector(47, 8));
        expect(sector(47, 7)).not.toBe(sector(47, 8));
        expect(msa.getMSA({lat: 46.9999, lon: 8.5})).toBe(sector(46, 8));
        expect(msa.getMSA({lat: 47.0001, lon: 8.5})).toBe(sector(47, 8));
        expect(msa.getMSA({lat: 47.5, lon: 7.9999})).toBe(sector(47, 7));
    });

    // characterization: a position exactly on a whole degree belongs to the sector north and east of it
    it('puts a position on a sector corner into the sector north-east of it (characterization)', () => {
        expect(msa.getMSA({lat: 47, lon: 8})).toBe(sector(47, 8));
    });

    // characterization: the shipped grid covers 56S to 75N; outside it the service returns null, which the pages show
    // as dashes. The unit itself navigates from 60S to 74N, so the grid ends before the southern limit (the
    // enhancement issue for the data south of 56S covers that).
    it('has no MSA south of 56S and from 75N (characterization)', () => {
        expect(msa.getMSA({lat: -56, lon: 10})).toBe(sector(-56, 10));
        expect(msa.getMSA({lat: -56.01, lon: 10})).toBeNull();
        expect(msa.getMSA({lat: 74.99, lon: 10})).toBe(sector(74, 10));
        expect(msa.getMSA({lat: 75, lon: 10})).toBeNull();
    });

    // 3-33: 180E and 180W are the same meridian, so a position on it lies in the sector from 180W (column 0) by the
    // north-east rule above. The file has a 361st column, all 1000 ft, which the service reads for lon = 180 exactly.
    // At 17S the two differ (Fiji). Suspected bug, low impact.
    it.fails('gives the sector from 180W for a position on the date line at 180E (#NEW-4-5)', () => {
        expect(msa.getMSA({lat: -16.5, lon: 180})).toBe(sector(-17, -180));
    });

    // 3-33: the passing sibling of the pin above: the two columns differ at 17S, and 179.5W reads column 0
    it('reads the sector from 180W just east of the date line (sibling of #NEW-4-5, 3-33)', () => {
        expect(sector(-17, -180)).not.toBe(GRID[-17 + 56][360]);
        expect(msa.getMSA({lat: -16.5, lon: -179.5})).toBe(sector(-17, -180));
    });
});

/** A leg of 30 NM due south from 47.2N 8.5E, from the sector from 47N 8E into the higher sector from 46N 8E */
const SHORT_FROM = {lat: 47.2, lon: 8.5};
const SHORT_TO = pointFrom(SHORT_FROM, 180, 30);

describe('MSA.getMSAFromTo (the ESA of one leg)', () => {
    // 3-33: the ESA of a leg is the highest sector MSA from the start to the end, so the end's sector counts. The
    // service samples every 40 NM from the start (f = 0, 40 NM / d, ...) and never the end point itself, so on a leg
    // shorter than 40 NM it reads the start sector only.
    it.fails('includes the sector of the end of a short leg (#NEW-4-4)', () => {
        expect(msa.getMSAFromTo(SHORT_FROM, SHORT_TO)).toBe(sector(46, 8));
    });

    // 3-33: the passing sibling of the pin above: the leg is 30 NM long and ends in the sector from 46N, which is
    // higher than the start sector, and a leg of the same length inside one sector gives that sector
    it('has a short leg into a higher sector, and a short leg inside one sector gives it (sibling of #NEW-4-4, 3-33)', () => {
        expect(distanceNm(SHORT_FROM, SHORT_TO)).toBeCloseTo(30, 6);
        expect(SHORT_TO.lat).toBeGreaterThan(46);
        expect(SHORT_TO.lat).toBeLessThan(47);
        expect(sector(46, 8)).toBeGreaterThan(sector(47, 8));
        const inside = {lat: 46.95, lon: 8.5};
        expect(msa.getMSAFromTo(inside, pointFrom(inside, 180, 30))).toBe(sector(46, 8));
    });

    // 3-33: a leg along 46.5N from 5.5E to 9.5E crosses the sectors from 5E to 9E. The highest of them (from 7E) is
    // in the middle, so the end-point gap of the pin above plays no part. The service samples the leg with
    // intermediatePoint, whose latitude collapses toward the equator (#97), so it reads sectors far south of the leg.
    it.fails('gives the highest sector a long leg crosses (#97)', () => {
        expect(msa.getMSAFromTo({lat: 46.5, lon: 5.5}, {lat: 46.5, lon: 9.5})).toBe(sector(46, 7));
    });

    // 3-33: the passing sibling of the pin above: the highest crossed sector is the middle one, from 7E
    it('has its highest crossed sector in the middle of the long leg (sibling of #97, 3-33)', () => {
        const crossed = [5, 6, 7, 8, 9].map(lon => sector(46, lon));
        expect(Math.max(...crossed)).toBe(sector(46, 7));
        expect(sector(46, 9)).toBeLessThan(sector(46, 7));
    });

    // 3-33, #8: a leg without length has the MSA of its point
    it('gives the sector of the point for a leg without length (3-33)', () => {
        const p = {lat: 46.5, lon: 7.5};
        expect(msa.getMSAFromTo(p, {...p})).toBe(sector(46, 7));
    });

    // characterization: a leg with an end outside the grid has no ESA (dashes), because one sample is undefined
    it('has no ESA for a leg that starts outside the grid (characterization)', () => {
        expect(msa.getMSAFromTo({lat: -57, lon: 10}, {lat: -55, lon: 10})).toBeNull();
    });
});

describe('MSA.getMSAForRoute', () => {
    // 3-33: the ESA along the route is the highest MSA of its legs. The route is A, B, B: a leg of about 13 NM from A
    // in the sector from 47N 7E to B in the higher sector from 46N 8E, then a leg without length at B. Under 40 NM the
    // first leg is sampled at its start only (the gap of the pin above), so neither that gap nor #97 decides the
    // result: the second leg brings B's sector in.
    it('gives the highest MSA of its legs (3-33)', () => {
        const a = {lat: 47.1, lon: 7.9};
        const b = {lat: 46.9, lon: 8.1};
        expect(distanceNm(a, b)).toBeLessThan(40);
        expect(sector(46, 8)).toBeGreaterThan(sector(47, 7));
        expect(msa.getMSAForRoute([a, b, {...b}])).toBe(sector(46, 8));
    });

    // characterization: a route of one waypoint has no legs; the service returns 0, not null. NAV 3 reads 0 as "no
    // value" (Nav3Page.calculateESA: `esaAlongRoute ? ... : null`), see the NAV 3 pin.
    it('returns 0 for a route of one waypoint (characterization)', () => {
        expect(msa.getMSAForRoute([{lat: 46.5, lon: 7.5}])).toBe(0);
    });

    // characterization: a leg outside the grid makes the whole route's ESA null
    it('returns null when a leg is outside the grid (characterization)', () => {
        const p = {lat: -57, lon: 10};
        expect(msa.getMSAForRoute([{lat: 46.5, lon: 7.5}, {lat: 46.5, lon: 7.5}, p, {...p}])).toBeNull();
    });
});
