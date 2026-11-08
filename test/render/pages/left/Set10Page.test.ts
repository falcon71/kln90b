import {describe, expect, it, vi} from 'vitest';
import {GPSSatelliteState} from '@microsoft/msfs-sdk';
import {bootToSelfTest, bootUnit, HeadlessUnit, settle, untilCalcTick} from '../../../harness/boot';
import {DEFAULT_START} from '../../../harness/sim/clock';
import {Screen} from '../../../harness/render/screen';
import {secondsToFix} from '../../../harness/gps';
import {SearchMode} from '../../../../kln90b/GpsSearch';
import {TimeStamp} from '../../../../kln90b/data/Time';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('SET 10 page (characterization, the page is fictitious, #46)', () => {
    it('renders without an error', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 10');

        expect(unit.errors).toEqual([]);
        expect(Screen.read().status().left).toBe('SET10');
        expect(Screen.read().rows('L')[0]).toBe('GPS:   FAST');
    });
});

// #458: the FAILURES button on row 2 opens the FLR pages (fictional, like SET 10 itself)
describe('SET 10 FAILURES button (#458)', () => {
    it('shows the button below the GPS setting', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 10');

        expect(Screen.read().rows('L')[1].trim()).toBe('FAILURES?');
    });

    it('opens FLR 1 with ENT', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 10');
        await unit.panel.cursor('L');
        await unit.panel.cursorTo('L', 'FAILURES?');

        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().status().left).toBe('FLR 1');
    });
});

/** Turns the GPS setting of SET 10 to FAST: the cursor starts on it, and the inner knob selects the next value */
async function switchToFast(unit: HeadlessUnit): Promise<void> {
    await unit.panel.selectPage('L', 'SET 10');
    expect(Screen.read().rows('L')[0]).toBe('GPS:   REAL'); // Precondition
    await unit.panel.cursor('L');
    await unit.panel.inner('L', 1);
    expect(unit.props.userSettings.getSetting('fastGpsAcquisition').get()).toBe(true); // Precondition: saved at once
}

