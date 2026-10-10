import {beforeEach, describe, expect, it} from 'vitest';
import {AirportFacility, EventBus, Facility, FacilityType, ICAO, NdbFacility, RunwaySurfaceType, UnitType, UserFacility, UserFacilityType, VorFacility} from '@microsoft/msfs-sdk';
import {KLNFacilityRepository} from '../../../kln90b/data/navdata/KLNFacilityRepository';
import {KLN90BUserWaypointsSettings} from '../../../kln90b/settings/KLN90BUserWaypoints';
import {KLN90BUserSettings} from '../../../kln90b/settings/KLN90BUserSettings';
import {UserWaypointPersistor} from '../../../kln90b/settings/UserWaypointPersistor';
import {UserWaypointLoaderV2} from '../../../kln90b/settings/UserWaypointLoaderV2';
import {airport} from '../../harness/navdata/builders';

const bus = new EventBus();
const userSettings = new KLN90BUserSettings(bus);
userSettings.getSetting('userDataFormat').set(2);
const repo = KLNFacilityRepository.getRepository(bus);
// Persists every repository change into the wpt0..wpt249 settings, as in the instrument
new UserWaypointPersistor(bus, repo, userSettings);
const wptSettings = KLN90BUserWaypointsSettings.getManager(bus);

function storedSlot(i: number): string {
    return wptSettings.getSetting(`wpt${i}`).get();
}

function restoreFrom(...serialized: string[]): void {
    serialized.forEach((s, i) => wptSettings.getSetting(`wpt${i}`).set(s));
    new UserWaypointLoaderV2(bus, repo).restoreWaypoints();
}

function removeAll(): void {
    const all: Facility[] = [];
    repo.forEach(f => all.push(f));
    all.forEach(f => repo.remove(f));
}

beforeEach(removeAll);

