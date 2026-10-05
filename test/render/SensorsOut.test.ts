import {describe, expect, it, vi} from 'vitest';
import {bootUnit, moveAircraft, settle} from '../harness/boot';
import {Screen} from '../harness/render/screen';
import {standardRoute} from '../harness/fixtures';
import {savedFlightplan} from '../harness/storage';
import {courseDeg, finalCourseDeg, pointBefore, pointFrom} from '../harness/flight/geo';

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

// Public contract: LVars.ts documents L:KLN90B_HSI_TF_FLAGS without values; the values 0 (flagged), 1 (TO) and 2 (FROM)
// follow the convention of the sim's HSI TF FLAGS. 3-31: the triangle on NAV 1 points to TO or FROM, and a unit that has
// passed the last waypoint shows FROM, because the last waypoint does not sequence.
describe('L:KLN90B_HSI_TF_FLAGS (public contract)', () => {
    it('is 1, TO, before the last waypoint and 2, FROM, past it (3-31)', async () => {
        const {kaaa, abc} = standardRoute();
        const unit = await bootUnit({
            facilities: [kaaa, abc],
            storage: savedFlightplan(0, [kaaa, abc]),
            position: pointBefore(kaaa, abc, 3),
        });
        await settle(unit);
        const active = () => unit.props.memory.navPage.activeWaypoint.getActiveWpt()?.icaoStruct.ident;
        expect(active()).toBe('ABC');
        expect(unit.env.sim.get('L:KLN90B_HSI_TF_FLAGS', 'enum')).toBe(1);

        await moveAircraft(unit, pointFrom(abc, finalCourseDeg(kaaa, abc), 3), {groundspeedKt: 0});
        await vi.advanceTimersByTimeAsync(1000);

        expect(active()).toBe('ABC');
        expect(unit.env.sim.get('L:KLN90B_HSI_TF_FLAGS', 'enum')).toBe(2);
    });
});

// Public contract: LVars.ts, the External Annunciators wiki page: the WPT light is 1 during the alert. The Pilot's Guide
// (3-29, 4-8) describes a flashing annunciator, but the maintainer ruled that a steady light is correct (the code cites a
// video of the real unit, NavCalculator.ts), so this test asserts the ruling, not the manual. firstFlight.test.ts reads the
// light once at the start of the turn, not at every sample of the alert.
describe('L:KLN90B_WptLight during the waypoint alert (public contract)', () => {
    it('is 1 at every sample while the alert is on', async () => {
        const {kaaa, abc, kbbb} = standardRoute();
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb],
            storage: savedFlightplan(0, [kaaa, abc, kbbb]),
            position: {lat: kaaa.lat, lon: kaaa.lon},
            magvar: 0,
        });
        await settle(unit);
        // The turn starts about 0.3 NM before ABC (firstFlight.test.ts) and the alert 20 s earlier, about 0.7 NM at 120 kt,
        // so the unit is inside the alert from 0.8 NM on. A held position would sequence ABC within a few seconds, so the
        // aircraft advances 0.0333 NM, one second at 120 kt, between the samples. The LVar changes once per calculation tick
        const samples: number[] = [];
        const alerts: boolean[] = [];
        for (let i = 0; i < 6; i++) {
            await moveAircraft(unit, pointBefore(kaaa, abc, 0.8 - i * 120 / 3600), {groundspeedKt: 120, trackTrue: i === 0 ? courseDeg(kaaa, abc) : undefined});
            alerts.push(unit.props.memory.navPage.waypointAlert);
            samples.push(unit.env.sim.get('L:KLN90B_WptLight', 'bool'));
        }

        expect(alerts).toEqual(Array(6).fill(true));
        expect(samples).toEqual(Array(6).fill(1));
    });

    it('is 0 before the alert', async () => {
        const {kaaa, abc, kbbb} = standardRoute();
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb],
            storage: savedFlightplan(0, [kaaa, abc, kbbb]),
            position: {lat: kaaa.lat, lon: kaaa.lon},
            magvar: 0,
        });
        await settle(unit);

        await moveAircraft(unit, pointBefore(kaaa, abc, 3), {groundspeedKt: 120, trackTrue: courseDeg(kaaa, abc)});

        expect(unit.props.memory.navPage.waypointAlert).toBe(false);
        expect(unit.env.sim.get('L:KLN90B_WptLight', 'bool')).toBe(0);
    });
});

