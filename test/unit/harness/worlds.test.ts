import {describe, expect, it} from 'vitest';
import {BoundaryType, FixTypeFlags, LegTurnDirection, LegType, UnitType, VorFacility} from '@microsoft/msfs-sdk';
import {arcWorld, centerWorld, dtWorld, legWorld} from '../../harness/fixtures';
import {courseDeg, distanceNm} from '../../harness/flight/geo';

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

describe('legWorld (harness)', () => {
    it('has KAAA 200 NM west of KDDD on the 270 bearing and KEEE 30 NM east of it on 090', () => {
        const w = legWorld();

        expect(w.kddd.icaoStruct.ident).toBe('KDDD');
        expect([w.kddd.lat, w.kddd.lon]).toEqual([47.0, 9.0]);
        expect(distanceNm(w.kddd, w.kaaa)).toBeCloseTo(200, 6);
        expect(courseDeg(w.kddd, w.kaaa)).toBeCloseTo(270, 6);
        expect(distanceNm(w.kddd, w.keee)).toBeCloseTo(30, 6);
        expect(courseDeg(w.kddd, w.keee)).toBeCloseTo(90, 6);
        expect([w.kaaa, w.keee].map(f => f.icaoStruct.ident)).toEqual(['KAAA', 'KEEE']);
    });

    it('gives the point nm NM west of KDDD on the same line with west(nm)', () => {
        const w = legWorld();

        expect(distanceNm(w.kddd, w.west(30))).toBeCloseTo(30, 6);
        expect(courseDeg(w.kddd, w.west(30))).toBeCloseTo(270, 6);
        expect(distanceNm(w.west(30), w.kaaa)).toBeCloseTo(170, 6);
        expect(w.west(200)).toEqual({lat: w.kaaa.lat, lon: w.kaaa.lon});
    });

    it('returns fresh objects on every call', () => {
        const a = legWorld();
        Object.assign(a.kaaa, {lat: 0});

        expect(legWorld().kaaa.lat).not.toBe(0);
        expect(legWorld().kddd).not.toBe(a.kddd);
    });
});

describe('arcWorld (harness)', () => {
    const w = arcWorld();

    it('has the arc fixes 10 NM from ABC, ARCBG on its 270 radial and ARCEN on its 180 radial', () => {
        expect([w.abc.lat, w.abc.lon]).toEqual([47.3, 8.3]);
        expect(distanceNm(w.abc, w.arcbg)).toBeCloseTo(10, 6);
        expect(courseDeg(w.abc, w.arcbg)).toBeCloseTo(270, 6);
        expect(distanceNm(w.abc, w.arcen)).toBeCloseTo(10, 6);
        expect(courseDeg(w.abc, w.arcen)).toBeCloseTo(180, 6);
    });

    it('gives the point nm NM from ABC on a bearing with at(bearing, nm), so that at(225, 10) lies on the arc', () => {
        expect(distanceNm(w.abc, w.at(225, 10))).toBeCloseTo(10, 6);
        expect(courseDeg(w.abc, w.at(225, 10))).toBeCloseTo(225, 6);
    });

    it('has the final fixes FAFAA and MAPAA on the meridian 8.7 E, MAPAA the more southern', () => {
        expect([w.fafaa.lat, w.fafaa.lon, w.mapaa.lat, w.mapaa.lon]).toEqual([47.1, 8.7, 47.0, 8.7]);
        expect(courseDeg(w.mapaa, w.fafaa)).toBeCloseTo(0, 6);
    });

    it('has the runway 27 approach of KPRC with the ARCBG transition: IAF, a left arc, FAF, then the MAP', () => {
        const a = w.kprc.approaches[0];

        expect(w.kprc.icaoStruct.ident).toBe('KPRC');
        expect([a.runway, a.transitions.map(t => t.name)]).toEqual(['27', ['ARCBG']]);
        expect(a.transitions[0].legs.map(l => [l.type, l.fixIcaoStruct.ident])).toEqual([
            [LegType.IF, 'ARCBG'], [LegType.AF, 'ARCEN'], [LegType.TF, 'FAFAA'],
        ]);
        const arc = a.transitions[0].legs[1];
        expect([arc.originIcaoStruct.ident, arc.course, arc.theta, arc.turnDirection]).toEqual(['ABC', 270, 180, LegTurnDirection.Left]);
        expect(UnitType.METER.convertTo(arc.rho, UnitType.NMILE)).toBeCloseTo(10, 6);
        expect(a.finalLegs.map(l => [l.type, l.fixIcaoStruct.ident])).toEqual([[LegType.TF, 'MAPAA']]);
    });

    it('flags the IAF, the FAF and the MAP, and makes the approach an RNAV approach', () => {
        const a = w.kprc.approaches[0];

        expect(a.approachType).toBe(ApproachType.APPROACH_TYPE_RNAV);
        expect(a.transitions[0].legs.map(l => l.fixTypeFlags)).toEqual([FixTypeFlags.IAF, 0, FixTypeFlags.FAF]);
        expect(a.finalLegs.map(l => l.fixTypeFlags)).toEqual([FixTypeFlags.MAP]);
    });

    it('puts KPRC at 47.0 N, 8.0 E and gives ABC no magnetic variation of its own', () => {
        expect([w.kprc.lat, w.kprc.lon]).toEqual([47.0, 8.0]);
        expect(w.abc.magneticVariation).toBe(0);
    });

    it('lists every facility the world needs, KPRC first', () => {
        expect(w.facilities.map(f => f.icaoStruct.ident)).toEqual(['KPRC', 'ABC', 'ARCBG', 'ARCEN', 'FAFAA', 'MAPAA']);
    });

    it('returns fresh objects on every call', () => {
        const a = arcWorld();
        Object.assign(a.abc, {lat: 0});

        expect(arcWorld().abc.lat).toBe(47.3);
        expect(arcWorld().kprc).not.toBe(a.kprc);
        expect(arcWorld().kprc.approaches[0].transitions[0].legs[0]).not.toBe(a.kprc.approaches[0].transitions[0].legs[0]);
    });
});
