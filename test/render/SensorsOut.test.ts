import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../harness/boot';
import {standardRoute} from '../harness/fixtures';
import {courseDeg, pointBefore, pointFrom} from '../harness/flight/geo';
import {savedFlightplan} from '../harness/storage';

const NO_GPS_SIMVARS_XML = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Output><WriteGPSSimVars>false</WriteGPSSimVars></Output></Instrument></PlaneHTMLConfig>';

// Public contract: the LVar is documented in LVars.ts (ARINC label 275, bit 22: true when no GPS signal is acquired) and
// listed in CLAUDE.md, "Public contract with aircraft". An unset LVar reads 0, so "written as 0" is asserted with
// lastWrite().
describe('L:KLN90B_IntegrityWarn (public contract) (#87)', () => {
    it('is 1 while the GPS has no fix and 0 once it has one', async () => {
        // The last position and the almanac are valid, so the slow acquisition stays well below the cap
        const unit = await bootUnit({
            coldGps: true,
            storage: {fastGpsAcquisition: false, lastLatitude: 47.0, lastLongitude: 8.0},
            position: {lat: 47.0, lon: 8.0},
        });
        const sim = unit.env.sim;
        const gps = unit.props.sensors.in.gps;

        await vi.advanceTimersByTimeAsync(2000);
        expect(gps.isValid()).toBe(false);
        expect(sim.lastWrite('L:KLN90B_IntegrityWarn')?.value).toBe(1);

        await vi.advanceTimersByTimeAsync(28_000);
        expect(gps.isValid()).toBe(false);
        expect(sim.lastWrite('L:KLN90B_IntegrityWarn')?.value).toBe(1);

        // The acquisition time comes from the seeded random; only a generous window is asserted. The lower bound is the
        // "still invalid at 30 s" check above, the upper bound is the check below.
        let seconds = 30;
        while (!gps.isValid()) {
            expect(seconds).toBeLessThan(900);
            await vi.advanceTimersByTimeAsync(1000);
            seconds++;
        }
        expect(seconds).toBeLessThan(400);

        await vi.advanceTimersByTimeAsync(2000);
        expect(sim.lastWrite('L:KLN90B_IntegrityWarn')?.value).toBe(0);
        expect(sim.get('L:KLN90B_IntegrityWarn', 'bool')).toBe(0);
    });
});

// Public contract: CLAUDE.md, "Public contract with aircraft" (GPS SimVars), and the Hot Swapping wiki page. The unit
// claims the GPS from the sim's own GPS on every calculation tick, not only at boot, because the sim resets the variable.
describe('GPS OVERRIDDEN (public contract) (#24)', () => {
    it('is asserted again within one calculation tick after something clears it', async () => {
        const unit = await bootUnit();
        await settle(unit);
        const sim = unit.env.sim;
        expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(1);

        sim.set('GPS OVERRIDDEN', 'bool', false);
        expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(0);
        await vi.advanceTimersByTimeAsync(1000);

        expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(1);
    });

    it('is released when the unit is hot-swapped off and stays released', async () => {
        const unit = await bootUnit();
        await settle(unit);
        const sim = unit.env.sim;

        sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(3000);
        expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(0);

        // Another unit now owns the GPS and sets the variable itself
        sim.set('GPS OVERRIDDEN', 'bool', true);
        await vi.advanceTimersByTimeAsync(3000);
        expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(1);
    });

    it('is never written when Output.WriteGPSSimVars is off', async () => {
        const unit = await bootUnit({panelXml: NO_GPS_SIMVARS_XML});
        await settle(unit);
        const sim = unit.env.sim;

        expect(sim.lastWrite('GPS OVERRIDDEN')).toBeUndefined();
        sim.set('GPS OVERRIDDEN', 'bool', false);
        await vi.advanceTimersByTimeAsync(2000);

        expect(sim.lastWrite('GPS OVERRIDDEN')).toBeUndefined();
        expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(0);
    });
});

// Bug #124: SensorsOut.setPos (Sensors.ts:371-373) and setWpBearing (342-345) return before the LVar write
// when Output.WriteGPSSimVars is off, unlike the other L:KLN90B_* outputs. CLAUDE.md lists the LVars and the GPS SimVars as
// separate contracts, and LVars.ts documents the LVars as outputs of the unit, so an aircraft that leaves the GPS SimVars to
// another GPS should still get the integrity flag and the bearing from the unit.
describe('LVar outputs with Output.WriteGPSSimVars off (public contract) (#124)', () => {
    it('the gate holds the GPS SimVars back and lets the HSI flag LVar through', async () => {
        const unit = await bootUnit({panelXml: NO_GPS_SIMVARS_XML});
        await settle(unit);
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.env.sim.lastWrite('GPS MAGVAR')).toBeUndefined();
        expect(unit.env.sim.lastWrite('L:KLN90B_HSI_TF_FLAGS')?.value).toBe(0);
    });

    it('the default panel.xml writes both LVars under test', async () => {
        const unit = await bootUnit();
        await settle(unit);
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.env.sim.lastWrite('L:KLN90B_IntegrityWarn')?.value).toBe(0);
        expect(unit.env.sim.lastWrite('L:KLN90B_GPS_WP_BEARING')?.value).toBe(0);
    });

    it.fails('L:KLN90B_IntegrityWarn is still written (#124)', async () => {
        const unit = await bootUnit({panelXml: NO_GPS_SIMVARS_XML});
        await settle(unit);
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.env.sim.lastWrite('L:KLN90B_IntegrityWarn')?.value).toBe(0);
    });

    it.fails('L:KLN90B_GPS_WP_BEARING is still written (#124)', async () => {
        const unit = await bootUnit({panelXml: NO_GPS_SIMVARS_XML});
        await settle(unit);
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.env.sim.lastWrite('L:KLN90B_GPS_WP_BEARING')?.value).toBe(0);
    });
});

