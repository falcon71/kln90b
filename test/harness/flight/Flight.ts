import {expect, onTestFailed, onTestFinished, vi} from 'vitest';
import {NavMode} from '../../../kln90b/data/VolatileMemory';
import {bootUnit, BootOptions, HeadlessUnit} from '../boot';
import {Screen} from '../render/screen';
import {Aircraft, AircraftInit, AircraftOptions} from './Aircraft';
import {coupledAutopilot, Pilot} from './pilots';
import {World} from './World';
import {distanceNm} from './geo';
import {FlightRecorder} from './Recorder';
import {FrontPanel} from './FrontPanel';

export type JumpTarget = { kind: 'nmBefore'; ident: string; nm: number } | { kind: 'minutes'; minutes: number };
export const nmBefore = (ident: string, nm: number): JumpTarget => ({kind: 'nmBefore', ident, nm});
export const minutes = (m: number): JumpTarget => ({kind: 'minutes', minutes: m});

/** A jump must leave room for turn anticipation and the waypoint alert before the active waypoint. */
const MIN_REMAINING_NM = 3;
/**
 * 16 Hz. The fake timers truncate the delay of a timer to whole milliseconds (62 ms), so each step integrates the time
 * that actually passed on the clock rather than the nominal step; otherwise the aircraft would fly 0.8 % fast.
 */
const PHYSICS_STEP_MS = 1000 / 16;

const MODE_NAMES: Record<number, string> = {
    [NavMode.ENR_LEG]: 'ENR-LEG', [NavMode.ENR_OBS]: 'ENR-OBS', [NavMode.ARM_LEG]: 'ARM-LEG',
    [NavMode.ARM_OBS]: 'ARM-OBS', [NavMode.APR_LEG]: 'APR-LEG',
};

const RECORDED_SIMVARS: [string, string][] = [
    ['GPS WP NEXT ID', 'string'], ['GPS WP DISTANCE', 'nautical miles'], ['GPS WP DESIRED TRACK', 'degrees'],
    ['GPS WP CROSS TRK', 'nautical miles'], ['L:KLN90B_RollCommand', 'degrees'], ['L:KLN90B_WptLight', 'bool'],
];

export interface FlightOptions extends Omit<BootOptions, 'facilities' | 'airspaces' | 'position' | 'altitudeFt' | 'magvar'> {
    world: World;
    aircraft: AircraftInit;
    aircraftOptions?: AircraftOptions;
    pilot?: Pilot;
}

export interface NavView {
    activeIdent: string | null;
    distNm: number | null;
    dtkTrue: number | null;
    xtkNm: number | null;
    toFrom: 'TO' | 'FROM' | null;
    mode: string;
    waypointAlert: boolean;
    xtkScale: number;
}

interface MonitorFailure {
    t: number;
    name: string;
    detail: string;
}

/**
 * A simulated flight: the headless unit, an aircraft, a pilot and the world. Time only moves in fly, flyUntil and jump.
 *
 * Monitors and the recorder sample once per simulated second, so they can miss a transient shorter than a second, and
 * they do not run across the span a jump skips.
 */
export class Flight {
    public readonly recorder = new FlightRecorder();
    public readonly panel: FrontPanel;
    public pilot: Pilot;
    private readonly monitors: { name: string; check: (f: Flight) => true | string }[] = [];
    private readonly failures: MonitorFailure[] = [];
    private readonly startMs: number;
    /** Counts console.error calls, boot included; Flight.start installs the counter before the unit boots */
    private readonly consoleErrors: { count: number };
    /** Clock time up to which the aircraft has been integrated */
    private lastPhysicsMs = 0;

    private constructor(public readonly unit: HeadlessUnit, public readonly world: World, public readonly aircraft: Aircraft, pilot: Pilot, consoleErrors: { count: number }) {
        this.pilot = pilot;
        this.consoleErrors = consoleErrors;
        this.startMs = Date.now();
        this.panel = new FrontPanel(evt => unit.send(evt), () => this.screen);
    }

