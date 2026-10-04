import {describe, expect, it, vi} from 'vitest';
import {bootUnit, settle} from '../harness/boot';

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

        // The acquisition time comes from the seeded random; only a generous window is asserted
        let seconds = 30;
        while (!gps.isValid()) {
            expect(seconds).toBeLessThan(900);
            await vi.advanceTimersByTimeAsync(1000);
            seconds++;
        }
        expect(seconds).toBeGreaterThan(10);
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

// Suspected bug #NEW-4-1: SensorsOut.setPos (Sensors.ts:371-373) and setWpBearing (342-345) return before the LVar write
// when Output.WriteGPSSimVars is off, unlike the other L:KLN90B_* outputs. CLAUDE.md lists the LVars and the GPS SimVars as
// separate contracts, and LVars.ts documents the LVars as outputs of the unit, so an aircraft that leaves the GPS SimVars to
// another GPS should still get the integrity flag and the bearing from the unit.
describe('LVar outputs with Output.WriteGPSSimVars off (public contract) (#NEW-4-1)', () => {
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

    it.fails('L:KLN90B_IntegrityWarn is still written (#NEW-4-1)', async () => {
        const unit = await bootUnit({panelXml: NO_GPS_SIMVARS_XML});
        await settle(unit);
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.env.sim.lastWrite('L:KLN90B_IntegrityWarn')?.value).toBe(0);
    });

    it.fails('L:KLN90B_GPS_WP_BEARING is still written (#NEW-4-1)', async () => {
        const unit = await bootUnit({panelXml: NO_GPS_SIMVARS_XML});
        await settle(unit);
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.env.sim.lastWrite('L:KLN90B_GPS_WP_BEARING')?.value).toBe(0);
    });
});
