import {describe, expect, it} from 'vitest';
import {FacilityClient, FacilitySearchType, FacilityType, GeoPoint, RunwaySurfaceType} from '@microsoft/msfs-sdk';
import {AirportNearestList} from '../../../../kln90b/data/navdata/NearestList';
import {Sensors} from '../../../../kln90b/Sensors';
import {KLN90BUserSettings, SURFACE_HRD, SURFACE_HRD_SFT} from '../../../../kln90b/settings/KLN90BUserSettings';
import {MemoryFacilityClient} from '../../../harness/navdata/MemoryFacilityClient';
import {airport} from '../../../harness/navdata/builders';

/**
 * The airport nearest list on its own: the aircraft at 47.0 N 8.0 E, the SET 3 settings as given. The list searches on
 * the tenth calculation tick (NEAREST_TICK_TIME 10 s, TICK_TIME_CALC 1 s). Returns the idents of the list, nearest first.
 */
async function nearestAirports(facilities: ReturnType<typeof airport>[], surface: boolean, minLengthFt = 1000): Promise<string[]> {
    const sensors = {in: {gps: {coords: new GeoPoint(47.0, 8.0)}}} as unknown as Sensors;
    const settings = {nearestAptSurface: surface, nearestAptMinRunwayLength: minLengthFt} as Record<string, unknown>;
    const userSettings = {getSetting: (name: string) => ({get: () => settings[name]})} as unknown as KLN90BUserSettings;
    const list = new AirportNearestList(new MemoryFacilityClient(facilities) as unknown as FacilityClient, sensors, FacilitySearchType.Airport, FacilityType.Airport, userSettings);
    await list.init();
    for (let i = 0; i < 10; i++) await list.tick();
    return list.getNearestList().map(w => w.facility.icaoStruct.ident);
}

// 3-23: hard surfaces are concrete, asphalt, pavement, tarmac, brick, bitumen and sealed; soft surfaces are turf,
// gravel, clay, sand, dirt, ice, steel matting, shale and snow. HRD admits only hard runways, HRD SFT both. The SDK
// surface types below are the ones whose names match those words (HardTurf for turf, SteelMats for steel matting,
// Bituminous for bitumen); clay, pavement and sealed have no SDK type of that name.
const HARD: [string, RunwaySurfaceType][] = [
    ['CONC', RunwaySurfaceType.Concrete], ['ASPH', RunwaySurfaceType.Asphalt], ['TARM', RunwaySurfaceType.Tarmac],
    ['BRIK', RunwaySurfaceType.Brick], ['BITU', RunwaySurfaceType.Bituminous],
];
const SOFT: [string, RunwaySurfaceType][] = [
    ['TURF', RunwaySurfaceType.HardTurf], ['GRVL', RunwaySurfaceType.Gravel], ['SAND', RunwaySurfaceType.Sand],
    ['DIRT', RunwaySurfaceType.Dirt], ['ICEE', RunwaySurfaceType.Ice], ['MATS', RunwaySurfaceType.SteelMats],
    ['SHAL', RunwaySurfaceType.Shale],
];
/** One airport per surface, 0.01 degrees apart going north, each with a single 3000 ft runway */
const world = (surfaces: [string, RunwaySurfaceType][]) =>
    surfaces.map(([ident, surface], i) => airport(ident, 47.01 + i * 0.01, 8.0, {runways: [{lengthFt: 3000, surface}]}));

describe('nearest airport surfaces (3-23)', () => {
    it('admits every hard surface with HRD', async () => {
        expect(await nearestAirports(world(HARD), SURFACE_HRD)).toEqual(['CONC', 'ASPH', 'TARM', 'BRIK', 'BITU']);
    });

    it('admits no soft surface with HRD', async () => {
        expect(await nearestAirports(world(SOFT), SURFACE_HRD)).toEqual([]);
    });

    it('admits every listed soft surface with HRD SFT', async () => {
        expect(await nearestAirports(world(SOFT), SURFACE_HRD_SFT)).toEqual(['TURF', 'GRVL', 'SAND', 'DIRT', 'ICEE', 'MATS', 'SHAL']);
    });

    it('admits every hard surface with HRD SFT', async () => {
        expect(await nearestAirports(world(HARD), SURFACE_HRD_SFT)).toEqual(['CONC', 'ASPH', 'TARM', 'BRIK', 'BITU']);
    });

    // 3-23: with HRD the airport needs a hard runway of at least the minimum length. KMIX has a hard runway, so the
    // airport class (HardSurface) lets it through; only the surface filter can see that the long runway is grass.
    it('leaves out an airport whose only long enough runway is soft with HRD', async () => {
        const kmix = airport('KMIX', 47.01, 8.0, {runways: [{lengthFt: 800}, {lengthFt: 3000, surface: RunwaySurfaceType.Grass}]});
        const kaaa = airport('KAAA', 47.02, 8.0);

        expect([await nearestAirports([kmix, kaaa], SURFACE_HRD), await nearestAirports([kmix, kaaa], SURFACE_HRD_SFT)])
            .toEqual([['KAAA'], ['KMIX', 'KAAA']]);
    });

    it.fails('admits a snow runway with HRD SFT (#NEW-2-5)', async () => {
        expect(await nearestAirports(world([['SNOW', RunwaySurfaceType.Snow]]), SURFACE_HRD_SFT)).toEqual(['SNOW']);
    });
});
