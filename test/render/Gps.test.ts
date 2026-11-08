import {describe, expect, it, vi} from 'vitest';
import {GPSSatellite, GPSSatelliteState} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, moveAircraft, settle, untilCalcTick} from '../harness/boot';
import {Screen} from '../harness/render/screen';
import {messages} from '../harness/readers';
import {secondsToFix} from '../harness/gps';
import {panelXml} from '../harness/panelXml';
import {DEFAULT_START} from '../harness/sim/clock';
import {TimeStamp} from '../../kln90b/data/Time';
import {GPSEvents} from '../../kln90b/Gps';
import {SearchMode} from '../../kln90b/GpsSearch';

// The channels of the satellite computer stay null until the first onUpdate(), so "all non-null" means that acquisition
// runs. Not asserted: Acquiring, or isValid(), whose timing comes from the seeded random (and isValid() sits next to the
// end of the turn-on page).
describe('GPS acquisition starts at power-on (179d37d)', () => {
    // Spec 3-17: the time to first fix counts from power-on, not from the approval of the self-test page
    it('the satellite channels are searching while the turn-on page is still up', async () => {
        const unit = await bootUnit({engineRunning: false});
        const gps = unit.props.sensors.in.gps;
        expect(gps.gpsSatComputer.getChannels()).toHaveLength(8); // 5-29: an empty list would pass the every() checks
        expect(gps.gpsSatComputer.getChannels().every(c => c === null)).toBe(true);

        await unit.panel.powerOn();
        await vi.advanceTimersByTimeAsync(5000); // a fixed wait: the time since power-on is the subject

        expect(Screen.read().row(0)).toBe(' GPS             ORS 20');
        expect(gps.gpsSatComputer.getChannels()).toHaveLength(8);
        expect(gps.gpsSatComputer.getChannels().every(c => c !== null)).toBe(true);
    });
});

