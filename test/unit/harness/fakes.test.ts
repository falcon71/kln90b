import {afterEach, describe, expect, it, vi} from 'vitest';
import {DataStore, SimVarValueType} from '@microsoft/msfs-sdk';
import {simEnv} from '../../harness/sim/install';
import {FakeSim} from '../../harness/sim/FakeSim';
import {DEFAULT_START, startFakeClock} from '../../harness/sim/clock';
import {seedRandom} from '../../harness/sim/random';

const {sim, storage, xhr} = simEnv();

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('FakeSim through the SDK SimVar functions', () => {
    it('converts a value the instrument writes in radians when read in degrees', () => {
        SimVar.SetSimVarValue('GPS WP DESIRED TRACK', SimVarValueType.Radians, Math.PI / 2);
        expect(sim.get('GPS WP DESIRED TRACK', 'degrees')).toBeCloseTo(90, 9);
        expect(sim.lastWrite('GPS WP DESIRED TRACK')).toMatchObject({unit: SimVarValueType.Radians});
    });

    it('lets the instrument read aircraft values in its own unit', () => {
        sim.set('PLANE ALTITUDE', 'feet', 1000);
        expect(SimVar.GetSimVarValue('PLANE ALTITUDE', SimVarValueType.Meters)).toBeCloseTo(304.8, 9);
    });

    it('reads strings and booleans', () => {
        sim.set('ATC MODEL', 'string', 'TEST');
        sim.set('GPS DRIVES NAV1', 'bool', true);
        expect(SimVar.GetSimVarValue('ATC MODEL', SimVarValueType.String)).toBe('TEST');
        // The sim answers booleans as 0/1; Number() keeps the test independent of whether the SDK coerces them
        expect(Number(SimVar.GetSimVarValue('GPS DRIVES NAV1', SimVarValueType.Bool))).toBe(1);
    });

    it('records an impossible conversion', () => {
        sim.set('SOME DISTANCE', 'feet', 1);
        SimVar.GetSimVarValue('SOME DISTANCE', SimVarValueType.Degree);
        expect(sim.errors).toContain('SOME DISTANCE: FakeSim: cannot convert from "feet" to "degrees"');
    });

    it('logs key events separately from values', () => {
        SimVar.SetSimVarValue('K:GPS_OBS_ON', SimVarValueType.Number, 0);
        expect(sim.keyEvents.map(k => k.name)).toEqual(['K:GPS_OBS_ON']);
        expect(sim.has('K:GPS_OBS_ON')).toBe(false);
    });

    it('carries the value of a key event', () => {
        SimVar.SetSimVarValue('K:VOR1_SET', SimVarValueType.Number, 123);
        const last = sim.keyEvents[sim.keyEvents.length - 1];
        expect(last.name).toBe('K:VOR1_SET');
        expect(last.value).toBe(123);
        expect(sim.has('K:VOR1_SET')).toBe(false);
    });

    it('registers a variable once per unit, so alternating units each convert correctly', () => {
        sim.set('X DIST', 'feet', 1000);
        expect(SimVar.GetSimVarValue('X DIST', SimVarValueType.Feet)).toBe(1000);
        expect(SimVar.GetSimVarValue('X DIST', SimVarValueType.Meters)).toBeCloseTo(304.8, 9);
        expect(SimVar.GetSimVarValue('X DIST', SimVarValueType.Feet)).toBe(1000);
        const feet = SimVar.GetRegisteredId('X DIST', 'feet', '');
        expect(SimVar.GetRegisteredId('X DIST', 'feet', '')).toBe(feet);
        expect(SimVar.GetRegisteredId('X DIST', 'meters', '')).not.toBe(feet);
    });

    it('writes booleans through the bool channel as 1', () => {
        SimVar.SetSimVarValue('L:TEST_FLAG', SimVarValueType.Bool, true);
        expect(sim.get('L:TEST_FLAG', 'bool')).toBe(1);
        expect(sim.lastWrite('L:TEST_FLAG')).toMatchObject({value: 1});
    });

    it('derives E:SIMULATION TIME from startClock', () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
        sim.startClock();
        vi.setSystemTime(new Date('2026-06-01T12:01:30Z'));
        expect(SimVar.GetSimVarValue('E:SIMULATION TIME', SimVarValueType.Seconds)).toBe(90);
    });

    it('resets to an empty sim but keeps the registration ids, because SDK objects cache them', () => {
        const fresh = new FakeSim();
        const g: any = {SimVar: {}};
        fresh.install(g);
        const keyId = g.SimVar.GetRegisteredId('K:RESET_TEST', 'number');
        const valueId = g.SimVar.GetRegisteredId('L:RESET_TEST', 'number');
        fresh.writeReg(keyId, 1);
        fresh.writeReg(valueId, 2);
        fresh.get('L:RESET_UNSET', 'number');
        fresh.set('PLANE ALTITUDE', 'feet', 1000);
        fresh.gameVars.set('SOME GAME VAR', 1);
        fresh.errors.push('stale error');
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
        fresh.startClock();

        fresh.reset();

        expect(fresh.writes).toEqual([]);
        expect(fresh.keyEvents).toEqual([]);
        expect([...fresh.unsetReads]).toEqual([]);
        expect(fresh.errors).toEqual([]);
        expect([...fresh.gameVars.keys()]).toEqual([]);
        expect(fresh.has('PLANE ALTITUDE')).toBe(false);
        expect(fresh.has('L:RESET_TEST')).toBe(false);
        // The simulation time counts from the epoch again until the next startClock
        expect(fresh.get('E:SIMULATION TIME', 'seconds')).toBe(Date.parse('2026-06-01T12:00:00Z') / 1000);

        // An SDK object holds the old ids and never registers again. A new name must not take one of them, and the old
        // ids must still reach their variables. Re-registering the old names would pass even after a full wipe,
        // because ids are list positions.
        const other = g.SimVar.GetRegisteredId('L:RESET_OTHER', 'number');
        expect([keyId, valueId]).not.toContain(other);
        fresh.writeReg(valueId, 3);
        expect(fresh.get('L:RESET_TEST', 'number')).toBe(3);
        expect(fresh.lastWrite('L:RESET_TEST')).toMatchObject({name: 'L:RESET_TEST', value: 3});
        fresh.writeReg(keyId, 4);
        expect(fresh.keyEvents.map(k => [k.name, k.value])).toEqual([['K:RESET_TEST', 4]]);
    });

    it('derives E:ABSOLUTE TIME from the clock', () => {
        vi.useFakeTimers({toFake: ['Date']});
        vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
        // 2026-06-01T12:00:00Z is 1780315200 s after 1970; E:ABSOLUTE TIME adds the 62135596800 s from year 1
        expect(SimVar.GetSimVarValue('E:ABSOLUTE TIME', SimVarValueType.Seconds)).toBe(1780315200 + 62135596800);
    });
});

