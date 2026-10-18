import {describe, expect, it, onTestFinished, vi} from 'vitest';
import {UserSettingSaveManager} from '@microsoft/msfs-sdk';
import {bootUnit, teardown} from '../../harness/boot';
import {KLN90BCore} from '../../../kln90b/KLN90BCore';
import {simEnv} from '../../harness/sim/install';

describe('teardown of a booted unit (harness)', () => {
    it('runs every real step when an earlier step throws, rethrows it, and lets the next boot proceed', async () => {
        const first = await bootUnit();
        const env = simEnv();
        env.magvar = () => 7;
        env.storage.data.set('some.key', 'value');
        expect(env.xhr.requests.map(u => u.slice(u.lastIndexOf('/') + 1))).toEqual(['gps_ephemeris.json', 'msa.json', 'gps_sbas.json']);
        expect(document.getElementById('pageContainer')).not.toBeNull();

        expect(() => teardown([() => {
            throw new Error('injected');
        }])).toThrow('injected');

        // Steps after the throwing one ran: the fakes, the magvar, the requests and the DOM were reset
        expect(env.storage.data.size).toBe(0);
        expect(env.xhr.requests).toEqual([]);
        expect(env.magvar(0, 0)).toBe(0);
        expect(document.getElementById('pageContainer')).toBeNull();
        // The live marker was cleared although the teardown failed, so a boot is allowed again in this test
        const second = await bootUnit();
        expect(second.props).not.toBe(first.props);
    });
});

describe('Math.random across a boot (harness)', () => {
    it('is the seeded generator while the unit lives and the real one again after the teardown', async () => {
        await bootUnit();
        expect(vi.isMockFunction(Math.random)).toBe(true);

        teardown();

        expect(vi.isMockFunction(Math.random)).toBe(false);
    });

    // The SDK's UserSetting draws Math.random once per setting it builds, so every new setting key would shift each later
    // draw, the GPS start times of the seeded tests in GpsAcquisition.test.ts among them. bootUnit starts the sequence
    // again once the KLN90BCore constructor has built the settings
    it('starts the sequence again from the seed once the user settings are built, however many draws building them took', async () => {
        // 90 more draws while the settings are loaded, as 90 more setting keys would make
        const load = UserSettingSaveManager.prototype.load;
        const loadSpy = vi.spyOn(UserSettingSaveManager.prototype, 'load').mockImplementation(function (this: UserSettingSaveManager, key: string) {
            for (let i = 0; i < 90; i++) {
                Math.random();
            }
            load.call(this, key);
        });
        const init = KLN90BCore.prototype.init;
        let firstInInit: number | undefined;
        const initSpy = vi.spyOn(KLN90BCore.prototype, 'init').mockImplementation(function (this: KLN90BCore, xml: Document) {
            firstInInit = Math.random();
            return init.call(this, xml);
        });
        onTestFinished(() => {
            loadSpy.mockRestore();
            initSpy.mockRestore();
        });

        await bootUnit({seed: 7});

        expect(loadSpy).toHaveBeenCalledTimes(1); // Precondition: the extra draws ran inside the constructor
        // The first draw of mulberry32 from seed 7, computed once outside the harness from the published algorithm
        expect(firstInInit).toBe(0.011704753153026104);
    });
});