// The receiver sends only the week number modulo 1024, so the unit picks the era from the date it believes it is (the
// pilot-entered date, which Set2Page.saveDate stores in gps.timeZulu) and lands 1024 weeks off when that guess is wrong
// (Gps.calculateGPSTime). The default fake clock starts 2026-06-01T12:00:00Z.
describe('GPS week rollover (64c203d)', () => {
    const CLOCK_START = Date.UTC(2026, 5, 1, 12);

    async function acquireWithDate(userDate: number) {
        const unit = await bootUnit({coldGps: true});
        const gps = unit.props.sensors.in.gps;
        expect(gps.isValid()).toBe(false);
        gps.timeZulu = TimeStamp.create(userDate);
        // Not settle(): the era check runs at the acquisition tick, before the valid-state tick recalculates, so the loop
        // must stop at the first valid second. The reset receiver searches as REAL does in both settings, about 73 s (#468)
        for (let i = 0; i < 120 && !gps.isValid(); i++) {
            await vi.advanceTimersByTimeAsync(1000);
        }
        expect(gps.isValid()).toBe(true);
        return gps;
    }

    // The unit's time lags the clock by up to one calculation tick (measured 0.25 to 1 s)
    const TOLERANCE_MS = 1500;

    // characterization: the Pilot's Guide is silent on the rollover. 2006-10-16T12:00Z is the clock start minus 1024 weeks
    // (7168 days), so a date one era in the past is shifted by exactly one era: the sim time minus 1024 weeks.
    it('characterization: a date one era off makes the unit show the sim time minus 1024 weeks, right after acquisition and 5 s later', async () => {
        const gps = await acquireWithDate(Date.UTC(2006, 5, 1, 12));
        const expected = () => Date.UTC(2006, 9, 16, 12) + (Date.now() - CLOCK_START);

        // gpsAcquired
        expect(Math.abs(gps.timeZulu.getTimestamp() - expected())).toBeLessThan(TOLERANCE_MS);

        // The valid tick, which recalculates the era every second
        await vi.advanceTimersByTimeAsync(5000);
        expect(Math.abs(gps.timeZulu.getTimestamp() - expected())).toBeLessThan(TOLERANCE_MS);
    });

    // 3-53: the date comes from the satellite; a date in the right era is simply replaced by the sim time
    it('a date in the right era is replaced by the sim time', async () => {
        const gps = await acquireWithDate(Date.UTC(2026, 5, 1, 11));

        expect(Math.abs(gps.timeZulu.getTimestamp() - Date.now())).toBeLessThan(TOLERANCE_MS);
    });

    // characterization: era 2 began 2019-04-07T00:00Z (2048 weeks after 1980-01-06). A date half a day after it is in the
    // right era, so no shift; together with the case below it pins the epoch from both sides (an epoch a day later puts
    // this date before the boundary).
    it('characterization: a date just after the 2019 era boundary is in the right era', async () => {
        const gps = await acquireWithDate(Date.UTC(2019, 3, 7, 12));

        expect(Math.abs(gps.timeZulu.getTimestamp() - Date.now())).toBeLessThan(TOLERANCE_MS);
    });

    // characterization: half a day before the same boundary is the last half day of era 1, so the era is off by one and
    // the unit shows the sim time minus 1024 weeks. An epoch a day earlier, or rounding the era instead of flooring it,
    // moves this date into era 2.
    it('characterization: a date just before the 2019 era boundary is in the previous era', async () => {
        const gps = await acquireWithDate(Date.UTC(2019, 3, 6, 12));
        const ERA_MS = 1024 * 7 * 24 * 60 * 60 * 1000;

        expect(Math.abs(gps.timeZulu.getTimestamp() - (Date.now() - ERA_MS))).toBeLessThan(TOLERANCE_MS);
    });

    // #465: the general time check compares the unit's clock with the GPS time in the era the unit believes, as the
    // acquisition does. The acquisition posts its own SYSTEM TIME UPDATED (the date is months off); the ticks after it, whose
    // GPS time stays an era behind the sim time, post nothing more
    it('after an acquisition in the previous era, the ticks with the fix post no further SYSTEM TIME UPDATED (B-4, #465)', async () => {
        const unit = await bootUnit({coldGps: true});
        const gps = unit.props.sensors.in.gps;
        gps.timeZulu = TimeStamp.create(Date.UTC(2006, 5, 1, 12));
        for (let i = 0; i < 120 && !gps.isValid(); i++) {
            await vi.advanceTimersByTimeAsync(1000);
        }
        expect(gps.isValid()).toBe(true); // Precondition

        await vi.advanceTimersByTimeAsync(10_000);

        expect(gps.isValid()).toBe(true);
        expect(messages(unit).filter(m => m === 'SYSTEM TIME UPDATED TO GPS TIME')).toHaveLength(1);
        expect(Math.abs(gps.timeZulu.getTimestamp() - (Date.UTC(2006, 9, 16, 12) + (Date.now() - CLOCK_START)))).toBeLessThan(TOLERANCE_MS);
    }, 60_000);
});

// The track of the GPS is the bearing between two successive fixes, and it needs a ground speed of at least 2 kt (3-32,
// 3-35). When the position then stops changing (a paused sim), the unit keeps the last track instead of computing the
// bearing between two equal points (43d472b). The jump from 47/8 to 47.1/8.1 is flown on the true course of 34.232
// degrees (great circle, by hand from the spherical formula); with the variation of 4 degrees east the magnetic track is
// 30.232 degrees, which NAV 3 rounds to 030.
describe('GPS track while the sim is paused (43d472b)', () => {
    const TRUE_TRACK_RAD = 34.232 * Math.PI / 180;
    const MAGNETIC_TRACK_RAD = 30.232 * Math.PI / 180;

    async function bootAndJump() {
        const unit = await bootUnit({position: {lat: 47, lon: 8}, magvar: 4});
        await settle(unit);
        await unit.panel.selectPage('L', 'NAV 3');
        await moveAircraft(unit, {lat: 47.1, lon: 8.1}, {groundspeedKt: 120});
        return unit;
    }

    // 3-32: TK shows the track as a number when the speed is sufficient
    it('shows the magnetic track on NAV 3 and writes both track SimVars after a jump at 120 kt', async () => {
        const unit = await bootAndJump();

        expect(Screen.read().rows('L')[2]).toBe('TK     030°');
        expect(unit.env.sim.get('GPS GROUND TRUE TRACK', 'radians')).toBeCloseTo(TRUE_TRACK_RAD, 3);
        expect(unit.env.sim.get('GPS GROUND MAGNETIC TRACK', 'radians')).toBeCloseTo(MAGNETIC_TRACK_RAD, 3);
    });

    // The hold is a characterization: the Pilot's Guide does not describe a paused sim. One test per output, so that each
    // says on its own whether it kept the track.
    async function bootJumpAndHold() {
        const unit = await bootAndJump();
        await vi.advanceTimersByTimeAsync(5000);
        return unit;
    }

    it('characterization: keeps the track on NAV 3 while the position holds for 5 s', async () => {
        await bootJumpAndHold();

        expect(Screen.read().rows('L')[2]).toBe('TK     030°');
    });

    it('characterization: keeps the true track SimVar while the position holds for 5 s', async () => {
        const unit = await bootJumpAndHold();

        expect(unit.env.sim.get('GPS GROUND TRUE TRACK', 'radians')).toBeCloseTo(TRUE_TRACK_RAD, 3);
    });

    it('characterization: keeps the magnetic track SimVar while the position holds for 5 s', async () => {
        const unit = await bootJumpAndHold();

        expect(unit.env.sim.get('GPS GROUND MAGNETIC TRACK', 'radians')).toBeCloseTo(MAGNETIC_TRACK_RAD, 3);
    });

    it('characterization: logs no error while the position holds for 5 s', async () => {
        const unit = await bootJumpAndHold();

        expect(unit.consoleErrors).toEqual([]);
    });
});

