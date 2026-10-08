import {describe, expect, it} from 'vitest';
import {BoundaryType, VorFacility} from '@microsoft/msfs-sdk';
import {centerWorld, dtWorld} from '../../harness/fixtures';
import {distanceNm} from '../../harness/flight/geo';

describe('dtWorld (harness)', () => {
    it('has four waypoints on one meridian whose legs are 30 NM long', () => {
        const w = dtWorld();
        const chain = [w.kaaa, w.abc, w.def, w.kbbb];

        expect(chain.map(f => f.icaoStruct.ident)).toEqual(['KAAA', 'ABC', 'DEF', 'KBBB']);
        expect(chain.map(f => f.lon)).toEqual([10, 10, 10, 10]);
        // Half a degree of latitude is 30.05 NM on the unit's sphere (geo.ts)
        for (let i = 0; i < chain.length - 1; i++) {
            expect(Math.abs(distanceNm(chain[i], chain[i + 1]) - 30.0)).toBeLessThan(0.1);
        }
    });

    it('returns fresh objects on every call', () => {
        const a = dtWorld();
        Object.assign(a.abc, {lat: 0});

        expect(dtWorld().abc.lat).toBe(47.5);
        expect(dtWorld().abc).not.toBe(a.abc);
    });
});

describe('centerWorld (harness)', () => {
    const w = centerWorld();
    const vors = [w.bgd, w.gck];
    // The boundaries the three Centers share, on 100 W
    const crossing = (lat: number) => ({lat, lon: -100});
    const within100 = (lat: number) => vors.filter((v: VorFacility) => distanceNm(crossing(lat), v) <= 100).map(v => v.icaoStruct.ident);

    it('has BGD as the only VOR within 100 NM of the first boundary and GCK of the second', () => {
        expect(within100(42.75)).toEqual(['BGD']);
        expect(within100(47.75)).toEqual(['GCK']);
    });

    it('has airports 300 NM apart on 100 W', () => {
        expect(distanceNm(w.kaaa, w.kbbb)).toBeCloseTo(300.5, 0);
        expect(distanceNm(w.kbbb, w.kccc)).toBeCloseTo(300.5, 0);
        expect([w.kaaa, w.kbbb, w.kccc].map(a => a.lon)).toEqual([-100, -100, -100]);
    });

    it('has three Center airspaces stacked south to north that share their boundaries', () => {
        const c = w.centers;

        expect(c.map(a => a.type)).toEqual([BoundaryType.Center, BoundaryType.Center, BoundaryType.Center]);
        expect(c.map(a => [a.bottomRight.lat, a.topLeft.lat])).toEqual([[38, 42.75], [42.75, 47.75], [47.75, 52]]);
        // 2 degrees either side of 100 W, where the airports, the VORs and the crossings lie
        expect(c.map(a => [a.topLeft.long, a.bottomRight.long])).toEqual([[-102, -98], [-102, -98], [-102, -98]]);
        expect(c.map(a => (a as any).frequency.freqMHz)).toEqual([120.0, 121.0, 122.0]);
    });

    it('returns fresh objects on every call, airspaces included', () => {
        const a = centerWorld();
        const b = centerWorld();

        expect(a.bgd).not.toBe(b.bgd);
        expect(a.centers[0]).not.toBe(b.centers[0]);
        expect(a.centers[0].id).not.toBe(b.centers[0].id);
    });
});
