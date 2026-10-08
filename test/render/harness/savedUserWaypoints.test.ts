import {describe, expect, it} from 'vitest';
import {AirportFacility, ICAO, NdbFacility, RunwaySurfaceType, UnitType, VorFacility} from '@microsoft/msfs-sdk';
import {bootUnit, settle} from '../../harness/boot';
import {savedUserWaypoints} from '../../harness/storage';
import {Screen} from '../../harness/render/screen';

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
            // Off the 0.01 minute grid: 0.12345 degrees are 7.407 minutes in both, which round to 7.41 (a floor gives 7.40)
            {kind: 'int', ident: 'OFFGRID', lat: 47.12345, lon: -8.12345},
            {kind: 'vor', ident: 'XYZ', lat: 47.5, lon: 8.9, freqMHz: 108.05, magvar: -3},
        ])).toEqual({
            userDataFormat: 2,
            wpt0: 'UXX        USUP    +4715.00+00830.00',
            wpt1: 'WXX        UINT    +4730.75-00830.00',
            wpt2: 'AXX        UAPT    +4700.00+00800.00+00427+03200H',
            wpt3: 'AXX        UGRS    +4700.00+00800.00+00024+00900S',
            wpt4: 'AXX        UNOL    +4700.00+00800.00-00001-00033-',
            wpt5: 'VXX        ABC     +4730.00+00854.00+114.30+02',
            wpt6: 'NXX        XY      +4800.00+00900.00+0345.0',
            wpt7: 'WXX        OFFGRID +4707.41-00807.41',
            wpt8: 'VXX        XYZ     +4730.00+00854.00+108.05-03',
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
                {kind: 'int', ident: 'OFFGRID', lat: 47.12345, lon: -8.12345},
                {kind: 'vor', ident: 'XYZ', lat: 47.5, lon: 8.9, freqMHz: 108.05, magvar: -3},
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
        // The format holds meters, as the model does: 1400 ft are 426.7 m, saved as 427
        expect(apt.altitude).toBe(427);
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

        // The coordinates are stored to 0.01 minute: 47 degrees 7.41 minutes, 8 degrees 7.41 minutes west
        const offGrid = repo.get(ICAO.value('W', 'XX', '', 'OFFGRID'))!;
        expect(offGrid.lat).toBeCloseTo(47 + 7.41 / 60, 6);
        expect(offGrid.lon).toBeCloseTo(-(8 + 7.41 / 60), 6);

        const westVor = repo.get(ICAO.value('V', 'XX', '', 'XYZ')) as VorFacility;
        expect(westVor.freqMHz).toBeCloseTo(108.05, 6);
        expect(westVor.magneticVariation).toBe(-3);
    });

    // APT 2 of a user airport rounds the stored altitude (meters) back to feet in steps of 10 (Apt2UserPage.formatElevation):
    // 427 m are 1400.9 ft and show as 1400. Without the conversion the unit would show 4590 ft (1400 m), and a saved
    // elevation of 80 ft (24 m, 78.7 ft) shows as 80
    it.each([[1400, 'ELV 01400ft'], [80, 'ELV 00080ft']])('shows an elevation of %i ft on APT 2 as saved', async (elevationFt, row) => {
        const unit = await bootUnit({storage: savedUserWaypoints([{kind: 'apt', ident: 'UAPT', lat: 47, lon: 8, elevationFt, runwayLengthFt: 3200}])});
        await settle(unit);
        await unit.panel.selectPage('R', 'APT 1');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'UAPT');
        await unit.panel.cursor('R');
        await unit.panel.selectPage('R', 'APT 2');

        expect(Screen.read().rows('R')).toEqual([' UAPT      ', ' '.repeat(11), ' '.repeat(11), row, ' '.repeat(11), ' '.repeat(11)]);
    });
});
