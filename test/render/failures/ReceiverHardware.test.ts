import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle, untilCalcTick} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';

// #471: rcvrHardware and the edges of the power-on latch in a booted unit. The codes 0002, 0004 and 0080 are found by the
// power-on test, so a failure started in operation acts from the next power-on (IM C-3, C-4); 2000 and 8000 show while the
// failure lasts (IM C-4)

const HOME = {lastLatitude: 47, lastLongitude: 8};

const byNumber = (a: number, b: number) => a - b;
const gpsOf = (unit: HeadlessUnit) => unit.props.sensors.in.gps;
const allPrns = (unit: HeadlessUnit) => gpsOf(unit).gpsSatComputer.getSatellites().map(s => s.prn).sort(byNumber);
const inhibited = (unit: HeadlessUnit) => [...gpsOf(unit).gpsSatComputer.inhibitedSatellitePrnCodes.get()].sort(byNumber);

describe('rcvrHardware and the latch (#471)', () => {
    it('rcvrHardware 0002 failed in operation acts from the next power-on', async () => {
        const unit = await bootUnit({storage: HOME});
        await settle(unit);
        const gps = gpsOf(unit);
        const errors = gps.failures.receiverErrors;
        errors.random = () => 0; // The code 0002
        expect(gps.isValid()).toBe(true); // Precondition: a fix

        unit.props.failures.fail('rcvrHardware');
        await untilCalcTick(unit);
        await vi.advanceTimersByTimeAsync(5000);

        expect(errors.code).toBe(0);
        expect(gps.isValid()).toBe(true);
        expect(inhibited(unit)).toEqual([]);

        await unit.panel.powerCycle({offSeconds: 60});
        await unit.panel.approveSelfTest();
        await untilCalcTick(unit);
        await vi.advanceTimersByTimeAsync(5000);

        expect(errors.code).toBe(0x0002);
        expect(gps.isValid()).toBe(false);
        expect(inhibited(unit)).toEqual(allPrns(unit));
        await unit.panel.selectPage('L', 'STA 1');
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().rows('L')[0]).toBe('STATE FAILR');
        expect(unit.errors).toEqual([]);
    }, 300_000);

    // The random value picks the index into the draw's code list [0002, 0004, 0080, 2000, 8000] (HARDWARE_CODES)
    it.each([[0.6, 0x2000], [0.8, 0x8000]])('rcvrHardware with random %s (code %i) acts at once', async (draw, code) => {
        const unit = await bootUnit({storage: HOME});
        await settle(unit);
        const gps = gpsOf(unit);
        const errors = gps.failures.receiverErrors;
        errors.random = () => draw;
        expect(gps.isValid()).toBe(true); // Precondition

        unit.props.failures.fail('rcvrHardware');
        await untilCalcTick(unit);

        expect(errors.code).toBe(code);
        expect(gps.isValid()).toBe(false);
        expect(inhibited(unit)).toEqual(allPrns(unit));

        unit.props.failures.repair('rcvrHardware');
        await settle(unit);

        expect(errors.code).toBe(0);
        expect(inhibited(unit)).toEqual([]);
        expect(gps.isValid()).toBe(true);
        expect(unit.errors).toEqual([]);
    }, 300_000);

    // A hot-swap disable and resume is no power-on (SimVarSync.test.ts): the latch keeps the word of the real power-on
    it('a hot-swap resume keeps the latched word', async () => {
        const unit = await bootUnit({storage: {...HOME, failure_rcvrInit: '{"transient":1}'}});
        const errors = gpsOf(unit).failures.receiverErrors;
        await vi.advanceTimersByTimeAsync(3000);
        expect(errors.code).toBe(0x0400); // Precondition: latched at the power-on
        expect(unit.props.failures.isActive('rcvrInit')).toBe(false); // Precondition: the transient failure is repaired

        unit.env.sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(5000);
        unit.env.sim.set('L:KLN90B_Disabled', 'bool', false);
        await vi.advanceTimersByTimeAsync(3000);

        expect(errors.code).toBe(0x0400);
        expect(unit.props.failures.isActive('rcvrInit')).toBe(false);
        expect(unit.errors).toEqual([]);
    }, 60_000);
});
