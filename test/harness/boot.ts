/// <reference types="node" />
import {onTestFinished, vi} from 'vitest';
import {BoundaryFacility, Facility} from '@microsoft/msfs-sdk';
import {KLN90BCore, PropsReadyEvent} from '../../kln90b/KLN90BCore';
import {KLN90BPlatform} from '../../kln90b/KLN90BPlatform';
import {PageProps} from '../../kln90b/pages/Page';
import {ErrorEvent} from '../../kln90b/controls/ErrorPage';
import {simEnv, SimEnvironment} from './sim/install';
import {DEFAULT_NAVDATA_RANGE, startFakeClock} from './sim/clock';
import {seedRandom} from './sim/random';
import {MemoryFacilityClient} from './navdata/MemoryFacilityClient';
import {FakePlatform, FakeRouteManager} from './platform';
import {FrontPanel} from './flight/FrontPanel';
import {Screen} from './render/screen';
import {resetSingletons} from './singletons';
import {pointFrom} from './flight/geo';
import {defaultNavdata} from './fixtures';

export const MINIMAL_PANEL_XML = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name></Instrument></PlaneHTMLConfig>';

export interface BootOptions {
    facilities?: Facility[];
    /**
     * Adds the default navdata (fixtures.ts, defaultNavdata): one airport, VOR, NDB and intersection far away, so that
     * no scan list but SUP is empty, as in a real unit. False boots with exactly the facilities given. Default true
     */
    defaultNavdata?: boolean;
    /** Airspaces the boundary search finds (navdata/airspaces.ts) */
    airspaces?: BoundaryFacility[];
    position?: { lat: number; lon: number };
    altitudeFt?: number;
    /** A PlaneHTMLConfig document; the parser defaults apply to everything it leaves out */
    panelXml?: string;
    /** User settings saved by an earlier session, by setting name (see storage.ts) */
    storage?: Record<string, unknown>;
    /** ENG COMBUSTION:1. True skips the welcome and self-test pages (KLN90BCore.isForceReadyToUse). Default true */
    engineRunning?: boolean;
    /**
     * The fake clock's start. The navdata cycle is DEFAULT_NAVDATA_RANGE (see sim/clock.ts): bootUnit sets the game var
     * FLIGHT NAVDATA DATE RANGE itself, and the SDK caches the cycle for the life of the test file
     * (FacilityLoader.databaseCycleCache), so a start outside that cycle boots with an expired database (DATA BASE OUT
     * OF DATE message, MSG lit). A unit test that needs another cycle clears that cache and sets the game var itself.
     */
    start?: Date;
    seed?: number;
    atcModel?: string;
    /**
     * An engine-running boot whose GPS has no fix yet: gps.reset() after propsReady. It acquires again on its own, fast
     * or slow per the fastGpsAcquisition setting. Replaces the hand-written reset in tests of the invalid-GPS state.
     */
    coldGps?: boolean;
    /** Magnetic variation in degrees east; a number for the whole world. Default 0 */
    magvar?: number | ((lat: number, lon: number) => number);
    /** Attaches a fake EFB route manager, exposed as HeadlessUnit.efb. Without it the unit has no EFB (the manager never resolves) */
    efb?: boolean;
    /** Overrides methods of FakePlatform, for example a facility client that fails, or a route manager that rejects */
    platform?: Partial<KLN90BPlatform>;
}

export interface HeadlessUnit {
    core: KLN90BCore;
    props: PageProps;
    env: SimEnvironment;
    navdata: MemoryFacilityClient;
    /** Errors published on the bus; the sim would show them on the error page */
    errors: Error[];
    send(evt: string): void;
    /** The ATC MODEL the unit booted with; it is part of the key its settings are saved under (see storedSetting) */
    atcModel: string;
    /** The front panel, driven through H events like an aircraft's hardware */
    panel: FrontPanel;
    /** Every console.error call since before the boot, boot included. The call is passed on to the real console.error */
    consoleErrors: unknown[][];
    /**
     * Unhandled promise rejections since before the boot. Each is also in errors. A test that provokes one takes it with
     * takeRejections(); a rejection left in the list fails the test when it ends (see prepareBoot).
     */
    rejections: unknown[];
    /** Returns the unhandled rejections collected so far and empties the list, which marks them as expected */
    takeRejections(): unknown[];
    /** Probes of what the unit shows and drives outside the 23x7 screen */
    display: {
        /** The instrument container's opacity, which the brightness and the power state drive; NaN while it is unset (the unit is fully visible then, not dark) */
        opacity(): number;
        /** Every write of L:KLN90B_POWER */
        powerWrites(): { name: string; value: unknown }[];
    };
    /** The fake EFB, when the unit booted with efb: true */
    efb?: FakeRouteManager;
}

