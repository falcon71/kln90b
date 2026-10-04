import {onTestFinished, vi} from 'vitest';
import {Facility} from '@microsoft/msfs-sdk';
import {KLN90BCore, PropsReadyEvent} from '../../kln90b/KLN90BCore';
import {PageProps} from '../../kln90b/pages/Page';
import {ErrorEvent} from '../../kln90b/controls/ErrorPage';
import {simEnv, SimEnvironment} from './sim/install';
import {DEFAULT_NAVDATA_RANGE, startFakeClock} from './sim/clock';
import {seedRandom} from './sim/random';
import {MemoryFacilityClient} from './navdata/MemoryFacilityClient';
import {FakePlatform} from './platform';
import {FrontPanel} from './flight/FrontPanel';
import {Screen} from './render/screen';
import {resetSingletons} from './singletons';

export const MINIMAL_PANEL_XML = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name></Instrument></PlaneHTMLConfig>';

export interface BootOptions {
    facilities?: Facility[];
    position?: { lat: number; lon: number };
    altitudeFt?: number;
    /** A PlaneHTMLConfig document; the parser defaults apply to everything it leaves out */
    panelXml?: string;
    /** User settings saved by an earlier session, by setting name (see storage.ts) */
    storage?: Record<string, unknown>;
    /** ENG COMBUSTION:1. True skips the welcome and self-test pages (KLN90BCore.isForceReadyToUse). Default true */
    engineRunning?: boolean;
    /**
     * The fake clock's start. The navdata cycle is fixed to DEFAULT_NAVDATA_RANGE (see sim/clock.ts), so a start outside
     * that cycle boots with an expired database (DATA BASE OUT OF DATE message, MSG lit) unless the caller also sets
     * the FLIGHT NAVDATA DATE RANGE game var.
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
}

/** The unit of the running test, if any: its boot state decides how strictly teardown checks the singletons */
let live: { completed: boolean } | undefined;

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

/**
 * Boots the real instrument headless and returns once propsReady fired. One unit per test: the facility repository and
 * the settings managers are singletons. The unit is torn down when the test ends (teardown above).
 */
export async function bootUnit(opts: BootOptions = {}): Promise<HeadlessUnit> {
    if (live !== undefined) {
        throw new Error('bootUnit: one unit per test; this test already booted one (the singletons allow one live unit)');
    }
    try {
        onTestFinished(() => teardown());
    } catch (e) {
        throw new Error(`bootUnit: call it inside a test (it, not beforeAll or the module body); the unit is torn down when the test ends. ${e}`);
    }
    const state = {completed: false};
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
    const navdata = new MemoryFacilityClient(opts.facilities ?? []);
    const missing = navdata.missingProcedureFixes();
    if (missing.length > 0) {
        throw new Error(`bootUnit: procedure fixes missing from the navdata: ${missing.join(', ')}`);
    }
    const core: KLN90BCore = new KLN90BCore(new FakePlatform(navdata), args => core.onInteractionEvent(args));
    const errors: Error[] = [];
    core.bus.getSubscriber<ErrorEvent>().on('error').handle(e => errors.push(e));
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
