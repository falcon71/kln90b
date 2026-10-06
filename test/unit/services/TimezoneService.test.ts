import {beforeEach, describe, expect, it} from 'vitest';
import {TimezoneService} from '../../../kln90b/services/TimezoneService';
import {simEnv} from '../../harness/sim/install';

// Source: the sim's Coherent call GET_TIMEZONE_INFO(datum, lat, lon), which answers {utcOffset (ms), dstActive}.
// APT 2 shows the result (3-43: "Z-05(-04DT)"). The fake records the call and answers with a configured reply.
describe('TimezoneService (characterization of the sim call)', () => {
    beforeEach(() => simEnv().coherent.reset());

    it('asks the sim for the zone at a time and position and passes its answer through', async () => {
        const {coherent} = simEnv();
        coherent.replies.set('GET_TIMEZONE_INFO', () => ({utcOffset: -5 * 3600000, dstActive: false}));

        const info = await TimezoneService.getTimezoneInfo(Date.UTC(2026, 0, 15), 37.1, -76.5);

        expect(coherent.calls).toEqual([{name: 'GET_TIMEZONE_INFO', args: [Date.UTC(2026, 0, 15), 37.1, -76.5]}]);
        expect(info).toEqual({utcOffset: -18000000, dstActive: false});
    });
});