    /**
     * Boots the unit and flies until the GPS has a solution. Call it inside a test: it registers onTestFailed, which
     * binds the recorder to that test, and the output is named after it.
     */
    public static async start(opts: FlightOptions): Promise<Flight> {
        const {world, aircraft, aircraftOptions, pilot, ...boot} = opts;
        // Counted from before the boot, so an error logged while the unit starts up trips the monitor too
        const consoleErrors = {count: 0};
        const originalError = console.error;
        console.error = (...args: unknown[]) => {
            consoleErrors.count++;
            originalError(...args);
        };
        onTestFinished(() => {
            console.error = originalError;
        });
        const unit = await bootUnit({
            ...boot, facilities: world.all(), airspaces: world.airspaces(), position: {lat: aircraft.lat, lon: aircraft.lon}, altitudeFt: aircraft.altitudeFt,
            magvar: (lat, lon) => world.magvar(lat, lon),
        });
        const flight = new Flight(unit, world, new Aircraft(aircraft, aircraftOptions), pilot ?? coupledAutopilot(), consoleErrors);
        flight.installBuiltInMonitors();
        flight.installLoops();
        onTestFailed(() => {
            const name = expect.getState().currentTestName ?? 'flight';
            const base = flight.recorder.write(name, world.all().map(f => ({ident: f.icaoStruct.ident, lat: f.lat, lon: f.lon})));
            console.error(`Flight recorder written to ${base}.jsonl / .kml`);
        });
        await flight.flyUntil(() => unit.props.sensors.in.gps.isValid(), {timeout: 120, description: 'GPS solution'});
        return flight;
    }

    /** Seconds of simulated time since Flight.start */
    public get t(): number {
        return (Date.now() - this.startMs) / 1000;
    }

    public get sim() {
        return this.unit.env.sim;
    }

    public get screen(): Screen {
        return Screen.read();
    }

    public get nav(): NavView {
        const n = this.unit.props.memory.navPage;
        return {
            activeIdent: n.activeWaypoint.getActiveWpt()?.icaoStruct.ident ?? null,
            distNm: n.distToActive,
            dtkTrue: n.desiredTrack,
            xtkNm: n.xtkToActive,
            toFrom: n.toFrom === null ? null : (n.toFrom ? 'TO' : 'FROM'),
            mode: MODE_NAMES[n.navmode] ?? String(n.navmode),
            waypointAlert: n.waypointAlert,
            xtkScale: n.xtkScale,
        };
    }

    /**
     * Adds a check that runs once per simulated second. Return true when fine, otherwise a description. A check sees
     * the state at each whole second only, so a condition that comes and goes between two samples is not caught.
     */
    public monitor(name: string, check: (f: Flight) => true | string): void {
        this.monitors.push({name, check});
    }

    /** Runs every tick for the given simulated time. */
    public async fly(seconds: number): Promise<void> {
        await vi.advanceTimersByTimeAsync(seconds * 1000);
        this.throwIfFailed();
    }

    /** Flies until the predicate holds; returns the simulated seconds it took. */
    public async flyUntil(predicate: () => boolean, o: { timeout: number; description: string }): Promise<number> {
        const t0 = Date.now();
        while (!predicate()) {
            if (Date.now() - t0 > o.timeout * 1000) {
                throw new Error(`flyUntil: "${o.description}" not reached within ${o.timeout} s\n${this.screen.dump()}`);
            }
            await vi.advanceTimersByTimeAsync(250);
            this.throwIfFailed();
        }
        return (Date.now() - t0) / 1000;
    }

    /** flyUntil the active waypoint is ident */
    public flyUntilActive(ident: string, o: { timeout: number }): Promise<number> {
        return this.flyUntil(() => this.nav.activeIdent === ident, {timeout: o.timeout, description: `${ident} active`});
    }

    /**
     * Flies display ticks until one ran without a calculation tick, so the screen shows the latest calculation.
     *
     * Both fall due together once a second. Under the fake timers the calculation runs first at that shared second
     * (measured: the timer that fired longest ago goes first, which is the 1 Hz one), so the display tick that follows
     * already shows it and the screen is normally current at once. This helper is a guard for a state where the display
     * would run first, such as the first shared second after the tick loops are created; otherwise it flies one or two
     * display ticks (testing.md section 4).
     *
     * A calculation tick is recognized by DIS to the active waypoint changing, so this needs an aircraft that moves
     * toward or away from an active waypoint. Without one nothing changes, and it returns after one display tick.
     * @throws Error if DIS changed in every display tick
     */
    public async syncDisplay(): Promise<void> {
        for (let i = 0, before = this.nav.distNm; ; i++, before = this.nav.distNm) {
            await this.fly(0.25);
            if (this.nav.distNm === before) return;
            if (i > 4) throw new Error('syncDisplay: DIS changed in every display tick');
        }
    }

