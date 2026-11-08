import {afterEach, describe, expect, it, vi} from 'vitest';
import {GPSSatelliteState} from '@microsoft/msfs-sdk';
import {bootToSelfTest, bootUnit, HeadlessUnit, settle, untilCalcTick} from '../../harness/boot';
import {messages} from '../../harness/readers';
import {Screen} from '../../harness/render/screen';
import {openFlr3, rows} from '../../harness/render/flrPages';
import {DEFAULT_START} from '../../harness/sim/clock';
import {GPS} from '../../../kln90b/Gps';
import {SearchMode} from '../../../kln90b/GpsSearch';
import {GpsGeometry} from '../../../kln90b/GpsSolution';
import {FailureKey} from '../../../kln90b/failures/FailureCatalog';
import {panelXml} from '../../harness/panelXml';
import {inhibitAllBut} from '../../harness/gps';
import {standardRoute} from '../../harness/fixtures';
import {savedFlightplan} from '../../harness/storage';

/**
 * #460: the receiver failures wired into the receiver (the design docs/superpowers/specs/2026-11-05-failures-gps-receiver-design.md,
 * "The inhibits", "Blocked satellites leave the unit's solution at once", "The receiver failures" and "The #453 messages
 * during a receiver failure"). A dead antenna or receiver blocks every satellite through the SDK's inhibits, and the
 * hardware message names the cause instead of the #453 messages (Installation Manual C-7, Pilot's Guide 5-29)
 */

const COVERAGE = 'SATELLITE COVERAGE INADEQUATE FOR NAV';
const RAIM = 'RAIM NOT AVAILABLE CROSS CHECK POSITION';
const GEOMETRY = 'BAD SATELLITE GEOMETRY SEE EPE ON STA 2 PAGE';
const APPROACH_RAIM = 'BAD SATELLITE GEOMETRY AND RAIM NOT AVAILABLE';
const SIGNAL_MESSAGES = [COVERAGE, RAIM, GEOMETRY, APPROACH_RAIM];
const ANTENNA = 'RCVR HARDWARE ERROR: 0010';
const RECEIVER = 'NO RCVR DATA';

const TRACKED = new Set([GPSSatelliteState.Acquired, GPSSatelliteState.DataCollected, GPSSatelliteState.InUse, GPSSatelliteState.InUseDiffApplied]);

/** The stored data of a unit last used here yesterday (GpsAcquisition.test.ts): the start model runs a warm start */
const WARM_START = {fastGpsAcquisition: false, lastLatitude: 47, lastLongitude: 8, lastAlmanacDownload: DEFAULT_START.getTime() - 24 * 60 * 60 * 1000};
/** The position stored at the last power-off is where the unit boots, so the boot posts no POSITION DIFFERS message */
const HOME = {lastLatitude: 47, lastLongitude: 8};

/** A failure stored by an earlier session; '{}' is the text of a failure without values (Failures.fail) */
const failed = (key: FailureKey) => ({[`failure_${key}`]: '{}'});
/** #471: the antenna draws open or short at its failure (random() < 0.5 is the short); this steers it to open, 0010 */
const openAntenna = (unit: HeadlessUnit) => unit.props.sensors.in.gps.failures.receiverErrors.random = () => 0.9;

const byNumber = (a: number, b: number) => a - b;
const computer = (unit: HeadlessUnit) => unit.props.sensors.in.gps.gpsSatComputer;
/** Every satellite the receiver knows, by PRN */
const allPrns = (unit: HeadlessUnit) => computer(unit).getSatellites().map(s => s.prn).sort(byNumber);
const inhibited = (unit: HeadlessUnit) => [...computer(unit).inhibitedSatellitePrnCodes.get()].sort(byNumber);
/** The satellites the SDK tracks: acquired, ephemeris collected or in use */
const tracked = (unit: HeadlessUnit) => computer(unit).getSatellites().filter(s => TRACKED.has(s.state.get())).map(s => s.prn);

