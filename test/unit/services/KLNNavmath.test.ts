import {describe, expect, it} from 'vitest';
import {intermediatePoint} from '../../../kln90b/services/KLNNavmath';

describe('intermediatePoint', () => {
    it('returns the start point for f = 0', () => {
        const p = intermediatePoint({lat: 50, lon: 8}, {lat: 51, lon: 10}, 0);
        expect(p.lat).toBeCloseTo(50, 6);
        expect(p.lon).toBeCloseTo(8, 6);
    });

    it.fails('returns the great-circle midpoint and end point (#97)', () => {
        // Expected values from https://edwilliams.org/avform147.htm#Intermediate, computed independently
        const mid = intermediatePoint({lat: 50, lon: 8}, {lat: 51, lon: 10}, 0.5);
        expect(mid.lat).toBeCloseTo(50.5043, 3);
        expect(mid.lon).toBeCloseTo(8.9894, 3);
        const end = intermediatePoint({lat: 50, lon: 8}, {lat: 51, lon: 10}, 1);
        expect(end.lat).toBeCloseTo(51, 3);
        expect(end.lon).toBeCloseTo(10, 3);
    });
});
