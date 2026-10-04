import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../harness/boot';

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
});
