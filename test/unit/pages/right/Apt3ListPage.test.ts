import {describe, expect, it} from 'vitest';
import {AirportRunway, RunwayLightingType, RunwaySurfaceType} from '@microsoft/msfs-sdk';
import {getKLNLightingString, getKLNSurfaceString} from '../../../../kln90b/pages/right/Apt3ListPage';

// Both functions read only the surface or the lighting of the runway
const rwy = (o: Partial<AirportRunway>) => o as AirportRunway;

// 3-44: APT 3 shows a three-letter surface code per runway. Hard surface covers asphalt, concrete, tarmac, brick and
// bitumen; the guide also lists gravel, sand, dirt, ice, steel matting, shale and snow. It lists turf as TRF, and the
// SDK member named turf is HardTurf, so that one is a spec row; the SDK's grass types are the project's mapping of
// grass onto the guide's turf, which the guide does not state, so they are characterization (below).
const SPEC_SURFACES: [RunwaySurfaceType, string][] = [
    [RunwaySurfaceType.Concrete, 'HRD'], [RunwaySurfaceType.Asphalt, 'HRD'], [RunwaySurfaceType.Tarmac, 'HRD'],
    [RunwaySurfaceType.Brick, 'HRD'], [RunwaySurfaceType.Bituminous, 'HRD'],
    [RunwaySurfaceType.HardTurf, 'TRF'],
    [RunwaySurfaceType.Gravel, 'GRV'], [RunwaySurfaceType.Sand, 'SND'], [RunwaySurfaceType.Dirt, 'DRT'],
    [RunwaySurfaceType.Ice, 'ICE'], [RunwaySurfaceType.SteelMats, 'MAT'], [RunwaySurfaceType.Shale, 'SHL'],
    [RunwaySurfaceType.Snow, 'SNW'],
];

// The SDK types the guide does not name. The grass types map onto turf; the rest (water, paving that is not a
// runway material of the guide, ...) show a blank surface, as the guide shows for an unknown one.
// Macadam is left out on purpose: whether it counts as hard surface is the open question #270.
const GRASS_SURFACES = [
    RunwaySurfaceType.Grass, RunwaySurfaceType.GrassBumpy, RunwaySurfaceType.ShortGrass, RunwaySurfaceType.LongGrass,
];
const BLANK_SURFACES = [
    RunwaySurfaceType.WaterFSX, RunwaySurfaceType.Urban, RunwaySurfaceType.Forest, RunwaySurfaceType.Coral,
    RunwaySurfaceType.OilTreated, RunwaySurfaceType.Planks, RunwaySurfaceType.WrightFlyerTrack,
    RunwaySurfaceType.Ocean, RunwaySurfaceType.Water, RunwaySurfaceType.Pond, RunwaySurfaceType.Lake,
    RunwaySurfaceType.River, RunwaySurfaceType.WasteWater, RunwaySurfaceType.Paint,
];

const name = (t: RunwaySurfaceType) => RunwaySurfaceType[t];

describe('getKLNSurfaceString (3-44)', () => {
    it.each(SPEC_SURFACES.map(([s, code]) => ({n: name(s), surface: s, code})))('shows surface $n as $code (3-44)', ({surface, code}) => {
        expect(getKLNSurfaceString(rwy({surface}))).toBe(code);
    });
});

describe('getKLNSurfaceString, characterization of the SDK types 3-44 does not name', () => {
    it.each(GRASS_SURFACES.map(s => ({n: name(s), surface: s})))('shows the grass type $n as TRF', ({surface}) => {
        expect(getKLNSurfaceString(rwy({surface}))).toBe('TRF');
    });

    it.each(BLANK_SURFACES.map(s => ({n: name(s), surface: s})))('shows the type $n as a blank surface', ({surface}) => {
        expect(getKLNSurfaceString(rwy({surface}))).toBe('');
    });

    // The tables above must hold every SDK value but Macadam, or a new SDK member would escape them
    it('lists every SDK surface type except Macadam in one of the tables', () => {
        const all = Object.values(RunwaySurfaceType).filter((v): v is RunwaySurfaceType => typeof v === 'number');
        const listed = [...SPEC_SURFACES.map(([s]) => s), ...GRASS_SURFACES, ...BLANK_SURFACES];

        expect([...listed].sort((a, b) => a - b)).toEqual(all.filter(s => s !== RunwaySurfaceType.Macadam).sort((a, b) => a - b));
    });
});

// 3-44: the lighting column shows L for lighting sunset to sunrise, LPC for pilot controlled lighting and LPT for part
// time or on request lighting, and nothing for a runway without lighting. The page's column is three cells wide, so
// the code pads the strings to three.
describe('getKLNLightingString (3-44)', () => {
    it.each([
        [RunwayLightingType.FullTime, 'L  '],
        [RunwayLightingType.Frequency, 'LPC'],
        [RunwayLightingType.PartTime, 'LPT'],
        [RunwayLightingType.None, '   '],
    ].map(([l, text]) => ({n: RunwayLightingType[l as RunwayLightingType], lighting: l as RunwayLightingType, text})))('shows lighting $n as "$text" (3-44)', ({lighting, text}) => {
        expect(getKLNLightingString(rwy({lighting}))).toBe(text);
    });
});

describe('getKLNLightingString, characterization of the SDK type 3-44 does not name', () => {
    it('shows unknown lighting as blank', () => {
        expect(getKLNLightingString(rwy({lighting: RunwayLightingType.Unknown}))).toBe('   ');
    });
});