// 3-32: NAV 3 shows dashes for TK when the speed is insufficient; 3-35: the track is usable from 2 knots. The jump from
// 47/8 to 47.1/8.1 is the true course 34.232 degrees, 030 magnetic with 4 degrees east (see above)
describe('TK and the 2 kt limit (3-32, 3-35)', () => {
    async function jumpAt(groundspeedKt: number) {
        const unit = await bootUnit({position: {lat: 47, lon: 8}, magvar: 4});
        await settle(unit);
        await unit.panel.selectPage('L', 'NAV 3');
        await moveAircraft(unit, {lat: 47.1, lon: 8.1}, {groundspeedKt});
    }

    it('shows the track at 2 kt (3-35)', async () => {
        await jumpAt(2);

        expect(Screen.read().rows('L')[2]).toBe('TK     030°');
    });

    it('shows dashes at 1.9 kt (3-32, 3-35)', async () => {
        await jumpAt(1.9);

        expect(Screen.read().rows('L')[2]).toBe('TK     ---°');
    });
});

// #463: the SDK publishes the receiver's state, SBAS state, inhibit, covariance and DOP events synced and cached, so they
// reach every instrument of the aircraft. The Working Title GNS 430/530 builds its receiver on index 1 and drives its display from gps_system_state_changed_1, so a
// KLN receiver on index 1 set the state the GNS showed (NO GPS POSITION after a KLN power-off, the sim on 2026-11-03).
// The KLN subscribes to none of these topics, so none of them may leave the unit, whatever the index. The harness's
// listener never becomes ready and the harness has no flow events, which keeps every bus local; this test records what
// the buses would send on either sync channel of the SDK instead
describe('the receiver events stay inside the unit (#463)', () => {
    it('syncs no receiver event to other instruments through an acquisition and a power cycle (#463)', async () => {
        const g = globalThis as any;
        const original = g.RegisterGenericDataListener;
        const originalFlow = g.LaunchFlowEvent;
        const topics: string[] = [];
        g.RegisterGenericDataListener = (onReady: () => void) => {
            setTimeout(onReady, 0); //The SDK assigns the listener before its ready callback may use it
            return {
                send: (_key: string, pkg: { data: { topic: string }[] }) => topics.push(...pkg.data.map(d => d.topic)),
                onDataReceived: () => undefined,
            };
        };
        //The other channel, a bus built with the flow event sync
        g.LaunchFlowEvent = (_event: string, key: string, _busId: string, json: string) => {
            if (key === 'EB_EVENTS') {
                topics.push(...(JSON.parse(json) as { data: { topic: string }[] }).data.map(d => d.topic));
            }
        };
        try {
            const unit = await bootUnit({coldGps: true});
            await settle(unit);

            unit.send('KLN90B_Power_Off');
            await vi.advanceTimersByTimeAsync(3000);
            unit.send('KLN90B_Power_On');
            await vi.advanceTimersByTimeAsync(3000);
        } finally {
            g.RegisterGenericDataListener = original;
            if (originalFlow === undefined) {
                delete g.LaunchFlowEvent; //The harness defines none
            } else {
                g.LaunchFlowEvent = originalFlow;
            }
        }

        expect(topics).toContain('event_bus'); //The unit's bus asks for a resync at its construction: the recorder is wired
        expect(topics.filter(t => t.startsWith('gps_'))).toEqual([]);
    });
});