// #468: a switch to FAST while the unit has no fix initializes the memory from the truth and restarts the search, as a
// power-on with FAST does. No forced acquisition: FAST runs the normal search of REAL
describe('SET 10 switched to FAST (#468)', () => {
    it('switching to FAST during a search gives a hot-start fix, with no Unreachable satellite (#468)', async () => {
        const unit = await bootUnit({coldGps: true, antennaAttitude: true, storage: {fastGpsAcquisition: false, lastLatitude: 47, lastLongitude: 30}});
        const gps = unit.props.sensors.in.gps;
        gps.signals.fadeScale = 0;
        gps.signals.jitterScale = 0;
        // A bank of 60 degrees to the right (MSFS: negative) loses the low satellites on the high-wing side (#467); the
        // search keeps them searched
        unit.env.sim.set('PLANE BANK DEGREES', 'degrees', -60);
        unit.env.sim.set('SIM ON GROUND', 'bool', false);
        await untilCalcTick(unit);
        await untilCalcTick(unit);
        const lost = gps.gpsSatComputer.getSatellites().filter(s => gps.signals.isLost(s.prn) && s.position.get()[0] < Math.PI / 2).map(s => s.prn);
        expect(lost.length).toBeGreaterThan(0); // Precondition: a satellite above the horizon has lost its signal
        expect(gps.isValid()).toBe(false); // Precondition

        await switchToFast(unit);
        await untilCalcTick(unit);
        expect(gps.search.mode).toBe(SearchMode.Acquisition); // The search restarted, no fix was forced
        const seconds = 1 + await secondsToFix(unit, 60);

        // #62: a hot start has its fix by 0:17 (the bound of the FAST power-on in GpsAcquisition.test.ts)
        expect(seconds).toBeLessThanOrEqual(17);
        expect(gps.gpsSatComputer.getSatellites().filter(s => s.state.get() === GPSSatelliteState.Unreachable).map(s => s.prn)).toEqual([]);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // REAL with the stored data of a unit last used on the other side of the world over a year ago runs the almanac search
    // (3-17, ORS 01 6-30); FAST in the middle of it starts again from the truth and is a hot start
    it('switching to FAST during the almanac search of REAL gives a hot-start fix, with no Unreachable satellite (#468)', async () => {
        const unit = await bootToSelfTest({storage: {
            fastGpsAcquisition: false, lastLatitude: -47, lastLongitude: -172, lastAlmanacDownload: DEFAULT_START.getTime() - 400 * DAY,
        }});
        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(60_000 - 19_000 - 2000); // About 60 s since the power-on
        const gps = unit.props.sensors.in.gps;
        expect(gps.isValid()).toBe(false); // Preconditions
        expect(gps.search.mode).toBe(SearchMode.AlmanacSearch);

        const before = Date.now();
        await switchToFast(unit);
        await secondsToFix(unit, 60);
        const seconds = (Date.now() - before) / 1000;

        expect(gps.isValid()).toBe(true);
        expect(seconds).toBeLessThanOrEqual(17); // #62: a hot start has its fix by 0:17
        expect(gps.gpsSatComputer.getSatellites().filter(s => s.state.get() === GPSSatelliteState.Unreachable).map(s => s.prn)).toEqual([]);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    it('switching to FAST with a fix changes nothing (#468)', async () => {
        const unit = await bootUnit({storage: {fastGpsAcquisition: false}});
        await settle(unit);
        const gps = unit.props.sensors.in.gps;
        const inUse = () => gps.gpsSatComputer.getSatellites()
            .filter(s => s.state.get() === GPSSatelliteState.InUse || s.state.get() === GPSSatelliteState.InUseDiffApplied)
            .map(s => s.prn);
        const prns = inUse();
        expect(prns.length).toBeGreaterThanOrEqual(4); // Precondition: a fix
        const lat = gps.coords.lat;
        const lon = gps.coords.lon;

        await switchToFast(unit);
        const valid: boolean[] = [gps.isValid()];
        await untilCalcTick(unit);
        valid.push(gps.isValid());
        await untilCalcTick(unit);
        valid.push(gps.isValid());

        expect(valid).toEqual([true, true, true]);
        expect(gps.search.mode).toBe(SearchMode.Idle);
        expect(inUse()).toEqual(prns);
        expect([gps.coords.lat, gps.coords.lon]).toEqual([lat, lon]);
        expect(unit.errors).toEqual([]);
    }, 60_000);
});

// #468, design: switching to REAL does nothing; the next power-on runs as REAL. The memory keeps what the unit had, so
// the aircraft is moved away from it and the clock set off, to tell the truth apart from the memory
describe('SET 10 switched to REAL (#468)', () => {
    it('switching to REAL without a fix only saves the setting: the position, the clock and the search stay', async () => {
        // The boot's FAST power-on sets the memory to the true 47/8, whatever is stored; coldGps then drops the fix
        const unit = await bootUnit({coldGps: true, storage: {fastGpsAcquisition: true}});
        const gps = unit.props.sensors.in.gps;
        unit.env.sim.set('PLANE LATITUDE', 'degrees', 48.5); // 90 NM north of the position the unit holds
        gps.timeZulu = TimeStamp.create(gps.timeZulu.getTimestamp() - HOUR);
        const lat = gps.coords.lat;
        const lon = gps.coords.lon;
        const clockOffset = () => gps.timeZulu.getTimestamp() - Date.now();
        expect(gps.isValid()).toBe(false); // Preconditions
        expect(gps.search.mode).toBe(SearchMode.Idle);
        expect(lat).toBeCloseTo(47, 6);
        expect(clockOffset()).toBeLessThan(-HOUR + 2000);

        await unit.panel.selectPage('L', 'SET 10');
        expect(Screen.read().rows('L')[0]).toBe('GPS:   FAST'); // Precondition
        await unit.panel.cursor('L');
        await unit.panel.inner('L', -1);
        expect(unit.props.userSettings.getSetting('fastGpsAcquisition').get()).toBe(false);
        await untilCalcTick(unit);
        await untilCalcTick(unit);

        expect(gps.isValid()).toBe(false); // The checks below hold before the first fix
        expect([gps.coords.lat, gps.coords.lon]).toEqual([lat, lon]);
        expect(clockOffset()).toBeLessThan(-HOUR + 2000); // The pilot's clock, not the sim time
        expect(gps.search.mode).toBe(SearchMode.Idle);
        expect(unit.errors).toEqual([]);
    }, 60_000);
});
