import {describe, expect, it} from 'vitest';
import {halForMode} from '../../../kln90b/services/ModeController';
import {NavMode} from '../../../kln90b/data/VolatileMemory';

// #453: the alert limit of the RAIM check by flight phase, in NM. The values are literals of the design (5.2)
describe('halForMode', () => {
    it.each([
        [NavMode.ENR_LEG, 2],
        [NavMode.ENR_OBS, 2],
        [NavMode.ARM_LEG, 1],
        [NavMode.ARM_OBS, 1],
        [NavMode.APR_LEG, 0.3],
    ])('mode %d has the alert limit %d NM', (mode, expected) => {
        expect(halForMode(mode)).toBe(expected);
    });
});
