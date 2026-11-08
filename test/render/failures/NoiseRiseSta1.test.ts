import {afterEach, describe, expect, it, vi} from 'vitest';
import {GPSSatellite, GPSSatelliteState} from '@microsoft/msfs-sdk';
import {bootToSelfTest, bootUnit, HeadlessUnit, untilCalcTick} from '../../harness/boot';
import {DEFAULT_START} from '../../harness/sim/clock';
import {Screen} from '../../harness/render/screen';
import {standardRoute} from '../../harness/fixtures';
import {savedFlightplan} from '../../harness/storage';
import {forceNoiseRise} from '../../harness/gps';
import {SearchMode} from '../../../kln90b/GpsSearch';

/**
 * What STA 1 and the receiver show under a raised noise floor, whatever raises it (#460, #467): the start model's states
 * come first, a lost satellite is listed once as searched (*xx 00, Pilot's Guide 5-29, 5-30; Installation Manual C-7), and a
 * satellite in use loses the rise from its SNR. Ported from #460's jamming ramp tests (#465): the rise is put into the
 * signals directly (forceNoiseRise), so these hold apart from the transmitters that cause it in the sim
 */

/** 26 dB over 240 s from the boot, as #460's ramp started at the boot */
const RISING = (ticks: number) => Math.min(26, ticks * 26 / 240);

/**
 * The stored data of a unit last used here yesterday (GpsAcquisition.test.ts): the start model runs a warm start. REAL,
 * because FAST would make it a hot start from the true state (#468), with its fix before the self-test is approved
 */
const WARM_START = {fastGpsAcquisition: false, lastLatitude: 47, lastLongitude: 8, lastAlmanacDownload: DEFAULT_START.getTime() - 24 * 60 * 60 * 1000};

const byNumber = (a: number, b: number) => a - b;
const TRACKED = new Set([GPSSatelliteState.Acquired, GPSSatelliteState.DataCollected, GPSSatelliteState.InUse, GPSSatelliteState.InUseDiffApplied]);

afterEach(() => {
    vi.restoreAllMocks();
});

/**
 * An engine-running unit at KAAA, 3000 ft, flying FPL 0 KAAA, ABC, KBBB. The position is the one stored at the last
 * power-off, so the boot posts no POSITION DIFFERS message. STA 1 is on the left.
 */
async function routeFlight(): Promise<HeadlessUnit> {
    const r = standardRoute();
    const unit = await bootUnit({
        facilities: [r.kaaa, r.abc, r.kbbb], position: {lat: r.kaaa.lat, lon: r.kaaa.lon}, altitudeFt: 3000,
        storage: {lastLatitude: r.kaaa.lat, lastLongitude: r.kaaa.lon, ...savedFlightplan(0, [r.kaaa, r.abc, r.kbbb])},
    });
    await unit.panel.selectPage('L', 'STA 1');
    return unit;
}

/** The satellite rows of both STA 1 pages (four on the first page, below the state and the header; the rest on the second, below its header) */
async function satelliteRows(unit: HeadlessUnit): Promise<string[]> {
    const first = Screen.read().rows('L').slice(2);
    if (Screen.read().status().left !== 'STA+1') {
        return first.filter(r => r.trim() !== '');
    }
    await unit.panel.inner('L', 1);
    const second = Screen.read().rows('L').slice(1).filter(r => r.trim() !== '');
    await unit.panel.inner('L', -1);
    return [...first, ...second];
}

/** Brings the display one tick past a calculation tick, so that the screen shows what that calculation tick left */
async function afterCalcTick(unit: HeadlessUnit): Promise<void> {
    await untilCalcTick(unit);
    await vi.advanceTimersByTimeAsync(250);
}

const prnOf = (row: string) => Number(row.slice(1, 3));