describe('FakeStorage', () => {
    it('returns "" for a missing key so settings keep their defaults', () => {
        expect(GetStoredData('missing')).toBe('');
        expect(DataStore.get('missing')).toBeUndefined();
    });

    it('stores what DataStore writes', () => {
        DataStore.set('k', 42);
        expect(storage.data.get('k')).toBe('42');
        expect(DataStore.get('k')).toBe(42);
    });
});

describe('FakeXhr', () => {
    it('serves coui:// files from resources/, asynchronously, with readyState 4', async () => {
        const url = 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/GPS/KLN90B/Assets/msa.json';
        const req = new XMLHttpRequest();
        let fired = false;
        let stateInCallback = -1;
        const done = new Promise<void>(resolve => req.onreadystatechange = () => {
            fired = true;
            stateInCallback = req.readyState;
            resolve();
        });
        req.open('GET', url);
        req.send();
        expect(fired).toBe(false);
        await done;
        expect(stateInCallback).toBe(4);
        expect(req.status).toBe(200);
        expect(Array.isArray(JSON.parse(req.responseText))).toBe(true);
        expect(xhr.requests).toContain(url);
    });

    it('answers 404 for a missing file', async () => {
        const req = new XMLHttpRequest();
        const done = new Promise<void>(resolve => req.onreadystatechange = () => resolve());
        req.open('GET', 'coui://html_ui/does-not-exist.json');
        req.send();
        await done;
        expect(req.status).toBe(404);
        expect(req.readyState).toBe(4);
    });
});

describe('clock and random helpers', () => {
    it('startFakeClock sets Date.now to the default start', () => {
        startFakeClock();
        expect(Date.now()).toBe(DEFAULT_START.getTime());
    });

    it('seedRandom repeats for the same seed and differs between seeds', () => {
        const draw = (seed: number) => {
            seedRandom(seed);
            const values = [Math.random(), Math.random(), Math.random()];
            vi.restoreAllMocks();
            return values;
        };
        const a = draw(42);
        expect(draw(42)).toEqual(a);
        expect(draw(43)[0]).not.toBe(a[0]);
    });
});
