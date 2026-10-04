import {describe, expect, it} from 'vitest';
import {standardRoute} from '../../harness/fixtures';
import {angleDiff, courseDeg, distanceNm} from '../../harness/flight/geo';

describe('standardRoute', () => {
    it('has KAAA, the VOR ABC and KBBB at their coordinates', () => {
        const {kaaa, abc, kbbb} = standardRoute();
        expect([kaaa, abc, kbbb].map(f => [f.icaoStruct.type, f.icaoStruct.ident, f.lat, f.lon])).toEqual([
            ['A', 'KAAA', 47.0, 8.0],
            ['V', 'ABC', 47.5, 8.9],
            ['A', 'KBBB', 48.2, 9.2],
        ]);
    });

    it('returns fresh objects on every call, so a test may change them', () => {
        const first = standardRoute();
        const second = standardRoute();
        expect(second.kaaa).not.toBe(first.kaaa);
        expect(second.abc).not.toBe(first.abc);
        expect(second.kbbb).not.toBe(first.kbbb);
        Object.assign(first.abc, {lat: 10});
        expect(first.abc.lat).toBe(10);
        expect(standardRoute().abc.lat).toBe(47.5);
        expect(second.abc.lat).toBe(47.5);
    });

    it('has the legs and the turn its doc comment names', () => {
        const {kaaa, abc, kbbb} = standardRoute();
        expect(distanceNm(kaaa, abc)).toBeCloseTo(47.45, 1);
        expect(distanceNm(abc, kbbb)).toBeCloseTo(43.78, 1);
        expect(Math.abs(angleDiff(courseDeg(abc, kbbb), courseDeg(kaaa, abc)))).toBeCloseTo(34.44, 1);
    });
});
