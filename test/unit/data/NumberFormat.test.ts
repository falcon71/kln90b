import {describe, expect, it} from 'vitest';
import {padFixed, padInt, withSign} from '../../../kln90b/data/NumberFormat';

// The fixed-width number forms of the display and the persisted user waypoints (#447). They replace numerable and
// round the way it did, for the values the unit passes.
describe('padInt', () => {
    it('pads the magnitude with leading zeros to the digits', () => {
        expect(padInt(7, 3)).toBe('007');
        expect(padInt(0, 2)).toBe('00');
        expect(padInt(359.4, 3)).toBe('359');
    });

    it('rounds halves away from zero', () => {
        expect(padInt(2.5, 1)).toBe('3');
        expect(padInt(-2.5, 1)).toBe('-3');
    });

    it('puts the minus in front of the padded digits, but not on a value that rounds to zero', () => {
        expect(padInt(-5, 2)).toBe('-05');
        expect(padInt(-0.3, 2)).toBe('00');
    });

    it('does not cut a value wider than the digits', () => {
        expect(padInt(1234, 3)).toBe('1234');
    });
});

describe('padFixed', () => {
    it('pads the integer part and keeps the decimals', () => {
        expect(padFixed(0.25, 1, 2)).toBe('0.25');
        expect(padFixed(29.92, 2, 2)).toBe('29.92');
        expect(padFixed(3.5, 4, 1)).toBe('0003.5');
    });

    it('carries a rounded fraction into the integer part', () => {
        expect(padFixed(9.96, 1, 1)).toBe('10.0');
        expect(padFixed(0.996, 1, 2)).toBe('1.00');
    });

    it('rounds halves away from zero', () => {
        expect(padFixed(1.45, 1, 1)).toBe('1.5');
        expect(padFixed(-1.25, 1, 1)).toBe('-1.3');
    });

    // 3-45: the comm frequencies of APT 4 on 25 kHz and 8.33 kHz channels sit on a half of the shown hundredths that
    // binary cannot hold exactly (128.075 * 100 = 12807.499999999998)
    it('rounds a decimal half up although binary holds it a hair below (3-45)', () => {
        expect(padFixed(128.075, 3, 2)).toBe('128.08');
        expect(padFixed(128.015, 3, 2)).toBe('128.02');
        expect(padFixed(1.005, 1, 2)).toBe('1.01');
    });

    it('puts no minus on a value that rounds to zero', () => {
        expect(padFixed(-0.04, 1, 1)).toBe('0.0');
    });

    it('does not cut a value wider than the integer digits', () => {
        expect(padFixed(12345.6, 2, 1)).toBe('12345.6');
    });
});

// The persisted user waypoints and the APT 2 time zone write a sign in front of every value, also of zero
describe('withSign', () => {
    it('puts the sign of the value in front of the text, plus for zero', () => {
        expect(withSign(12, '12')).toBe('+12');
        expect(withSign(-12, '12')).toBe('-12');
        expect(withSign(0, '00')).toBe('+00');
    });

    // A latitude 0.4 degrees south truncates to 0 degrees, and only the sign keeps it south
    it('keeps the minus of a value whose shown magnitude is zero', () => {
        expect(withSign(-0.4, '00')).toBe('-00');
    });
});