// Public contract: with Output.WriteGPSSimVars false the unit writes no GPS SimVar and no K:GPS key event; the wiki page
// panel.xml customization lists the variables under "If set to true", and CLAUDE.md, "Public contract with aircraft",
// names the option. An aircraft that turns the option off leaves the GPS SimVars to another GPS. The unit is the known
// state of SensorsOutSimVars.test.ts: ABC active, 1 NM right of the first leg, moving at 120 kt, so every output has a
// value to write.
describe('GPS SimVars with Output.WriteGPSSimVars off (public contract) (#126)', () => {
    async function bootMovingOnRoute(panelXml?: string): Promise<HeadlessUnit> {
        const {kaaa, abc, kbbb} = standardRoute();
        const onLeg = pointBefore(kaaa, abc, 20);
        const legCourse = courseDeg(onLeg, abc);
        const p = pointFrom(onLeg, legCourse + 90, 1);
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb], storage: savedFlightplan(0, [kaaa, abc, kbbb]), position: p, magvar: 4, panelXml,
        });
        await settle(unit);
        await moveAircraft(unit, p, {groundspeedKt: 120, trackTrue: (legCourse + 10) % 360});
        await vi.advanceTimersByTimeAsync(4000);
        return unit;
    }

    /** The names written from the GPS SimVar namespace; FakeSim stores them in upper case */
    const writtenGpsNames = (unit: HeadlessUnit) =>
        [...new Set(unit.env.sim.writes.map(w => w.name.toUpperCase()).filter(n => n.startsWith('GPS ')))].sort();

    // The two variables of #126 are excluded here, and pinned one each below, so that fixing one cannot hide the other
    it('writes no other GPS SimVar and no K:GPS key event while the unit runs', async () => {
        const unit = await bootMovingOnRoute(NO_GPS_SIMVARS_XML);

        // Preconditions: the unit runs and has a route, so the silence is the option and not a missing state
        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('ABC');
        expect(unit.env.sim.lastWrite('L:KLN90B_HSI_TF_FLAGS')?.value).toBe(1);

        expect(writtenGpsNames(unit).filter(n => n !== 'GPS WP CROSS TRK' && n !== 'GPS COURSE TO STEER')).toEqual([]);
        expect(unit.env.sim.keyEvents.filter(k => k.name.startsWith('K:GPS'))).toEqual([]);
    });

    // The control of the two pins: the default panel.xml writes both variables, so that a pin that sees no write is
    // looking at the right names
    it('the default panel.xml writes GPS WP CROSS TRK and GPS COURSE TO STEER', async () => {
        const unit = await bootMovingOnRoute();

        // 1 NM right of the leg; the sign follows the SDK convention (negated), see SensorsOutSimVars.test.ts
        expect(unit.env.sim.get('GPS WP CROSS TRK', 'meters')).toBeCloseTo(-1852, -1);
        // Only that the name is written, with a finite number; the value is the characterization below
        const written = unit.env.sim.lastWrite('GPS COURSE TO STEER');
        expect(written).toBeDefined();
        expect(Number.isFinite(written!.value)).toBe(true);
    });

    // No contract source beyond the unit, radians (written as a plain number): this is what the code writes today. The
    // roll steering intercepts a leg it is 1 NM right of at 45 degrees, so the course is the leg's 50.75 less 45.
    it('writes GPS COURSE TO STEER as the intercept course in radians (characterization)', async () => {
        const unit = await bootMovingOnRoute();

        const {kaaa, abc} = standardRoute();
        const legCourse = courseDeg(pointBefore(kaaa, abc, 20), abc);
        const cts = unit.env.sim.lastWrite('GPS COURSE TO STEER')!.value as number;
        expect(cts).toBeCloseTo((legCourse - 45) * Math.PI / 180, 2);
    });

    it.fails('GPS COURSE TO STEER is not written (#126)', async () => {
        const unit = await bootMovingOnRoute(NO_GPS_SIMVARS_XML);

        expect(unit.env.sim.lastWrite('GPS COURSE TO STEER')).toBeUndefined();
    });

    it.fails('GPS WP CROSS TRK is not written (#126)', async () => {
        const unit = await bootMovingOnRoute(NO_GPS_SIMVARS_XML);

        expect(unit.env.sim.lastWrite('GPS WP CROSS TRK')).toBeUndefined();
    });
});