/**
 * The unit of the running test, if any. completed decides how strictly teardown checks the singletons; the two functions
 * undo what the collectors installed, so that a boot that throws cannot leak them into the next test.
 */
interface LiveState {
    completed: boolean;
    restoreConsole: () => void;
    removeRejectionListener: () => void;
}

let live: LiveState | undefined;

/** Runs every step even if one throws, then rethrows the first error */
export function runAll(steps: (() => void)[]): void {
    let first: unknown = undefined;
    let failed = false;
    for (const step of steps) {
        try {
            step();
        } catch (e) {
            if (!failed) first = e;
            failed = true;
        }
    }
    if (failed) throw first;
}

/**
 * Ends the unit of the test that just finished: stops its clock, empties the sim fakes in place (setup files and simEnv()
 * keep their references), clears the singletons and the DOM. Every step runs even if one throws, so that a failed reset
 * never leaves the singletons dirty for the next test.
 *
 * Exported for the harness test of the teardown itself: `before` steps run first, so a test can inject a throwing step
 * and see that the real steps still run.
 */
export function teardown(before: (() => void)[] = []): void {
    const state = live;
    const env = simEnv();
    try {
        runAll([
            ...before,
            () => state?.restoreConsole(),
            () => state?.removeRejectionListener(),
            () => vi.clearAllTimers(),
            () => vi.useRealTimers(),
            () => env.sim.reset(),
            () => env.storage.reset(),
            () => env.coherent.reset(),
            () => {
                env.magvar = () => 0;
            },
            () => {
                env.xhr.requests.length = 0;
            },
            () => resetSingletons(state?.completed ?? false),
            () => {
                document.body.innerHTML = '';
            },
        ]);
    } finally {
        live = undefined;
    }
}

/** Everything a boot sets up before KLN90BCore.init runs; bootUnit and bootUnitExpectingError share it */
interface PreparedBoot {
    core: KLN90BCore;
    env: SimEnvironment;
    navdata: MemoryFacilityClient;
    errors: Error[];
    consoleErrors: unknown[][];
    rejections: unknown[];
    state: LiveState;
    model: string;
    efb?: FakeRouteManager;
}

/**
 * The part of a boot both entry points share: the live-unit guard, the teardown, the clock, the SimVars and the saved
 * settings, the DOM, the navdata, the collectors (console.error, unhandled rejections, error events) and the core,
 * which is built but not initialized.
 */
