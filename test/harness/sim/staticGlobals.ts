/**
 * MSFS globals that the SDK and the instrument use as ambient values. They are static: nothing here talks to the sim.
 * The stateful fakes (SimVars, Coherent, storage, XHR) are installed on top by install.ts.
 */
export function installStaticGlobals(g: any): void {
    // The SDK assigns SimVar.GetSimVarValue/SetSimVarValue onto this object at import time; FakeSim adds the native
    // layer to the same object. Never replace it after the SDK has loaded.
    g.SimVar ??= {};
    g.__registeredInstruments = new Map<string, unknown>();
    g.registerInstrument = (name: string, cls: unknown) => g.__registeredInstruments.set(name, cls);
    g.BaseInstrument = class {
        public xmlConfig: Document | undefined;

        Init(): void {
        }

        connectedCallback(): void {
        }

        onInteractionEvent(_args: string[]): void {
        }

        onSoundEnd(_id: unknown): void {
        }
    };
    g.RunwayDesignator = {
        RUNWAY_DESIGNATOR_NONE: 0, RUNWAY_DESIGNATOR_LEFT: 1, RUNWAY_DESIGNATOR_RIGHT: 2, RUNWAY_DESIGNATOR_CENTER: 3,
        RUNWAY_DESIGNATOR_WATER: 4, RUNWAY_DESIGNATOR_A: 5, RUNWAY_DESIGNATOR_B: 6,
    };
    g.ApproachType = {
        APPROACH_TYPE_UNKNOWN: 0, APPROACH_TYPE_GPS: 1, APPROACH_TYPE_VOR: 2, APPROACH_TYPE_NDB: 3, APPROACH_TYPE_ILS: 4,
        APPROACH_TYPE_LOCALIZER: 5, APPROACH_TYPE_SDF: 6, APPROACH_TYPE_LDA: 7, APPROACH_TYPE_VORDME: 8,
        APPROACH_TYPE_NDBDME: 9, APPROACH_TYPE_RNAV: 10, APPROACH_TYPE_LOCALIZER_BACK_COURSE: 11,
    };
    g.Avionics = {Utils: {DEG2RAD: Math.PI / 180, RAD2DEG: 180 / Math.PI}};
    g.Utils = {
        Clamp: (n: number, min: number, max: number) => Math.min(max, Math.max(min, n)),
        // The sim translates localization keys; plain database text comes back unchanged.
        Translate: (key: string) => key,
    };
    g.KeyCode = {
        KEY_BACK_SPACE: 8, KEY_ENTER: 13, KEY_ESCAPE: 27, KEY_PAGE_UP: 33, KEY_PAGE_DOWN: 34, KEY_END: 35, KEY_HOME: 36,
        KEY_DELETE: 46, KEY_0: 48, KEY_9: 57, KEY_A: 65, KEY_Z: 90, KEY_NUMPAD0: 96, KEY_NUMPAD9: 105,
    };
    g.GameState = {mainmenu: 0, loading: 1, briefing: 2, ingame: 3};
    g.LatLongAlt = class {
        constructor(public lat = 0, public long = 0, public alt = 0) {
        }
    };
    // The EventBus sync waits for this listener; ours never becomes ready, so the bus stays local to this instrument.
    g.RegisterGenericDataListener = () => ({send: () => undefined, onDataReceived: () => undefined});
    g.requestAnimationFrame ??= (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 16);
    g.cancelAnimationFrame ??= (id: ReturnType<typeof setTimeout>) => clearTimeout(id);
}
