import {vi} from 'vitest';
import {Facility} from '@microsoft/msfs-sdk';
import {KLN90BCore, PropsReadyEvent} from '../../kln90b/KLN90BCore';
import {PageProps} from '../../kln90b/pages/Page';
import {ErrorEvent} from '../../kln90b/controls/ErrorPage';
import {simEnv, SimEnvironment} from './sim/install';
import {DEFAULT_NAVDATA_RANGE, startFakeClock} from './sim/clock';
import {seedRandom} from './sim/random';
import {MemoryFacilityClient} from './navdata/MemoryFacilityClient';
import {FakePlatform} from './platform';

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
}

let booted = false;

/**
 * Boots the real instrument headless and returns once propsReady fired. One unit per test file: the facility
 * repository and the settings managers are singletons.
 */
export async function bootUnit(opts: BootOptions = {}): Promise<HeadlessUnit> {
    if (booted) {
        throw new Error('bootUnit: one unit per test file (KLNFacilityRepository and the settings managers are singletons)');
    }
    booted = true;

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
    return {core, props, env, navdata, errors, send: evt => core.onInteractionEvent([evt])};
}
