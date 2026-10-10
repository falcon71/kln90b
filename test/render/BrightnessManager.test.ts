import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../harness/boot';
import {Screen} from '../harness/render/screen';

// Spec test of the public contract with aircraft; the source is the contract itself (CLAUDE.md, "Public contract", and
// the doc comments in LVars.ts and HEvents.ts), not a manual page: L:KLN90B_Brightness is writable for hardware, and
// the Brt_Inc and Brt_Dec events still work
describe('L:KLN90B_Brightness (public contract) (#52)', () => {
    it('follows a write to the LVar, and the brightness events step from there', async () => {
        const unit = await bootUnit();
        await vi.advanceTimersByTimeAsync(5000); // the fade-in of the boot is done

        unit.env.sim.set('L:KLN90B_Brightness', 'number', 0.5);
        await vi.advanceTimersByTimeAsync(300);
        expect(unit.display.opacity()).toBeCloseTo(0.5, 5);

        unit.send('KLN90B_Brt_Inc');
        await vi.advanceTimersByTimeAsync(300);
        expect(unit.display.opacity()).toBeCloseTo(0.55, 5);

        unit.send('KLN90B_Brt_Dec');
        await vi.advanceTimersByTimeAsync(300);
        unit.send('KLN90B_Brt_Dec');
        await vi.advanceTimersByTimeAsync(300);
        expect(unit.display.opacity()).toBeCloseTo(0.45, 5);
    });

    // The same contract (LVars.ts, CLAUDE.md "Public contract") for a brightness the aircraft has already written when
    // the instrument starts (a knob position it keeps in its own state): the unit takes it over instead of its default
    // of 1, and still follows later writes
    it('starts at the brightness the LVar holds at the boot, and follows later writes', async () => {
        const unit = await bootUnit({simVars: [{name: 'L:KLN90B_Brightness', unit: 'number', value: 0.7}]});
        await vi.advanceTimersByTimeAsync(5000); // the fade-in of the boot is done
        expect(unit.display.opacity()).toBeCloseTo(0.7, 5);

        unit.env.sim.set('L:KLN90B_Brightness', 'number', 0.4);
        await vi.advanceTimersByTimeAsync(300);

        expect(unit.display.opacity()).toBeCloseTo(0.4, 5);
    });
});

/** Switches an engine-running unit off once its boot fade-in is done, keeps it off, and switches it on again */
async function offFor(unit: HeadlessUnit, offMs: number): Promise<void> {
    // The boot fade-in, or the previous warm-up, is done (#114: a running fade-in continues after a power-off)
    await vi.advanceTimersByTimeAsync(15_000);
    unit.send('KLN90B_Power_Off');
    await vi.advanceTimersByTimeAsync(offMs);
    unit.send('KLN90B_Power_On');
}

describe('the screen warm-up at the power-on (3-3)', () => {
    // 3-3: the screen needs some seconds of warm-up once the power knob is pushed in, so a cold unit is still dark one
    // second later. Maintenance manual (PDF 97): the Turn-On page is judged after the display has come up and stays
    // for about 15 s, so the screen is at the knob's brightness while that page is still showing
    it('is dark 1 s after the power-on of a cold unit, at full brightness during the Turn-On page (3-3)', async () => {
        const unit = await bootUnit();
        await offFor(unit, 30 * 60_000);

        await vi.advanceTimersByTimeAsync(1000);
        expect(unit.display.opacity()).toBe(0);

        // 12 s after the power-on: past the warm-up, inside the 15 s the Turn-On page stays (see the comment above)
        await vi.advanceTimersByTimeAsync(11_000);
        expect(Screen.read().row(0)).toBe(' GPS             ORS 20'); // still the Turn-On page
        expect(unit.display.opacity()).toBe(1);
    });
});

describe('the screen warm-up at the power-on (characterization)', () => {
    /** Milliseconds from the power-on until the screen is no longer dark, in steps of 100 ms */
    async function darkFor(unit: HeadlessUnit): Promise<number> {
        let ms = 0;
        while (!(unit.display.opacity() > 0) && ms < 20_000) {
            await vi.advanceTimersByTimeAsync(100);
            ms += 100;
        }
        return ms;
    }

    // BrightnessManager: the warm-up grows with the time the unit was off, up to 6 s after 10 minutes off, and the
    // fade-in then starts with its first 100 ms step
    it('stays dark longer the longer the unit was off (characterization)', async () => {
        const unit = await bootUnit();
        const dark: number[] = [];
        for (const offMs of [60_000, 5 * 60_000, 30 * 60_000]) {
            await offFor(unit, offMs);
            dark.push(await darkFor(unit));
        }

        expect(dark).toEqual([700, 3100, 6100]);
    });
});
