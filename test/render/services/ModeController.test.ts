import {describe, expect, it, vi} from 'vitest';
import {GeoPoint, UnitType} from '@microsoft/msfs-sdk';
import {bootUnit, settle} from '../../harness/boot';
import {airport, vor} from '../../harness/navdata/builders';
import {savedFlightplan} from '../../harness/storage';
import {courseDeg, distanceNm, EARTH_RADIUS_NM, finalCourseDeg, norm360} from '../../harness/flight/geo';
import {NavMode} from '../../../kln90b/data/VolatileMemory';

// The standard world of the flight tests: the final course KAAA - ABC is about 51.0 degrees
const kaaa = airport('KAAA', 47.0, 8.0);
const abc = vor('ABC', 47.5, 8.9);
const kbbb = airport('KBBB', 48.2, 9.2);

/** The point nm before the facility on the course, as a position for bootUnit */
function before(f: { lat: number; lon: number }, courseTrue: number, nm: number): { lat: number; lon: number } {
    const p = new GeoPoint(f.lat, f.lon).offset(norm360(courseTrue + 180), UnitType.NMILE.convertTo(nm, UnitType.GA_RADIAN));
    return {lat: p.lat, lon: p.lon};
}

/** MOD 2 shows "PRESS ENT TO ACTIVATE" in ENR-LEG; ENT enters ENR-OBS (the cursor is not needed) */
async function enterObs(unit: Awaited<ReturnType<typeof bootUnit>>): Promise<void> {
    await unit.panel.selectPage('L', 'MOD 2');
    await unit.panel.ent();
}

describe('ModeController OBS course', () => {
    // 5-34 and 5-35: in OBS the deviation is measured from the selected course through the active waypoint, and the
    // course comes from the external indicator. 014293d: ModeController ticks before NavCalculator, so a course that
    // changed is in the deviation of the same calculation tick instead of one second late.
    it('uses a changed OBS course in the same calculation tick (014293d)', async () => {
        const position = before(abc, finalCourseDeg(kaaa, abc), 5);
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb], position, storage: savedFlightplan(0, [kaaa, abc, kbbb]),
        });
        await settle(unit);
        const sim = unit.env.sim;
        sim.set('Nav OBS:1', 'degrees', 51); // Before entering OBS: unset it reads 0
        await enterObs(unit);
        await vi.advanceTimersByTimeAsync(2000);
        const nav = unit.props.memory.navPage;
        expect(nav.navmode).toBe(NavMode.ENR_OBS);
        expect(sim.get('GPS OBS VALUE', 'degrees')).toBeCloseTo(51, 2);

        sim.set('Nav OBS:1', 'degrees', 100);
        await vi.advanceTimersByTimeAsync(1000); // Exactly one calculation tick

        // The aircraft is d from ABC on the bearing brg; the course through ABC is 100: XTK = R asin(sin(d/R) sin(100 - brg))
        const d = distanceNm(position, abc);
        const brg = courseDeg(position, abc);
        const expectedXtk = EARTH_RADIUS_NM * Math.asin(Math.sin(d / EARTH_RADIUS_NM) * Math.sin((100 - brg) * Math.PI / 180));
        expect(expectedXtk).toBeCloseTo(3.77, 1); // The hand value is not about zero, so a stale course cannot match it
        expect(Math.abs(sim.get('GPS OBS VALUE', 'degrees') - 100)).toBeLessThan(0.01);
        expect(Math.abs(sim.get('GPS WP DESIRED TRACK', 'degrees') - 100)).toBeLessThan(0.01);
        // Not GPS WP CROSS TRK: the 16 Hz output filter lags the model
        expect(Math.abs(nav.xtkToActive! - expectedXtk)).toBeLessThan(0.05);
    });
});

describe('ModeController OBS course of 000', () => {
    /** Plan [KAAA, ABC], 10 NM before ABC on the leg, the external OBS course set before OBS is entered */
    async function enterObsWithCourse(course: number) {
        const position = before(abc, finalCourseDeg(kaaa, abc), 10);
        const unit = await bootUnit({facilities: [kaaa, abc], position, storage: savedFlightplan(0, [kaaa, abc])});
        await settle(unit);
        unit.env.sim.set('Nav OBS:1', 'degrees', course);
        await enterObs(unit);
        await vi.advanceTimersByTimeAsync(3000);
        return {unit, position};
    }

    /** The deviation from the course through ABC for an aircraft at the position, by hand */
    function xtkFromCourse(position: { lat: number; lon: number }, course: number): number {
        const d = distanceNm(position, abc);
        return EARTH_RADIUS_NM * Math.asin(Math.sin(d / EARTH_RADIUS_NM) * Math.sin((course - courseDeg(position, abc)) * Math.PI / 180));
    }

    // The sibling of the pin: the same entry with an OBS course other than the stored one works, so a broken setup fails here.
    // Spec: the OBS course is the one the external indicator shows (5-34), and going from LEG to OBS keeps the active
    // waypoint and takes that course (5-36, rule 2.i); the deviation is measured from it through the waypoint.
    it('measures the deviation from an OBS course of 077 through the waypoint', async () => {
        const {unit, position} = await enterObsWithCourse(77);
        const nav = unit.props.memory.navPage;

        expect(nav.navmode).toBe(NavMode.ENR_OBS);
        expect(nav.obsMag).toBe(77);
        expect(nav.activeWaypoint.isDctNavigation()).toBe(true);
        expect(xtkFromCourse(position, 77)).toBeCloseTo(4.38, 1);
        expect(Math.abs(nav.xtkToActive! - xtkFromCourse(position, 77))).toBeLessThan(0.05);
    });

    // 5-36: the OBS course is the one the indicator selects, 000 included. ModeController.setObs returns at once when the
    // course equals navState.obsMag, which is 0 at start and after a switch to LEG, so the leg path stays in force.
    it.fails('measures the deviation from an OBS course of 000 through the waypoint (#122)', async () => {
        const {unit, position} = await enterObsWithCourse(0);
        const nav = unit.props.memory.navPage;

        expect(nav.navmode).toBe(NavMode.ENR_OBS);
        expect(nav.activeWaypoint.isDctNavigation()).toBe(true);
        expect(xtkFromCourse(position, 0)).toBeCloseTo(-7.77, 1);
        expect(Math.abs(nav.xtkToActive! - xtkFromCourse(position, 0))).toBeLessThan(0.05);
    });
});
