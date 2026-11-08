import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {AirportClass, EventBus, Facility, ICAO, RunwaySurfaceType} from '@microsoft/msfs-sdk';
import {bootUnit} from '../../harness/boot';
import {MemoryFacilityClient} from '../../harness/navdata/MemoryFacilityClient';
import {airport} from '../../harness/navdata/builders';
import {clearStatic} from '../../harness/singletons';
import {ActualFacilityClient, KLNFacilityLoader} from '../../../kln90b/data/navdata/KLNFacilityLoader';
import {KLNFacilityRepository} from '../../../kln90b/data/navdata/KLNFacilityRepository';
import {NearestAirportFinder} from '../../../kln90b/data/navdata/NearestAirportFinder';

/**
 * #465: the airport a spoofer's false position snaps to, the spec docs/superpowers/specs/2026-11-07-gps-jamming-spoofing-transmitters-design.md,
 * "The fake signals", "Snapped to an airport": the nearest airport with a hard-surface runway of 1500 m or more.
 * The airports lie on the meridian 8E, a degree of latitude being 60 NM.
 */

const M_PER_FT = 0.3048;
const ft = (meters: number) => meters / M_PER_FT;

beforeEach(() => clearStatic(KLNFacilityRepository, 'INSTANCE', false));
afterEach(() => vi.restoreAllMocks());

function finderOver(database: Facility[], user: Facility[] = []): NearestAirportFinder {
    const repo = KLNFacilityRepository.getRepository(new EventBus());
    user.forEach(f => repo.add(f));
    return new NearestAirportFinder(new KLNFacilityLoader(new MemoryFacilityClient(database) as unknown as ActualFacilityClient, repo));
}

const userAirport = (ident: string, lat: number, lon: number, region = 'XX'): Facility => {
    const fac = airport(ident, lat, lon, {runways: [{lengthFt: ft(2500)}]});
    const icaoStruct = ICAO.value('A', region, '', ident);
    return {...fac, icaoStruct, icao: ICAO.valueToStringV1(icaoStruct), region};
};

describe('the airport finder', () => {
    it('finds the nearest hard-surfaced airport with a runway of 1500 m or more within the radius', async () => {
        const database = [
            airport('SHRT', 47.1, 8.0, {runways: [{lengthFt: ft(1200)}], elevationFt: 100}), //nearer, but short
            airport('GRAS', 47.2, 8.0, {runways: [{lengthFt: ft(2000), surface: RunwaySurfaceType.Grass}], elevationFt: 200}), //nearer, but grass
            airport('LONG', 47.3, 8.0, {runways: [{lengthFt: ft(2500)}], elevationFt: 1000}), //18 NM away
            airport('FARR', 47.45, 8.0, {runways: [{lengthFt: ft(2500)}]}), //27 NM away, also matching but farther
        ];

        const found = await finderOver(database).find(47.0, 8.0, 30);

        expect(found).not.toBeNull();
        expect(found!.lat).toBeCloseTo(47.3, 6);
        expect(found!.lon).toBeCloseTo(8.0, 6);
        expect(found!.elevationFt).toBeCloseTo(1000, 3);
    });

    it('needs the long runway to be hard: a short hard runway beside a long grass one does not count', async () => {
        const database = [airport('MIXD', 47.1, 8.0, {runways: [{lengthFt: ft(1200)}, {lengthFt: ft(2000), surface: RunwaySurfaceType.Grass}]})];

        expect(await finderOver(database).find(47.0, 8.0, 30)).toBeNull();
    });

    it('leaves out an airport the database classes as soft-surfaced, whatever its runways', async () => {
        const database = [airport('SOFT', 47.1, 8.0, {runways: [{lengthFt: ft(2500)}], airportClass: AirportClass.SoftSurface})];

        expect(await finderOver(database).find(47.0, 8.0, 30)).toBeNull();
    });

    it('takes the nearest of two matching airports', async () => {
        const database = [
            airport('FARR', 47.4, 8.0, {runways: [{lengthFt: ft(2500)}]}),
            airport('NEAR', 47.2, 8.0, {runways: [{lengthFt: ft(1600)}]}),
        ];

        const found = await finderOver(database).find(47.0, 8.0, 30);

        expect(found!.lat).toBeCloseTo(47.2, 6);
    });

    it('returns null when none matches within the radius', async () => {
        const database = [
            airport('SHRT', 47.1, 8.0, {runways: [{lengthFt: ft(1200)}]}),
            airport('OUTS', 47.6, 8.0, {runways: [{lengthFt: ft(2500)}]}), //36 NM away
        ];

        expect(await finderOver(database).find(47.0, 8.0, 30)).toBeNull();
    });

    it('ignores a user airport and a temporary one, though they are nearest and match', async () => {
        const database = [airport('LONG', 47.3, 8.0, {runways: [{lengthFt: ft(2500)}]})];
        const user = [userAirport('USRA', 47.05, 8.0), userAirport('TMPA', 47.06, 8.0, 'XY')];

        const found = await finderOver(database, user).find(47.0, 8.0, 30);

        expect(found!.lat).toBeCloseTo(47.3, 6);
    });

    it('returns null with only a user airport', async () => {
        expect(await finderOver([], [userAirport('USRA', 47.05, 8.0)]).find(47.0, 8.0, 30)).toBeNull();
    });

    it('the unit wires the finder into the transmitters at boot', async () => {
        const find = vi.spyOn(NearestAirportFinder.prototype, 'find').mockResolvedValue(null);
        const unit = await bootUnit({position: {lat: 47.0, lon: 8.0}});
        const sensors = unit.props.sensors;

        unit.props.failures.fail('gpsSpoofing');
        const inputs = {lat: 47.0, lon: 8.0, aglFt: 0, groundElevationFt: 0, simTimeS: 1000,
            attitude: {headingTrueDeg: 0, pitchUpDeg: 0, bankRightDeg: 0, onGround: true}};
        sensors.in.gps.transmitters.tick(inputs);
        sensors.in.gps.transmitters.tick({...inputs, simTimeS: 1001});

        expect(find).toHaveBeenCalledTimes(1);
        expect(find.mock.calls[0][2]).toBe(30);
    });
});
