import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../harness/boot';
import {airport} from '../../harness/navdata/builders';
import {Screen} from '../../harness/render/screen';
import {answerTimezone} from '../../harness/timezone';

/** APT 2 of KAAA, the first airport of the scan list, after the display tick that shows the asynchronous answer */
async function zoneRow(): Promise<string> {
    const unit = await bootUnit({facilities: [airport('KAAA', 39.8, -89.7)], position: {lat: 39.8, lon: -89.7}});
    await unit.panel.selectPage('R', 'APT 2');
    await vi.advanceTimersByTimeAsync(500);
    return Screen.read().rows('R')[4];
}

// The unit shows the time zone of the airport from the sim's answer (GET_TIMEZONE_INFO, TimezoneService.test.ts)
describe('answerTimezone (harness)', () => {
    it('makes APT 2 show the zone row of a zone without daylight saving time', async () => {
        answerTimezone(-6);

        expect(await zoneRow()).toBe('Z-06       ');
    });

    it('makes APT 2 show the standard zone and the daylight saving zone of a zone that observes it in June', async () => {
        answerTimezone(-6, [5]);

        expect(await zoneRow()).toBe('Z-06(-05DT)');
    });

    it('leaves the row blank without it, like a sim with nothing attached', async () => {
        expect(await zoneRow()).toBe(' '.repeat(11));
    });
});