afterEach(() => {
    vi.restoreAllMocks();
});

describe('the receiver failures in the receiver (#460)', () => {
    const CASES: { key: FailureKey, text: string }[] = [
        {key: 'gpsAntenna', text: ANTENNA},
        {key: 'gpsReceiver', text: RECEIVER},
    ];
    for (const c of CASES) {
        it(`${c.key} in flight: the fix lost at the next calculation tick, every satellite inhibited, ${c.text} and no #453 message; the repair reacquires`, async () => {
            const unit = await bootUnit({storage: HOME});
            await settle(unit);
            const gps = unit.props.sensors.in.gps;
            const all = allPrns(unit);
            // Preconditions: a fix, nothing inhibited, an empty message list, the whole constellation known
            expect(gps.isValid()).toBe(true);
            expect(inhibited(unit)).toEqual([]);
            expect(messages(unit)).toEqual([]);
            expect(all.length).toBe(32);

            openAntenna(unit);
            unit.props.failures.fail(c.key);
            await untilCalcTick(unit);

            // The unit's solution leaves the blocked satellites at once, before the SDK drops them at its next update
            expect(gps.isValid()).toBe(false);
            expect(inhibited(unit)).toEqual(all);

            const sampled: string[] = [];
            for (let s = 0; s < 60; s++) {
                await vi.advanceTimersByTimeAsync(1000);
                sampled.push(...messages(unit));
            }
            // The hardware message is the only one, and it stays
            expect(messages(unit)).toEqual([c.text]);
            expect(sampled.filter(m => m !== c.text)).toEqual([]);
            expect(gps.isValid()).toBe(false);
            expect(tracked(unit)).toEqual([]); // The SDK has dropped every satellite
            expect(inhibited(unit)).toEqual(all);

            unit.props.failures.repair(c.key);
            await untilCalcTick(unit);
            expect(inhibited(unit)).toEqual([]);
            for (let s = 0; s < 120 && !gps.isValid(); s++) {
                await vi.advanceTimersByTimeAsync(1000);
            }
            expect(gps.isValid()).toBe(true);
            expect(unit.errors).toEqual([]);
        }, 60_000);
    }

    it('the hardware message is posted after the next calculation tick', async () => {
        const unit = await bootUnit({storage: HOME});
        await settle(unit);

        openAntenna(unit);
        unit.props.failures.fail('gpsAntenna');
        await vi.advanceTimersByTimeAsync(2000);

        expect(messages(unit)).toEqual([ANTENNA]);
    }, 30_000);

    // A unit that still had a valid solution would post the RAIM and geometry messages here; the hardware message names
    // the cause instead (design, "The #453 messages during a receiver failure")
    it('the RAIM and geometry messages are not valid while the receiver has failed', async () => {
        const unit = await bootUnit({storage: HOME});
        await settle(unit);
        const gps = unit.props.sensors.in.gps;
        // HPL 200 x 5 m x 5.3 = 2.9 NM against the alert limit of 2 NM (ENR): RAIM and geometry fail
        const geometry: GpsGeometry = {valid: true, satellites: 6, altitudeAided: false, measurements: 6, hdop: 1, cNorth: 0.5, cEast: 0.5, epeNm: 0.01, maxSlope: 200};
        vi.spyOn(gps, 'solution', 'get').mockReturnValue(geometry);
        vi.spyOn(gps, 'isValid').mockReturnValue(true);

        openAntenna(unit);
        unit.props.failures.fail('gpsAntenna');
        await vi.advanceTimersByTimeAsync(15_000);
        expect(messages(unit)).toEqual([ANTENNA]);

        // The control: the same solution without the failure posts both after 10 s
        unit.props.failures.repair('gpsAntenna');
        await vi.advanceTimersByTimeAsync(12_000);
        expect(messages(unit).filter(m => SIGNAL_MESSAGES.includes(m))).toEqual([RAIM, GEOMETRY]);
    }, 60_000);

    // Review Focus 4: the forced acquisition of an engine-running start skips the inhibited satellites
    it('a stored gpsAntenna and an engine-running start: no satellite is acquired, no fix', async () => {
        const atForced: number[][] = [];
        const original = GPS.prototype.acceptForcedSolution;
        vi.spyOn(GPS.prototype, 'acceptForcedSolution').mockImplementation(function (this: GPS) {
            atForced.push(this.gpsSatComputer.getSatellites().filter(s => TRACKED.has(s.state.get())).map(s => s.prn));
            original.call(this);
        });
        const unit = await bootUnit({storage: failed('gpsAntenna')});
        const gps = unit.props.sensors.in.gps;
        await vi.advanceTimersByTimeAsync(1000);

        expect(atForced).toEqual([[]]); // Exactly one forced acquisition, and it acquired nothing
        expect(gps.isValid()).toBe(false);
        expect(tracked(unit)).toEqual([]);
        expect(inhibited(unit)).toEqual(allPrns(unit));

        await vi.advanceTimersByTimeAsync(30_000);
        expect(gps.isValid()).toBe(false);
        expect(tracked(unit)).toEqual([]);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // The control of the test above: the same boot without the failure acquires at once
    it('the same engine-running start without the failure acquires in the forced acquisition', async () => {
        const unit = await bootUnit();
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.props.sensors.in.gps.isValid()).toBe(true);
        expect(inhibited(unit)).toEqual([]);
    }, 30_000);

    it('a stored gpsAntenna: every satellite stays inhibited over a power cycle and through the start model\'s acquisition', async () => {
        const unit = await bootUnit({storage: {...WARM_START, ...failed('gpsAntenna')}});
        const gps = unit.props.sensors.in.gps;
        await vi.advanceTimersByTimeAsync(1000);
        const all = allPrns(unit);
        expect(inhibited(unit)).toEqual(all); // Precondition

        await unit.panel.powerOff();
        expect(inhibited(unit)).toEqual(all);
        await vi.advanceTimersByTimeAsync(5000);
        expect(inhibited(unit)).toEqual(all);

        await unit.panel.powerOn();
        expect(inhibited(unit)).toEqual(all);
        for (let s = 0; s < 30 && gps.search.mode !== SearchMode.Acquisition; s++) {
            await vi.advanceTimersByTimeAsync(1000);
            expect(inhibited(unit)).toEqual(all);
        }
        expect(gps.search.mode).toBe(SearchMode.Acquisition); // Precondition: the start model runs its warm start
        expect(inhibited(unit)).toEqual(all);

        for (let s = 0; s < 90; s++) {
            await vi.advanceTimersByTimeAsync(1000);
            expect(inhibited(unit)).toEqual(all);
        }
        expect(tracked(unit)).toEqual([]);
        expect(gps.isValid()).toBe(false);

        // A power-off during the acquisition ends the search, which lifts its own inhibits but not the blocks
        expect(gps.search.mode).toBe(SearchMode.Acquisition); // Precondition
        await unit.panel.powerOff();
        expect(gps.search.mode).toBe(SearchMode.Idle);
        expect(inhibited(unit)).toEqual(all);
        expect(unit.errors).toEqual([]);
    }, 120_000);

    // The engine-running start forces an acquisition (WelcomePage): it also skips the blocked satellites. SET 10 FAST no
    // longer forces one (#468), see the next test
    it('a forced acquisition during the failure acquires nothing', async () => {
        const unit = await bootUnit();
        await settle(unit);
        const gps = unit.props.sensors.in.gps;
        unit.props.failures.fail('gpsReceiver');
        await vi.advanceTimersByTimeAsync(10_000);
        expect(tracked(unit)).toEqual([]); // Precondition

        gps.gpsSatComputer.acquireAndUseSatellites();

        expect(tracked(unit)).toEqual([]);
        expect(inhibited(unit)).toEqual(allPrns(unit));
        await vi.advanceTimersByTimeAsync(2000);
        expect(gps.isValid()).toBe(false);
    }, 60_000);

    // #468: a switch to FAST without a fix initializes the memory from the truth and restarts the search, which the blocks hold
    it('SET 10 switched to FAST during the failure acquires nothing', async () => {
        const unit = await bootUnit({storage: {...HOME, fastGpsAcquisition: false}});
        await settle(unit);
        const gps = unit.props.sensors.in.gps;
        unit.props.failures.fail('gpsReceiver');
        await vi.advanceTimersByTimeAsync(10_000);
        expect(gps.isValid()).toBe(false); // Preconditions
        expect(tracked(unit)).toEqual([]);

        await unit.panel.selectPage('L', 'SET 10');
        await unit.panel.cursor('L');
        await unit.panel.inner('L', 1);
        expect(unit.props.userSettings.getSetting('fastGpsAcquisition').get()).toBe(true); // Precondition
        for (let s = 0; s < 30; s++) {
            await vi.advanceTimersByTimeAsync(1000);
            expect(tracked(unit)).toEqual([]);
        }

        expect(inhibited(unit)).toEqual(allPrns(unit));
        expect(gps.isValid()).toBe(false);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // The runtime state of GpsFailures restarts at both power edges (#460 design, "GpsFailures"): on, the first tick counts
    // no time, so the faulty satellite's ramp has not moved over the power-off. Ported from the jamming ramp (#465)
    it('a power cycle restarts the runtime state of the failures: the faulty satellite ramp counts nothing over the power-off', async () => {
        const unit = await bootUnit({storage: HOME});
        await settle(unit);
        const failures = unit.props.sensors.in.gps.failures;
        const biases: number[] = [];
        const original = failures.tick.bind(failures);
        vi.spyOn(failures, 'tick').mockImplementation((t: number) => {
            original(t);
            biases.push(failures.faultyBiasM);
        });
        unit.props.failures.fail('faultySatellite');
        await vi.advanceTimersByTimeAsync(30_000);

        await unit.panel.powerOff();
        const beforeOff = biases.length;
        const bias = biases[beforeOff - 1];
        expect(bias).toBeGreaterThan(0); // Precondition: 30 s into a ramp of at most 300 s to at least 500 m
        expect(bias).toBeGreaterThan(biases[beforeOff - 2]); // Precondition: the ramp was still rising

        await vi.advanceTimersByTimeAsync(20_000);
        expect(biases.length).toBe(beforeOff); // Precondition: no tick while off
        await unit.panel.powerOn();
        for (let i = 0; i < 8 && biases.length === beforeOff; i++) {
            await vi.advanceTimersByTimeAsync(250);
        }

        expect(biases.length).toBe(beforeOff + 1);
        expect(biases[beforeOff]).toBe(bias);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    it('the Self Test page shows TEST FAIL with gpsAntenna stored', async () => {
        await bootToSelfTest({storage: failed('gpsAntenna')});

        expect(Screen.read().rows('L')[5]).toBe('TEST FAIL  ');
    }, 30_000);

    it('the Self Test page shows TEST FAIL with gpsReceiver stored', async () => {
        await bootToSelfTest({storage: failed('gpsReceiver')});

        expect(Screen.read().rows('L')[5]).toBe('TEST FAIL  ');
    }, 30_000);

    it('FLR 3 lists the GPS failures', async () => {
        const unit = await bootUnit();
        await openFlr3(unit);
        await unit.panel.cursor('L');
        await unit.panel.cursorTo('L', 'SPOOFING');
        await vi.advanceTimersByTimeAsync(1000);

        expect(rows()).toEqual(['  INACTIVE', 'RCVR HW', 'RCVR INIT', 'RCVR MEMORY', 'SATELLITE', 'SPOOFING']);
        await unit.panel.cursorTo('L', 'GPS ANTENNA');
        await vi.advanceTimersByTimeAsync(1000);
        expect(rows()[1]).toBe('GPS ANTENNA');
    }, 30_000);

    it('with nothing failed an engine-running boot inhibits no satellite, as before', async () => {
        const unit = await bootUnit();
        await settle(unit);

        expect(inhibited(unit)).toEqual([]);
        expect(tracked(unit).length).toBe(8); // Precondition: every channel tracks
    }, 30_000);
});


// The wiring around the receiver: the tick order, take-home mode, and what jamming does not suppress (design, "GpsFailures",
// "Blocked satellites leave the unit's solution at once", "The #453 messages during a receiver failure"). The per-satellite
// skip of a satellite whose signal is lost is in SatelliteReachability.test.ts (#467)
describe('the wiring of the failures into the receiver (#460)', () => {
    // Tick order: GpsFailures.tick, GpsSearch.tick, the inhibits, then the receiver's update. A block set between two
    // ticks reaches the receiver in the next tick's update, not one tick later
    it('a receiver failure is inhibited when the receiver updates in the next tick', async () => {
        const unit = await bootUnit({storage: HOME});
        await settle(unit);
        const sdk = computer(unit);
        const all = allPrns(unit);
        const atUpdate: number[][] = [];
        const onUpdate = sdk.onUpdate.bind(sdk);
        vi.spyOn(sdk, 'onUpdate').mockImplementation(() => {
            atUpdate.push(inhibited(unit));
            onUpdate();
        });

        unit.props.failures.fail('gpsAntenna');
        await untilCalcTick(unit);

        expect(atUpdate).toEqual([all]);
    }, 30_000);

    // #467: tick order GpsFailures.tick, the signals' tick, then the receiver's update. A tracked satellite whose signal
    // is lost in a tick has left the tracked states when the receiver's update of that same tick returns (through its
    // reachability, Gps.ts wrapReachability). The per-satellite skip of the unit's solution is in
    // SatelliteReachability.test.ts. #465: the noise rise, once #460's jamming ramp, is put into the signals' tick here:
    // 26 dB over 240 s, so that the satellites are lost over several ticks
    it('a tracked satellite lost to a rising noise floor in a tick is no longer tracked after the receiver updates in that tick', async () => {
        const unit = await bootUnit({storage: HOME});
        await settle(unit);
        const gps = unit.props.sensors.in.gps;
        const sdk = computer(unit);
        const all = allPrns(unit);
        const lost = () => all.filter(prn => gps.signals.isLost(prn));
        const isTracked = (prn: number) => TRACKED.has(sdk.getSatellites().find(s => s.prn === prn)!.state.get());

        let tick = 0;
        const gpsTick = gps.tick.bind(gps);
        vi.spyOn(gps, 'tick').mockImplementation(() => {
            tick++;
            gpsTick();
        });
        const newlyLostTracked = new Map<number, number[]>();
        const signalsTick = gps.signals.tick.bind(gps.signals);
        let rising = 0;
        vi.spyOn(gps.signals, 'tick').mockImplementation((t, attitude) => {
            const before = lost();
            rising++;
            signalsTick(t, attitude, Math.min(26, rising * 26 / 240));
            const added = lost().filter(prn => !before.includes(prn) && isTracked(prn));
            if (added.length > 0) {
                newlyLostTracked.set(tick, added);
            }
        });
        const trackedAfterUpdate = new Map<number, number[]>();
        const onUpdate = sdk.onUpdate.bind(sdk);
        vi.spyOn(sdk, 'onUpdate').mockImplementation(() => {
            onUpdate();
            trackedAfterUpdate.set(tick, all.filter(isTracked));
        });

        await vi.advanceTimersByTimeAsync(240_000);

        expect(newlyLostTracked.size).toBeGreaterThan(1); // Precondition: the losses came over several ticks
        const stillTracked: string[] = [];
        for (const [t, prns] of newlyLostTracked) {
            const after = trackedAfterUpdate.get(t) ?? [];
            stillTracked.push(...prns.filter(prn => after.includes(prn)).map(prn => `tick ${t}: PRN ${prn}`));
        }
        expect(stillTracked).toEqual([]);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // Take-home mode has no receiver failures (GpsFailures), also with one stored by an earlier session
    it('take-home mode ignores a stored gpsAntenna: no inhibit, a valid position', async () => {
        const unit = await bootUnit({panelXml: panelXml({TakeHomeMode: true}), storage: failed('gpsAntenna')});
        await vi.advanceTimersByTimeAsync(5000);
        const gps = unit.props.sensors.in.gps;

        expect(unit.props.failures.isActive('gpsAntenna')).toBe(true); // Precondition: the failure is stored
        expect(gps.failures.receiverFailed).toBe(false);
        expect(inhibited(unit)).toEqual([]);
        expect(gps.isValid()).toBe(true);
        expect(unit.errors).toEqual([]);
    }, 30_000);

    // Only a receiver failure suppresses the #453 messages; under jamming they say what the satellites do
    it('jamming does not suppress the RAIM and geometry messages', async () => {
        const unit = await bootUnit({storage: HOME});
        await settle(unit);
        const gps = unit.props.sensors.in.gps;
        // HPL 200 x 5 m x 5.3 = 2.9 NM against the alert limit of 2 NM (ENR): RAIM and geometry fail
        const geometry: GpsGeometry = {valid: true, satellites: 6, altitudeAided: false, measurements: 6, hdop: 1, cNorth: 0.5, cEast: 0.5, epeNm: 0.01, maxSlope: 200};
        vi.spyOn(gps, 'solution', 'get').mockReturnValue(geometry);
        vi.spyOn(gps, 'isValid').mockReturnValue(true);

        unit.props.failures.fail('gpsJamming');
        await vi.advanceTimersByTimeAsync(12_000);

        expect(unit.props.failures.isEffective('gpsJamming')).toBe(true); // Precondition
        expect(messages(unit)).toEqual([RAIM, GEOMETRY]);
    }, 30_000);

    it('jamming does not suppress SATELLITE COVERAGE INADEQUATE FOR NAV', async () => {
        const unit = await bootUnit({storage: HOME});
        await settle(unit);
        const gps = unit.props.sensors.in.gps;
        unit.props.failures.fail('gpsJamming');
        inhibitAllBut(unit, 0);
        for (let s = 0; s < 12 && gps.isValid(); s++) {
            await vi.advanceTimersByTimeAsync(1000);
        }
        expect(gps.isValid()).toBe(false); // Precondition: the fix is lost
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.props.failures.isEffective('gpsJamming')).toBe(true); // Precondition
        expect(messages(unit)).toEqual([COVERAGE]);
    }, 30_000);
});


/**
 * An engine-running unit at KAAA, 3000 ft, flying FPL 0 KAAA, ABC, KBBB. The position is the one stored at the last
 * power-off, so the boot posts no POSITION DIFFERS message. STA 1 is on the left. Moved with the tests of STA 1 during a
 * receiver failure from GpsJamming.test.ts (#465), under its name there, so that they moved unchanged; the jamming they
 * once stored is gone
 */
async function jammedFlight(storage: Record<string, unknown>): Promise<HeadlessUnit> {
    const r = standardRoute();
    const unit = await bootUnit({
        facilities: [r.kaaa, r.abc, r.kbbb], position: {lat: r.kaaa.lat, lon: r.kaaa.lon}, altitudeFt: 3000,
        storage: {lastLatitude: r.kaaa.lat, lastLongitude: r.kaaa.lon, ...savedFlightplan(0, [r.kaaa, r.abc, r.kbbb]), ...storage},
    });
    await unit.panel.selectPage('L', 'STA 1');
    return unit;
}

/** Brings the display one tick past a calculation tick, so that the screen shows what that calculation tick left */
async function afterCalcTick(unit: HeadlessUnit): Promise<void> {
    await untilCalcTick(unit);
    await vi.advanceTimersByTimeAsync(250);
}

describe('STA 1 during a receiver failure (#460)', () => {
    it('gpsAntenna in flight: STATE FAILR and no satellite rows, while the SDK still has the satellites in their channels', async () => {
        const unit = await jammedFlight({});
        const gps = unit.props.sensors.in.gps;
        await afterCalcTick(unit);
        expect(Screen.read().status().left).toBe('STA+1'); // Precondition: eight rows on two pages

        unit.props.failures.fail('gpsAntenna');
        await afterCalcTick(unit);

        expect(gps.gpsSatComputer.getChannels().filter(s => s !== null && s.state.get() === GPSSatelliteState.InUse).length).toBe(8); // Precondition
        expect(Screen.read().rows('L')).toEqual(['STATE FAILR', ' SV SNR ELE', '           ', '           ', '           ', '           ']);
        expect(Screen.read().status().left).toBe('STA 1'); // No second page

        await vi.advanceTimersByTimeAsync(10_000);
        expect(Screen.read().rows('L')).toEqual(['STATE FAILR', ' SV SNR ELE', '           ', '           ', '           ', '           ']);
        expect(Screen.read().status().left).toBe('STA 1');
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // FAILR comes before every other state: also before the calculation tick that drops the fix
    it('gpsAntenna: FAILR at the next display tick, while the fix is still valid', async () => {
        const unit = await jammedFlight({});
        await untilCalcTick(unit);

        unit.props.failures.fail('gpsAntenna');
        await vi.advanceTimersByTimeAsync(250);

        expect(unit.props.sensors.in.gps.isValid()).toBe(true); // Precondition: no calculation tick yet
        expect(Screen.read().rows('L')[0]).toBe('STATE FAILR');
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // The page falls back from STA+1 (#466), so the failure shows on the first page
    it('gpsAntenna while STA+1 is shown: STATE FAILR and no satellite rows', async () => {
        const unit = await jammedFlight({});
        await afterCalcTick(unit);
        await unit.panel.inner('L', 1);
        expect(Screen.read().rows('L')[0]).not.toMatch(/^STATE /); // Precondition: on the second page
        expect(Screen.read().status().left).toBe('STA+1');

        unit.props.failures.fail('gpsAntenna');
        await vi.advanceTimersByTimeAsync(3000);

        expect(Screen.read().rows('L')).toEqual(['STATE FAILR', ' SV SNR ELE', '           ', '           ', '           ', '           ']);
        expect(Screen.read().status().left).toBe('STA 1');
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // No rows also during the start model's acquisition, whose predicted list would otherwise show
    it("gpsAntenna during the start model's acquisition: STATE FAILR and no satellite rows", async () => {
        const unit = await bootToSelfTest({storage: {...WARM_START, failure_gpsAntenna: '{}'}});
        await unit.panel.approveSelfTest();
        await unit.panel.selectPage('L', 'STA 1');

        expect(unit.props.sensors.in.gps.search.mode).toBe(SearchMode.Acquisition); // Precondition
        expect(Screen.read().rows('L')).toEqual(['STATE FAILR', ' SV SNR ELE', '           ', '           ', '           ', '           ']);
        expect(Screen.read().status().left).toBe('STA 1');
        expect(unit.errors).toEqual([]);
    }, 60_000);

    it('gpsAntenna stored by an earlier session: STATE FAILR and no satellite rows', async () => {
        const unit = await jammedFlight({failure_gpsAntenna: '{}'});
        await vi.advanceTimersByTimeAsync(5000);

        expect(Screen.read().rows('L')).toEqual(['STATE FAILR', ' SV SNR ELE', '           ', '           ', '           ', '           ']);
        expect(Screen.read().status().left).toBe('STA 1');
        expect(unit.errors).toEqual([]);
    }, 60_000);
});