    /**
     * Slew-style jump: moves the aircraft along its current great circle and the clock forward without running the
     * ticks in between, then runs one second normally. Integrated values (flight timer, fuel) miss the jumped time.
     * Monitors do not run for the skipped span.
     * @throws Error if the jump would cross or come within 3 NM of the active waypoint
     */
    public async jump(target: JumpTarget): Promise<void> {
        const active = this.nav.activeIdent;
        if (active === null) throw new Error('jump: no active waypoint');
        const toActive = distanceNm(this.aircraft, this.world.pos(active));
        let distance: number;
        if (target.kind === 'nmBefore') {
            if (target.ident !== active) {
                throw new Error(`jump: ${target.ident} is not the active waypoint (${active}); a jump must not cross a waypoint`);
            }
            distance = toActive - target.nm;
        } else {
            distance = this.aircraft.groundspeedKt * target.minutes / 60;
        }
        if (distance <= 0) throw new Error(`jump: nothing to jump (${distance.toFixed(2)} NM)`);
        if (toActive - distance < 0) {
            throw new Error(`jump: would cross ${active} (${(distance - toActive).toFixed(2)} NM past it)`);
        }
        if (toActive - distance < MIN_REMAINING_NM) {
            throw new Error(`jump: would end ${(toActive - distance).toFixed(2)} NM from ${active}, closer than ${MIN_REMAINING_NM} NM`);
        }
        this.aircraft.moveAlongTrack(distance);
        this.aircraft.writeTo(this.sim, this.world.magvar(this.aircraft.lat, this.aircraft.lon));
        vi.setSystemTime(Date.now() + distance / this.aircraft.groundspeedKt * 3600_000);
        // The jumped time is already covered by moveAlongTrack
        this.lastPhysicsMs = Date.now();
        await this.fly(1);
    }

    private installLoops(): void {
        this.lastPhysicsMs = Date.now();
        setInterval(() => {
            const now = Date.now();
            const bank = this.pilot.commandedBank({sim: this.sim, aircraft: this.aircraft});
            this.aircraft.step((now - this.lastPhysicsMs) / 1000, bank);
            this.lastPhysicsMs = now;
            this.aircraft.writeTo(this.sim, this.world.magvar(this.aircraft.lat, this.aircraft.lon));
        }, PHYSICS_STEP_MS);
        setInterval(() => this.everySecond(), 1000);
    }

    private everySecond(): void {
        for (const m of this.monitors) {
            const result = m.check(this);
            if (result !== true) this.failures.push({t: this.t, name: m.name, detail: result});
        }
        const simvars: Record<string, number | string> = {};
        for (const [name, unit] of RECORDED_SIMVARS) {
            if (this.sim.has(name)) simvars[name] = this.sim.get(name, unit);
        }
        let screen: string;
        try {
            screen = this.screen.text();
        } catch (e) {
            // An overwide row is a rendering bug; record it instead of throwing inside a timer
            screen = String(e);
            this.failures.push({t: this.t, name: 'screen readable', detail: screen});
        }
        const a = this.aircraft;
        this.recorder.record({
            t: this.t, lat: a.lat, lon: a.lon, altFt: a.altitudeFt, gs: a.groundspeedKt, track: a.trackTrue, bank: a.bankDeg,
            nav: {...this.nav}, simvars, screen,
        });
    }

    private installBuiltInMonitors(): void {
        this.monitor('no error page', f => f.unit.errors.length === 0 || `error published: ${f.unit.errors.map(String).join('; ')}`);
        this.monitor('no SimVar unit errors', f => f.sim.errors.length === 0 || f.sim.errors.join('; '));
        this.monitor('no console.error', () => this.consoleErrors.count === 0 || `${this.consoleErrors.count} console.error call(s)`);
        this.monitor('GPS outputs finite', f => {
            for (const name of ['GPS WP DISTANCE', 'GPS WP DESIRED TRACK', 'GPS WP CROSS TRK', 'GPS GROUND SPEED']) {
                const w = f.sim.lastWrite(name);
                if (w !== undefined && typeof w.value === 'number' && !Number.isFinite(w.value)) return `${name} = ${w.value}`;
            }
            return true;
        });
    }

    private throwIfFailed(): void {
        if (this.failures.length > 0) {
            const lines = this.failures.slice(0, 5).map(f => `t=${f.t.toFixed(0)} s ${f.name}: ${f.detail}`);
            throw new Error(`Flight monitors failed:\n${lines.join('\n')}`);
        }
    }
}
