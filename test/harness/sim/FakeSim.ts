import {convertUnit, normalizeUnit} from './units';

export interface SimVarWrite {
    time: number;
    name: string;
    unit: string;
    value: number | string;
}

export interface KeyEventWrite {
    time: number;
    name: string;
    value: number;
}

interface Stored {
    unit: string;
    value: number | string;
}

interface Registration {
    name: string;
    key: string;
    unit: string;
}

/** The key events that set a course SimVar when FakeSim.applyObsKeyEvents is on */
const OBS_KEY_EVENTS: Record<string, string> = {'K:VOR1_SET': 'NAV OBS:1', 'K:VOR2_SET': 'NAV OBS:2'};

/** Seconds from 0001-01-01 to 1970-01-01: E:ABSOLUTE TIME counts from year 1. */
const ABSOLUTE_TIME_OFFSET_S = 62135596800;

export function simVarKey(name: string): string {
    return name.trim().toUpperCase();
}

/**
 * The sim's native SimVar layer. The SDK replaces SimVar.GetSimVarValue/SetSimVarValue at import time with versions
 * built on SimVar.GetRegisteredId, simvar.getValueReg(_String) and Coherent.call('setValueReg_*'), so this is the layer
 * to fake. Writes by the instrument are logged; values set by the test or the aircraft model are not.
 */
export class FakeSim {
    public readonly writes: SimVarWrite[] = [];
    public readonly keyEvents: KeyEventWrite[] = [];
    /** Reads of variables nobody set (they return 0 or ""). Useful when wiring a new input. */
    public readonly unsetReads = new Set<string>();
    /** Conversion failures. The SDK catches exceptions in GetSimVarValue, so they are collected here for monitors. */
    public readonly errors: string[] = [];
    public readonly gameVars = new Map<string, string | number>();
    /**
     * Off by default: key events only go to keyEvents. On, K:VOR1_SET and K:VOR2_SET set Nav OBS:1 and Nav OBS:2 to
     * their value in degrees, as the sim does, for a test of an indicator the unit drives (ObsTarget). reset() turns it
     * off again.
     */
    public applyObsKeyEvents = false;
    private readonly values = new Map<string, Stored>();
    private readonly registrations: Registration[] = [];
    private readonly registrationIds = new Map<string, number>();
    private simStartMs = 0;

    /** Back to an empty sim for the next unit. Keeps the registration ids, because SDK objects cache them. */
    public reset(): void {
        this.writes.length = 0;
        this.keyEvents.length = 0;
        this.unsetReads.clear();
        this.errors.length = 0;
        this.gameVars.clear();
        this.values.clear();
        this.simStartMs = 0;
        this.applyObsKeyEvents = false;
    }

    /** Sets a value as the sim or the aircraft model would. */
    public set(name: string, unit: string, value: number | boolean | string): void {
        this.values.set(simVarKey(name), {unit, value: typeof value === 'boolean' ? (value ? 1 : 0) : value});
    }

    /** Reads a value in the given unit, converting from the unit it was written in. */
    public get(name: string, unit: string): any {
        const key = simVarKey(name);
        const derived = this.derived(key, unit);
        if (derived !== undefined) {
            return derived;
        }
        const stored = this.values.get(key);
        if (stored === undefined) {
            this.unsetReads.add(key);
            return normalizeUnit(unit) === 'string' ? '' : 0;
        }
        if (typeof stored.value === 'string') {
            return stored.value;
        }
        try {
            return convertUnit(stored.value, stored.unit, unit);
        } catch (e) {
            this.errors.push(`${key}: ${(e as Error).message}`);
            throw e;
        }
    }

    public has(name: string): boolean {
        return this.values.has(simVarKey(name));
    }

    public lastWrite(name: string): SimVarWrite | undefined {
        const key = simVarKey(name);
        for (let i = this.writes.length - 1; i >= 0; i--) {
            if (this.writes[i].name === key) {
                return this.writes[i];
            }
        }
        return undefined;
    }

    /** Marks the start of the simulation for E:SIMULATION TIME. */
    public startClock(): void {
        this.simStartMs = Date.now();
    }

    /** Called by FakeCoherent for Coherent.call('setValueReg_Number' | '_Bool' | '_String', id, value). */
    public writeReg(id: number, value: number | boolean | string): void {
        const reg = this.registrations[id];
        const v = typeof value === 'boolean' ? (value ? 1 : 0) : value;
        const time = Date.now();
        if (reg.key.startsWith('K:')) {
            this.keyEvents.push({time, name: reg.key, value: Number(v)});
            const obs = OBS_KEY_EVENTS[reg.key];
            if (this.applyObsKeyEvents && obs !== undefined) {
                this.set(obs, 'degrees', Number(v));
            }
            return;
        }
        this.values.set(reg.key, {unit: reg.unit, value: v});
        this.writes.push({time, name: reg.key, unit: reg.unit, value: v});
    }

    /** Adds the native layer to the global SimVar object (created by staticGlobals) and defines simvar. */
    public install(g: any): void {
        Object.assign(g.SimVar, {
            GetRegisteredId: (name: string, unit: string) => this.register(name, unit),
            GetSimVarValueFastReg: (id: number) => this.readReg(id),
            GetSimVarValueFastRegString: (id: number) => String(this.readReg(id)),
            GetGameVarValue: (name: string) => this.gameVars.get(simVarKey(name)) ?? 0,
        });
        g.simvar = {
            getValueReg: (id: number) => this.readReg(id),
            getValueReg_String: (id: number) => String(this.readReg(id)),
        };
    }

    private register(name: string, unit: string): number {
        const cacheKey = `${simVarKey(name)}|${unit}`;
        let id = this.registrationIds.get(cacheKey);
        if (id === undefined) {
            id = this.registrations.length;
            this.registrations.push({name, key: simVarKey(name), unit});
            this.registrationIds.set(cacheKey, id);
        }
        return id;
    }

    private readReg(id: number): any {
        const reg = this.registrations[id];
        return this.get(reg.name, reg.unit);
    }

    private derived(key: string, unit: string): number | undefined {
        if (key === 'E:ABSOLUTE TIME') {
            return convertUnit(Date.now() / 1000 + ABSOLUTE_TIME_OFFSET_S, 'seconds', unit);
        }
        if (key === 'E:SIMULATION TIME') {
            return convertUnit((Date.now() - this.simStartMs) / 1000, 'seconds', unit);
        }
        return undefined;
    }
}