function prepareBoot(opts: BootOptions): PreparedBoot {
    if (live !== undefined) {
        throw new Error('bootUnit: one unit per test; this test already booted one (the singletons allow one live unit)');
    }
    try {
        onTestFinished(() => teardown());
    } catch (e) {
        throw new Error(`bootUnit: call it inside a test (it, not beforeAll or the module body); the unit is torn down when the test ends. ${e}`);
    }
    const state: LiveState = {completed: false, restoreConsole: () => undefined, removeRejectionListener: () => undefined};
    live = state;

    const env = simEnv();
    startFakeClock(opts.start);
    seedRandom(opts.seed ?? 1);

    const model = opts.atcModel ?? 'KLN TEST';
    const pos = opts.position ?? {lat: 47, lon: 8};
    const altitude = opts.altitudeFt ?? 0;
    const magvar = opts.magvar ?? 0;
    env.magvar = typeof magvar === 'function' ? magvar : () => magvar;
    env.sim.gameVars.set('FLIGHT NAVDATA DATE RANGE', DEFAULT_NAVDATA_RANGE);
    env.sim.set('ATC MODEL', 'string', model);
    env.sim.set('ENG COMBUSTION:1', 'bool', opts.engineRunning ?? true);
    env.sim.set('PLANE LATITUDE', 'degrees', pos.lat);
    env.sim.set('PLANE LONGITUDE', 'degrees', pos.lon);
    env.sim.set('PLANE ALTITUDE', 'feet', altitude);
    env.sim.set('PRESSURE ALTITUDE', 'feet', altitude);
    env.sim.set('GROUND VELOCITY', 'knots', 0);
    env.sim.set('GPS DRIVES NAV1', 'bool', true);
    // UserSettingSaveManager key format: persistent-setting.<save key>.<setting name>, with "<ATC MODEL>.profile_1"
    for (const [name, value] of Object.entries(opts.storage ?? {})) {
        env.storage.data.set(`persistent-setting.${model}.profile_1.${name}`, JSON.stringify(value));
    }

    document.body.innerHTML = '<div id="InstrumentsContainer"></div>';
    const defaults = (opts.defaultNavdata ?? true) ? defaultNavdata() : [];
    const clash = (opts.facilities ?? []).filter(f => defaults.some(d => d.icaoStruct.ident === f.icaoStruct.ident));
    if (clash.length > 0) {
        throw new Error(`bootUnit: ${clash.map(f => f.icaoStruct.ident).join(', ')} is an ident of the default navdata (fixtures.ts); rename it or pass defaultNavdata: false`);
    }
    const navdata = new MemoryFacilityClient([...opts.facilities ?? [], ...defaults], opts.airspaces ?? []);
    const missing = navdata.missingProcedureFixes();
    if (missing.length > 0) {
        throw new Error(`bootUnit: procedure fixes missing from the navdata: ${missing.join(', ')}`);
    }

    // The collectors are installed before init, so that an error while the unit starts up is counted too
    const errors: Error[] = [];
    const consoleErrors: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
        consoleErrors.push(args);
        originalError(...args);
    };
    state.restoreConsole = () => {
        console.error = originalError;
    };

    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => {
        rejections.push(reason);
        errors.push(reason instanceof Error ? reason : new Error(String(reason)));
    };
    // Vitest stops reporting unhandled rejections once a second listener exists, so this collector is the only check
    process.on('unhandledRejection', onRejection);
    state.removeRejectionListener = () => {
        process.off('unhandledRejection', onRejection);
    };

    const efb = opts.efb ? new FakeRouteManager() : undefined;
    const core: KLN90BCore = new KLN90BCore(new FakePlatform(navdata, efb, opts.platform), args => core.onInteractionEvent(args));
    core.bus.getSubscriber<ErrorEvent>().on('error').handle(e => errors.push(e));

    // Registered after the teardown. Vitest runs onTestFinished callbacks last registered first, so this check runs while
    // the unit is still up
    onTestFinished(async () => {
        // One real macrotask, so a rejection from the test's last input lands before the check
        await new Promise(resolve => setImmediate(resolve));
        state.removeRejectionListener();
        if (rejections.length > 0) {
            throw new Error(`unhandled rejection(s) during the test; take expected ones with unit.takeRejections():\n${rejections.map(String).join('\n')}`);
        }
    });
    return {core, env, navdata, errors, consoleErrors, rejections, state, model, efb};
}

/**
 * Boots the real instrument headless and returns once propsReady fired. One unit per test: the facility repository and
 * the settings managers are singletons. The unit is torn down when the test ends (teardown above).
 */
export async function bootUnit(opts: BootOptions = {}): Promise<HeadlessUnit> {
    const {core, env, navdata, errors, consoleErrors, rejections, state, model, efb} = prepareBoot(opts);
    let props: PageProps | undefined;
    core.bus.getSubscriber<PropsReadyEvent>().on('propsReady').handle(p => props = p);

    void core.init(new DOMParser().parseFromString(opts.panelXml ?? MINIMAL_PANEL_XML, 'text/xml'));
    for (let i = 0; i < 120 && props === undefined; i++) {
        await vi.advanceTimersByTimeAsync(250);
    }
    if (props === undefined) {
        throw new Error(`bootUnit: propsReady did not fire within 30 s. Errors: ${errors.map(String).join('; ')}`);
    }
    state.completed = true;
    if (opts.coldGps) props.sensors.in.gps.reset();
    return {
        core, props, env, navdata, errors, atcModel: model, send: evt => core.onInteractionEvent([evt]),
        panel: new FrontPanel(evt => core.onInteractionEvent([evt]), () => Screen.read()),
        consoleErrors, rejections, efb,
        takeRejections: () => rejections.splice(0, rejections.length),
        display: {
            opacity: () => parseFloat(document.getElementById('InstrumentsContainer')!.style.opacity), // NaN while unset: Number('') would read as 0, a dark unit
            powerWrites: () => env.sim.writes.filter(w => w.name === 'L:KLN90B_POWER'),
        },
    };
}

