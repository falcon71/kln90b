import {describe, expect, it, vi} from 'vitest';
import {GPSSatelliteState} from '@microsoft/msfs-sdk';
import {bootToSelfTest, bootUnit, HeadlessUnit, settle} from '../../harness/boot';
import {DEFAULT_START} from '../../harness/sim/clock';
import {messages} from '../../harness/readers';
import {storedSetting} from '../../harness/storage';
import {Screen} from '../../harness/render/screen';
import {inhibitAllBut} from '../../harness/gps';
import {SearchMode} from '../../../kln90b/GpsSearch';
import {WIPED_CLOCK_MS} from '../../../kln90b/Gps';
import {TimeStamp} from '../../../kln90b/data/Time';

// #471: rcvrInit (0400) and rcvrEeprom (0800), design docs/superpowers/specs/2026-11-08-receiver-hardware-errors-design.md.
// IM C-4: with 0400 the receiver gets no initialization data from the host over the RS-232 link, for the whole power-on:
// no clock, no position, no altitude (5-29), and FAST sends nothing either (the maintainer, 2026-11-08). With 0800 the
// receiver has lost its oscillator calibration, and the start of the power-on searches longer by the factor drawn at the
// latch (2 to 4, a guess)
const START = DEFAULT_START.getTime();
const DAY = 86_400_000;
const MINUTE = 60_000;
const TOLERANCE_MS = 3000;
/** The almanac search takes about 20 minutes (ORS 01 6-30); the bound of the waits for the first fix */
const FIX_CAP_S = 40 * 60;
const SLOW = 300_000;

/** The stored data of a unit last used here yesterday: position 47/8 (the boot position), almanac a day old, REAL */
const WARM_START = {fastGpsAcquisition: false, lastLatitude: 47, lastLongitude: 8, lastAlmanacDownload: START - DAY};
/** WARM_START with rcvrInit stored, not transient: it acts at every power-on */
const INIT = {...WARM_START, failure_rcvrInit: '{"transient":0}'};

const gpsOf = (unit: HeadlessUnit) => unit.props.sensors.in.gps;
/** The sim's time in UNIX ms, from the fake clock and the sim's offset, not from the unit */
const simNowMs = (unit: HeadlessUnit) => Date.now() + unit.env.sim.absoluteTimeOffsetMs;
const clock = (unit: HeadlessUnit) => gpsOf(unit).timeZulu.getTimestamp();
const withEphemeris = (unit: HeadlessUnit) => gpsOf(unit).gpsSatComputer.getSatellites().filter(s => s.lastEphemerisTime !== undefined).map(s => s.prn);
const timeUpdated = (unit: HeadlessUnit) => messages(unit).some(m => m.startsWith('SYSTEM TIME UPDATED'));
/** The SDK's acquisition timings, private (GPSSatComputer.satelliteTimingOptions), as GpsAcquisition.test.ts reads them */
const timings = (unit: HeadlessUnit) => {
    const o = (gpsOf(unit).gpsSatComputer as any).satelliteTimingOptions;
    return {mean: o.acquisitionTime, range: o.acquisitionTimeRange, hot: o.acquisitionTimeWithEphemeris, hotRange: o.acquisitionTimeRangeWithEphemeris};
};

