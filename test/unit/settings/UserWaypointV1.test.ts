import {beforeEach, describe, expect, it} from 'vitest';
import {AirportFacility, EventBus, Facility, ICAO, NdbFacility, NdbType, RunwaySurfaceType, UnitType, UserFacility, UserFacilityType, VorFacility} from '@microsoft/msfs-sdk';
import {KLNFacilityRepository} from '../../../kln90b/data/navdata/KLNFacilityRepository';
import {KLN90BUserWaypointsSettings} from '../../../kln90b/settings/KLN90BUserWaypoints';
import {UserWaypointLoaderV1} from '../../../kln90b/settings/UserWaypointLoaderV1';

// The V1 format is what users of version 1 have on disk (userDataFormat 0), so no persistor is built here: the loader
// alone restores the slots.
// Layout of a slot (documented in the loader, not in the manual): a 12 character ICAO (type, region(2), airport(4),
// ident padded to 5), the latitude +-DDMM.mm at 12-19 and the longitude +-DDDMM.mm at 20-28. Then, per type:
//   airport: altitude 29-34, runway length 35-40, surface 41; VOR: frequency 29-35 and magvar 36-38; NDB: frequency 29-35.
const bus = new EventBus();
const repo = KLNFacilityRepository.getRepository(bus);
const wptSettings = KLN90BUserWaypointsSettings.getManager(bus);

function restoreV1(...serialized: string[]): void {
    serialized.forEach((s, i) => wptSettings.getSetting(`wpt${i}`).set(s));
    new UserWaypointLoaderV1(bus, repo).restoreWaypoints();
}

function removeAll(): void {
    const all: Facility[] = [];
    repo.forEach(f => all.push(f));
    all.forEach(f => repo.remove(f));
    for (let i = 0; i < 5; i++) {
        wptSettings.getSetting(`wpt${i}`).set('');
    }
}

beforeEach(removeAll);

describe('user waypoint V1 format', () => {
    it.fails('restores a V1 longitude of 100° or more (#101)', () => {
        restoreV1('WXX    WEST +3400.00-11830.00');
        const wpt = repo.get(ICAO.value('W', 'XX', '', 'WEST'))!;
        expect(wpt.lon).toBeCloseTo(-118.5, 6);
    });

    it('restores an intersection with a western longitude (#47)', () => {
        restoreV1('WXX    USRA +4730.00-00815.50');
        const wpt = repo.get(ICAO.value('W', 'XX', '', 'USRA'))!;
        expect(wpt.lat).toBeCloseTo(47.5, 6);
        expect(wpt.lon).toBeCloseTo(-8.258333, 6);
    });

    it('restores a southern latitude (#47)', () => {
        restoreV1('WXX    SOUTH-1230.00+01015.00');
        const wpt = repo.get(ICAO.value('W', 'XX', '', 'SOUTH'))!;
        expect(wpt.lat).toBeCloseTo(-12.5, 6);
        expect(wpt.lon).toBeCloseTo(10.25, 6);
    });

    it('restores a VOR with frequency and magnetic variation (#47)', () => {
        restoreV1('VXX    ABC  +4730.00+00854.00+114.30+02');
        const vor = repo.get(ICAO.value('V', 'XX', '', 'ABC')) as VorFacility;
        expect(vor.lat).toBeCloseTo(47.5, 6);
        expect(vor.lon).toBeCloseTo(8.9, 6);
        expect(vor.freqMHz).toBeCloseTo(114.3, 6);
        expect(vor.magneticVariation).toBe(2);
    });

    it('restores an airport with altitude, runway length and surface (#47)', () => {
        restoreV1('AXX    UAPT +4700.00-00830.00+01400+03200H');
        const apt = repo.get(ICAO.value('A', 'XX', '', 'UAPT')) as AirportFacility;
        expect(apt.lat).toBeCloseTo(47, 6);
        expect(apt.lon).toBeCloseTo(-8.5, 6);
        expect(apt.altitude).toBe(1400);
        expect(UnitType.METER.convertTo(apt.runways[0].length, UnitType.FOOT)).toBeCloseTo(3200, 3);
        expect(apt.runways[0].surface).toBe(RunwaySurfaceType.Asphalt);
    });

    // The error names the character of the V2 offset (48), which is empty in a V1 slot
    it.fails('names the unknown runway surface character in its error (#116)', () => {
        expect(() => restoreV1('AXX    UAPT +4700.00-00830.00+01400+03200X')).toThrow('runwaySurface:X');
    });

    // Contract source for the cases below: docs/architecture.md Core 7 (V1: the 12 character ICAO, then latitude
    // +DDMM.MM, longitude +DDDMM.MM and the type-specific fields)

    it('restores a supplementary waypoint of the SUP page', () => {
        restoreV1('UXX    MYWPT+4730.00+00815.00');
        const wpt = repo.get(ICAO.value('U', 'XX', '', 'MYWPT')) as UserFacility;
        expect(wpt.lat).toBeCloseTo(47.5, 6);
        expect(wpt.lon).toBeCloseTo(8.25, 6);
        expect(wpt.userFacilityType).toBe(UserFacilityType.LAT_LONG);
        expect(wpt.isTemporary).toBe(false);
    });

    it('restores a grass runway', () => {
        restoreV1('AXX    UAPT +4700.00+00800.00+01400+02500S');
        const apt = repo.get(ICAO.value('A', 'XX', '', 'UAPT')) as AirportFacility;
        expect(apt.altitude).toBe(1400);
        expect(apt.runways[0].surface).toBe(RunwaySurfaceType.Grass);
        expect(UnitType.METER.convertTo(apt.runways[0].length, UnitType.FOOT)).toBeCloseTo(2500, 3);
    });

    // f745fb3: an airport without a runway length has -10 m in the model, and the stored number is negative
    it('restores an airport with a runway of unknown length (f745fb3)', () => {
        restoreV1('AXX    UAPU +4700.00+00800.00-00001-00033-');
        const apt = repo.get(ICAO.value('A', 'XX', '', 'UAPU')) as AirportFacility;
        expect(apt.altitude).toBe(-1);
        // -33 ft are -10.0584 m
        expect(apt.runways[0].length).toBeCloseTo(-10.0584, 4);
        expect(apt.runways[0].surface).toBe(RunwaySurfaceType.WrightFlyerTrack);
    });

    it('restores an NDB with its frequency and type', () => {
        restoreV1('NXX    XY   +4800.00-00915.00+0345.0');
        const ndb = repo.get(ICAO.value('N', 'XX', '', 'XY')) as NdbFacility;
        expect(ndb.lat).toBeCloseTo(48, 6);
        expect(ndb.lon).toBeCloseTo(-9.25, 6);
        expect(ndb.freqMHz).toBe(345);
        expect(ndb.type).toBe(NdbType.H);
    });
});
