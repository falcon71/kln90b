import {describe, expect, it, vi} from 'vitest';
import {Flight} from '../../harness/flight/Flight';
import {World} from '../../harness/flight/World';
import {courseDeg, pointBefore} from '../../harness/flight/geo';
import {standardRoute} from '../../harness/fixtures';

/** 3-31: NAV 1 shows DIS with one decimal below 100 NM (the proof flight checks the same row) */
const disRow = (flight: Flight) => flight.screen.half('L').split('\n')[2];
const expectedDisRow = (flight: Flight) => `DIS  ${flight.nav.distNm!.toFixed(1).padStart(4)}nm`;

async function flightToAbc(): Promise<Flight> {
    const {kaaa, abc, kbbb} = standardRoute();
    const world = new World({magvar: 0}).add(kaaa, abc, kbbb);
    // 600 kt move the distance by 0.17 NM a second, so a calculation tick shows in the model's DIS and in the row
    const start = pointBefore(kaaa, abc, 30);
    const flight = await Flight.start({world, aircraft: {lat: start.lat, lon: start.lon, altitudeFt: 3000, groundspeedKt: 600, trackTrue: courseDeg(kaaa, abc)}});
    await flight.panel.appendToFpl0(['KAAA', 'ABC', 'KBBB']);
    await flight.flyUntilActive('ABC', {timeout: 30});
    await flight.panel.selectPage('L', 'NAV 1');
    return flight;
}

describe('Flight.syncDisplay and flyUntilActive (harness)', () => {
    it('syncDisplay returns after a display tick without a calculation tick, at every phase of the second', async () => {
        const flight = await flightToAbc();
        // DIS of the model after each display tick syncDisplay flew
        const dist: (number | null)[] = [];
        const original = flight.fly.bind(flight);
        vi.spyOn(flight, 'fly').mockImplementation(async seconds => {
            await original(seconds);
            dist.push(flight.nav.distNm);
        });

        const windows: number[] = [];
        // A calculation tick falls into one of the four display ticks of a second; the calls below start in each of them
        for (let phase = 0; phase < 4; phase++) {
            dist.length = 0;
            dist.push(flight.nav.distNm);
            await flight.syncDisplay();
            windows.push(dist.length - 1);
            // The last display tick brought no new calculation: DIS is the same as before it
            expect(dist[dist.length - 1]).toBe(dist[dist.length - 2]);
            expect(disRow(flight)).toBe(expectedDisRow(flight));
            // Four display ticks, a whole second, so that the next call starts one tick later in the second than this one
            // did (this call flew one tick)
            await flight.fly(1);
        }
        // One window where no calculation fell into it, two where the first window held the calculation tick
        expect(Math.min(...windows)).toBe(1);
        expect(Math.max(...windows)).toBe(2);
    });

    it('flyUntilActive reaches the active waypoint, and throws with its name and the screen on a timeout', async () => {
        const flight = await flightToAbc();
        expect(flight.nav.activeIdent).toBe('ABC');
        const seconds = await flight.flyUntilActive('ABC', {timeout: 2});
        expect(seconds).toBe(0);

        await expect(flight.flyUntilActive('ZZZ', {timeout: 2})).rejects.toThrow(/"ZZZ active" not reached within 2 s/);
    });
});
