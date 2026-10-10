import {beforeAll, beforeEach, describe, expect, it, onTestFinished, vi} from 'vitest';
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

describe('user waypoint persistor restore', () => {
    const repo = KLNFacilityRepository.getRepository(bus);
    // One persistor for the describe: it stays subscribed to the repository for the rest of the file, so a second one
    // built by the second test would be a persistor that does not ignore the sync
    let setup: { saveManager: KLN90BSettingSaveManager, persistor: UserWaypointPersistor } | undefined;

    beforeEach(() => {
        const all: Facility[] = [];
        repo.forEach(f => all.push(f));
        all.forEach(f => repo.remove(f));
        // The settings and the save manager write what they hold; the storage is cleared after them, before the test
        // writes its own slots
        simEnv().storage.reset();
    });

    /**
     * Stores a user VOR in wpt0 and a supplementary waypoint in wpt1 (format 2), builds the save manager with load and
     * autosave and the persistor, and restores. Returns the spy on SetStoredData that was installed just before the
     * restore, so it counts only the writes of the restore.
     */
    function restoreFromStorage() {
        const data = simEnv().storage.data;
        data.set(K + 'userDataFormat', '2');
        data.set(K + 'wpt0', JSON.stringify('VXX        ABC     +4730.00+00854.00+114.30+02'));
        data.set(K + 'wpt1', JSON.stringify('WXX        USRA    +4730.00-00815.50'));

        if (setup === undefined) {
            const userSettings = new KLN90BUserSettings(bus);
            setup = {
                saveManager: new KLN90BSettingSaveManager(bus, userSettings),
                persistor: new UserWaypointPersistor(bus, repo, userSettings),
            };
        }
        setup.saveManager.load('KLN TEST.profile_1');
        setup.saveManager.startAutoSave('KLN TEST.profile_1');

        const spy = vi.spyOn(globalThis as any, 'SetStoredData');
        onTestFinished(() => spy.mockRestore());
        setup.persistor.restoreWaypoints();
        return spy;
    }

    // docs/architecture.md Core 7: the user waypoints stored in wpt0 to wpt249 are restored into the repository. This is
    // the setup of the pin below, asserting what works today: both slots arrive in the repository
    it('restores the stored waypoints into the repository', () => {
        restoreFromStorage();

        const vor = repo.get(ICAO.value('V', 'XX', '', 'ABC'))!;
        expect(vor.lat).toBeCloseTo(47.5, 6);
        expect(vor.lon).toBeCloseTo(8.9, 6);
        const usra = repo.get(ICAO.value('W', 'XX', '', 'USRA'))!;
        expect(usra.icaoStruct.ident).toBe('USRA');
        expect(usra.lat).toBeCloseTo(47.5, 6);
        expect(usra.lon).toBeCloseTo(-(8 + 15.5 / 60), 6);
    });

    // 1781156 ("Do not write user waypoints while importing them") was undone by 933479d: the persistor still sets
    // ignoreSync, but the delegation to the loaders moved it out of the persistor's reach, so every restored waypoint
    // rewrites all slots in the saved data. A crash during a restore would lose waypoints.
    it.fails('does not write storage while restoring (1781156) (#103)', () => {
        const spy = restoreFromStorage();

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
