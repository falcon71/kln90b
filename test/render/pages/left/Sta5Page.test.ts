import {describe, expect, it, vi} from 'vitest';
import {BootOptions, bootUnit, HeadlessUnit, moveAircraft, settle} from '../../../harness/boot';
import {NO_ALTIMETER, panelXml} from '../../../harness/panelXml';
import {GPSSatelliteState} from '@microsoft/msfs-sdk';
import {predictRaim} from '../../../../kln90b/GpsSolution';
import {RAIM_ENROUTE_NOT_APPROACH, stubSatellites} from '../../../harness/predictionStub';
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

    async function onStandardRouteAtSta5(opts: BootOptions = {}) {
        const {abc, kbbb} = standardRoute();
        const unit = await bootOnStandardRoute(opts);
        const here = {lat: 47.01, lon: 8.02};
        await moveAircraft(unit, here, {groundspeedKt: 120, trackTrue: 50});
        const eta = new Date(Date.now() + (distanceNm(here, abc) + distanceNm(abc, kbbb)) / 120 * 3600 * 1000);
        const hhmm = `${String(eta.getUTCHours()).padStart(2, '0')}:${String(eta.getUTCMinutes()).padStart(2, '0')}`;
        return {unit, kbbb, hhmm, eta};
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

    /**
     * Inhibits on the prediction context every satellite but four of those it has in use at the destination at the ETA,
     * and checks that the four still give a position solution there
     */
    async function keepFourAtEta(unit: HeadlessUnit, at: { lat: number, lon: number }, eta: Date): Promise<void> {
        const prediction = unit.props.sensors.in.gps.raimPrediction;
        await prediction.awaitInit();
        prediction.setPosition(at.lat, at.lon, 0, eta.getTime()).predict();
        const inUse = prediction.getSatellites()
            .filter(sat => sat.state.get() === GPSSatelliteState.InUse || sat.state.get() === GPSSatelliteState.InUseDiffApplied)
            .map(sat => sat.prn);
        expect(inUse.length).toBeGreaterThan(4); // Precondition: more than four to begin with
        const kept = inUse.slice(0, 4);
        for (const sat of prediction.getSatellites()) {
            if (!kept.includes(sat.prn)) {
                prediction.setSatelliteInhibit(sat.prn, true);
            }
        }
        prediction.setPosition(at.lat, at.lon, 0, eta.getTime()).predict();
        expect(prediction.getDops()[0]).toBeGreaterThan(0); // Precondition: the four still give a position solution
    }

    // 6-20, #453: the bars show RAIM for the approach (the 0.3 NM limit), not only a solution. Four satellites and no
    // altitude input give a position but not the five measurements RAIM needs (design 5.2)
    it('predicts RAIM not available with four satellites and no altitude input (6-20, #453)', async () => {
        const {unit, kbbb, eta} = await onStandardRouteAtSta5({panelXml: panelXml(NO_ALTIMETER)});
        await keepFourAtEta(unit, kbbb, eta);

        await unit.panel.selectPage('L', 'STA 5');
        await vi.advanceTimersByTimeAsync(11_000);

        expect(Screen.read().rows('L')[4]).toBe('  ééééééé  ');
    });

    // #453, design 5.5: with an altitude input the altitude counts as the fifth measurement. Not every four satellites give
    // a geometry within the 0.3 NM limit with the weak altitude row, so the test looks for four that do at every offset
    it('predicts RAIM available with four satellites and an altitude input (6-20, #453)', async () => {
        const {unit, kbbb, eta} = await onStandardRouteAtSta5();
        expect(unit.props.sensors.in.airdata.pressureAltitude).not.toBeNull(); // Precondition: the unit has an altitude input
        const prediction = unit.props.sensors.in.gps.raimPrediction;
        await prediction.awaitInit();
        const pageEta = Math.floor(eta.getTime() / 60_000) * 60_000; // The page predicts for the whole minute it shows
        const offsets = [-15, -10, -5, 0, 5, 10, 15].map(m => pageEta + m * 60_000);
        prediction.setPosition(kbbb.lat, kbbb.lon, 0, pageEta).predict();
        const inUse = prediction.getSatellites()
            .filter(sat => sat.state.get() === GPSSatelliteState.InUse || sat.state.get() === GPSSatelliteState.InUseDiffApplied)
            .map(sat => sat.prn);
        const keep = (kept: number[]) => {
            for (const sat of prediction.getSatellites()) {
                prediction.setSatelliteInhibit(sat.prn, !kept.includes(sat.prn));
            }
        };
        let found: number[] | null = null;
        for (let a = 0; a < inUse.length && found === null; a++) {
            for (let b = a + 1; b < inUse.length && found === null; b++) {
                for (let c = b + 1; c < inUse.length && found === null; c++) {
                    for (let d = c + 1; d < inUse.length && found === null; d++) {
                        const four = [inUse[a], inUse[b], inUse[c], inUse[d]];
                        keep(four);
                        if (offsets.every(t => predictRaim(prediction, kbbb.lat, kbbb.lon, t, true, 0.3))) {
                            found = four;
                        }
                    }
                }
            }
        }
        expect(found).not.toBeNull(); // Precondition: four satellites that do, with the altitude
        keep(found!);
        expect(offsets.some(t => predictRaim(prediction, kbbb.lat, kbbb.lon, t, false, 0.3))).toBe(false); // And not without it

        await unit.panel.selectPage('L', 'STA 5');
        await vi.advanceTimersByTimeAsync(11_000);

        expect(Screen.read().rows('L')[4]).toBe('  èèèèèèè  ');
    });

    // #453, design 5.5: the bars are for the 0.3 NM limit of the approach. The prediction context hands out a geometry with
    // RAIM for 2 NM and 1 NM but not 0.3 NM without an altitude (predictionStub.ts)
    it('predicts RAIM for the approach limit of 0.3 NM (6-20, #453)', async () => {
        const {unit} = await onStandardRouteAtSta5({panelXml: panelXml(NO_ALTIMETER)});
        vi.spyOn(unit.props.sensors.in.gps.raimPrediction, 'getSatellites').mockReturnValue(stubSatellites(RAIM_ENROUTE_NOT_APPROACH));

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