describe('rcvrInit (#471)', () => {
    // 5-29: the altitude input reaches the receiver over the link from the host, so with 0400 the solution has no altitude
    // row: STA 1 shows NAV, not NAV A, and three satellites give no fix. The measurement gets no altitude either
    it('no altitude aiding', async () => {
        const unit = await bootToSelfTest({storage: INIT});
        const gps = gpsOf(unit);
        expect(gps.failures.receiverErrors.hostBlocked).toBe(true); // Precondition
        await unit.panel.approveSelfTest();
        await settle(unit, 300);
        expect(unit.props.sensors.in.airdata.getIndicatedAlt()).not.toBeNull(); // Precondition: the altitude input works

        expect(gps.solution.altitudeAided).toBe(false);
        expect((gps as any).measurementInputs.indicatedAltitudeFt).toBeNull();
        await unit.panel.selectPage('L', 'STA 1');
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().rows('L')[0]).toMatch(/^STATE (  NAV|NAV D)$/);

        inhibitAllBut(unit, 3);
        // The SDK drops the inhibited satellites at its next position update, every 5 s
        for (let i = 0; i < 10 && gps.isValid(); i++) {
            await vi.advanceTimersByTimeAsync(1000);
        }
        expect(gps.isValid()).toBe(false);
        expect(gps.solution.satellites).toBe(3);
        expect(unit.errors).toEqual([]);
    }, SLOW);

    // 3-17..3-19: the pilot's position and time normally restart the search from them (#357). With 0400 they reach only the
    // unit: its position and its clock change, the receiver's clock and last known position do not, and the search goes
    // on. The almanac is 200 days old, so that the almanac search leaves the time for the entries before a fix
    it('SET 1 and SET 2 entries do not restart the search', async () => {
        const unit = await bootToSelfTest({storage: {...INIT, lastAlmanacDownload: START - 200 * DAY}});
        const gps = gpsOf(unit);
        await unit.panel.approveSelfTest();
        const start = vi.spyOn(gps.search, 'start');
        const sync = vi.spyOn(gps.gpsSatComputer, 'syncLastKnownPosition');
        expect(gps.search.mode).toBe(SearchMode.AlmanacSearch); // Precondition

        // SET 1: N 46°00.00', 60 NM south of the aircraft
        await unit.panel.selectPage('L', 'SET 1');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 1); // the latitude
        await unit.panel.inner('L', 1); // enters the editor: N, the other digits blank
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 5); // the first click enters a 0, so this is a 4
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 7); // a 6
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1); // a 0
        await unit.panel.ent();
        await unit.panel.cursorTo('L', 'CONFIRM?');
        await unit.panel.ent();
        expect(gps.isValid()).toBe(false); // Precondition
        expect(gps.coords.lat).toBeCloseTo(46, 9); // The unit's position is set

        // SET 2: the time 20:00, eight hours ahead of the sim
        await unit.panel.selectPage('L', 'SET 2');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 1); // the time
        await unit.panel.inner('L', 21); // the first click opens the entry on hour 00, so 21 clicks give 20
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1);
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(2000);
        expect(gps.isValid()).toBe(false); // Precondition

        expect(Screen.read().rows('L')[3].slice(0, 5)).toBe('20:00'); // The unit's clock is set
        expect(gps.timeZulu.getHours()).toBe(20);
        // The unit's clock is saved (#461), as it is without the failure: the offset of 20:00 from the sim's noon
        expect(Math.abs((storedSetting(unit, 'clockOffset') as number) - (clock(unit) - simNowMs(unit)))).toBeLessThan(TOLERANCE_MS);
        expect(storedSetting(unit, 'clockOffset') as number).toBeGreaterThan(7 * 60 * MINUTE);
        expect(start).not.toHaveBeenCalled();
        expect(sync).not.toHaveBeenCalled();
        expect(gps.search.mode).toBe(SearchMode.AlmanacSearch);
        expect(Math.abs(gps.gpsSatComputer.internalTime - simNowMs(unit))).toBeLessThan(TOLERANCE_MS); // The receiver's clock runs on
        expect(unit.errors).toEqual([]);
    }, SLOW);

    // The maintainer, 2026-11-08: FAST sends nothing either, at the power-on and on a switch to FAST on SET 10. The search
    // is the warm start of the stored memory: no ephemeris, so no fix before the self-test ends, as a hot start has (#62)
    it('FAST sends nothing', async () => {
        const unit = await bootUnit({engineRunning: false, storage: {...INIT, fastGpsAcquisition: true}});
        const gps = gpsOf(unit);
        const truth = vi.spyOn(gps, 'initializeFromTruth');
        await unit.panel.powerOn();
        await vi.advanceTimersByTimeAsync(19_000);

        expect(gps.failures.receiverErrors.hostBlocked).toBe(true); // Precondition
        expect(truth).not.toHaveBeenCalled();
        expect(gps.search.mode).toBe(SearchMode.Acquisition);
        expect(gps.isValid()).toBe(false);
        expect(withEphemeris(unit)).toEqual([]);

        // SET 10: the cursor starts on the GPS setting, and the inner knob selects the next value
        await unit.panel.approveSelfTest();
        const start = vi.spyOn(gps.search, 'start');
        await unit.panel.selectPage('L', 'SET 10');
        await unit.panel.cursor('L');
        await unit.panel.inner('L', 1);
        expect(unit.props.userSettings.getSetting('fastGpsAcquisition').get()).toBe(false); // Precondition: REAL
        await unit.panel.inner('L', 1);
        expect(unit.props.userSettings.getSetting('fastGpsAcquisition').get()).toBe(true); // Precondition: FAST
        expect(gps.isValid()).toBe(false); // Precondition: FAST acts only without a fix
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L')[0]).toBe('GPS:   FAST');
        expect(truth).not.toHaveBeenCalled();
        expect(start).not.toHaveBeenCalled();
        expect(unit.errors).toEqual([]);
    }, SLOW);

    // Design "rcvrMemory": with 0008 the receiver's memory is lost, and with 0400 the host's clock and position do not
    // arrive to replace it. The receiver starts from the 1988 clock and 0/0, the unit's clock and position stay right, and
    // the first fix takes the unit's era
    it('0400 and 0008 together', async () => {
        const unit = await bootUnit({engineRunning: false, storage: {...INIT, failure_rcvrMemory: '{"transient":0}'}});
        const gps = gpsOf(unit);
        const start = vi.spyOn(gps.search, 'start');
        const sync = vi.spyOn(gps.gpsSatComputer, 'syncLastKnownPosition');
        await unit.panel.powerOn();
        const positions = sync.mock.calls.map(c => [c[0]?.lat, c[0]?.lon]); // Read now: the argument may be reused
        await vi.advanceTimersByTimeAsync(19_000);
        const errors = gps.failures.receiverErrors;
        expect(errors.hostBlocked).toBe(true); // Precondition
        expect(errors.memoryLostAtPowerOn).toBe(true); // Precondition

        expect(start.mock.calls.map(c => [c[0].lat, c[0].lon])).toEqual([[0, 0]]);
        expect(positions).toEqual([[0, 0]]);
        // 19 s of the receiver's own clock since the power-on, 1 JAN 1988
        expect(Math.abs(gps.gpsSatComputer.internalTime - (WIPED_CLOCK_MS + 19_000))).toBeLessThan(TOLERANCE_MS);
        expect(Math.abs(clock(unit) - simNowMs(unit))).toBeLessThan(TOLERANCE_MS);
        expect([gps.coords.lat, gps.coords.lon]).toEqual([47, 8]);
        expect(gps.search.mode).toBe(SearchMode.AlmanacSearch);

        await unit.panel.approveSelfTest();
        await settle(unit, FIX_CAP_S);

        expect(Math.abs(clock(unit) - simNowMs(unit))).toBeLessThan(TOLERANCE_MS);
        expect(timeUpdated(unit)).toBe(false);
        expect(unit.errors).toEqual([]);
    }, SLOW);

    // The sibling of the test above: 0008 alone. The host's initialization arrives, so the receiver starts from the unit's
    // clock and stored position (design "rcvrMemory"), not from 1988 and 0/0. In this model the almanac search is blind
    // either way, so the start itself looks the same; what the host hands over is what tells them apart
    it('0008 alone: the host hands the receiver its clock and position', async () => {
        const unit = await bootUnit({engineRunning: false, storage: {...WARM_START, failure_rcvrMemory: '{"transient":0}'}});
        const gps = gpsOf(unit);
        const start = vi.spyOn(gps.search, 'start');
        const sync = vi.spyOn(gps.gpsSatComputer, 'syncLastKnownPosition');
        await unit.panel.powerOn();
        const positions = sync.mock.calls.map(c => [c[0]?.lat, c[0]?.lon]);
        await vi.advanceTimersByTimeAsync(19_000);
        expect(gps.failures.receiverErrors.hostBlocked).toBe(false); // Precondition
        expect(gps.failures.receiverErrors.memoryLostAtPowerOn).toBe(true); // Precondition

        expect(start.mock.calls.map(c => [c[0].lat, c[0].lon])).toEqual([[47, 8]]);
        expect(positions).not.toContainEqual([0, 0]);
        expect(Math.abs(gps.gpsSatComputer.internalTime - simNowMs(unit))).toBeLessThan(TOLERANCE_MS);
        expect(gps.search.mode).toBe(SearchMode.AlmanacSearch);
        expect(unit.errors).toEqual([]);
    }, SLOW);

    // A hot-swap disable stops the ticks; the receiver's own clock runs on over it, as the unit's does (#465), and is not
    // set from the unit's clock on resume
    it('0400 and 0008 together: the receiver\'s clock runs on over a hot-swap disable', async () => {
        const unit = await bootToSelfTest({storage: {...INIT, failure_rcvrMemory: '{"transient":0}'}});
        const gps = gpsOf(unit);
        const before = gps.gpsSatComputer.internalTime;
        const disabledAt = Date.now();
        expect(Math.abs(before - (WIPED_CLOCK_MS + 19_000))).toBeLessThan(TOLERANCE_MS); // Precondition: the 1988 clock

        unit.env.sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(15 * MINUTE);
        unit.env.sim.set('L:KLN90B_Disabled', 'bool', false);
        await vi.advanceTimersByTimeAsync(2000);
        expect(gps.isValid()).toBe(false); // Precondition: the almanac search goes on

        expect(Math.abs(gps.gpsSatComputer.internalTime - before - (Date.now() - disabledAt))).toBeLessThan(TOLERANCE_MS);
        expect(Math.abs(clock(unit) - simNowMs(unit))).toBeLessThan(TOLERANCE_MS);
        expect(unit.errors).toEqual([]);
    }, SLOW);
});