export interface FailedBoot {
    core: KLN90BCore;
    env: SimEnvironment;
    errors: Error[];
    /** As on HeadlessUnit. A failed unit keeps ticking, and its nearest searches reject, so a test that advances time takes them */
    consoleErrors: unknown[][];
    rejections: unknown[];
    takeRejections(): unknown[];
    /** The message on the visible error page, or null while it is hidden */
    errorPage(): string | null;
}

/**
 * Boots a unit whose start-up is expected to fail (#50): waits for the first error event instead of propsReady.
 * platform overrides methods of FakePlatform, for example a facility client whose nearest session rejects.
 *
 * The boot stays marked incomplete, so the teardown tolerates singletons that were never created.
 * @throws Error if the unit came up (propsReady fired), or if no error came within 30 s
 */
export async function bootUnitExpectingError(opts: BootOptions = {}): Promise<FailedBoot> {
    const {core, env, errors, consoleErrors, rejections} = prepareBoot(opts);
    let propsReady = false;
    core.bus.getSubscriber<PropsReadyEvent>().on('propsReady').handle(() => propsReady = true);

    void core.init(new DOMParser().parseFromString(opts.panelXml ?? MINIMAL_PANEL_XML, 'text/xml'));
    for (let i = 0; i < 120 && errors.length === 0 && !propsReady; i++) {
        await vi.advanceTimersByTimeAsync(250);
    }
    if (propsReady) {
        throw new Error('bootUnitExpectingError: propsReady fired');
    }
    if (errors.length === 0) {
        throw new Error('bootUnitExpectingError: no error event within 30 s');
    }
    return {
        core, env, errors, consoleErrors, rejections,
        takeRejections: () => rejections.splice(0, rejections.length),
        errorPage: () => {
            const page = document.querySelector('.errorpage');
            if (page === null || page.classList.contains('d-none')) return null;
            return page.querySelector('.errormessage')?.textContent ?? '';
        },
    };
}

/**
 * Advances the clock until the GPS has a solution, then two calculation ticks more, so that FPL 0 has activated and the
 * display shows it. A force-ready boot is valid at once; FPL 0 activates at the first calculation tick after that.
 */
export async function settle(unit: HeadlessUnit, capSeconds = 120): Promise<void> {
    for (let i = 0; !unit.props.sensors.in.gps.isValid(); i++) {
        if (i >= capSeconds) throw new Error(`settle: no GPS solution within ${capSeconds} s`);
        await vi.advanceTimersByTimeAsync(1000);
    }
    await vi.advanceTimersByTimeAsync(2000);
}

/**
 * Moves the aircraft of a render test so that the GPS computes a track (Gps.ts takes it from the last two positions
 * when the ground speed is at least 2 kt, 3-35). Without trackTrue the track is that of the jump from the present
 * position; with it, the aircraft first jumps to a point 0.05 NM behind the target on that track. Each jump is followed
 * by exactly one calculation tick. Afterwards the position holds, which is a paused sim: the unit keeps the track.
 * The order of the two ticks relative to the display tick does not matter, because only the calculation reads the
 * position.
 */
export async function moveAircraft(unit: HeadlessUnit, to: { lat: number; lon: number },
                                   o: { groundspeedKt: number; trackTrue?: number }): Promise<void> {
    const sim = unit.env.sim;
    sim.set('GROUND VELOCITY', 'knots', o.groundspeedKt);
    if (o.trackTrue !== undefined) {
        const from = pointFrom(to, (o.trackTrue + 180) % 360, 0.05);
        sim.set('PLANE LATITUDE', 'degrees', from.lat);
        sim.set('PLANE LONGITUDE', 'degrees', from.lon);
        await vi.advanceTimersByTimeAsync(1000);
    }
    sim.set('PLANE LATITUDE', 'degrees', to.lat);
    sim.set('PLANE LONGITUDE', 'degrees', to.lon);
    await vi.advanceTimersByTimeAsync(1000);
}
