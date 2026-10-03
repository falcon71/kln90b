import {installStaticGlobals} from './staticGlobals';
import {FakeSim} from './FakeSim';
import {FakeCoherent} from './FakeCoherent';
import {FakeStorage} from './FakeStorage';
import {FakeXhr} from './FakeXhr';

export interface SimEnvironment {
    sim: FakeSim;
    coherent: FakeCoherent;
    storage: FakeStorage;
    xhr: FakeXhr;
    /** Answers Facilities.getMagVar (degrees, east positive). Boots replace it with the world's magvar. */
    magvar: (lat: number, lon: number) => number;
}

let current: SimEnvironment | undefined;

/** Installs the sim fakes into the globals. Runs once per test file from the Vitest setup files. */
export function installSimFakes(): SimEnvironment {
    const g = globalThis as any;
    installStaticGlobals(g);
    const sim = new FakeSim();
    sim.install(g);
    const coherent = new FakeCoherent(sim);
    coherent.install(g);
    const storage = new FakeStorage();
    storage.install(g);
    const xhr = new FakeXhr();
    xhr.install(g);
    const env: SimEnvironment = {sim, coherent, storage, xhr, magvar: () => 0};
    g.Facilities = {getMagVar: (lat: number, lon: number) => env.magvar(lat, lon)};
    current = env;
    return env;
}

export function simEnv(): SimEnvironment {
    if (current === undefined) {
        throw new Error('installSimFakes() has not run; check setupFiles in vitest.config.mts');
    }
    return current;
}
