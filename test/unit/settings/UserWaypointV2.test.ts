import {beforeEach, describe, expect, it} from 'vitest';
import {AirportFacility, EventBus, Facility, FacilityType, ICAO, NdbFacility, RunwaySurfaceType, UnitType, VorFacility} from '@microsoft/msfs-sdk';
import {KLNFacilityRepository} from '../../../kln90b/data/navdata/KLNFacilityRepository';
import {KLN90BUserWaypointsSettings} from '../../../kln90b/settings/KLN90BUserWaypoints';
import {KLN90BUserSettings} from '../../../kln90b/settings/KLN90BUserSettings';
import {UserWaypointPersistor} from '../../../kln90b/settings/UserWaypointPersistor';
import {UserWaypointLoaderV2} from '../../../kln90b/settings/UserWaypointLoaderV2';

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
        // Restoring re-persists through the repository sync, so the slot must hold the identical string again
        expect(storedSlot(0)).toBe('AXX        KAAA    +4700.00-00830.00+01400+03200H');
    });

    it('restores a user NDB', () => {
        restoreFrom('NXX        XY      +4800.00+00900.00+0345.0');
        const ndb = repo.get(ICAO.value('N', 'XX', '', 'XY')) as NdbFacility;
        expect(ICAO.getFacilityTypeFromValue(ndb.icaoStruct)).toBe(FacilityType.NDB);
        expect(ndb.freqMHz).toBeCloseTo(345, 6);
        // Restoring re-persists through the repository sync, so the slot must hold the identical string again
        expect(storedSlot(0)).toBe('NXX        XY      +4800.00+00900.00+0345.0');
    });

    it('restores a southern waypoint without throwing', () => {
        expect(() => restoreFrom('WXX        SOUTH   -1230.00+01015.00')).not.toThrow();
        expect(repo.get(ICAO.value('W', 'XX', '', 'SOUTH'))).toBeDefined();
    });

    it.fails('restores a southern latitude (#98)', () => {
        restoreFrom('WXX        SOUTH   -1230.00+01015.00');
        const wpt = repo.get(ICAO.value('W', 'XX', '', 'SOUTH'))!;
        expect(wpt.lat).toBeCloseTo(-12.5, 6);
    });
});
