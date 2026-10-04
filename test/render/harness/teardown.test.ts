import {describe, expect, it} from 'vitest';
import {bootUnit, teardown} from '../../harness/boot';
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
