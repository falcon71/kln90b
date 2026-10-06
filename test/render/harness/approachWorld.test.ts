import {describe, expect, it, vi} from 'vitest';
import {bootUnit, moveAircraft, settle} from '../../harness/boot';
import {approachWorld, defaultNavdata} from '../../harness/fixtures';
import {savedFlightplan} from '../../harness/storage';
import {distanceNm} from '../../harness/flight/geo';
import {KLNFixType} from '../../../kln90b/data/flightplan/Flightplan';
import {NavMode} from '../../../kln90b/data/VolatileMemory';

describe('approachWorld (harness)', () => {
    async function loaded(nmNorth: number) {
        const w = approachWorld();
        const unit = await bootUnit({
            facilities: w.facilities, position: w.north(nmNorth),
            storage: {...savedFlightplan(0, [w.enraa, w.kprc]), turnAnticipation: false},
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        return {w, unit};
    }

    it('loads the approach into FPL 0 with its IAF, FAF and MAP', async () => {
        const {unit} = await loaded(20);
        const legs = unit.props.memory.fplPage.flightplans[0].getLegs();
        expect(legs.map(l => l.wpt.icaoStruct.ident))
            .toEqual(['ENRAA', 'IAFAA', 'IFAAA', 'FAFAA', 'SDFAA', 'MAPAA', 'KPRC']);
        expect(legs.map(l => l.fixType)).toEqual([
            undefined, KLNFixType.IAF, undefined, KLNFixType.FAF, undefined, KLNFixType.MAP, undefined,
        ]);
    });

    // The APR switch itself (6-3) is specified in ModeController.test.ts; this only shows that the world can reach it
    it('reaches APR on the final course, from ARM before the FAF', async () => {
        const {w, unit} = await loaded(7.5);   // 2.5 NM before FAFAA, inside 30 NM: armed
        await vi.advanceTimersByTimeAsync(31_000);
        const nav = unit.props.memory.navPage;
        // Preconditions: the FAF is active and the unit is armed but not yet in APR
        expect(nav.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('FAFAA');
        expect(nav.navmode).toBe(NavMode.ARM_LEG);

        await moveAircraft(unit, w.north(6.5), {groundspeedKt: 120, trackTrue: 180});
        await vi.advanceTimersByTimeAsync(1000);
        expect(nav.navmode).toBe(NavMode.APR_LEG);
    });

    describe('geometry', () => {
        const w = approachWorld();

        it('lays the approach fixes along the final course, FAF 5 NM and step-down fix 2.5 NM from the MAP', () => {
            expect(distanceNm(w.kprc, w.mapaa)).toBeCloseTo(0, 3);
            expect(distanceNm(w.mapaa, w.fafaa)).toBeCloseTo(5, 2);
            expect(distanceNm(w.mapaa, w.sdfaa)).toBeCloseTo(2.5, 2);
            expect(distanceNm(w.fafaa, w.sdfaa)).toBeCloseTo(2.5, 2);
            expect(distanceNm(w.mapaa, w.ifaaa)).toBeCloseTo(10, 2);
            expect(distanceNm(w.mapaa, w.iafaa)).toBeCloseTo(15, 2);
            // Due north of the airport, so the final course is 180
            for (const fix of [w.fafaa, w.sdfaa, w.ifaaa, w.iafaa, w.enraa]) {
                expect(fix.lon).toBeCloseTo(8.0, 6);
                expect(fix.lat).toBeGreaterThan(47.0);
            }
        });

        it('puts ENRAA 60 NM north of KPRC and north(nm) nm north of it', () => {
            expect(distanceNm(w.kprc, w.enraa)).toBeCloseTo(60, 2);
            expect(distanceNm(w.kprc, w.north(7.5))).toBeCloseTo(7.5, 2);
            expect(distanceNm(w.fafaa, w.north(7.5))).toBeCloseTo(2.5, 2);
            expect(w.north(7.5).lat).toBeGreaterThan(w.kprc.lat);
        });
    });

    describe('facilities', () => {
        it('returns new objects on every call', () => {
            const a = approachWorld();
            const b = approachWorld();
            expect(a.kprc).not.toBe(b.kprc);
            expect(a.fafaa).not.toBe(b.fafaa);
            expect(a.facilities).not.toBe(b.facilities);
        });

        it('lists every approach fix and sorts all idents before the default navdata', () => {
            const w = approachWorld();
            expect(w.facilities.map(f => f.icaoStruct.ident).sort())
                .toEqual(['ENRAA', 'FAFAA', 'IAFAA', 'IFAAA', 'KPRC', 'MAPAA', 'SDFAA']);
            const firstDefault = defaultNavdata().map(f => f.icaoStruct.ident).sort()[0];
            for (const f of w.facilities) {
                expect(f.icaoStruct.ident < firstDefault).toBe(true);
            }
        });
    });
});