const TIME_UPDATED = 'SYSTEM TIME UPDATED TO GPS TIME';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const timeMessages = (unit: HeadlessUnit) => messages(unit).filter(m => m === TIME_UPDATED);

/** The times of every timeUpdatedEvent from now on */
function recordTimeUpdates(unit: HeadlessUnit): number[] {
    const published: number[] = [];
    unit.core.bus.getSubscriber<GPSEvents>().on('timeUpdatedEvent').handle(t => published.push(t.getTimestamp()));
    return published;
}

/** The sim's time as a UNIX timestamp (FakeSim E:ABSOLUTE TIME) */
const simUnix = (unit: HeadlessUnit) => Date.now() + unit.env.sim.absoluteTimeOffsetMs;

// B-4: the message shows whenever the GPS moves the unit's clock by more than 10 minutes, not only at the acquisition of a
// fix (design 2026-11-07, "Kept from the issue"). In flight that is a spoofer's time shift; without a failure only a sim
// time changed by the pilot during a fix does it, one of the three decided exceptions (design, "Anti-goals")
describe('the general time check (B-4, #465)', () => {
    async function withFix(): Promise<{ unit: HeadlessUnit, published: number[] }> {
        const unit = await bootUnit();
        await settle(unit);
        return {unit, published: recordTimeUpdates(unit)};
    }

    it('a sim time jump of an hour during a fix posts SYSTEM TIME UPDATED and publishes timeUpdatedEvent once', async () => {
        const {unit, published} = await withFix();
        const gps = unit.props.sensors.in.gps;
        expect(timeMessages(unit)).toEqual([]); // Precondition

        unit.env.sim.absoluteTimeOffsetMs += HOUR;
        const jumped = simUnix(unit);
        await vi.advanceTimersByTimeAsync(10_000);

        expect(timeMessages(unit)).toEqual([TIME_UPDATED]);
        expect(published).toHaveLength(1);
        // The first calculation tick after the jump, up to a second later
        expect(published[0] - jumped).toBeGreaterThanOrEqual(-1);
        expect(published[0] - jumped).toBeLessThan(1500);
        expect(Math.abs(gps.timeZulu.getTimestamp() - simUnix(unit))).toBeLessThan(1500);
    }, 60_000);

    // The sim's time set back by the pilot: the same check either way
    it('a sim time jump of an hour back during a fix posts SYSTEM TIME UPDATED and publishes timeUpdatedEvent once', async () => {
        const {unit, published} = await withFix();
        const gps = unit.props.sensors.in.gps;

        unit.env.sim.absoluteTimeOffsetMs -= HOUR;
        await vi.advanceTimersByTimeAsync(10_000);

        expect(timeMessages(unit)).toEqual([TIME_UPDATED]);
        expect(published).toHaveLength(1);
        expect(Math.abs(gps.timeZulu.getTimestamp() - simUnix(unit))).toBeLessThan(1500);
    }, 60_000);

    it('a normal tick and a jump of 9 minutes post nothing', async () => {
        const {unit, published} = await withFix();
        const gps = unit.props.sensors.in.gps;

        await vi.advanceTimersByTimeAsync(10_000);
        expect(timeMessages(unit)).toEqual([]);
        expect(published).toEqual([]);

        unit.env.sim.absoluteTimeOffsetMs += 9 * MINUTE;
        await vi.advanceTimersByTimeAsync(10_000);

        expect(Math.abs(gps.timeZulu.getTimestamp() - simUnix(unit))).toBeLessThan(1500); // Precondition: the clock followed
        expect(gps.isValid()).toBe(true);
        expect(timeMessages(unit)).toEqual([]);
        expect(published).toEqual([]);
    }, 60_000);

    // The acquisition's own check (gpsAcquired) posts; the valid ticks after it find the clock right. A receiver reset with
    // no start model in progress (coldGps) acquires on its own, whatever the clock
    it('a fix acquired with the clock an hour off posts once, not again in the ticks after it', async () => {
        const unit = await bootUnit({coldGps: true});
        const gps = unit.props.sensors.in.gps;
        const published = recordTimeUpdates(unit);
        gps.timeZulu = TimeStamp.create(Date.now() - HOUR);

        expect(await secondsToFix(unit, 120)).toBeLessThan(120);
        await vi.advanceTimersByTimeAsync(10_000);

        expect(timeMessages(unit)).toEqual([TIME_UPDATED]);
        expect(published).toHaveLength(1);
        expect(Math.abs(gps.timeZulu.getTimestamp() - simUnix(unit))).toBeLessThan(1500);
    }, 60_000);
});

