import {describe, expect, it, vi} from 'vitest';
import {GPSSatelliteState} from '@microsoft/msfs-sdk';
import {bootToSelfTest, bootUnit, HeadlessUnit, settle} from '../../harness/boot';
import {DEFAULT_START} from '../../harness/sim/clock';
import {savedUserWaypoints, storedSetting} from '../../harness/storage';
import {messageLines, messages, userWaypoints} from '../../harness/readers';
import {openFlr1, openFlr2} from '../../harness/render/flrPages';
import {Screen} from '../../harness/render/screen';
import {SearchMode} from '../../../kln90b/GpsSearch';

// #461: the receiver's own battery-backed memory after a wipe. Characterizations of the design
// (docs/superpowers/specs/2026-11-08-failures-battery-design.md, "The wipe", the GPS bullets and RCVR HARDWARE ERROR
// 0008, and "The clock across sessions"). The clock of a wiped unit starts on 1 JAN 1988, the default of the unit's date
// editors (a guess), so its first fix in 2026 comes out two GPS eras early
const ERA_MS = 1024 * 7 * 86_400_000;
const TOLERANCE_MS = 3000;
const START = DEFAULT_START.getTime();
const DAY = 86_400_000;
const MINUTE = 60_000;
/** The almanac search takes about 20 minutes (ORS 01 6-30); the bound of the waits for the first fix */
const FIX_CAP_S = 40 * 60;
const SLOW = 300_000;

/** The sim's time in UNIX ms, from the fake clock and the sim's offset, not from the unit */
const simNowMs = (unit: HeadlessUnit) => Date.now() + unit.env.sim.absoluteTimeOffsetMs;
const gpsOf = (unit: HeadlessUnit) => unit.props.sensors.in.gps;
const clock = (unit: HeadlessUnit) => gpsOf(unit).timeZulu.getTimestamp();
const BEFORE_1989 = Date.UTC(1989, 0, 1);

const has0008 = (unit: HeadlessUnit) => messageLines(unit).some(l => l.length === 2 && l[0] === 'RCVR HARDWARE ERROR:' && l[1] === '0008');
const hasReceiverError = (unit: HeadlessUnit) => messageLines(unit).some(l => l[0] === 'RCVR HARDWARE ERROR:');
const userDataLost = (unit: HeadlessUnit) => messages(unit).filter(m => m === 'USER DATA LOST').length;
const positionDiffers = (unit: HeadlessUnit) => messages(unit).some(m => m.startsWith('POSITION DIFFERS FROM'));

/** The states of a satellite the receiver tracks: acquired, its data collected, or in use */
const TRACKED_STATES: readonly GPSSatelliteState[] = [GPSSatelliteState.Acquired, GPSSatelliteState.DataCollected, GPSSatelliteState.InUse, GPSSatelliteState.InUseDiffApplied];
/** Some satellite in the receiver's channels is tracked, read from the channels and not from GPS.tracksSatellite */
const tracked = (unit: HeadlessUnit) => gpsOf(unit).gpsSatComputer.getChannels().some(s => s !== null && TRACKED_STATES.includes(s.state.get()));

/** Advances in 1 s steps until a satellite is tracked, asserting 0008 is listed until then */
async function untilTrackedWith0008(unit: HeadlessUnit): Promise<void> {
    for (let s = 0; !tracked(unit); s++) {
        if (s >= 30 * 60) throw new Error('no satellite tracked within 30 minutes');
        expect(has0008(unit)).toBe(true);
        await vi.advanceTimersByTimeAsync(1000);
    }
}

/** Every PRN of the ephemeris file with an ephemeris collected half an hour before the boot */
const OLD_EPHEMERIS = Array.from({length: 32}, (_, i) => `${i + 1}:${START - 30 * MINUTE}`).join(',');

/**
 * The receiver's memory of an earlier session, far from the aircraft at 47/8: without the wipe the first fix would post
 * POSITION DIFFERS (B-3). A current almanac, an ephemeris, a user waypoint, REAL
 */
const STORED: Record<string, unknown> = {
    ...savedUserWaypoints([{kind: 'int', ident: 'USRA', lat: 47.2, lon: 8.2}]),
    userDataFormat: 2,
    fastGpsAcquisition: false,
    lastLatitude: -47,
    lastLongitude: -172,
    lastAlmanacDownload: START - DAY,
    lastEphemeris: OLD_EPHEMERIS,
    failure_battery: '{}',
};

async function service(unit: HeadlessUnit): Promise<void> {
    await openFlr1(unit);
    await unit.panel.cursor('L');
    await unit.panel.cursorTo('L', 'SERVICE?');
    await unit.panel.ent();
    await unit.panel.ent();
}

