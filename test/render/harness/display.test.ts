import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../harness/boot';

describe('display probes (harness)', () => {
    it('opacity() reads the instrument container as a number', async () => {
        const unit = await bootUnit();
        // The brightness ramp of the boot (warm-up and fade-in, BrightnessManager.ts) has run out by then
        await vi.advanceTimersByTimeAsync(15_000);
        expect(unit.display.opacity()).toBe(1);

        // A write to L:KLN90B_Brightness sets the opacity (BrightnessManager, public contract)
        unit.env.sim.set('L:KLN90B_Brightness', 'number', 0.5);
        await vi.advanceTimersByTimeAsync(300);
        expect(unit.display.opacity()).toBeCloseTo(0.5, 5);

        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.display.opacity()).toBe(0);
    });

    it('opacity() reads an unset opacity as NaN, not as 0 (a dark unit)', async () => {
        const unit = await bootUnit();
        const container = document.getElementById('InstrumentsContainer')!;

        container.style.opacity = '';
        expect(container.style.opacity).toBe('');
        expect(unit.display.opacity()).toBeNaN();

        container.style.opacity = '0';
        expect(unit.display.opacity()).toBe(0);
    });

    it('powerWrites() lists the writes of L:KLN90B_POWER and nothing else', async () => {
        const unit = await bootUnit();
        const writesBefore = unit.display.powerWrites().length;

        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(1000);

        const writes = unit.display.powerWrites();
        expect(writes.slice(writesBefore).map(w => w.value)).toEqual([0]);
        expect(writes.every(w => w.name === 'L:KLN90B_POWER')).toBe(true);
    });
});
