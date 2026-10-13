import {describe, expect, it} from 'vitest';
import {roundBearing} from '../../../kln90b/data/Coordinates';

// Bearings run from 000 to 359: north shows 000, never 360 (checked in the KLN 89 trainer, 2026-10-07 for the OBS
// course and 2026-10-08 for a bearing, #263). roundBearing rounds first and wraps after, so the format never sees 360
describe('roundBearing in whole degrees (checked in the KLN 89 trainer, 2026-10-07 and 2026-10-08, #263)', () => {
    it('wraps a bearing that rounds up to 360 to 0', () => {
        expect(roundBearing(359.5)).toBe(0);
        expect(roundBearing(359.99)).toBe(0);
    });

    it('keeps a bearing that rounds down', () => {
        expect(roundBearing(359.4)).toBe(359);
        expect(roundBearing(0.4)).toBe(0);
        expect(roundBearing(88.8)).toBe(89);
    });
});

// No trainer entry covers tenths of a bearing, so the one-decimal form is the code's own: the same rule one decimal finer
describe('roundBearing in tenths (characterization)', () => {
    it('characterization: rounds to tenths with one decimal and wraps 360.0 to 0.0 (#263)', () => {
        expect(roundBearing(359.95, 1)).toBe(0);
        expect(roundBearing(359.94, 1)).toBeCloseTo(359.9, 9);
        expect(roundBearing(12.34, 1)).toBeCloseTo(12.3, 9);
    });
});
