import {describe, expect, it} from 'vitest';
import {EventBus} from '@microsoft/msfs-sdk';
import {Timers} from '../../../kln90b/services/Timers';
import {FLT_TIMER_GS30, FLT_TIMER_POWER, KLN90BUserSettings} from '../../../kln90b/settings/KLN90BUserSettings';
import {TimeStamp} from '../../../kln90b/data/Time';
import {DtPageState} from '../../../kln90b/data/VolatileMemory';
import {simEnv} from '../../harness/sim/install';

// The settings manager is a singleton bound to the first bus (testing.md, Unit), so one bus serves the file.
const bus = new EventBus();
const settings = new KLN90BUserSettings(bus);

const at = (h: number, m: number, s: number) => TimeStamp.create(Date.UTC(2026, 5, 1, h, m, s));

/** The parts of Sensors the timers read: the GPS ground speed and time. Timers tick once per second (TICK_TIME_CALC). */
function setup(mode: boolean, totalTime = 0) {
    simEnv().storage.data.clear();
    settings.getSetting('flightTimer').set(mode);
    settings.getSetting('totalTime').set(totalTime);
    const gps = {groundspeed: 0, timeZulu: at(15, 2, 0)};
    const state: DtPageState = {flightTimer: 0, departureTime: null} as DtPageState;
    const timers = new Timers({in: {gps}} as any, settings, state);
    return {gps, state, timers};
}

describe('flight timer and departure time with RUN WHEN GS > 30KT', () => {
    // 4-13: FLT is the time spent above 30 kt, and DEP the time the ground speed first reached 30 kt
    it('does not count the seconds below 30 kt and leaves DEP empty', () => {
        const {gps, state, timers} = setup(FLT_TIMER_GS30);
        gps.groundspeed = 29;
        timers.tick();
        timers.tick();
        expect(state.flightTimer).toBe(0);
        expect(state.departureTime).toBeNull();
    });

    // 4-13: FLT is the time spent above 30 kt, and DEP the time the ground speed first reached 30 kt
    it('counts the seconds above 30 kt and takes DEP at the first of them', () => {
        const {gps, state, timers} = setup(FLT_TIMER_GS30);
        gps.groundspeed = 31;
        for (const second of [0, 1, 2]) {
            gps.timeZulu = at(15, 3, second); // the GPS hands out a new time object each second
            timers.tick();
        }
        expect(state.flightTimer).toBe(3);
        expect(state.departureTime!.getTimestamp()).toBe(Date.UTC(2026, 5, 1, 15, 3, 0));
    });

    it('keeps FLT and DEP when the ground speed falls below 30 kt again', () => {
        // 4-13: an intermediate stop below 30 kt does not count
        const {gps, state, timers} = setup(FLT_TIMER_GS30);
        gps.groundspeed = 31;
        gps.timeZulu = at(15, 3, 0);
        timers.tick();
        gps.timeZulu = at(15, 3, 1);
        timers.tick();
        gps.groundspeed = 10;
        gps.timeZulu = at(16, 0, 0);
        timers.tick();
        expect(state.flightTimer).toBe(2);
        expect(state.departureTime!.getTimestamp()).toBe(Date.UTC(2026, 5, 1, 15, 3, 0));
    });
});

describe('flight timer at exactly 30 kt (characterization of the boundary)', () => {
    it('counts exactly 30 kt as reached', () => {
        const {gps, state, timers} = setup(FLT_TIMER_GS30);
        gps.groundspeed = 30;
        timers.tick();
        expect(state.flightTimer).toBe(1);
    });
});

describe('flight timer and departure time with RUN WHEN POWER IS ON', () => {
    // 4-13: FLT is the time since power on, DEP the time power was applied
    it('counts from the first tick and takes DEP at once', () => {
        const {gps, state, timers} = setup(FLT_TIMER_POWER);
        timers.tick();
        gps.timeZulu = at(15, 2, 1); // the GPS hands out a new time object each second
        timers.tick();
        expect(state.flightTimer).toBe(2);
        expect(state.departureTime!.getTimestamp()).toBe(Date.UTC(2026, 5, 1, 15, 2, 0));
    });

    // 4-13: DEP is the time power was applied. The GPS advances its time in place (TimeStamp.setTimestamp) while it
    // has no fix and in take-home mode (Gps.ts), and Timers keeps a reference to that object, so DEP runs with the
    // clock until the GPS replaces the object at the first fix.
    it.fails('keeps DEP when the GPS advances its time in place (#NEW-2-1)', () => {
        const {gps, state, timers} = setup(FLT_TIMER_POWER);
        timers.tick();
        gps.timeZulu.setTimestamp(gps.timeZulu.getTimestamp() + 60_000);
        timers.tick();
        expect(state.departureTime!.getTimestamp()).toBe(Date.UTC(2026, 5, 1, 15, 2, 0));
    });
});

describe('total time (STA 4)', () => {
    it('adds one second per tick and saves it every 60 s (characterization)', () => {
        const {timers} = setup(FLT_TIMER_GS30, 3600);
        for (let i = 0; i < 59; i++) {
            timers.tick();
        }
        expect(settings.getSetting('totalTime').get()).toBe(3600);
        timers.tick();
        expect(settings.getSetting('totalTime').get()).toBe(3660);
        for (let i = 0; i < 59; i++) {
            timers.tick();
        }
        expect(settings.getSetting('totalTime').get()).toBe(3660);
        timers.tick();
        expect(settings.getSetting('totalTime').get()).toBe(3720);
    });
});
