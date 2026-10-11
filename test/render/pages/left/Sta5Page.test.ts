import {describe, expect, it, vi} from 'vitest';
import {bootUnit, moveAircraft, settle} from '../../../harness/boot';
import {standardRoute} from '../../../harness/fixtures';
import {distanceNm} from '../../../harness/flight/geo';
import {Screen} from '../../../harness/render/screen';
import {bootOnStandardRoute} from '../../../harness/worldBoot';

describe('STA 5 page (characterization)', () => {
    it('characterization: the defaults before a prediction on a unit with no flight plan', async () => {
        const unit = await bootUnit();
        await settle(unit);
        await unit.panel.selectPage('L', 'STA 5');

        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          "RAIM STATUS
          DEST:      
          ETA:  __:__
                  UTC
            ççççççç  
          -15  0  •15"
        `);
    });
});

// The defaults of the entry fields and the COMPUTING text come before the prediction. The prediction runs through
// gps.raimPrediction, a prediction context of the main computer (#214).
describe('STA 5 page, the defaults of the RAIM prediction (6-20)', () => {
    // 6-20: the destination defaults to the last waypoint of the active flight plan when it holds no approach, the time
    // to the current ETA there, and the page shows COMPUTING while it calculates. The ETA is derived from geo.ts: the
    // great-circle distance to ABC, then ABC to KBBB, at 120 kt, from the present time (UTC, the default time zone)
    it('defaults to the last waypoint of FPL 0 and its ETA, and shows COMPUTING (6-20)', async () => {
        const {abc, kbbb} = standardRoute();
        const unit = await bootOnStandardRoute();
        const here = {lat: 47.01, lon: 8.02};
        await moveAircraft(unit, here, {groundspeedKt: 120, trackTrue: 50});
        const eta = new Date(Date.now() + (distanceNm(here, abc) + distanceNm(abc, kbbb)) / 120 * 3600 * 1000);
        const hhmm = `${String(eta.getUTCHours()).padStart(2, '0')}:${String(eta.getUTCMinutes()).padStart(2, '0')}`;

        await unit.panel.selectPage('L', 'STA 5');

        const rows = Screen.read().rows('L');
        expect(rows.slice(1, 5)).toEqual(['DEST: KBBB ', `ETA:  ${hhmm}`, '        UTC', ' COMPUTING ']);
    });

    async function onStandardRouteAtSta5() {
        const {abc, kbbb} = standardRoute();
        const unit = await bootOnStandardRoute();
        const here = {lat: 47.01, lon: 8.02};
        await moveAircraft(unit, here, {groundspeedKt: 120, trackTrue: 50});
        const eta = new Date(Date.now() + (distanceNm(here, abc) + distanceNm(abc, kbbb)) / 120 * 3600 * 1000);
        const hhmm = `${String(eta.getUTCHours()).padStart(2, '0')}:${String(eta.getUTCMinutes()).padStart(2, '0')}`;
        return {unit, kbbb, hhmm};
    }

    // 6-20: after COMPUTING the page shows seven bars from -15 to +15 minutes, above the line where RAIM is available.
    // The constellation of the harness covers the destination at every offset
    it('shows RAIM available at all seven offsets after computing (6-20, #214)', async () => {
        const {unit} = await onStandardRouteAtSta5();
        await unit.panel.selectPage('L', 'STA 5');
        await vi.advanceTimersByTimeAsync(11_000);

        expect(Screen.read().rows('L')[4]).toBe('  èèèèèèè  ');
    });

    // 6-20: the bars below the line mean RAIM is not available. With no satellite the prediction has no solution (PDOP -1)
    it('shows RAIM not available at all seven offsets when no satellite can be used (6-20, #214)', async () => {
        const {unit} = await onStandardRouteAtSta5();
        const prediction = unit.props.sensors.in.gps.raimPrediction;
        await prediction.awaitInit();
        for (const sat of prediction.getSatellites()) {
            prediction.setSatelliteInhibit(sat.prn, true);
        }
        await unit.panel.selectPage('L', 'STA 5');
        await vi.advanceTimersByTimeAsync(11_000);

        expect(Screen.read().rows('L')[4]).toBe('  ééééééé  ');
    });

    // 6-19, 6-20: the prediction is for the destination at the ETA, not for here and now (#214)
    it('predicts at the destination for the ETA and the six offsets around it (6-20, #214)', async () => {
        const {unit, kbbb, hhmm} = await onStandardRouteAtSta5();
        const setPosition = vi.spyOn(unit.props.sensors.in.gps.raimPrediction, 'setPosition');
        const predict = vi.spyOn(unit.props.sensors.in.gps.raimPrediction, 'predict');
        await unit.panel.selectPage('L', 'STA 5');
        await vi.advanceTimersByTimeAsync(11_000);

        const calls = setPosition.mock.calls;
        expect(calls).toHaveLength(7);
        for (const [lat, lon] of calls) {
            expect(lat).toBeCloseTo(kbbb.lat, 6);
            expect(lon).toBeCloseTo(kbbb.lon, 6);
        }
        const times = calls.map(c => c[3]);
        expect(times.map(t => t - times[3])).toEqual([-15, -10, -5, 0, 5, 10, 15].map(m => m * 60_000));
        expect(new Date(times[3]).toISOString().slice(11, 16)).toBe(hhmm);
        //The DOP of a fresh context reads 0, which counts as available: only predict() makes the bars mean something
        expect(predict.mock.invocationCallOrder).toEqual(setPosition.mock.invocationCallOrder.map(n => n + 1));
    });
});

// The prediction context computes the satellite geometry where and when it is told (#214)
describe('the RAIM prediction context', () => {
    it('gives a different PDOP at 47/8 and at its antipode for the same time (#214)', async () => {
        const unit = await bootUnit();
        await settle(unit);
        const prediction = unit.props.sensors.in.gps.raimPrediction;
        await prediction.awaitInit();

        const pdop = (lat: number, lon: number) => prediction.setPosition(lat, lon, 0, Date.now()).predict().getDops()[0];
        const here = pdop(47, 8);
        const antipode = pdop(-47, -172);

        expect(here).toBeGreaterThan(0);
        expect(antipode).toBeGreaterThan(0);
        expect(antipode).not.toBeCloseTo(here, 3);
    });
});
