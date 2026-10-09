import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {EventBus} from '@microsoft/msfs-sdk';
import {CalcTickable, DisplayTickable, TickController} from '../../kln90b/TickController';
import {PowerEvent} from '../../kln90b/PowerButton';
import {ErrorEvent} from '../../kln90b/controls/ErrorPage';

/** What the tickables of one controller recorded */
interface Recorder {
    bus: EventBus;
    controller: TickController;
    /** The blink argument of every display tick */
    display: boolean[];
    /** The name of every calculation tickable, in the order they ran */
    calc: string[];
    /** One entry per signal tick */
    signals: number;
    errors: Error[];
}

function calcTickable(name: string, log: string[]): CalcTickable {
    return {tick: () => log.push(name)};
}

/**
 * A TickController on its own bus with recording tickables. calcNames are run in this order; a name in `throwing`
 * throws an Error from its tick (in the calculation, the display or the signal loop, whichever it is in).
 */
function controller(calcNames: string[] = ['first', 'second', 'third'], throwing: string[] = []): Recorder {
    const bus = new EventBus();
    const r: Recorder = {
        bus, controller: undefined as unknown as TickController, display: [], calc: [], signals: 0, errors: [],
    };
    const display: DisplayTickable[] = [
        {
            tick: (blink: boolean) => {
                if (throwing.includes('display')) throw new Error('display boom');
            },
        },
        {tick: (blink: boolean) => r.display.push(blink)},
    ];
    const calc: CalcTickable[] = calcNames.map(name => throwing.includes(name)
        ? {tick: () => {
            r.calc.push(name);
            throw new Error(`${name} boom`);
        }}
        : calcTickable(name, r.calc));
    const signals: CalcTickable[] = [
        {
            tick: () => {
                if (throwing.includes('signal')) throw new Error('signal boom');
            },
        },
        {tick: () => r.signals++},
    ];
    r.controller = new TickController(bus, display, calc, signals);
    bus.getSubscriber<ErrorEvent>().on('error').handle(e => r.errors.push(e));
    return r;
}

function power(r: Recorder, isPowered: boolean): void {
    r.bus.getPublisher<PowerEvent>().pub('powerEvent', {isPowered, timeSincePowerChange: 0});
}

/** Empties the logs, so that the next count starts at zero */
function clear(r: Recorder): void {
    r.display.length = 0;
    r.calc.length = 0;
    r.signals = 0;
}

