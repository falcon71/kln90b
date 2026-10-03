import {describe, expect, it} from 'vitest';
import {ICAO} from '@microsoft/msfs-sdk';
import {bankeAngleForStandardTurn} from '../../../kln90b/services/KLNNavmath';

describe('test harness', () => {
    it('loads the SDK and project modules under Node', () => {
        expect(ICAO.value('V', 'K1', '', 'ABC').ident).toBe('ABC');
        // Standard-rate bank angle, https://edwilliams.org/avform147.htm#Turns: 57.3 * atan(120 / 362.1) = 18.34°
        expect(bankeAngleForStandardTurn(120)).toBeCloseTo(18.34, 2);
        // Above 25° the unit limits the bank (MAX_BANK_ANGLE)
        expect(bankeAngleForStandardTurn(300)).toBe(25);
    });
});
