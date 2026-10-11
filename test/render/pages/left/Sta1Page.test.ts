import {describe, expect, it, vi} from 'vitest';
import {GPSSatellite, GPSSystemState} from '@microsoft/msfs-sdk';
import {bootToSelfTest, bootUnit, HeadlessUnit, moveAircraft, settle} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {DEFAULT_START} from '../../../harness/sim/clock';

// The STA 1 snapshot of a unit with a fix is in GpsAcquisition.test.ts (describe 'STA 1 page with a fix'); the INIT
// state of an almanac search is below. The decisions of #215: INIT covers the almanac and the sky searches (ORS 20 has
// no state of its own for them), ACQ is the start model's acquisition even when nothing can be acquired, NAV A shows
// whenever there is an altitude

/**
 * A cold-and-dark unit with slow acquisition and an almanac 200 days old, powered on: an almanac search, a blind search
 * in PRN order (ORS 01 6-30). STA 1 is shown right after the self-test, before any satellite is acquired.
 */
async function almanacSearch(): Promise<HeadlessUnit> {
    const unit = await bootToSelfTest({
        storage: {fastGpsAcquisition: false, lastLatitude: 47, lastLongitude: 8, lastAlmanacDownload: DEFAULT_START.getTime() - 200 * 24 * 3600 * 1000},
    });
    await unit.panel.approveSelfTest();
    await unit.panel.selectPage('L', 'STA 1');
    return unit;
}

/** The satellite rows of both STA 1 pages (four on the first page, below the state and the header; the rest on the second) */
async function satelliteRows(unit: HeadlessUnit): Promise<string[]> {
    const first = Screen.read().rows('L').slice(2);
    await unit.panel.inner('L', 1);
    const second = Screen.read().rows('L').filter(r => r.trim() !== '');
    await unit.panel.inner('L', -1);
    return [...first, ...second];
}

/** The PRNs of the receiver's satellites below the horizon, from the SDK's zenith angle (above 90 degrees) */
function belowHorizon(unit: HeadlessUnit): number[] {
    const sats = unit.props.sensors.in.gps.gpsSatComputer.getChannels().filter(s => s !== null) as GPSSatellite[];
    return sats.filter(s => s.position.get()[0] > Math.PI / 2).map(s => s.prn).sort((a, b) => a - b);
}

/** The PRN and the ELE field of a satellite row ("*02  00 83°": PRN 2, ELE "83") */
const prnAndEle = (row: string): [number, string] => [Number(row.slice(1, 3)), row.slice(8, 10)];

describe('STA 1 page during an almanac search', () => {
    // 5-30: a * before the satellite number means the satellite is not used in the position solution; during an almanac
    // search no satellite is
    it('marks every satellite as not used in the solution during an almanac search (5-30)', async () => {
        const unit = await almanacSearch();
        expect(unit.props.sensors.in.gps.isValid()).toBe(false);

        const rows = await satelliteRows(unit);

        expect(rows.map(r => r[0])).toEqual(['*', '*', '*', '*', '*', '*', '*', '*']);
    });

    // 5-29: there are two STA 1 pages when more than four satellites are received, which the + in STA+1 shows
    it('has a second page, STA+1, with eight satellites (5-29)', async () => {
        const unit = await almanacSearch();

        expect(Screen.read().status().left).toBe('STA+1');
        expect((await satelliteRows(unit)).map(r => prnAndEle(r)[0])).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    });

    // The precondition of the #213 pin below, on the same sequence: during an almanac search with no fix the receiver
    // tracks satellites that are below the horizon by the SDK's own zenith angle (with the seed and the ephemeris of the
    // harness)
    it('characterization: the receiver tracks satellites below the horizon during an almanac search (precondition of #213)', async () => {
        const unit = await almanacSearch();

        expect(unit.props.sensors.in.gps.isValid()).toBe(false);
        expect(belowHorizon(unit)).toEqual([2, 3, 4, 5, 6, 7]);
    });

    // 5-30: the elevation column ranges from 5 to 90 degrees above the horizon; a satellite below the horizon has no
    // elevation of 5 degrees or more (the page used to mirror it: |90 - zenith|). Satellites without orbit data show
    // dashes
    it('shows no elevation of 5 degrees or more for a satellite below the horizon (5-30, #213)', async () => {
        const unit = await almanacSearch();
        const below = belowHorizon(unit);

        const shown = (await satelliteRows(unit)).map(prnAndEle).filter(([prn]) => below.includes(prn));

        expect(shown.filter(([, ele]) => /^\d\d$/.test(ele) && Number(ele) >= 5)).toEqual([]);
    });

    // #213: during the almanac search the receiver cannot know where a satellite it searches blindly stands; unknown
    // values are dashes
    it('shows dashes for the elevation of satellites without orbit data during an almanac search (#213)', async () => {
        const unit = await almanacSearch();
        const sats = unit.props.sensors.in.gps.gpsSatComputer.getChannels().filter(s => s !== null) as GPSSatellite[];
        const withoutData = sats.filter(s => s.lastEphemerisTime === undefined).map(s => s.prn);
        expect(withoutData.length).toBeGreaterThan(0);

        const shown = (await satelliteRows(unit)).map(prnAndEle).filter(([prn]) => withoutData.includes(prn));

        expect(shown.map(([, ele]) => ele)).toEqual(withoutData.map(() => '--'));
    });
});