beforeEach(() => {
    // The unit stage runs in Node, which has no window; TickController starts its loops with window.setInterval
    vi.stubGlobal('window', globalThis);
    vi.useFakeTimers();
    // The controller logs "starting ticks" and "ending ticks"
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

// docs/architecture.md, Core 2 (Tick loops), and the class doc of TickController: the display is redrawn at 4 Hz with
// blink true one tick in four, the calculations run at 1 Hz in the order of the list, the analog signal outputs at
// 16 Hz, and the loops run only while the unit is powered and enabled. The literals are those rates times the elapsed
// time.
// The 16 Hz loop fires every 62 ms under the fake timers (docs/testing.md section 6), which gives 16 per second for the
// first seconds; the counts below stay within the first two seconds.
describe('TickController loops (spec, docs/architecture.md Core 2)', () => {
    it('runs nothing before the unit is powered', () => {
        const r = controller();

        vi.advanceTimersByTime(5000);

        expect(r.display).toEqual([]);
        expect(r.calc).toEqual([]);
        expect(r.signals).toBe(0);
    });

    it('runs the display at 4 Hz, the calculations at 1 Hz and the signals at 16 Hz once powered', () => {
        const r = controller();
        power(r, true);

        vi.advanceTimersByTime(2000);

        expect(r.display.length).toBe(8);
        expect(r.calc).toEqual(['first', 'second', 'third', 'first', 'second', 'third']);
        expect(r.signals).toBe(32);
    });

    it('passes blink true on exactly one display tick in four', () => {
        const r = controller();
        power(r, true);

        vi.advanceTimersByTime(3000);

        expect(r.display.length).toBe(12);
        const blinking = r.display.flatMap((blink, i) => blink ? [i] : []);
        expect(blinking.length).toBe(3);
        expect(blinking[1] - blinking[0]).toBe(4);
        expect(blinking[2] - blinking[1]).toBe(4);
    });

    it('stops every loop at power-off and resumes at the same rates at the next power-on', () => {
        const r = controller();
        power(r, true);
        vi.advanceTimersByTime(1000);

        power(r, false);
        clear(r);
        vi.advanceTimersByTime(5000);
        expect(r.display).toEqual([]);
        expect(r.calc).toEqual([]);
        expect(r.signals).toBe(0);

        power(r, true);
        vi.advanceTimersByTime(1000);
        expect(r.display.length).toBe(4);
        expect(r.calc).toEqual(['first', 'second', 'third']);
        expect(r.signals).toBe(16);
    });

    // The hot swap: SimVarSync calls setEnabled(false) while L:KLN90B_Disabled is set (docs/architecture.md, Core 1)
    it('stops every loop while disabled and resumes at the same rates when enabled again', () => {
        const r = controller();
        power(r, true);
        vi.advanceTimersByTime(1000);

        r.controller.setEnabled(false);
        clear(r);
        vi.advanceTimersByTime(5000);
        expect(r.display).toEqual([]);
        expect(r.calc).toEqual([]);
        expect(r.signals).toBe(0);

        r.controller.setEnabled(true);
        vi.advanceTimersByTime(1000);
        expect(r.display.length).toBe(4);
        expect(r.calc).toEqual(['first', 'second', 'third']);
        expect(r.signals).toBe(16);
    });

    // The TickController half of the #24 guard: SimVarSync passes on only changes of L:KLN90B_Disabled, and setEnabled
    // ignores a repeated value on its own, so a second start cannot double the loops
    it('keeps the rates when it is enabled again while it already runs', () => {
        const r = controller();
        power(r, true);

        r.controller.setEnabled(true);
        vi.advanceTimersByTime(1000);

        expect(r.display.length).toBe(4);
        expect(r.calc).toEqual(['first', 'second', 'third']);
        expect(r.signals).toBe(16);
    });

    it('stays stopped when powered on while disabled, and starts once enabled', () => {
        const r = controller();
        r.controller.setEnabled(false);

        power(r, true);
        vi.advanceTimersByTime(2000);
        expect(r.calc).toEqual([]);

        r.controller.setEnabled(true);
        vi.advanceTimersByTime(1000);
        expect(r.display.length).toBe(4);
        expect(r.calc).toEqual(['first', 'second', 'third']);
        expect(r.signals).toBe(16);
    });
});

// docs/architecture.md, Core 2: each tickable is wrapped in try/catch, which logs the error and publishes it on the
// error topic (the error page shows it). The wrapping is per tickable, so the others of the same tick still run.
describe('TickController exceptions (spec, docs/architecture.md Core 2)', () => {
    it('publishes and logs a calculation tickable that throws, and still runs the ones after it', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const r = controller(['first', 'second', 'third'], ['second']);
        power(r, true);

        vi.advanceTimersByTime(1000);

        expect(r.calc).toEqual(['first', 'second', 'third']);
        expect(r.errors.map(e => e.message)).toEqual(['second boom']);
        expect(consoleError).toHaveBeenCalledTimes(1);
        expect((consoleError.mock.calls[0][0] as Error).message).toBe('second boom');
    });

    it('publishes and logs a display tickable that throws, and still runs the ones after it', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const r = controller(['first'], ['display']);
        power(r, true);

        vi.advanceTimersByTime(250);

        expect(r.display.length).toBe(1);
        expect(r.errors.map(e => e.message)).toEqual(['display boom']);
        expect((consoleError.mock.calls[0][0] as Error).message).toBe('display boom');
    });

    it('publishes and logs a signal tickable that throws, and still runs the ones after it', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const r = controller(['first'], ['signal']);
        power(r, true);

        vi.advanceTimersByTime(62);

        expect(r.signals).toBe(1);
        expect(r.errors.map(e => e.message)).toEqual(['signal boom']);
        expect((consoleError.mock.calls[0][0] as Error).message).toBe('signal boom');
    });
});