describe('STA 1 under a raised noise floor (#460, #467)', () => {
    // A satellite whose signal is lost stays in its channel, searched (#467), and is listed once, from its channel
    it('no satellite is listed twice while the satellites are lost and searched', async () => {
        forceNoiseRise(RISING);
        const unit = await routeFlight();
        const gps = unit.props.sensors.in.gps;
        await vi.advanceTimersByTimeAsync(30_000);

        const repeated: string[] = [];
        let lostInChannel = 0;
        for (let s = 30; s < 90; s++) {
            await afterCalcTick(unit);
            const channels = gps.gpsSatComputer.getChannels().filter(sat => sat !== null) as GPSSatellite[];
            if (channels.some(sat => gps.signals.isLost(sat.prn))) {
                lostInChannel++;
            }
            const prns = (await satelliteRows(unit)).map(prnOf);
            if (new Set(prns).size !== prns.length) {
                repeated.push(`${s} s: ${prns.join(',')}`);
            }
        }

        expect(lostInChannel).toBeGreaterThan(0); // Precondition: lost satellites were searched in their channels
        expect(repeated).toEqual([]);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // #468: FAST initializes the memory from the truth and runs the search as REAL does, so a cold power-on under a full
    // rise has no forced acquisition to skip: the search finds nothing (#460 design, non-goals)
    it('a FAST power-on under a rise of 26 dB acquires nothing', async () => {
        forceNoiseRise(() => 26);
        const unit = await bootToSelfTest({storage: {fastGpsAcquisition: true, lastLatitude: 47, lastLongitude: 8}});
        await unit.panel.approveSelfTest();
        const gps = unit.props.sensors.in.gps;

        for (let s = 0; s < 120; s++) {
            await vi.advanceTimersByTimeAsync(1000);
            expect(gps.gpsSatComputer.getSatellites().filter(sat => TRACKED.has(sat.state.get())).map(sat => sat.prn)).toEqual([]);
        }
        expect(gps.hadFixSincePowerOn).toBe(false);
        expect(gps.isValid()).toBe(false);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // During an almanac search STA 1 shows INIT, also under a noise rise. REAL, because FAST completes the almanac at
    // power-on (#468)
    it('a rising noise floor during an almanac search: STA 1 shows INIT', async () => {
        let rise = 0;
        forceNoiseRise(n => rise = RISING(n));
        const unit = await bootToSelfTest({
            storage: {fastGpsAcquisition: false, lastLatitude: 47, lastLongitude: 8, lastAlmanacDownload: DEFAULT_START.getTime() - 200 * 24 * 3600 * 1000},
        });
        await unit.panel.approveSelfTest();
        await unit.panel.selectPage('L', 'STA 1');

        expect(rise).toBeGreaterThan(0); // Preconditions
        expect(unit.props.sensors.in.gps.search.mode).toBe(SearchMode.AlmanacSearch);
        expect(Screen.read().rows('L')[0]).toBe('STATE  INIT');
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // The start model's acquisition lists the satellites predicted for the stored position (#213). Under the rise a lost
    // one reads *xx 00 and one in use loses the rise from its SNR, as in the channel list (#460 design, "STA 1 and STA 2")
    it("a rise of 8 dB during the start model's acquisition: the predicted list shows the lost satellites searched and the SNRs lowered", async () => {
        // 8 dB from the first calculation tick on. The fade and the estimate noise are pinned (#467), so the SNR is the
        // antenna's curve, the block offset and the rise
        forceNoiseRise(() => 8);
        const unit = await bootUnit({engineRunning: false, storage: WARM_START});
        const gps = unit.props.sensors.in.gps;
        gps.signals.fadeScale = 0;
        gps.signals.jitterScale = 0;
        await unit.panel.powerOn();
        await vi.advanceTimersByTimeAsync(19_000);
        await unit.panel.approveSelfTest();
        await unit.panel.selectPage('L', 'STA 1');
        const inUse = () => gps.gpsSatComputer.getSatellites().filter(s => s.state.get() === GPSSatelliteState.InUse).map(s => s.prn).sort(byNumber);
        for (let t = 0; t < 240 && inUse().length === 0; t++) {
            await vi.advanceTimersByTimeAsync(250);
        }
        await vi.advanceTimersByTimeAsync(250); // A display tick after the calculation tick that put them in use

        // Preconditions: the start model's acquisition without a fix, two satellites in use
        expect(gps.search.mode).toBe(SearchMode.Acquisition);
        expect(gps.isValid()).toBe(false);
        expect(inUse()).toEqual([1, 21]);

        // 01 at 25 degrees, a GPS IIF, is 46.5 at the antenna (50 + 12 x log10(sin 25 degrees) + 1, #464, #467) and 38.5
        // with 8 dB, shown as 39; 21 at 55 degrees, a GPS IIR-A, is 48 and 40. 14 at 10 degrees, a GPS IIIA, is 39.4 at the antenna (the
        // curve less 1.5) and 31.4 with the rise: below the acquire level of 35, lost and searched
        expect(gps.signals.isLost(14)).toBe(true); // Precondition
        expect(Screen.read().rows('L')[0]).toBe('STATE   ACQ');
        expect(await satelliteRows(unit)).toEqual([
            ' 01  39 25°', '*08  00 76°', '*10  00 48°', '*14  00 10°', '*16  00 10°', ' 21  40 55°', '*23  00 18°', '*27  00 57°',
        ]);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // TRAN comes before the ACQ of a loss of signal: a unit that acquires its first fix under a rise just begun shows it
    it('a rising noise floor during the transition to the first fix: STA 1 shows TRAN', async () => {
        let rise = 0;
        forceNoiseRise(n => rise = RISING(n));
        const unit = await bootToSelfTest({storage: WARM_START});
        await unit.panel.approveSelfTest();
        await unit.panel.selectPage('L', 'STA 1');
        const gps = unit.props.sensors.in.gps;
        for (let t = 0; t < 600 && !gps.isTransition(); t++) {
            await vi.advanceTimersByTimeAsync(250);
        }
        expect(gps.isTransition()).toBe(true); // Preconditions: TRAN, the rise under way
        expect(rise).toBeGreaterThan(0);
        await vi.advanceTimersByTimeAsync(250); // The display tick after the calculation tick of TRAN

        expect(gps.isTransition()).toBe(true);
        expect(Screen.read().rows('L')[0]).toBe('STATE  TRAN');
        expect(unit.errors).toEqual([]);
    }, 60_000);
});