// Public contract: LVars.ts and the wiki pages Autopilot, CDI/HSI and External Annunciators describe the L:KLN90B_*
// outputs. Installation Manual 2-69: the annunciator outputs are inactive unless the unit drives them. The outputs are
// written by ticks, and ticks stop when the unit loses power (TickController), so a switched-off unit keeps its last
// values. SensorsOut.reset writes nothing for the LVars. Disabled is a deliberate freeze (61f6b61) and not pinned here.
describe('outputs at power-off (public contract)', () => {
    const HEADING_INPUT_XML = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input><HeadingInput>true</HeadingInput></Input></Instrument></PlaneHTMLConfig>';
    const BLANK_SCREEN = Array.from({length: 7}, () => ' '.repeat(23)).join('\n');

    /** Setup A: banking towards the leg, 2 NM right of the course, the leg to the left */
    async function banking() {
        const {kaaa, abc, kbbb} = standardRoute();
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb],
            storage: savedFlightplan(0, [kaaa, abc, kbbb]),
            position: {lat: kaaa.lat, lon: kaaa.lon},
            panelXml: HEADING_INPUT_XML,
            magvar: 0,
        });
        await settle(unit);
        const mid = pointBefore(kaaa, abc, 10);
        const dtk = courseDeg(mid, abc);
        await moveAircraft(unit, pointFrom(mid, dtk + 90, 2), {groundspeedKt: 120, trackTrue: dtk});
        return unit;
    }

    /** Setup B: the self-test page, where the annunciators are lit */
    async function onSelfTestPage() {
        const unit = await bootUnit({engineRunning: false, magvar: 0, panelXml: HEADING_INPUT_XML});
        await unit.panel.powerOn();
        await vi.advanceTimersByTimeAsync(19_000);
        expect(Screen.read().text()).toContain('APPROVE?');
        return unit;
    }

    it('sibling A: the roll command is 25 and the HSI flag 1 before the power-off, and the switch-off blanks the unit', async () => {
        const unit = await banking();
        expect(unit.env.sim.get('L:KLN90B_RollCommand', 'degrees')).toBeCloseTo(25, 6);
        expect(unit.env.sim.get('L:KLN90B_HSI_TF_FLAGS', 'enum')).toBe(1);

        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.env.sim.get('L:KLN90B_Power', 'bool')).toBe(0);
        expect(Screen.read().text()).toBe(BLANK_SCREEN);
    });

    it('sibling B: MSG, WPT and the annunciator test are 1 on the self-test page, and the switch-off blanks the unit', async () => {
        const unit = await onSelfTestPage();
        await vi.advanceTimersByTimeAsync(1000);
        expect(unit.env.sim.get('L:KLN90B_MsgLight', 'bool')).toBe(1);
        expect(unit.env.sim.get('L:KLN90B_WptLight', 'bool')).toBe(1);
        expect(unit.env.sim.get('L:KLN90B_AnnunTest', 'bool')).toBe(1);

        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.env.sim.get('L:KLN90B_Power', 'bool')).toBe(0);
        expect(Screen.read().text()).toBe(BLANK_SCREEN);
    });

    it.fails('the roll command is 0 (#NEW-3-1)', async () => {
        const unit = await banking();

        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.env.sim.get('L:KLN90B_RollCommand', 'degrees')).toBe(0);
    });

    it.fails('the HSI flag is 0, flagged (#NEW-3-2)', async () => {
        const unit = await banking();

        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.env.sim.get('L:KLN90B_HSI_TF_FLAGS', 'enum')).toBe(0);
    });

    it.fails('the MSG light is 0 (#NEW-3-3)', async () => {
        const unit = await onSelfTestPage();

        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.env.sim.get('L:KLN90B_MsgLight', 'bool')).toBe(0);
    });

    it.fails('the WPT light is 0 (#NEW-3-4)', async () => {
        const unit = await onSelfTestPage();

        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.env.sim.get('L:KLN90B_WptLight', 'bool')).toBe(0);
    });

    it.fails('the annunciator test is 0 (#NEW-3-5)', async () => {
        const unit = await onSelfTestPage();

        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.env.sim.get('L:KLN90B_AnnunTest', 'bool')).toBe(0);
    });
});
