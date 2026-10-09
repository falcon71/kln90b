import {describe, expect, it} from 'vitest';
import {Hardware} from '../../kln90b/Hardware';
import {simEnv} from '../harness/sim/install';

describe('Hardware', () => {
    // c673dc2: L:KLN90B_RightScan showed the previous state, because the LVar was written before the field changed
    it('writes the current state of the scan switch to L:KLN90B_RightScan (c673dc2)', () => {
        const hw = new Hardware();

        hw.setScanPulled(true);
        expect(simEnv().sim.lastWrite('L:KLN90B_RightScan')!.value).toBe(1);

        hw.setScanPulled(false);
        expect(simEnv().sim.lastWrite('L:KLN90B_RightScan')!.value).toBe(0);
    });

    // Public contract: LVars.ts documents L:KLN90B_RightScan as a read-only output, false while the right inner knob is
    // pushed in. A new unit starts with the knob in, so it overwrites a value left over from before (a reloaded
    // gauge, a hot swap) instead of showing it to the aircraft's knob animation.
    it('starts with the knob pushed in and writes 0 to L:KLN90B_RightScan when it is built (public contract)', () => {
        const sim = simEnv().sim;
        sim.reset();
        sim.set('L:KLN90B_RightScan', 'bool', true);

        const hw = new Hardware();

        expect(hw.isScanPulled).toBe(false);
        expect(sim.get('L:KLN90B_RightScan', 'bool')).toBe(0);
    });
});
