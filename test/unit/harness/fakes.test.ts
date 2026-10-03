import {afterEach, describe, expect, it, vi} from 'vitest';
import {DataStore, SimVarValueType} from '@microsoft/msfs-sdk';
import {simEnv} from '../../harness/sim/install';

const {sim, storage} = simEnv();

afterEach(() => {
    vi.useRealTimers();
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
        expect(sim.errors).toEqual(['SOME DISTANCE: FakeSim: cannot convert from "feet" to "degrees"']);
    });

    it('logs key events separately from values', () => {
        SimVar.SetSimVarValue('K:GPS_OBS_ON', SimVarValueType.Number, 0);
        expect(sim.keyEvents.map(k => k.name)).toEqual(['K:GPS_OBS_ON']);
        expect(sim.has('K:GPS_OBS_ON')).toBe(false);
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
    it('serves coui:// files from resources/', async () => {
        const req = new XMLHttpRequest();
        const done = new Promise<void>(resolve => req.onreadystatechange = () => resolve());
        req.open('GET', 'coui://html_ui/Pages/VCockpit/Instruments/NavSystems/GPS/KLN90B/Assets/msa.json');
        req.send();
        await done;
        expect(req.status).toBe(200);
        expect(Array.isArray(JSON.parse(req.responseText))).toBe(true);
    });
});
