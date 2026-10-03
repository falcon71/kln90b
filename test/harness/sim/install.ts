import {installStaticGlobals} from './staticGlobals';

/** Installs the sim fakes into the globals. Runs once per test file from the Vitest setup files. */
export function installSimFakes(): void {
    installStaticGlobals(globalThis);
}
