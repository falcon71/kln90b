import {describe, expect, it} from 'vitest';
import {AirportFacility, ICAO, NdbFacility, RunwaySurfaceType, UnitType, VorFacility} from '@microsoft/msfs-sdk';
import {bootUnit, settle} from '../../harness/boot';
import {savedUserWaypoints} from '../../harness/storage';

describe('savedUserWaypoints (harness)', () => {
    // Literals laid out by hand from docs/architecture.md, Core 7 (and as in UserWaypointV2.test.ts), not by the helper
    it('lays out the V2 strings, one setting per waypoint', () => {
        expect(savedUserWaypoints([
            {kind: 'sup', ident: 'USUP', lat: 47.25, lon: 8.5},
            {kind: 'int', ident: 'UINT', lat: 47.5125, lon: -8.5},
            {kind: 'apt', ident: 'UAPT', lat: 47, lon: 8, elevationFt: 1400, runwayLengthFt: 3200},
            {kind: 'apt', ident: 'UGRS', lat: 47, lon: 8, elevationFt: 80, runwayLengthFt: 900, surface: 'S'},
            {kind: 'apt', ident: 'UNOL', lat: 47, lon: 8},
            {kind: 'vor', ident: 'ABC', lat: 47.5, lon: 8.9, freqMHz: 114.3, magvar: 2},
            {kind: 'ndb', ident: 'XY', lat: 48, lon: 9, freqKHz: 345},
        ])).toEqual({
            userDataFormat: 2,
            wpt0: 'UXX        USUP    +4715.00+00830.00',
            wpt1: 'WXX        UINT    +4730.75-00830.00',
            wpt2: 'AXX        UAPT    +4700.00+00800.00+01400+03200H',
            wpt3: 'AXX        UGRS    +4700.00+00800.00+00080+00900S',
            wpt4: 'AXX        UNOL    +4700.00+00800.00-00001-00033-',
            wpt5: 'VXX        ABC     +4730.00+00854.00+114.30+02',
            wpt6: 'NXX        XY      +4800.00+00900.00+0345.0',
        });
    });

    it('is restored by the unit, each waypoint with its coordinates', async () => {
        const unit = await bootUnit({
            storage: savedUserWaypoints([
                {kind: 'sup', ident: 'USUP', lat: 47.25, lon: 8.5},
                {kind: 'int', ident: 'UINT', lat: 47.5125, lon: -8.5},
                {kind: 'apt', ident: 'UAPT', lat: 47, lon: 8, elevationFt: 1400, runwayLengthFt: 3200},
                {kind: 'apt', ident: 'UNOL', lat: 46.5, lon: 8},
                {kind: 'vor', ident: 'ABC', lat: 47.5, lon: 8.9, freqMHz: 114.3, magvar: 2},
                {kind: 'ndb', ident: 'XY', lat: 48, lon: 9, freqKHz: 345},
            ]),
        });
        await settle(unit);
        const repo = unit.props.facilityRepository;

        const sup = repo.get(ICAO.value('U', 'XX', '', 'USUP'))!;
        expect(sup.lat).toBeCloseTo(47.25, 6);
        expect(sup.lon).toBeCloseTo(8.5, 6);

        const int = repo.get(ICAO.value('W', 'XX', '', 'UINT'))!;
        expect(int.lat).toBeCloseTo(47.5125, 6);
        expect(int.lon).toBeCloseTo(-8.5, 6);

        const apt = repo.get(ICAO.value('A', 'XX', '', 'UAPT')) as AirportFacility;
        expect(apt.lat).toBeCloseTo(47, 6);
        expect(apt.lon).toBeCloseTo(8, 6);
        expect(apt.altitude).toBe(1400);
        expect(UnitType.METER.convertTo(apt.runways[0].length, UnitType.FOOT)).toBeCloseTo(3200, 3);
        expect(apt.runways[0].surface).toBe(RunwaySurfaceType.Asphalt);

        const noLength = repo.get(ICAO.value('A', 'XX', '', 'UNOL')) as AirportFacility;
        expect(noLength.lat).toBeCloseTo(46.5, 6);
        expect(noLength.altitude).toBe(-1);
        expect(UnitType.METER.convertTo(noLength.runways[0].length, UnitType.FOOT)).toBeCloseTo(-33, 3);
        expect(noLength.runways[0].surface).toBe(RunwaySurfaceType.WrightFlyerTrack);

        const vor = repo.get(ICAO.value('V', 'XX', '', 'ABC')) as VorFacility;
        expect(vor.lat).toBeCloseTo(47.5, 6);
        expect(vor.lon).toBeCloseTo(8.9, 6);
        expect(vor.freqMHz).toBeCloseTo(114.3, 6);
        expect(vor.magneticVariation).toBe(2);

        const ndb = repo.get(ICAO.value('N', 'XX', '', 'XY')) as NdbFacility;
        expect(ndb.lat).toBeCloseTo(48, 6);
        expect(ndb.lon).toBeCloseTo(9, 6);
        expect(ndb.freqMHz).toBeCloseTo(345, 6);
    });
});
