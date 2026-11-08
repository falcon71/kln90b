import {describe, expect, it, vi} from 'vitest';
import {GPSSatelliteState, ICAO} from '@microsoft/msfs-sdk';
import {bootToSelfTest, bootUnit, HeadlessUnit, settle} from '../../harness/boot';
import {DEFAULT_START} from '../../harness/sim/clock';
import {savedUserWaypoints, storedSetting} from '../../harness/storage';
import {messages, userWaypoints} from '../../harness/readers';
import {Screen} from '../../harness/render/screen';
import {SearchMode} from '../../../kln90b/GpsSearch';

// #471: rcvrMemory clears the receiver module's battery-backed memory at a power-on (design
// docs/superpowers/specs/2026-11-08-receiver-hardware-errors-design.md, "rcvrMemory"): the almanac and the ephemeris
// are lost, while the unit's own memory (user data, clock, last position) is kept and handed to the receiver as at every
// power-on. The storage is that of BatteryReceiver.test.ts (#461) with rcvrMemory in place of the battery
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

const userDataLost = (unit: HeadlessUnit) => messages(unit).filter(m => m === 'USER DATA LOST').length;
const timeUpdated = (unit: HeadlessUnit) => messages(unit).some(m => m.startsWith('SYSTEM TIME UPDATED'));
const positionDiffers = (unit: HeadlessUnit) => messages(unit).some(m => m.startsWith('POSITION DIFFERS FROM'));
const userIdents = (unit: HeadlessUnit) => userWaypoints(unit).map(f => ICAO.getIdent(f.icao));

/** The states of a satellite the receiver tracks: acquired, its data collected, or in use */
const TRACKED_STATES: readonly GPSSatelliteState[] = [GPSSatelliteState.Acquired, GPSSatelliteState.DataCollected, GPSSatelliteState.InUse, GPSSatelliteState.InUseDiffApplied];
/** Some satellite in the receiver's channels is tracked, read from the channels and not from GPS.tracksSatellite */
const tracked = (unit: HeadlessUnit) => gpsOf(unit).gpsSatComputer.getChannels().some(s => s !== null && TRACKED_STATES.includes(s.state.get()));

/** Every PRN of the ephemeris file with an ephemeris collected half an hour before the boot */
const OLD_EPHEMERIS = Array.from({length: 32}, (_, i) => `${i + 1}:${START - 30 * MINUTE}`).join(',');

/** A current almanac, an ephemeris, a user waypoint and a last position far from the aircraft at 47/8, REAL */
const STORED: Record<string, unknown> = {
    ...savedUserWaypoints([{kind: 'int', ident: 'USRA', lat: 47.2, lon: 8.2}]),
    userDataFormat: 2,
    fastGpsAcquisition: false,
    lastLatitude: -47,
    lastLongitude: -172,
    lastAlmanacDownload: START - DAY,
    lastEphemeris: OLD_EPHEMERIS,
    failure_rcvrMemory: '{"transient":0}',
};