// Design 2026-11-07, "Recovery": a loss of the fix with a belief far off the real sky (the clock off by more than the 10
// minutes of Install manual 2-66, or the position 100 NM or more off) restarts the start model from that belief, as at a
// power-on. Within those limits the receiver reacquires as before. A sim time changed during a fix does not lose it (the
// general time check corrects the clock); without a failure the trigger is a teleport, a slew or map move of 100 NM or
// more that loses the fix, one of the three decided exceptions (design, "Anti-goals"). The antenna failure takes the fix
// in the calculation tick after it is switched on; the belief is changed just before, so that no valid tick corrects it
describe('the recovery after a lost fix (#465)', () => {
    /** A unit with a fix whose belief is changed, then loses the fix to the antenna failure, which is then repaired */
    async function loseFixWith(change: (unit: HeadlessUnit) => void): Promise<HeadlessUnit> {
        const unit = await bootUnit();
        await settle(unit);
        const gps = unit.props.sensors.in.gps;
        await untilCalcTick(unit);
        change(unit);
        unit.props.failures.fail('gpsAntenna');
        await untilCalcTick(unit);
        expect(gps.isValid()).toBe(false); // Precondition: lost in the first calculation tick
        await untilCalcTick(unit); // The search begins its start in the tick after
        unit.props.failures.repair('gpsAntenna');
        return unit;
    }

    it.each([
        ['ahead', 3 * HOUR],
        ['behind', -3 * HOUR],
    ])('a loss of the fix with a clock 3 hours %s restarts the start model from the belief', async (_, offsetMs) => {
        const unit = await loseFixWith(u => {
            const gps = u.props.sensors.in.gps;
            gps.timeZulu.setTimestamp(gps.timeZulu.getTimestamp() + offsetMs);
        });
        const gps = unit.props.sensors.in.gps;
        expect(Math.abs(gps.timeZulu.getTimestamp() - simUnix(unit) - offsetMs)).toBeLessThan(5000); // Precondition: not corrected

        expect(gps.search.mode).toBe(SearchMode.Acquisition);
        // 3-17: with the clock off no predicted satellite is acquired; after the give-up time (2-66: 5 minutes) it searches the sky
        await vi.advanceTimersByTimeAsync(4 * MINUTE);
        expect(gps.search.mode).toBe(SearchMode.Acquisition);
        expect(gps.isValid()).toBe(false);
        await vi.advanceTimersByTimeAsync(MINUTE + 5000);
        expect(gps.search.mode).toBe(SearchMode.SkySearch);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    it('a loss of the fix with the position believed 150 NM off restarts the start model from the belief', async () => {
        const starts: { lat: number, lon: number }[] = [];
        const unit = await loseFixWith(u => {
            const gps = u.props.sensors.in.gps;
            const original = gps.search.start.bind(gps.search);
            vi.spyOn(gps.search, 'start').mockImplementation(p => {
                starts.push({lat: p.lat, lon: p.lon}); // A copy: the believed position is the unit's own, which a fix moves
                original(p);
            });
            gps.coords.set(47 + 2.5, 8); // 150 NM north of the aircraft at 47/8
        });
        const gps = unit.props.sensors.in.gps;

        expect(starts).toHaveLength(1);
        expect(starts[0].lat).toBeCloseTo(49.5, 6);
        expect(starts[0].lon).toBeCloseTo(8, 6);
        expect(gps.search.mode).toBe(SearchMode.Acquisition);
        expect(gps.search.predictedSatellites().length).toBeGreaterThan(0); // The clock is right: a warm start from 150 NM
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // The receiver keeps GPS time modulo the era (receiverTimeDifference, #63): a clock exactly 1024 weeks off is right to
    // it, and the loss reacquires as before
    it('a loss of the fix with the clock exactly 1024 weeks off keeps the search idle', async () => {
        const ERA_MS = 1024 * 7 * 24 * 60 * 60 * 1000;
        const unit = await loseFixWith(u => {
            const gps = u.props.sensors.in.gps;
            gps.timeZulu.setTimestamp(gps.timeZulu.getTimestamp() - ERA_MS);
        });
        const gps = unit.props.sensors.in.gps;
        expect(Math.abs(gps.timeZulu.getTimestamp() - simUnix(unit) + ERA_MS)).toBeLessThan(5000); // Precondition: not corrected

        expect(gps.search.mode).toBe(SearchMode.Idle);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // The control of both: a clock 5 minutes off and a position 90 NM off are within the limits. The search stays idle, and
    // the receiver reacquires as before (IDLE_ACQUISITION, 40 s)
    it('a loss of the fix with the clock 5 minutes and the position 90 NM off keeps the search idle and reacquires as before', async () => {
        const unit = await loseFixWith(u => {
            const gps = u.props.sensors.in.gps;
            gps.timeZulu.setTimestamp(gps.timeZulu.getTimestamp() + 5 * MINUTE);
            gps.coords.set(47 + 1.5, 8); // 90 NM north
        });
        const gps = unit.props.sensors.in.gps;

        expect(gps.search.mode).toBe(SearchMode.Idle);
        expect(await secondsToFix(unit, 120)).toBeLessThan(120);
        expect(unit.errors).toEqual([]);
    }, 60_000);
});

// Hot swapping is public contract (wiki "Hot Swapping"): L:KLN90B_Disabled stops the calculation ticks, but the unit's
// battery clock runs on, as over a power-off (3-53). Resumed after 15 minutes, the clock is right: no SYSTEM TIME UPDATED,
// and a loss of the fix finds no clock off. Base b622f4ee posted nothing here either
describe('a hot-swap disable (#465)', () => {
    it('a 15-minute disable posts no SYSTEM TIME UPDATED and restarts no search on resume', async () => {
        const unit = await bootUnit();
        await settle(unit);
        const gps = unit.props.sensors.in.gps;
        const published = recordTimeUpdates(unit);
        const start = vi.spyOn(gps.search, 'start');

        unit.env.sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(15 * MINUTE);
        unit.env.sim.set('L:KLN90B_Disabled', 'bool', false);
        await vi.advanceTimersByTimeAsync(30_000);

        expect(gps.isValid()).toBe(true);
        expect(timeMessages(unit)).toEqual([]);
        expect(published).toEqual([]);
        expect(start).not.toHaveBeenCalled();
        expect(gps.search.mode).toBe(SearchMode.Idle);
        expect(Math.abs(gps.timeZulu.getTimestamp() - simUnix(unit))).toBeLessThan(1500);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // The start model decides its start on the first tick after a power-on, from the receiver's clock. A disable right after
    // the power-on delays that tick by 15 minutes: the clock carried over makes it the warm start of the right time, not the
    // ACQ of a clock 15 minutes off, which acquires nothing (install manual 2-66)
    it('a disable right after a power-on: the start on resume is a warm start with the clock right', async () => {
        const unit = await bootUnit({engineRunning: false, storage: {lastLatitude: 47, lastLongitude: 8}});
        const gps = unit.props.sensors.in.gps;
        unit.send('KLN90B_Power_On');
        unit.env.sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(15 * MINUTE);
        expect(gps.search.mode).toBe(SearchMode.Idle); // Precondition: the start has not begun
        unit.env.sim.set('L:KLN90B_Disabled', 'bool', false);

        expect(await secondsToFix(unit, 180)).toBeLessThan(180);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // Final review (2026-11-08): a power-off while disabled. A disabled unit takes no input (#138), so the power goes with the
    // aircraft's electricity (Input.ElectricitySimVar), beyond the battery module's ride-through. The battery clock ran over
    // the disable and runs over the off time (3-53): powered on again with REAL acquisition (FAST would set the clock from
    // the truth, #468) and resumed, the start model finds its clock right, the fix posts no SYSTEM TIME UPDATED (B-4), and no
    // sky search follows. Frozen over the disable, the clock would be 15 minutes behind: no predicted satellite is acquired
    // with it (install manual 2-66), the sky search follows after 5 minutes, and its fix posts the message
    it('a power-off while disabled: the clock counts the disable, no SYSTEM TIME UPDATED at the fix, no sky search', async () => {
        const unit = await bootUnit({
            panelXml: panelXml({'Input.ElectricitySimVar': 'CIRCUIT ON:1'}),
            storage: {lastLatitude: 47, lastLongitude: 8, fastGpsAcquisition: false, lastAlmanacDownload: DEFAULT_START.getTime() - 24 * 3600 * 1000},
        });
        unit.env.sim.set('CIRCUIT ON:1', 'bool', true);
        const gps = unit.props.sensors.in.gps;
        expect(await secondsToFix(unit, 180)).toBeLessThan(180); // Precondition
        await vi.advanceTimersByTimeAsync(5000);
        const published = recordTimeUpdates(unit);
        const powered: boolean[] = [];
        unit.core.bus.getSubscriber<any>().on('powerEvent').handle((e: { isPowered: boolean }) => powered.push(e.isPowered));
        powered.length = 0; // The bus hands a new subscriber the last event

        unit.env.sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(15 * MINUTE);
        unit.env.sim.set('CIRCUIT ON:1', 'bool', false);
        await vi.advanceTimersByTimeAsync(MINUTE);
        unit.env.sim.set('CIRCUIT ON:1', 'bool', true);
        await vi.advanceTimersByTimeAsync(1000);
        expect(powered).toEqual([false, true]); // Precondition: off and on while disabled
        expect(Math.abs(gps.timeZulu.getTimestamp() - simUnix(unit))).toBeLessThan(5000);
        unit.env.sim.set('L:KLN90B_Disabled', 'bool', false);

        const modes = new Set<SearchMode>();
        let s = 0;
        for (; s < 10 * 60 && !gps.isValid(); s++) {
            await vi.advanceTimersByTimeAsync(1000);
            modes.add(gps.search.mode);
        }
        await vi.advanceTimersByTimeAsync(5000);

        expect(s).toBeLessThan(10 * 60);
        expect(modes.has(SearchMode.SkySearch)).toBe(false);
        expect(timeMessages(unit)).toEqual([]);
        expect(published).toEqual([]);
        expect(Math.abs(gps.timeZulu.getTimestamp() - simUnix(unit))).toBeLessThan(1500);
        expect(unit.errors).toEqual([]);
    }, 120_000);

    // Final review (2026-11-08): a second notice that the ticks stopped while they stand (TickController sends one at a
    // power change of a disabled unit) keeps the time they stopped at: no tick has counted the time since. Counted from the
    // second notice the clock would be 12 minutes behind, and the fix would post SYSTEM TIME UPDATED (B-4)
    it('a second stop of the standing ticks keeps the first stop time', async () => {
        const unit = await bootUnit();
        await settle(unit);
        const gps = unit.props.sensors.in.gps;

        unit.env.sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(12 * MINUTE);
        gps.onTicksStopped();
        await vi.advanceTimersByTimeAsync(5 * MINUTE);
        unit.env.sim.set('L:KLN90B_Disabled', 'bool', false);
        await vi.advanceTimersByTimeAsync(3000);

        expect(Math.abs(gps.timeZulu.getTimestamp() - simUnix(unit))).toBeLessThan(1500);
        expect(timeMessages(unit)).toEqual([]);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // The clock carried over the stopped ticks is the one a lost fix is judged by: frozen, it would be 15 minutes behind
    it('a fix lost in the first tick after a 15-minute disable keeps the search idle', async () => {
        const unit = await bootUnit();
        await settle(unit);
        const gps = unit.props.sensors.in.gps;

        unit.env.sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(15 * MINUTE);
        unit.props.failures.fail('gpsAntenna');
        unit.env.sim.set('L:KLN90B_Disabled', 'bool', false);
        for (let i = 0; i < 20 && gps.isValid(); i++) {
            await vi.advanceTimersByTimeAsync(250);
        }
        expect(gps.isValid()).toBe(false); // Precondition: lost on the first ticks after the resume
        await vi.advanceTimersByTimeAsync(3000);

        expect(gps.search.mode).toBe(SearchMode.Idle);
        expect(unit.errors).toEqual([]);
    }, 60_000);
});

// #465: the sky search after a lost fix searches every PRN again (GpsSearch, design "Recovery"). The SDK marks a satellite it
// searched in vain for its acquisition timeout as Unreachable, also one whose signal the receiver lost (#467), and leaves it
// out for an hour; KLNGPSSatComputer.forgetUnreachable clears the marks
describe('forgetUnreachable (#465)', () => {
    const TRACKED = new Set([GPSSatelliteState.Acquired, GPSSatelliteState.DataCollected, GPSSatelliteState.InUse, GPSSatelliteState.InUseDiffApplied]);
    /** Marks a satellite as the SDK's acquisition timeout does. The state is private SDK data */
    const markUnreachable = (sat: GPSSatellite) => {
        (sat as any).data.state = GPSSatelliteState.Unreachable;
        sat.state.set(GPSSatelliteState.Unreachable);
    };

    it('a satellite in a channel is searched there again and reacquired; one outside the channels is no longer Unreachable; a tracked one keeps its state', async () => {
        const unit = await bootUnit();
        await settle(unit);
        const computer = unit.props.sensors.in.gps.gpsSatComputer;
        await untilCalcTick(unit);
        const [inChannel, kept] = computer.getChannels().filter(s => s !== null) as GPSSatellite[];
        const outside = computer.getSatellites().find(s => !computer.getChannels().includes(s))!;
        const keptState = kept.state.get();
        expect(TRACKED.has(keptState)).toBe(true); // Precondition: a satellite the receiver tracks
        markUnreachable(inChannel);
        markUnreachable(outside);

        computer.forgetUnreachable();

        expect(inChannel.state.get()).toBe(GPSSatelliteState.None);
        expect(outside.state.get()).toBe(GPSSatelliteState.None);
        expect(kept.state.get()).toBe(keptState); // Only the Unreachable marks are forgotten
        let s = 0;
        for (; s < 60 && !TRACKED.has(inChannel.state.get()); s++) {
            await vi.advanceTimersByTimeAsync(1000);
        }
        expect(s).toBeLessThan(60);
        expect(computer.getChannels()).toContain(inChannel);
        expect(unit.errors).toEqual([]);
    }, 60_000);
});

// #465, final review (2026-11-08): the sky search after a lost fix keeps the receiver's belief, its almanac too, so that a
// satellite whose ephemeris the receiver never collected (one that rose meanwhile) is predicted from the almanac. The sky
// search of the start model (after a power-on) is blind and trusts no almanac (#62)
describe('the almanac in a sky search (#465)', () => {
    it('the SDK keeps its almanac in the sky search that keeps the belief, not in a blind one', async () => {
        const unit = await bootUnit();
        await settle(unit);
        const gps = unit.props.sensors.in.gps;
        expect(gps.gpsSatComputer.isAlmanacValid()).toBe(true); // Precondition: a current almanac, idle
        gps.search.mode = SearchMode.SkySearch;
        const keeps = vi.spyOn(gps.search, 'keepsBelief', 'get');

        keeps.mockReturnValue(true);
        expect(gps.gpsSatComputer.isAlmanacValid()).toBe(true);
        keeps.mockReturnValue(false);
        expect(gps.gpsSatComputer.isAlmanacValid()).toBe(false);
        // An expired almanac stays expired whatever the search
        keeps.mockReturnValue(true);
        expect(gps.gpsSatComputer.isAlmanacValid(gps.simTimeUnix + 400 * 24 * 3600 * 1000)).toBe(false);
        vi.restoreAllMocks();
        gps.search.end();
    }, 60_000);
});