// A real-unit video: started 829 NM from its stored position, STA 1 showed ACQ with the satellites the almanac predicts
// for the stored position and their predicted elevations, constant through the acquisition; not yet received ones with
// a * and SNR 00 (#213)
describe('STA 1 page during ACQ', () => {
    const STORED_LAT = 47 + 829 / 60;

    async function acquisition(): Promise<HeadlessUnit> {
        const unit = await bootToSelfTest({
            storage: {fastGpsAcquisition: false, lastLatitude: STORED_LAT, lastLongitude: 8, lastAlmanacDownload: DEFAULT_START.getTime() - 24 * 3600 * 1000},
        });
        await unit.panel.approveSelfTest();
        await unit.panel.selectPage('L', 'STA 1');
        return unit;
    }

    it('shows the predicted elevations, unchanged 30 s later, not the true ones (#213)', async () => {
        const unit = await acquisition();
        const gps = unit.props.sensors.in.gps;
        expect(gps.isValid()).toBe(false);
        const predicted = new Map(gps.search.predictedSatellites().map(p =>
            [p.prn, Math.round(90 - p.position.get()[0] * 180 / Math.PI)]));

        const first = (await satelliteRows(unit)).map(prnAndEle);
        await vi.advanceTimersByTimeAsync(30_000);
        const later = (await satelliteRows(unit)).map(prnAndEle);

        expect(first.map(([prn]) => prn)).toEqual([...predicted.keys()].sort((a, b) => a - b));
        for (const [prn, ele] of first) {
            expect(Math.abs(Number(ele) - predicted.get(prn)!)).toBeLessThanOrEqual(1);
        }
        expect(later).toEqual(first);
        const truth = (prn: number) => {
            const sat = gps.gpsSatComputer.getSatellites().find(s => s.prn === prn)!;
            return 90 - sat.position.get()[0] * 180 / Math.PI;
        };
        expect(first.some(([prn, ele]) => Math.abs(Number(ele) - truth(prn)) >= 3)).toBe(true);
    }, 60_000);
});

// #213: the guard itself. Right after the aircraft jumps to the other side of the earth the tracked satellites are all
// below the horizon but still have current orbit data (the SDK drops them only later). They have no elevation and show
// dashes, not the mirrored angle
describe('STA 1 page, tracked satellites with orbit data below the horizon', () => {
    it('shows dashes for a tracked satellite below the horizon that has current orbit data (5-30, #213)', async () => {
        const unit = await bootUnit({storage: {lastLatitude: 47, lastLongitude: 8}});
        await settle(unit);
        const gps = unit.props.sensors.in.gps;
        const channels = () => gps.gpsSatComputer.getChannels().filter(s => s !== null) as GPSSatellite[];
        expect(channels().length).toBeGreaterThan(0);

        await moveAircraft(unit, {lat: -47, lon: -172}, {groundspeedKt: 0});
        await unit.panel.selectPage('L', 'STA 1');

        const below = channels()
            .filter(s => s.position.get()[0] > Math.PI / 2 && s.isCachedEphemerisValid(gps.simTimeUnix))
            .map(s => s.prn).sort((a, b) => a - b);
        expect(below.length).toBeGreaterThan(0);

        const shown = (await satelliteRows(unit)).map(prnAndEle).filter(([prn]) => below.includes(prn));

        expect(shown.map(([prn]) => prn)).toEqual(below);
        expect(shown.map(([, ele]) => ele)).toEqual(below.map(() => '--'));
    }, 60_000);
});


// 5-29, 5-30: the transition state means enough satellites are tracked but no position is produced yet. A real-unit video
// shows it for about half a second between ACQ and NAV A; the unit accepts the position one calculation tick after the
// receiver has its solution (#215)
describe('STA 1 receiver states (5-29)', () => {
    it('shows TRAN on the tick of the first solution, NAV one second later (5-29, #215)', async () => {
        const unit = await bootToSelfTest({
            storage: {fastGpsAcquisition: false, lastLatitude: 47, lastLongitude: 8, lastAlmanacDownload: DEFAULT_START.getTime() - 24 * 3600 * 1000},
        });
        await unit.panel.approveSelfTest();
        await unit.panel.selectPage('L', 'STA 1');
        const gps = unit.props.sensors.in.gps;
        const sdkSolution = () => gps.gpsSatComputer.state === GPSSystemState.SolutionAcquired;
        for (let i = 0; i < 600 && !sdkSolution(); i++) {
            await vi.advanceTimersByTimeAsync(250);
        }
        expect(sdkSolution()).toBe(true);
        await vi.advanceTimersByTimeAsync(250); //one display tick

        expect(gps.isValid()).toBe(false);
        expect(Screen.read().rows('L')[0]).toBe('STATE  TRAN');

        await vi.advanceTimersByTimeAsync(1000);
        expect(gps.isValid()).toBe(true);
        expect(Screen.read().rows('L')[0]).toMatch(/^STATE (  NAV|NAV A|NAV D)$/);
    }, 60_000);
});