describe('the receiver\'s memory after a wipe (#461)', () => {
    it('the clock starts at 1 JAN 1988', async () => {
        const unit = await bootToSelfTest({storage: STORED});

        // bootToSelfTest waits 19 s from the power-on, which the clock runs on; the offset is stored at the power-on
        expect(Math.abs(clock(unit) - (Date.UTC(1988, 0, 1) + 19_000))).toBeLessThan(TOLERANCE_MS);
        expect(Math.abs((storedSetting(unit, 'clockOffset') as number) - (Date.UTC(1988, 0, 1) - (simNowMs(unit) - 19_000)))).toBeLessThan(TOLERANCE_MS);
    }, SLOW);

    it('an almanac search, no POSITION DIFFERS, and the rollover date', async () => {
        const unit = await bootToSelfTest({storage: STORED});
        await unit.panel.approveSelfTest();

        expect(gpsOf(unit).search.mode).toBe(SearchMode.AlmanacSearch);
        await settle(unit, FIX_CAP_S);

        expect(positionDiffers(unit)).toBe(false);
        expect(Math.abs(clock(unit) - (simNowMs(unit) - 2 * ERA_MS))).toBeLessThan(TOLERANCE_MS);
    }, SLOW);

    it('FAST does nothing after a wipe', async () => {
        const unit = await bootToSelfTest({storage: {...STORED, fastGpsAcquisition: true}});
        await unit.panel.approveSelfTest();
        expect(gpsOf(unit).search.mode).toBe(SearchMode.AlmanacSearch);

        // SET 10: the cursor starts on the GPS setting, and the inner knob selects the next value
        await unit.panel.selectPage('L', 'SET 10');
        await unit.panel.cursor('L');
        await unit.panel.inner('L', 1);
        expect(unit.props.userSettings.getSetting('fastGpsAcquisition').get()).toBe(false); // Precondition: REAL
        await unit.panel.inner('L', 1);
        expect(unit.props.userSettings.getSetting('fastGpsAcquisition').get()).toBe(true); // Precondition: FAST
        await vi.advanceTimersByTimeAsync(2000);

        expect(Screen.read().rows('L')[0]).toBe('GPS:   FAST');
        expect(gpsOf(unit).search.mode).toBe(SearchMode.AlmanacSearch);
    }, SLOW);

    it('the receiver memory is gone from storage', async () => {
        const unit = await bootToSelfTest({storage: STORED});
        await vi.advanceTimersByTimeAsync(61_000);
        expect(gpsOf(unit).isValid()).toBe(false); // Precondition: before any fix

        expect(storedSetting(unit, 'lastAlmanacDownload')).toBe(0);
        expect(storedSetting(unit, 'lastEphemeris')).toBe('');
        expect(storedSetting(unit, 'lastLatitude')).toBe(0);
    }, SLOW);

    it('an engine-running start keeps its forced fix', async () => {
        const unit = await bootUnit({storage: STORED});
        expect(gpsOf(unit).isValid()).toBe(true);
        expect(Math.abs(clock(unit) - (simNowMs(unit) - 2 * ERA_MS))).toBeLessThan(TOLERANCE_MS);
        await vi.advanceTimersByTimeAsync(5000);
        expect(hasReceiverError(unit)).toBe(false);

        // The ephemeris parsed from storage before the wipe is not restored once the satellites have loaded
        await vi.advanceTimersByTimeAsync(56_000);
        const stored = storedSetting(unit, 'lastEphemeris') as string;
        const times = stored === '' ? [] : stored.split(',').map(e => Number(e.split(':')[1]));
        expect(times.filter(t => !(t >= START))).toEqual([]); // The fake clock starts the boot on START
    }, SLOW);

    it('0008 shows until a satellite is tracked', async () => {
        const unit = await bootToSelfTest({storage: STORED});
        expect(has0008(unit)).toBe(false);

        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(1000);
        expect(has0008(unit)).toBe(true);

        // The first satellite of the almanac search's blind search is acquired without an ephemeris (Acquired), half a
        // minute before its data is collected: the message goes at the next calculation tick
        await untilTrackedWith0008(unit);
        expect(gpsOf(unit).gpsSatComputer.getChannels().some(s => s !== null && s.state.get() === GPSSatelliteState.Acquired)).toBe(true); // Precondition
        await vi.advanceTimersByTimeAsync(1000);
        expect(has0008(unit)).toBe(false);
    }, SLOW);

    // The design: until the receiver tracks its first satellite in that power-on. A loss of every satellite later in it
    // does not bring the message back
    it('0008 does not come back when the satellites are lost after the first track', async () => {
        const unit = await bootToSelfTest({storage: STORED});
        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(1000);
        await untilTrackedWith0008(unit);
        await vi.advanceTimersByTimeAsync(1000);
        expect(has0008(unit)).toBe(false); // Precondition

        unit.props.failures.fail('gpsAntenna');
        for (let s = 0; tracked(unit); s++) {
            if (s >= 60) throw new Error('the satellites were not lost within 60 s');
            await vi.advanceTimersByTimeAsync(1000);
        }
        await vi.advanceTimersByTimeAsync(2000);

        expect(tracked(unit)).toBe(false); // Precondition
        expect(has0008(unit)).toBe(false);
    }, SLOW);

    // The design: no stored position until the first fix or the next power-on. A wiped power-on that ends before its
    // first fix has stored a position (0/0) at its power-off, which the next power-on's first fix compares with (B-3)
    it('the next power-on compares with the position the wiped power-on stored', async () => {
        const unit = await bootToSelfTest({storage: STORED});
        await unit.panel.approveSelfTest();
        expect(gpsOf(unit).isValid()).toBe(false); // Precondition: no fix in the wiped power-on
        await unit.panel.powerOff();
        unit.props.failures.repair('battery');
        await vi.advanceTimersByTimeAsync(60_000);
        await unit.panel.powerOn();
        await unit.panel.approveSelfTest();
        expect(positionDiffers(unit)).toBe(false); // Precondition: before the fix

        await settle(unit, FIX_CAP_S);

        expect(positionDiffers(unit)).toBe(true);
    }, SLOW);

    it('FLR 2 does not correct the clock', async () => {
        const unit = await bootToSelfTest({storage: STORED});
        await unit.panel.approveSelfTest();

        await openFlr2(unit);
        await unit.panel.cursor('L');
        await unit.panel.cursorTo('L', 'BATTERY');
        await unit.panel.clr();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);
        expect(unit.props.failures.isActive('battery')).toBe(false); // Precondition

        expect(clock(unit)).toBeLessThan(BEFORE_1989);
        await settle(unit, FIX_CAP_S);
        expect(Math.abs(clock(unit) - (simNowMs(unit) - 2 * ERA_MS))).toBeLessThan(TOLERANCE_MS);
    }, SLOW);

    it('a hot-swap during the wiped power-on', async () => {
        const unit = await bootToSelfTest({storage: STORED});
        await unit.panel.approveSelfTest();
        expect(userDataLost(unit)).toBe(1); // Precondition

        unit.env.sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(30_000);
        unit.env.sim.set('L:KLN90B_Disabled', 'bool', false);
        await vi.advanceTimersByTimeAsync(2000);

        expect(userDataLost(unit)).toBe(1);
        expect(has0008(unit)).toBe(true);
        expect(clock(unit)).toBeLessThan(BEFORE_1989);
    }, SLOW);

    it('SERVICE? during the wiped power-on', async () => {
        const unit = await bootToSelfTest({storage: STORED});
        await unit.panel.approveSelfTest();
        expect(gpsOf(unit).isValid()).toBe(false); // Precondition: before the fix

        await service(unit);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Math.abs(clock(unit) - simNowMs(unit))).toBeLessThan(TOLERANCE_MS);
        expect(unit.props.battery.health).toBe(100);
        expect(userWaypoints(unit)).toEqual([]);
        expect(gpsOf(unit).search.mode).toBe(SearchMode.AlmanacSearch);

        await settle(unit, FIX_CAP_S);
        expect(Math.abs(clock(unit) - simNowMs(unit))).toBeLessThan(TOLERANCE_MS);
    }, SLOW);
    // The off time of the power cycle adds nothing to the wiped clock
    it('an in-session power-on starts the clock at 1 JAN 1988 too', async () => {
        const unit = await bootUnit({storage: {...STORED, failure_battery: ''}});
        unit.props.failures.fail('battery');
        await unit.panel.powerCycle({offSeconds: 600});
        const powerOn = Date.now();
        await vi.advanceTimersByTimeAsync(19_000);

        expect(Math.abs(clock(unit) - (Date.UTC(1988, 0, 1) + (Date.now() - powerOn)))).toBeLessThan(TOLERANCE_MS);
    }, SLOW);

    // Design: the next power-on is normal again once the battery is repaired. The receiver has not collected its almanac
    // in the short wiped power-on, so REAL searches for it again, without 0008; SET 10 switched to FAST then restores the
    // memory from the truth (#468), in the era of the 1988 clock
    it('the next power-on after a repair is normal again', async () => {
        const unit = await bootToSelfTest({storage: STORED});
        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(1000);
        expect(has0008(unit)).toBe(true); // Precondition
        unit.props.failures.repair('battery');

        await unit.panel.powerCycle({offSeconds: 60});
        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(1000);
        const gps = gpsOf(unit);
        expect(gps.tracksSatellite).toBe(false); // Precondition
        expect(gps.search.mode).toBe(SearchMode.AlmanacSearch); // Precondition
        expect(has0008(unit)).toBe(false);
        expect(userDataLost(unit)).toBe(0);

        unit.props.userSettings.getSetting('fastGpsAcquisition').set(true);
        gps.startFast();
        await vi.advanceTimersByTimeAsync(1000);
        expect(gps.search.mode).toBe(SearchMode.Acquisition);
        await settle(unit, 60);
        expect(Math.abs(clock(unit) - (simNowMs(unit) - 2 * ERA_MS))).toBeLessThan(TOLERANCE_MS);
    }, SLOW);
});
