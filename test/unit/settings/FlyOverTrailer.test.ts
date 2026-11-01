import {describe, expect, it} from 'vitest';
import {decodeFlyOverTrailer, encodeFlyOverTrailer} from '../../../kln90b/settings/FlyOverTrailer';

// Our own storage format, not the unit's: docs/superpowers/specs/2026-11-01-flyover-waypoints-design.md, section
// "Storage". The trailer is the leg count as two decimal digits, then one base64 character per six legs, least
// significant bit first. The expectations are literals worked out by hand from that description.
describe('fly-over trailer (characterization)', () => {
    it('is empty when no leg is a fly-over', () => {
        expect(encodeFlyOverTrailer([])).toBe('');
        expect(encodeFlyOverTrailer([false, false])).toBe('');
    });
    it('writes the count and one base64 character per six legs, least significant bit first', () => {
        expect(encodeFlyOverTrailer([false, true, false])).toBe('03C');
        expect(encodeFlyOverTrailer([false, false, false, false, false, true])).toBe('06g');
        expect(encodeFlyOverTrailer([false, false, false, false, false, false, true])).toBe('07AB');
        expect(encodeFlyOverTrailer(Array(30).fill(true))).toBe('30/////');
    });
    it('reads back what it wrote', () => {
        expect(decodeFlyOverTrailer('03C', 3)).toEqual([false, true, false]);
        expect(decodeFlyOverTrailer('07AB', 7)).toEqual([false, false, false, false, false, false, true]);
    });
    it('reads no trailer as no fly-over', () => {
        expect(decodeFlyOverTrailer('', 2)).toEqual([false, false]);
    });
    it('ignores a trailer whose count, length or characters do not fit', () => {
        expect(decodeFlyOverTrailer('04C', 3)).toEqual([false, false, false]);
        expect(decodeFlyOverTrailer('03*', 3)).toEqual([false, false, false]);
        // a bad character in front of a valid one must not leave that one set
        expect(decodeFlyOverTrailer('07*B', 7)).toEqual(Array(7).fill(false));
        expect(decodeFlyOverTrailer('03CA', 3)).toEqual([false, false, false]);
        expect(decodeFlyOverTrailer('0', 1)).toEqual([false]);
    });
});