describe('user waypoint V2 format', () => {
    it('serializes a user VOR', () => {
        const vor = {
            icao: '', icaoStruct: ICAO.value('V', 'XX', '', 'ABC'), name: '', lat: 47.5125, lon: 8.9125, region: 'XX', city: '',
            magvar: 0, freqMHz: 114.3, freqBCD16: 0, magneticVariation: 2, type: 0, vorClass: 0, navRange: 0,
            dme: null, ils: null, tacan: null, trueReferenced: false, alt: 0,
        } as unknown as VorFacility;
        repo.add(vor);
        expect(storedSlot(0)).toBe('VXX        ABC     +4730.75+00854.75+114.30+02');
    });

    it('restores a user VOR', () => {
        restoreFrom('VXX        ABC     +4730.00+00854.00+114.30+02');
        const vor = repo.get(ICAO.value('V', 'XX', '', 'ABC')) as VorFacility;
        expect(vor.lat).toBeCloseTo(47.5, 6);
        expect(vor.lon).toBeCloseTo(8.9, 6);
        expect(vor.freqMHz).toBeCloseTo(114.3, 6);
        expect(vor.magneticVariation).toBe(2);
    });

    it('round-trips a user airport with elevation and runway', () => {
        restoreFrom('AXX        KAAA    +4700.00-00830.00+01400+03200H');
        const apt = repo.get(ICAO.value('A', 'XX', '', 'KAAA')) as AirportFacility;
        expect(apt.lat).toBeCloseTo(47, 6);
        expect(apt.lon).toBeCloseTo(-8.5, 6);
        expect(apt.altitude).toBe(1400);
        expect(UnitType.METER.convertTo(apt.runways[0].length, UnitType.FOOT)).toBeCloseTo(3200, 3);
        expect(apt.runways[0].surface).toBe(RunwaySurfaceType.Asphalt);
        // Restoring re-persists through the repository sync, so the slot must hold the identical string again. That is the
        // bug of #103, not a feature: once it is fixed, this assertion holds nothing (restoreFrom sets the slot itself)
        expect(storedSlot(0)).toBe('AXX        KAAA    +4700.00-00830.00+01400+03200H');
    });

    // f745fb3, b14db79: an airport without a runway length has -10 m in the model and the stored number is negative
    it('round-trips a user airport with a runway of unknown length (f745fb3)', () => {
        const base = airport('UAPT', 47, 8);
        const apt: AirportFacility = {
            ...base,
            icaoStruct: ICAO.value('A', 'XX', '', 'UAPT'),
            region: 'XX',
            altitude: -1,
            runways: [{...base.runways[0], length: -10, surface: RunwaySurfaceType.WrightFlyerTrack}],
        };
        repo.add(apt);
        // -10 m are -32.8 ft, which is stored as -33
        expect(storedSlot(0)).toBe('AXX        UAPT    +4700.00+00800.00-00001-00033-');

        removeAll();
        restoreFrom('AXX        UAPT    +4700.00+00800.00-00001-00033-');
        const restored = repo.get(ICAO.value('A', 'XX', '', 'UAPT')) as AirportFacility;
        expect(restored.altitude).toBe(-1);
        expect(restored.runways[0].length).toBeCloseTo(-10.0584, 4);
        expect(restored.runways[0].surface).toBe(RunwaySurfaceType.WrightFlyerTrack);
    });

    it('restores a user NDB', () => {
        restoreFrom('NXX        XY      +4800.00+00900.00+0345.0');
        const ndb = repo.get(ICAO.value('N', 'XX', '', 'XY')) as NdbFacility;
        expect(ICAO.getFacilityTypeFromValue(ndb.icaoStruct)).toBe(FacilityType.NDB);
        expect(ndb.freqMHz).toBeCloseTo(345, 6);
        // Restoring re-persists through the repository sync, so the slot must hold the identical string again. That is the
        // bug of #103, not a feature: once it is fixed, this assertion holds nothing (restoreFrom sets the slot itself)
        expect(storedSlot(0)).toBe('NXX        XY      +4800.00+00900.00+0345.0');
    });

    // The setup sibling of the #98 pin below: the same slot restores without throwing, with its ident and its longitude
    it('restores a southern waypoint without throwing, with its ident and longitude', () => {
        expect(() => restoreFrom('WXX        SOUTH   -1230.00+01015.00')).not.toThrow();
        const wpt = repo.get(ICAO.value('W', 'XX', '', 'SOUTH'))!;
        expect(wpt.icaoStruct.ident).toBe('SOUTH');
        expect(wpt.lon).toBeCloseTo(10.25, 6);
    });

    it.fails('restores a southern latitude (#98)', () => {
        restoreFrom('WXX        SOUTH   -1230.00+01015.00');
        const wpt = repo.get(ICAO.value('W', 'XX', '', 'SOUTH'))!;
        expect(wpt.lat).toBeCloseTo(-12.5, 6);
    });

    // 6677fae: the V2 restore flipped the sign of western longitudes of one degree and more
    it('restores a western longitude of a VOR (#78)', () => {
        restoreFrom('VXX        ABC     +4730.00-00830.00+114.30+02');
        const vor = repo.get(ICAO.value('V', 'XX', '', 'ABC')) as VorFacility;
        expect(vor.lat).toBeCloseTo(47.5, 6);
        expect(vor.lon).toBeCloseTo(-8.5, 6);
    });

    it('restores a western longitude of an NDB (#78)', () => {
        restoreFrom('NXX        XY      +4800.00-00915.00+0345.0');
        const ndb = repo.get(ICAO.value('N', 'XX', '', 'XY')) as NdbFacility;
        expect(ndb.lon).toBeCloseTo(-9.25, 6);
        expect(ndb.freqMHz).toBe(345);
    });

    // e09cc67: a coordinate between -1 and 0 degrees lost its sign, because the degrees part truncates to zero
    it('keeps the sign of a longitude west of the prime meridian by less than one degree (#36)', () => {
        repo.add({
            icao: '', icaoStruct: ICAO.value('W', 'XX', '', 'ZERO'), name: '', lat: 47.5, lon: -(54.35 / 60), region: 'XX', city: '', routes: [],
        } as unknown as Facility);
        expect(storedSlot(0)).toBe('WXX        ZERO    +4730.00-00054.35');

        removeAll();
        restoreFrom('WXX        ZERO    +4730.00-00054.35');
        const wpt = repo.get(ICAO.value('W', 'XX', '', 'ZERO'))!;
        expect(wpt.lat).toBeCloseTo(47.5, 6);
        expect(wpt.lon).toBeCloseTo(-0.9058333, 6);
    });

    // Not a pin: #98 only hits southern latitudes of 1 degree and more
    it('keeps the sign of a latitude south of the equator by less than one degree (#36)', () => {
        repo.add({
            icao: '', icaoStruct: ICAO.value('W', 'XX', '', 'SZERO'), name: '', lat: -0.5, lon: 8, region: 'XX', city: '', routes: [],
        } as unknown as Facility);
        expect(storedSlot(0)).toBe('WXX        SZERO   -0030.00+00800.00');

        removeAll();
        restoreFrom('WXX        SZERO   -0030.00+00800.00');
        const wpt = repo.get(ICAO.value('W', 'XX', '', 'SZERO'))!;
        expect(wpt.lat).toBeCloseTo(-0.5, 6);
        expect(wpt.lon).toBeCloseTo(8, 6);
    });

    // Contract source for the cases below: docs/architecture.md Core 7 (V2: the 19 character ICAO, then latitude
    // +DDMM.MM, longitude +DDDMM.MM and the type-specific fields)

    it('serializes and restores a supplementary waypoint of the SUP page', () => {
        repo.add({
            icao: '', icaoStruct: ICAO.value('U', 'XX', '', 'MYWPT'), name: '', lat: 47.5, lon: 8.25, region: 'XX', city: '',
            isTemporary: false, userFacilityType: UserFacilityType.LAT_LONG,
        } as unknown as UserFacility);
        expect(storedSlot(0)).toBe('UXX        MYWPT   +4730.00+00815.00');

        removeAll();
        restoreFrom('UXX        MYWPT   +4730.00+00815.00');
        const wpt = repo.get(ICAO.value('U', 'XX', '', 'MYWPT')) as UserFacility;
        expect(wpt.lat).toBeCloseTo(47.5, 6);
        expect(wpt.lon).toBeCloseTo(8.25, 6);
        expect(wpt.userFacilityType).toBe(UserFacilityType.LAT_LONG);
        expect(wpt.isTemporary).toBe(false);
    });

    it('serializes a grass runway as S and restores it as grass', () => {
        const base = airport('UAPT', 47, 8);
        repo.add({
            ...base,
            icaoStruct: ICAO.value('A', 'XX', '', 'UAPT'),
            region: 'XX',
            altitude: 1400,
            runways: [{...base.runways[0], length: UnitType.FOOT.convertTo(2500, UnitType.METER), surface: RunwaySurfaceType.Grass}],
        } as AirportFacility);
        expect(storedSlot(0)).toBe('AXX        UAPT    +4700.00+00800.00+01400+02500S');

        removeAll();
        restoreFrom('AXX        UAPT    +4700.00+00800.00+01400+02500S');
        const apt = repo.get(ICAO.value('A', 'XX', '', 'UAPT')) as AirportFacility;
        expect(apt.runways[0].surface).toBe(RunwaySurfaceType.Grass);
        expect(UnitType.METER.convertTo(apt.runways[0].length, UnitType.FOOT)).toBeCloseTo(2500, 3);
    });

    it('serializes and restores a negative magnetic variation of a VOR', () => {
        repo.add({
            icao: '', icaoStruct: ICAO.value('V', 'XX', '', 'ABC'), name: '', lat: 47.5, lon: 8.9, region: 'XX', city: '',
            magvar: 0, freqMHz: 108.0, freqBCD16: 0, magneticVariation: -5, type: 0, vorClass: 0, navRange: 0,
            dme: null, ils: null, tacan: null, trueReferenced: false, alt: 0,
        } as unknown as VorFacility);
        expect(storedSlot(0)).toBe('VXX        ABC     +4730.00+00854.00+108.00-05');

        removeAll();
        restoreFrom('VXX        ABC     +4730.00+00854.00+108.00-05');
        expect((repo.get(ICAO.value('V', 'XX', '', 'ABC')) as VorFacility).magneticVariation).toBe(-5);
    });

    // The V1 half of this is #101
    it('serializes and restores a longitude of 100 degrees or more', () => {
        repo.add({
            icao: '', icaoStruct: ICAO.value('N', 'XX', '', 'XY'), name: '', lat: 35.25, lon: 139.75, region: 'XX', city: '',
            magvar: 0, freqMHz: 1700, type: 0, range: 0, bfoRequired: false, alt: 0,
        } as unknown as NdbFacility);
        expect(storedSlot(0)).toBe('NXX        XY      +3515.00+13945.00+1700.0');

        removeAll();
        restoreFrom('NXX        XY      +3515.00-13945.00+1700.0');
        const ndb = repo.get(ICAO.value('N', 'XX', '', 'XY')) as NdbFacility;
        expect(ndb.lon).toBeCloseTo(-139.75, 6);
        expect(ndb.freqMHz).toBe(1700);
    });

    // docs/architecture.md Core 7: wpt0 to wpt249 are restored
    it('restores the last slot, wpt249', () => {
        wptSettings.getSetting('wpt249').set('UXX        MYWPT   +4730.00+00815.00');
        new UserWaypointLoaderV2(bus, repo).restoreWaypoints();
        const wpt = repo.get(ICAO.value('U', 'XX', '', 'MYWPT')) as UserFacility;
        expect(wpt.lat).toBeCloseTo(47.5, 6);
        expect(wpt.lon).toBeCloseTo(8.25, 6);
    });
});