describe('rcvrEeprom (#471)', () => {
    // Design "rcvrEeprom": the factor (2 + random * 2, here 3) multiplies the times the search sets for the start, and
    // ends with the first fix. The warm start near the stored position sets the warm time and the hot time of the SDK's
    // 2 NM rule (GpsSearch): ranges of 18 s, a hot time of 27 s, and a warm time from 6 s to 225 s
    it('rcvrEeprom slows the first fix', async () => {
        const unit = await bootUnit({engineRunning: false, storage: {...WARM_START, failure_rcvrEeprom: '{"transient":0}'}});
        const gps = gpsOf(unit);
        gps.failures.receiverErrors.random = () => 0.5;
        await unit.panel.powerOn();
        await vi.advanceTimersByTimeAsync(3000);
        expect(gps.search.mode).toBe(SearchMode.Acquisition); // Precondition: the warm start has begun
        expect(gps.isValid()).toBe(false); // Precondition

        const t = timings(unit);
        expect({range: t.range, hot: t.hot, hotRange: t.hotRange}).toEqual({range: 18_000, hot: 27_000, hotRange: 18_000});
        expect(t.mean).toBeGreaterThanOrEqual(6_000);
        expect(t.mean).toBeLessThanOrEqual(225_000);

        await settle(unit, 15 * 60);
        expect(timings(unit)).toEqual({mean: 40_000, range: 6_000, hot: 9_000, hotRange: 6_000});
        expect(unit.errors).toEqual([]);
    }, SLOW);

    // The maintainer, 2026-11-08: the same receiver searches a spoofer's fake signals, so GPS hands the fake receiver the
    // same factor, until the first fix of the power-on (the fake receiver's scaling: test/unit/failures/FakeReceiver.test.ts)
    it('the fake receiver gets the factor until the first fix', async () => {
        const unit = await bootUnit({engineRunning: false, storage: {...WARM_START, failure_rcvrEeprom: '{"transient":0}'}});
        const gps = gpsOf(unit);
        gps.failures.receiverErrors.random = () => 0.5;
        const fakeFactor = () => (gps as any).fakeInputs.acquisitionFactor;
        await unit.panel.powerOn();
        await vi.advanceTimersByTimeAsync(3000);
        expect(gps.isValid()).toBe(false); // Precondition

        expect(fakeFactor()).toBe(3);

        await settle(unit, 15 * 60);
        expect(fakeFactor()).toBe(1);
        expect(unit.errors).toEqual([]);
    }, SLOW);

    // Builder's call in the design: the factor ends with the first fix, as a receiver with a fix has solved its clock drift.
    // A fix lost with the clock more than 10 minutes off (install manual 2-66) restarts the search from the belief (#465,
    // GPS.fixLost) in the same power-on: its warm start and the blind sky search after it take the normal times. The
    // clock is moved in the SDK's update that drops the last satellite, so that the tick that loses the fix sees it off
    it('the factor ends with the first fix: a restart after a lost fix is unscaled', async () => {
        const unit = await bootUnit({engineRunning: false, storage: {...WARM_START, failure_rcvrEeprom: '{"transient":0}'}});
        const gps = gpsOf(unit);
        gps.failures.receiverErrors.random = () => 0.5;
        await unit.panel.powerOn();
        await settle(unit, 15 * 60);
        expect(gps.failures.receiverErrors.acquisitionFactor).toBe(3); // Precondition: 0800 is latched for the power-on

        const computer = gps.gpsSatComputer;
        const update = computer.onUpdate.bind(computer);
        let shifted = false;
        vi.spyOn(computer, 'onUpdate').mockImplementation(() => {
            update();
            if (!shifted && !computer.getSatellites().some(s => s.state.get() === GPSSatelliteState.InUse || s.state.get() === GPSSatelliteState.InUseDiffApplied)) {
                gps.timeZulu = TimeStamp.create(gps.timeZulu.getTimestamp() + 60 * MINUTE);
                shifted = true;
            }
        });
        const start = vi.spyOn(gps.search, 'start');
        inhibitAllBut(unit, 0);
        for (let i = 0; i < 10 && gps.isValid(); i++) {
            await vi.advanceTimersByTimeAsync(1000);
        }
        expect(gps.isValid()).toBe(false); // Precondition
        expect(shifted).toBe(true); // Precondition
        expect(start).toHaveBeenCalledTimes(1); // Precondition: the restart from the belief
        await vi.advanceTimersByTimeAsync(2000);
        expect(gps.search.mode).toBe(SearchMode.Acquisition); // Precondition: the warm start has begun

        const t = timings(unit);
        expect({range: t.range, hot: t.hot, hotRange: t.hotRange}).toEqual({range: 6_000, hot: 9_000, hotRange: 6_000});
        expect(t.mean).toBeGreaterThanOrEqual(2_000);
        expect(t.mean).toBeLessThanOrEqual(75_000);

        // No satellite is acquired with the clock an hour off: the blind sky search after the give-up time, unscaled
        await vi.advanceTimersByTimeAsync(5 * MINUTE);
        expect(gps.search.mode).toBe(SearchMode.SkySearch); // Precondition
        expect({mean: timings(unit).mean, range: timings(unit).range}).toEqual({mean: 90_000, range: 60_000});
        expect(unit.errors).toEqual([]);
    }, SLOW);
});
