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
});
