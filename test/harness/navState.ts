import {NavPageState} from '../../kln90b/data/VolatileMemory';

/**
 * Holds a NavPageState field at a value: the writes of the calculation ticks (and of anything else) are ignored, so a
 * page shows a value that the world of the test does not produce, such as an exact 0. The hold replaces the field with
 * an accessor on that object and lasts until the unit is torn down.
 */
export function hold<K extends keyof NavPageState>(state: NavPageState, key: K, value: NavPageState[K]): void {
    Object.defineProperty(state, key, {get: () => value, set: () => undefined, configurable: true});
}