describe('rcvrMemory (#471)', () => {
    it('rcvrMemory erases the almanac and the ephemeris and keeps the user data', async () => {
        const unit = await bootToSelfTest({storage: STORED});
        const gps = gpsOf(unit);

        expect(gps.gpsSatComputer.getLastAlmanacTime()).toBeUndefined();
        const sats = gps.gpsSatComputer.getSatellites();
        expect(sats.length).toBeGreaterThan(0); // Precondition: the satellites are loaded, the restore has run
        expect(sats.filter(s => s.lastEphemerisTime !== undefined).map(s => s.prn)).toEqual([]);

        expect(userIdents(unit)).toEqual(['USRA']);
        expect(Math.abs(clock(unit) - simNowMs(unit))).toBeLessThan(TOLERANCE_MS);
        expect(storedSetting(unit, 'lastLatitude')).toBe(-47);
        expect(storedSetting(unit, 'lastLongitude')).toBe(-172);
        expect(gps.search.mode).toBe(SearchMode.AlmanacSearch);

        // The messages are posted from the first main page
        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(1000);
        expect(userDataLost(unit)).toBe(0);
    }, SLOW);

    it('FAST is blocked as for the battery', async () => {
        const unit = await bootToSelfTest({storage: {...STORED, fastGpsAcquisition: true}});
        await unit.panel.approveSelfTest();
        expect(gpsOf(unit).search.mode).toBe(SearchMode.AlmanacSearch);
        // FAST did not set the memory to the truth (47/8): the stored position is kept
        expect(gpsOf(unit).coords.lat).toBe(-47);
        expect(gpsOf(unit).coords.lon).toBe(-172);
        expect(storedSetting(unit, 'lastLatitude')).toBe(-47);
        expect(storedSetting(unit, 'lastLongitude')).toBe(-172);

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

    // The host hands the receiver its clock at the power-on, so the first fix stays in the unit's era
    it('the first fix keeps the unit\'s era', async () => {
        const unit = await bootToSelfTest({storage: STORED});
        await unit.panel.approveSelfTest();
        expect(gpsOf(unit).search.mode).toBe(SearchMode.AlmanacSearch); // Precondition
        await settle(unit, FIX_CAP_S);

        expect(Math.abs(clock(unit) - simNowMs(unit))).toBeLessThan(TOLERANCE_MS);
        expect(timeUpdated(unit)).toBe(false);
        // The stored position (-47/-172) is kept, so the fix at 47/8 is compared with it (B-3)
        expect(positionDiffers(unit)).toBe(true);
    }, SLOW);

    // With the battery's wipe at the same power-on the whole memory is gone already: the wipe of #461, once
    it('battery wipe and rcvrMemory together', async () => {
        const unit = await bootToSelfTest({storage: {...STORED, failure_battery: '{}'}});

        // bootToSelfTest waits 19 s from the power-on, which the clock runs on
        expect(Math.abs(clock(unit) - (Date.UTC(1988, 0, 1) + 19_000))).toBeLessThan(TOLERANCE_MS);
        expect(userIdents(unit)).toEqual([]);
        expect(gpsOf(unit).search.mode).toBe(SearchMode.AlmanacSearch);
        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(1000);
        expect(userDataLost(unit)).toBe(1);
    }, SLOW);

    // IM C-3 ties the end of 0008 to the first satellites for one cause. The word drops it in the first calculation tick that tracks one;
    // the TEST FAIL record keeps it for the power-on
    it('0008 is in the word until a satellite is tracked', async () => {
        const unit = await bootToSelfTest({storage: STORED});
        const errors = gpsOf(unit).failures.receiverErrors;
        await unit.panel.approveSelfTest();
        for (let s = 0; !tracked(unit); s++) {
            if (s >= 30 * 60) throw new Error('no satellite tracked within 30 minutes');
            expect(errors.code).toBe(0x0008);
            await vi.advanceTimersByTimeAsync(1000);
        }
        await vi.advanceTimersByTimeAsync(1000);

        expect(errors.code).toBe(0);
        expect(errors.testFailCode).toBe(0x0008);
    }, SLOW);

    // The power-on of an engine-running start comes before the satellites have loaded: the ephemeris parsed from storage
    // is erased once they have, not restored (ephemerisErasePending), as for the battery's wipe
    it('an engine-running start does not restore the stored ephemeris', async () => {
        const unit = await bootUnit({storage: STORED});
        expect(gpsOf(unit).failures.receiverErrors.memoryLostAtPowerOn).toBe(true); // Precondition
        await vi.advanceTimersByTimeAsync(61_000);

        const stored = storedSetting(unit, 'lastEphemeris') as string;
        const times = stored === '' ? [] : stored.split(',').map(e => Number(e.split(':')[1]));
        expect(times.filter(t => !(t >= START))).toEqual([]); // The fake clock starts the boot on START
    }, SLOW);

    // The transient rule: a transient rcvrMemory started in operation acts at the next power-on, and is repaired there.
    // A power-off latches nothing
    it('a transient rcvrMemory started in operation acts at the next power-on', async () => {
        const unit = await bootUnit({storage: {...STORED, failure_rcvrMemory: ''}});
        const gps = gpsOf(unit);
        gps.failures.receiverErrors.random = () => 0.1; // Draws transient
        unit.props.failures.fail('rcvrMemory');
        expect(unit.props.failures.values('rcvrMemory')).toEqual({transient: 1}); // Precondition
        expect(gps.gpsSatComputer.getLastAlmanacTime()).toBeDefined(); // Precondition: nothing acted in operation

        await unit.panel.powerCycle({offSeconds: 60});

        expect(gps.gpsSatComputer.getLastAlmanacTime()).toBeUndefined();
        expect(gps.failures.receiverErrors.memoryLostAtPowerOn).toBe(true);
        expect(unit.props.failures.isActive('rcvrMemory')).toBe(false);
    }, SLOW);
});
