import {describe, expect, it, vi} from 'vitest';
import {EventBus, ICAO} from '@microsoft/msfs-sdk';
import {KLNFacilityRepository} from '../../../kln90b/data/navdata/KLNFacilityRepository';
import {KLN90BUserSettings} from '../../../kln90b/settings/KLN90BUserSettings';
import {KLN90BSettingSaveManager} from '../../../kln90b/settings/KLN90BUserSettingsSaverManager';
import {UserWaypointPersistor} from '../../../kln90b/settings/UserWaypointPersistor';
import {simEnv} from '../../harness/sim/install';

const K = 'persistent-setting.KLN TEST.profile_1.';

describe('user waypoint persistor', () => {
    // 1781156 ("Do not write user waypoints while importing them") was undone by 933479d: the persistor still sets
    // ignoreSync, but the delegation to the loaders moved it out of the persistor's reach, so every restored waypoint
    // rewrites all slots in the saved data. A crash during a restore would lose waypoints.
    it.fails('does not write storage while restoring (1781156) (#103)', () => {
        const data = simEnv().storage.data;
        data.set(K + 'userDataFormat', '2');
        data.set(K + 'wpt0', JSON.stringify('VXX        ABC     +4730.00+00854.00+114.30+02'));
        data.set(K + 'wpt1', JSON.stringify('WXX        USRA    +4730.00-00815.50'));

        const bus = new EventBus();
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
