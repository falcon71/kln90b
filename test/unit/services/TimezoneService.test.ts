import {beforeEach, describe, expect, it} from 'vitest';
import {TimezoneService} from '../../../kln90b/services/TimezoneService';
import {simEnv} from '../../harness/sim/install';

// The sim's Coherent call GET_TIMEZONE_INFO(datum, lat, lon) answers {utcOffset (ms), dstActive}; APT 2 shows the
// zone it reports. The fake records the call and answers with a configured reply.
describe('TimezoneService (characterization of the sim call)', () => {
    beforeEach(() => simEnv().coherent.reset());

    it('asks the sim for the zone at a time and position', async () => {
        const {coherent} = simEnv();
        coherent.replies.set('GET_TIMEZONE_INFO', () => ({utcOffset: 0, dstActive: false}));

        await TimezoneService.getTimezoneInfo(Date.UTC(2026, 0, 15), 37.1, -76.5);

        expect(coherent.calls).toEqual([{name: 'GET_TIMEZONE_INFO', args: [Date.UTC(2026, 0, 15), 37.1, -76.5]}]);
    });

    it('passes the answer of the sim through, whatever it is', async () => {
        const {coherent} = simEnv();
        let reply = {utcOffset: 19800000, dstActive: true};
        coherent.replies.set('GET_TIMEZONE_INFO', () => reply);

        expect(await TimezoneService.getTimezoneInfo(Date.UTC(2026, 6, 15), 28.6, 77.2)).toEqual({utcOffset: 19800000, dstActive: true});

        reply = {utcOffset: -12600000, dstActive: false};
        expect(await TimezoneService.getTimezoneInfo(Date.UTC(2026, 0, 15), 47.5, -52.7)).toEqual({utcOffset: -12600000, dstActive: false});
    });
});
