import {describe, expect, it} from 'vitest';
import {BoundaryAltitudeType, BoundaryFacility, BoundaryType, BoundaryVectorType, LodBoundary} from '@microsoft/msfs-sdk';
import {airspace, AirspaceOptions, circularAirspace} from '../../../harness/navdata/airspaces';
import {AirspaceAreas, airspaceAreaKey} from '../../../../kln90b/data/navdata/AirspaceAreas';

// #410: the sim holds most airspaces more than once, as boundaries with the same type, limits and vectors but other
// names and ids. These are the project's own rules for one area per group of copies; no manual page covers them. The
// polygons are invented.
const polygon: [number, number][] = [[47.1, 7.9], [47.1, 8.1], [46.9, 8.1], [46.9, 7.9]];

const copy = (name: string, o: AirspaceOptions = {}, corners: [number, number][] = polygon, type: BoundaryType = BoundaryType.Restricted) =>
    airspace(name, type, corners, o);
const boundary = (name: string, o: AirspaceOptions = {}, corners: [number, number][] = polygon, type: BoundaryType = BoundaryType.Restricted) =>
    new LodBoundary(copy(name, o, corners, type));
const names = (areas: AirspaceAreas) => areas.areas().map(b => b.facility.name);

/** The facility with the type of one vector changed, its position kept */
const withVectorType = (facility: BoundaryFacility, index: number, type: BoundaryVectorType): BoundaryFacility =>
    ({...facility, vectors: facility.vectors.map((v, i) => i === index ? {...v, type} : v)});

describe('airspaceAreaKey (#410)', () => {
    it('is the same for copies with another name and id', () => {
        expect(airspaceAreaKey(copy('R-4711 ALPHA'))).toBe(airspaceAreaKey(copy('R-4711')));
    });

    it.each([
        ['another ceiling', copy('R-4711', {maxFt: 12000})],
        ['another floor', copy('R-4711', {minFt: 500})],
        ['another floor type', copy('R-4711', {minType: BoundaryAltitudeType.AGL})],
        ['another ceiling type', copy('R-4711', {maxType: BoundaryAltitudeType.AGL})],
        ['another type', copy('R-4711', {}, polygon, BoundaryType.Danger)],
        ['a corner moved by 0.001 degrees of latitude', copy('R-4711', {}, [[47.101, 7.9], ...polygon.slice(1)])],
        ['a corner moved by 0.001 degrees of longitude', copy('R-4711', {}, [[47.1, 7.901], ...polygon.slice(1)])],
        ['an arc instead of a line to the same point', withVectorType(copy('R-4711'), 1, BoundaryVectorType.ArcCW)],
    ])('differs for %s', (_what, other) => {
        expect(airspaceAreaKey(other)).not.toBe(airspaceAreaKey(copy('R-4711 ALPHA')));
    });

    it('differs for another radius of a circle, in whole meters', () => {
        const key = (nm: number) => airspaceAreaKey(circularAirspace('R-CIRCLE', BoundaryType.Restricted, [47, 8], nm));

        expect(key(5.0)).not.toBe(key(5.001));
        expect(key(5.0)).toBe(key(5.0));
    });
});

describe('AirspaceAreas (#410)', () => {
    it('returns the copy with the shortest name for two copies of an area', () => {
        const areas = new AirspaceAreas();
        areas.add(boundary('R-4711 ALPHA'));
        areas.add(boundary('R-4711'));

        expect(names(areas)).toEqual(['R-4711']);
    });

    it('returns the copy with the lowest id when the names are equally long', () => {
        const first = boundary('R-4711 A');
        const second = boundary('R-4711 B');
        const areas = new AirspaceAreas();
        areas.add(second);
        areas.add(first);

        expect(areas.areas()).toEqual([first]);
    });

    it('keeps areas that differ apart', () => {
        const areas = new AirspaceAreas();
        areas.add(boundary('R-4711'));
        areas.add(boundary('R-4712', {maxFt: 12000}));

        expect(names(areas).sort()).toEqual(['R-4711', 'R-4712']);
    });

    it('lets the next copy take over when the shortest one is removed, and returns nothing once all are removed', () => {
        const long = boundary('R-4711 ALPHA');
        const short = boundary('R-4711');
        const areas = new AirspaceAreas();
        areas.add(long);
        areas.add(short);

        areas.remove(short.facility.id);
        expect(areas.areas()).toEqual([long]);

        areas.remove(long.facility.id);
        expect(areas.areas()).toEqual([]);
    });

    it('answers the same key for both copies through keyOf', () => {
        const long = boundary('R-4711 ALPHA');
        const short = boundary('R-4711');
        const areas = new AirspaceAreas();
        areas.add(long);
        areas.add(short);

        expect(areas.keyOf(long)).toBe(areas.keyOf(short));
        expect(areas.keyOf(long)).toBe(airspaceAreaKey(long.facility));
    });

    it('ignores the removal of an id it does not hold', () => {
        const areas = new AirspaceAreas();
        areas.add(boundary('R-4711'));

        areas.remove(-1);

        expect(names(areas)).toEqual(['R-4711']);
    });
});
