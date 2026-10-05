import {beforeAll, beforeEach, describe, expect, it, vi} from 'vitest';
import {EventBus, Facility, ICAO, UserFacility, UserFacilityType} from '@microsoft/msfs-sdk';
import {KLNFacilityRepository} from '../../../kln90b/data/navdata/KLNFacilityRepository';
import {KLN90BUserWaypointsSettings} from '../../../kln90b/settings/KLN90BUserWaypoints';
import {KLN90BUserSettings} from '../../../kln90b/settings/KLN90BUserSettings';
import {KLN90BSettingSaveManager} from '../../../kln90b/settings/KLN90BUserSettingsSaverManager';
import {UserWaypointPersistor} from '../../../kln90b/settings/UserWaypointPersistor';
import {simEnv} from '../../harness/sim/install';

const K = 'persistent-setting.KLN TEST.profile_1.';

// The settings manager and the repository are singletons bound to the first bus, so every test of the file shares one
const bus = new EventBus();

describe('user waypoint persistor', () => {
    // 1781156 ("Do not write user waypoints while importing them") was undone by 933479d: the persistor still sets
    // ignoreSync, but the delegation to the loaders moved it out of the persistor's reach, so every restored waypoint
    // rewrites all slots in the saved data. A crash during a restore would lose waypoints.
    it.fails('does not write storage while restoring (1781156) (#103)', () => {
        const data = simEnv().storage.data;
        data.set(K + 'userDataFormat', '2');
        data.set(K + 'wpt0', JSON.stringify('VXX        ABC     +4730.00+00854.00+114.30+02'));
        data.set(K + 'wpt1', JSON.stringify('WXX        USRA    +4730.00-00815.50'));

        const userSettings = new KLN90BUserSettings(bus);
        const saveManager = new KLN90BSettingSaveManager(bus, userSettings);
        saveManager.load('KLN TEST.profile_1');
        saveManager.startAutoSave('KLN TEST.profile_1');
        const repo = KLNFacilityRepository.getRepository(bus);
        const persistor = new UserWaypointPersistor(bus, repo, userSettings);

        const spy = vi.spyOn(globalThis as any, 'SetStoredData');
        persistor.restoreWaypoints();

        expect(repo.get(ICAO.value('W', 'XX', '', 'USRA'))!.icaoStruct.ident).toBe('USRA');
        expect(spy).not.toHaveBeenCalled();
    });
});

// Contract source: docs/architecture.md Core 7: waypoints persist on every repository change, all slots wpt0 to wpt249
// are rewritten, and the stored format is `ICAO V2 + coordinates`.
describe('user waypoint persistor slots', () => {
    const wptSettings = KLN90BUserWaypointsSettings.getManager(bus);
    const slot = (i: number) => wptSettings.getSetting(`wpt${i}`).get();
    const sup = (ident: string, lat: number, lon: number) => ({
        icao: '', icaoStruct: ICAO.value('U', 'XX', '', ident), name: '', lat, lon, region: 'XX', city: '',
        isTemporary: false, userFacilityType: UserFacilityType.LAT_LONG,
    } as unknown as UserFacility);
    const repo = KLNFacilityRepository.getRepository(bus);

    beforeAll(() => {
        const userSettings = new KLN90BUserSettings(bus);
        userSettings.getSetting('userDataFormat').set(2);
        new UserWaypointPersistor(bus, repo, userSettings);
    });

    beforeEach(() => {
        const all: Facility[] = [];
        repo.forEach(f => all.push(f));
        all.forEach(f => repo.remove(f));
        wptSettings.getAllSettings().forEach(s => s.set(''));
    });

    it('clears the slot that a removed waypoint leaves behind', () => {
        repo.add(sup('ONE', 47, 8));
        repo.add(sup('TWO', 47, 9));
        expect(slot(0)).toBe('UXX        ONE     +4700.00+00800.00');
        expect(slot(1)).toBe('UXX        TWO     +4700.00+00900.00');

        repo.remove(ICAO.value('U', 'XX', '', 'TWO'));

        expect(slot(0)).toBe('UXX        ONE     +4700.00+00800.00');
        expect(slot(1)).toBe('');
    });

    it('keeps the 250th waypoint in wpt249', () => {
        for (let i = 0; i < 250; i++) {
            repo.add(sup(`W${i}`, 47, 8));
        }

        expect(slot(248)).toBe('UXX        W248    +4700.00+00800.00');
        expect(slot(249)).toBe('UXX        W249    +4700.00+00800.00');
    });
});
