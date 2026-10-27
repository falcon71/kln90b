import {describe, expect, it, vi} from 'vitest';
import {BootOptions, bootToSelfTest, bootUnit, HeadlessUnit, moveAircraft, settle, untilCalcTick} from '../harness/boot';
import {Screen} from '../harness/render/screen';
import {legWorld, standardRoute, variationNear} from '../harness/fixtures';
import {savedFlightplan} from '../harness/storage';
import {HEADING_INPUT, NO_GPS_SIMVARS, NO_OBS, panelXml} from '../harness/panelXml';
import {activeIdent, turnStackLength} from '../harness/readers';
import {bootOnStandardRoute} from '../harness/worldBoot';
import {NavMode} from '../../kln90b/data/VolatileMemory';
import {courseDeg, finalCourseDeg, pointBefore, pointFrom} from '../harness/flight/geo';
import {blinkCycle} from '../harness/render/blink';

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

        await vi.advanceTimersByTimeAsync(28_000); // 30 s since the boot with the 2 s above
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
        const unit = await bootUnit({panelXml: panelXml(NO_GPS_SIMVARS)});
        await settle(unit);
        const sim = unit.env.sim;

        expect(sim.lastWrite('GPS OVERRIDDEN')).toBeUndefined();
        sim.set('GPS OVERRIDDEN', 'bool', false);
        await vi.advanceTimersByTimeAsync(2000);

        expect(sim.lastWrite('GPS OVERRIDDEN')).toBeUndefined();
        expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(0);
    });
});

// Public contract: CLAUDE.md lists the LVars and the GPS SimVars as separate contracts, and LVars.ts documents the LVars as
// outputs of the unit, so an aircraft that leaves the GPS SimVars to another GPS (Output.WriteGPSSimVars off) still gets
// the integrity flag and the bearing from the unit, as it does the other L:KLN90B_* outputs.
describe('LVar outputs with Output.WriteGPSSimVars off (public contract) (#124)', () => {
    it('the gate holds the GPS SimVars back and lets the HSI flag LVar through', async () => {
        const unit = await bootUnit({panelXml: panelXml(NO_GPS_SIMVARS)});
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

    it('L:KLN90B_IntegrityWarn is still written (#124)', async () => {
        const unit = await bootUnit({panelXml: panelXml(NO_GPS_SIMVARS)});
        await settle(unit);
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.env.sim.lastWrite('L:KLN90B_IntegrityWarn')?.value).toBe(0);
    });

    it('L:KLN90B_GPS_WP_BEARING is still written (#124)', async () => {
        const unit = await bootUnit({panelXml: panelXml(NO_GPS_SIMVARS)});
        await settle(unit);
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.env.sim.lastWrite('L:KLN90B_GPS_WP_BEARING')?.value).toBe(0);
    });

    it('L:KLN90B_IntegrityWarn is 1 while the GPS has no fix and 0 once it has one', async () => {
        const unit = await bootUnit({
            coldGps: true,
            panelXml: panelXml(NO_GPS_SIMVARS),
            storage: {fastGpsAcquisition: false, lastLatitude: 47.0, lastLongitude: 8.0},
            position: {lat: 47.0, lon: 8.0},
        });
        const sim = unit.env.sim;
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.props.sensors.in.gps.isValid()).toBe(false);
        expect(sim.lastWrite('L:KLN90B_IntegrityWarn')?.value).toBe(1);

        await settle(unit);
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.props.sensors.in.gps.isValid()).toBe(true);
        expect(sim.lastWrite('L:KLN90B_IntegrityWarn')?.value).toBe(0);
        expect(sim.lastWrite('GPS MAGVAR')).toBeUndefined();
    });

    // Appendix A of the manual is the RMI bearing (LVars.ts): the magnetic bearing to the active waypoint, in radians. The
    // aircraft is 1 NM right of the first leg, so the bearing to ABC differs from the leg's course.
    it('L:KLN90B_GPS_WP_BEARING is the magnetic bearing to the active waypoint in radians', async () => {
        const {kaaa, abc} = standardRoute();
        const onLeg = pointBefore(kaaa, abc, 20);
        const p = pointFrom(onLeg, courseDeg(onLeg, abc) + 90, 1);
        const unit = await bootOnStandardRoute({position: p, magvar: 4, panelXml: panelXml(NO_GPS_SIMVARS)});
        await vi.advanceTimersByTimeAsync(3000);

        expect(activeIdent(unit)).toBe('ABC');
        const expected = (courseDeg(p, abc) - 4) * Math.PI / 180; // magnetic = true - 4 degrees east
        expect(unit.env.sim.lastWrite('L:KLN90B_GPS_WP_BEARING')!.unit).toBe('radians');
        expect(unit.env.sim.lastWrite('L:KLN90B_GPS_WP_BEARING')!.value).toBeCloseTo(expected, 4);
        // The GPS SimVar of the same quantity stays with the other GPS
        expect(unit.env.sim.lastWrite('GPS WP BEARING')).toBeUndefined();
        expect(unit.env.sim.lastWrite('GPS WP TRUE BEARING')).toBeUndefined();
    });
});

// The output keeps the frame of the aircraft (#371): the NAV 1 displays show the bearing at the active waypoint in OBS
// mode, but the RMI bearing stays the initial bearing at the aircraft with the aircraft's variation. The world of
// Nav1Page.test.ts: 64.8 NM west of KDDD on the leg to it, the variation 10 E within 1 NM of KDDD and 0 at the aircraft.
describe('L:KLN90B_GPS_WP_BEARING in OBS mode keeps the frame of the aircraft (#371)', () => {
    it('is the initial bearing with the variation of the aircraft, not the one at the waypoint', async () => {
        const {kaaa, kddd, west} = legWorld();
        const unit = await bootUnit({
            facilities: [kaaa, kddd], position: west(64.8), magvar: variationNear(kddd, 10), panelXml: panelXml(NO_OBS),
            storage: savedFlightplan(0, [kaaa, kddd]),
        });
        await settle(unit);
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_OBS);
        const expected = courseDeg(west(64.8), kddd); // 088.8 true, the variation at the aircraft is 0
        expect(Math.abs(expected - 88.8)).toBeLessThan(0.1); // The literal follows from the geometry
        const written = unit.env.sim.lastWrite('L:KLN90B_GPS_WP_BEARING')!;
        expect(written.unit).toBe('radians');
        expect(Math.abs((written.value as number) * 180 / Math.PI - expected)).toBeLessThan(0.1);
    });
});

// Public contract (CLAUDE.md, "Public contract with aircraft", the GPS SimVars): GPS WP DESIRED TRACK is the DTK or the
// OBS course in the frame of the aircraft, magnetic with the variation at the aircraft, and GPS WP TRACK ANGLE ERROR is
// that course less the track, both in radians. The OBS course shown and sent to the indicator uses the variation of the
// waypoint (#371), but these two keep the aircraft's frame, as before #371 for a waypoint that is not a VOR. The world of
// the describe above: the leg KAAA to KDDD, the aircraft 64.8 NM west of KDDD at 145 kt on track 090 true, the variation
// 10 E within 1 NM of KDDD and 0 at the aircraft.
describe('GPS WP DESIRED TRACK and GPS WP TRACK ANGLE ERROR keep the frame of the aircraft (public contract) (#371)', () => {
    async function onLegToKddd(): Promise<HeadlessUnit> {
        const {kaaa, kddd, west} = legWorld();
        const unit = await bootUnit({
            facilities: [kaaa, kddd], position: west(69.8), magvar: variationNear(kddd, 10), panelXml: panelXml(NO_OBS),
            storage: savedFlightplan(0, [kaaa, kddd]),
        });
        await settle(unit);
        await moveAircraft(unit, west(64.8), {groundspeedKt: 145, trackTrue: 90});
        return unit;
    }

    /** The last value written to the SimVar, which must be in radians, in degrees */
    function degrees(unit: HeadlessUnit, name: string): number {
        const written = unit.env.sim.lastWrite(name)!;
        expect(written.unit).toBe('radians');
        return (written.value as number) * 180 / Math.PI;
    }

    it('LEG mode: the DTK at the aircraft, 088.8, and the angle error 088.8 less the track 090', async () => {
        const unit = await onLegToKddd();
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_LEG); // Precondition
        // The DTK at the aircraft is the course of the great circle there: 088.8 true (geo.ts), 0 variation
        expect(Math.abs(degrees(unit, 'GPS WP DESIRED TRACK') - 88.8)).toBeLessThan(0.1);
        expect(Math.abs(degrees(unit, 'GPS WP TRACK ANGLE ERROR') - (88.8 - 90))).toBeLessThan(0.1);
    });

    it('OBS mode: the OBS course 090 true with the variation at the aircraft, and no angle error on track 090', async () => {
        const unit = await onLegToKddd();
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_OBS); // Precondition
        // Precondition: the unit chose the leg's course at KDDD, 090 true, shown as 080 with the variation of KDDD
        expect(Math.abs(unit.props.modeController.getDtkOrObsMagnetic()! - 80)).toBeLessThan(0.1);
        expect(Math.abs(degrees(unit, 'GPS WP DESIRED TRACK') - 90)).toBeLessThan(0.1);
        expect(Math.abs(degrees(unit, 'GPS WP TRACK ANGLE ERROR'))).toBeLessThan(0.1);
    });
});

// Public contract: LVars.ts documents L:KLN90B_HSI_TF_FLAGS without values; the values 0 (flagged), 1 (TO) and 2 (FROM)
// follow the convention of the sim's HSI TF FLAGS. 3-31: the triangle on NAV 1 behaves like the TO/FROM flag of a
// conventional CDI. The last waypoint does not sequence, so a unit that has passed it shows FROM.
describe('L:KLN90B_HSI_TF_FLAGS (public contract)', () => {
    it('is 1, TO, before the last waypoint and 2, FROM, past it (3-31)', async () => {
        const {kaaa, abc} = standardRoute();
        const unit = await bootUnit({
            facilities: [kaaa, abc],
            storage: savedFlightplan(0, [kaaa, abc]),
            position: pointBefore(kaaa, abc, 3),
        });
        await settle(unit);
        expect(activeIdent(unit)).toBe('ABC');
        expect(unit.env.sim.get('L:KLN90B_HSI_TF_FLAGS', 'enum')).toBe(1);

        await moveAircraft(unit, pointFrom(abc, finalCourseDeg(kaaa, abc), 3), {groundspeedKt: 0});
        await vi.advanceTimersByTimeAsync(1000);

        expect(activeIdent(unit)).toBe('ABC');
        expect(unit.env.sim.get('L:KLN90B_HSI_TF_FLAGS', 'enum')).toBe(2);
    });
});

// Public contract: LVars.ts, the External Annunciators wiki page: the WPT light is on during the waypoint alert. The
// Pilot's Guide (3-29, 4-8) and the Tu-154 video (https://youtu.be/S1lt2W95bLA, t=2245) show it flashing before an
// anticipated turn and steady from the start of the turn (#437). The light is written on the display tick, like the MSG
// light. firstFlight.test.ts reads it once at the start of the turn.
describe('L:KLN90B_WptLight during the waypoint alert (public contract)', () => {
    /**
     * The aircraft flies toward ABC at 120 kt in steps of 0.00833 NM, 250 ms, one per display tick; a held position would
     * sequence ABC within a few seconds. `sample` runs after each tick.
     */
    async function approachAbc(sample: (unit: HeadlessUnit) => void, steps: number, startNm = 0.8): Promise<HeadlessUnit> {
        const {kaaa, abc} = standardRoute();
        const unit = await bootOnStandardRoute({magvar: 0});
        const sim = unit.env.sim;
        await moveAircraft(unit, pointBefore(kaaa, abc, startNm), {groundspeedKt: 120, trackTrue: courseDeg(kaaa, abc)});
        for (let i = 0; i < steps; i++) {
            if (i > 0) {
                const p = pointBefore(kaaa, abc, startNm - i * 120 / 3600 / 4);
                sim.set('PLANE LATITUDE', 'degrees', p.lat);
                sim.set('PLANE LONGITUDE', 'degrees', p.lon);
                await vi.advanceTimersByTimeAsync(250);
            }
            sample(unit);
        }
        return unit;
    }

    // The turn starts about 0.3 NM before ABC (firstFlight.test.ts) and the alert 20 s earlier, about 0.7 NM at 120 kt, so
    // the unit is inside the alert from 0.8 NM on and 24 samples, 0.2 NM, end before the turn
    it('flashes before the turn (4-8, #437)', async () => {
        const samples: number[] = [];
        const alerts: boolean[] = [];
        const turnStacks: number[] = [];
        await approachAbc(unit => {
            alerts.push(unit.props.memory.navPage.waypointAlert);
            turnStacks.push(turnStackLength(unit));
            samples.push(unit.env.sim.get('L:KLN90B_WptLight', 'bool'));
        }, 24);

        expect(alerts).toEqual(Array(24).fill(true));
        expect(turnStacks).toEqual(Array(24).fill(0));
        expect(new Set(samples)).toEqual(new Set([0, 1]));
    });

    it('is steady during the turn (4-8, #437)', async () => {
        const samples: number[] = [];
        let turning = false;
        const unit = await approachAbc(() => undefined, 1);
        // Advance until the turn stack has a turn, then sample 8 display ticks, two blink cycles
        const {kaaa, abc} = standardRoute();
        for (let i = 1; i < 200 && !turning; i++) {
            const p = pointBefore(kaaa, abc, 0.8 - i * 120 / 3600 / 4);
            unit.env.sim.set('PLANE LATITUDE', 'degrees', p.lat);
            unit.env.sim.set('PLANE LONGITUDE', 'degrees', p.lon);
            await vi.advanceTimersByTimeAsync(250);
            turning = turnStackLength(unit) > 0;
        }
        expect(turning).toBe(true);
        for (let i = 0; i < 8; i++) {
            await vi.advanceTimersByTimeAsync(250);
            samples.push(unit.env.sim.get('L:KLN90B_WptLight', 'bool'));
        }

        expect(samples).toEqual(Array(8).fill(1));
    });

    // 3-29: without turn anticipation the alert starts 36 s before the waypoint (NavCalculator), 1.2 NM at 120 kt, and no
    // turn starts, so nothing makes the light steady: it flashes until the waypoint is sequenced (#437). The light is read
    // on every display tick of a blink cycle, since one read lands on the same phase every time
    it('flashes before a waypoint without an anticipated turn (3-29, #437)', async () => {
        const {kaaa, abc} = standardRoute();
        const unit = await bootOnStandardRoute({magvar: 0, storage: {turnAnticipation: false}});
        await moveAircraft(unit, pointBefore(kaaa, abc, 1.0), {groundspeedKt: 120, trackTrue: courseDeg(kaaa, abc)});

        const cycle = await blinkCycle(() => ({
            alert: unit.props.memory.navPage.waypointAlert,
            turnStack: turnStackLength(unit),
            light: unit.env.sim.get('L:KLN90B_WptLight', 'bool'),
        }));

        expect(cycle.map(c => c.alert)).toEqual([true, true, true, true]); // Precondition: inside the alert
        expect(cycle.map(c => c.turnStack)).toEqual([0, 0, 0, 0]); // Precondition: no turn
        expect(new Set(cycle.map(c => c.light))).toEqual(new Set([0, 1]));
    });

    it('is 0 before the alert', async () => {
        const {kaaa, abc} = standardRoute();
        const unit = await bootOnStandardRoute({magvar: 0});

        await moveAircraft(unit, pointBefore(kaaa, abc, 3), {groundspeedKt: 120, trackTrue: courseDeg(kaaa, abc)});

        expect(unit.props.memory.navPage.waypointAlert).toBe(false);
        expect(unit.env.sim.get('L:KLN90B_WptLight', 'bool')).toBe(0);
    });
});

// Public contract: LVars.ts and the wiki pages Autopilot, CDI/HSI and External Annunciators describe the L:KLN90B_*
// outputs. The basis is the maintainer's ruling "power-off only": the outputs go to zero when the unit is switched off,
// while a hot-swap Disabled stays a deliberate freeze (61f6b61). The outputs are written by ticks, and ticks stop when the
// unit loses power (TickController), so SensorsOut.setPoweredOff writes the zero state once on the power event. The
// outputs it zeroes are the roll command, the HSI flag (0 is flagged), the MSG, WPT and annunciator test lights, the
// integrity warning and the RMI bearing (the maintainer wants a switched-off unit to go silent); the switch positions (L:KLN90B_Power, L:KLN90B_RightScan) are not outputs of the unit. Installation Manual 2-69 states that
// the annunciators light during the self-test (setup B).
describe('outputs at power-off (public contract)', () => {
    const BLANK_SCREEN = Array.from({length: 7}, () => ' '.repeat(23)).join('\n');

    /** Setup A: banking towards the leg, 2 NM right of the course, the leg to the left. `opts` adds to the boot */
    async function banking(opts: BootOptions = {}) {
        const {kaaa, abc} = standardRoute();
        const unit = await bootOnStandardRoute({panelXml: panelXml(HEADING_INPUT), magvar: 0, ...opts});
        const mid = pointBefore(kaaa, abc, 10);
        const dtk = courseDeg(mid, abc);
        await moveAircraft(unit, pointFrom(mid, dtk + 90, 2), {groundspeedKt: 120, trackTrue: dtk});
        return unit;
    }

    /** Setup B: the self-test page, where the annunciators are lit */
    async function onSelfTestPage() {
        return bootToSelfTest({magvar: 0, panelXml: panelXml(HEADING_INPUT)});
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

    // Installation Manual 2-69: the annunciator lights are lit during the self-test, not flashing (#437). The alert is on
    // during the self-test (NavCalculator), so only the steady branch keeps the light from flashing; one read lands on the
    // same phase every time, so the light is read on every display tick of a blink cycle
    it('the WPT light is steady, not flashing, on the self-test page (2-69, #437)', async () => {
        const unit = await onSelfTestPage();
        expect(unit.props.memory.navPage.waypointAlert).toBe(true); // Precondition: the alert is on

        const cycle = await blinkCycle(() => unit.env.sim.get('L:KLN90B_WptLight', 'bool'));

        expect(cycle).toHaveLength(4);
        expect(new Set(cycle)).toEqual(new Set([1]));
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

    it('the roll command is 0 (#135)', async () => {
        const unit = await banking();

        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.env.sim.get('L:KLN90B_RollCommand', 'degrees')).toBe(0);
    });

    it('the HSI flag is 0, flagged (#135)', async () => {
        const unit = await banking();

        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.env.sim.get('L:KLN90B_HSI_TF_FLAGS', 'enum')).toBe(0);
    });

    it('the MSG light is 0 (#135)', async () => {
        const unit = await onSelfTestPage();

        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.env.sim.get('L:KLN90B_MsgLight', 'bool')).toBe(0);
    });

    it('the WPT light is 0 (#135)', async () => {
        const unit = await onSelfTestPage();

        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.env.sim.get('L:KLN90B_WptLight', 'bool')).toBe(0);
    });

    it('the annunciator test is 0 (#135)', async () => {
        const unit = await onSelfTestPage();

        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.env.sim.get('L:KLN90B_AnnunTest', 'bool')).toBe(0);
    });

    /** The names of the GPS SimVars written since the snapshot of the write count */
    const gpsWritesSince = (unit: HeadlessUnit, count: number) =>
        [...new Set(unit.env.sim.writes.slice(count).map(w => w.name.toUpperCase()).filter(n => n.startsWith('GPS ')))];

    it('writes the zero state also with Output.WriteGPSSimVars off', async () => {
        const {kaaa, abc} = standardRoute();
        const unit = await bootOnStandardRoute({panelXml: panelXml({...HEADING_INPUT, ...NO_GPS_SIMVARS}), magvar: 0});
        const mid = pointBefore(kaaa, abc, 10);
        const dtk = courseDeg(mid, abc);
        await moveAircraft(unit, pointFrom(mid, dtk + 90, 2), {groundspeedKt: 120, trackTrue: dtk});
        expect(unit.env.sim.get('L:KLN90B_RollCommand', 'degrees')).toBeCloseTo(25, 6);

        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.env.sim.get('L:KLN90B_RollCommand', 'degrees')).toBe(0);
        expect(unit.env.sim.get('L:KLN90B_HSI_TF_FLAGS', 'enum')).toBe(0);
    });

    it('leaves the GPS SimVars alone: only GPS OVERRIDDEN is asserted again', async () => {
        const unit = await banking();
        const written = unit.env.sim.writes.length;

        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(3000);

        expect(gpsWritesSince(unit, written)).toEqual(['GPS OVERRIDDEN']);
    });

    it('zeroes the outputs when the aircraft power is lost, not only at the power switch', async () => {
        const unit = await bootToSelfTest({
            magvar: 0, panelXml: panelXml({...HEADING_INPUT, 'Input.ElectricitySimVar': 'CIRCUIT ON:1'}),
            simVars: [{name: 'CIRCUIT ON:1', unit: 'bool', value: 1}],
        });
        await vi.advanceTimersByTimeAsync(1000);
        expect(unit.env.sim.get('L:KLN90B_MsgLight', 'bool')).toBe(1);
        expect(unit.env.sim.get('L:KLN90B_AnnunTest', 'bool')).toBe(1);

        unit.env.sim.set('CIRCUIT ON:1', 'bool', false);
        await vi.advanceTimersByTimeAsync(3000);

        expect(Screen.read().text()).toBe(BLANK_SCREEN);
        expect(unit.env.sim.get('L:KLN90B_MsgLight', 'bool')).toBe(0);
        expect(unit.env.sim.get('L:KLN90B_WptLight', 'bool')).toBe(0);
        expect(unit.env.sim.get('L:KLN90B_AnnunTest', 'bool')).toBe(0);
    });

    it('writes the outputs again when the unit is switched back on', async () => {
        const unit = await onSelfTestPage();

        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(3000);
        expect(unit.env.sim.get('L:KLN90B_AnnunTest', 'bool')).toBe(0);
        unit.send('KLN90B_Power_On');
        await vi.advanceTimersByTimeAsync(19_000); // the Turn-On page, then the self-test page

        expect(unit.env.sim.get('L:KLN90B_MsgLight', 'bool')).toBe(1);
        expect(unit.env.sim.get('L:KLN90B_WptLight', 'bool')).toBe(1);
        expect(unit.env.sim.get('L:KLN90B_AnnunTest', 'bool')).toBe(1);
    });

    // Hot swapping (wiki page Hot Swapping and Package Detection) freezes the outputs; only the power takes them to zero
    it('keeps the outputs of a unit that is only disabled for hot swapping', async () => {
        const unit = await banking();

        unit.env.sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.env.sim.get('L:KLN90B_RollCommand', 'degrees')).toBeCloseTo(25, 6);
        expect(unit.env.sim.get('L:KLN90B_HSI_TF_FLAGS', 'enum')).toBe(1);
    });

    // The freeze exists so that the unit resumes where it left off; a unit that is off has nothing to resume (maintainer).
    // A disabled unit ignores the power H events (#138, the maintainer's ruling), so it is switched off by the aircraft
    // power, Input.ElectricitySimVar
    it('zeroes the outputs of a unit that is switched off while it is disabled for hot swapping', async () => {
        const unit = await banking({
            panelXml: panelXml({...HEADING_INPUT, 'Input.ElectricitySimVar': 'CIRCUIT ON:1'}),
            simVars: [{name: 'CIRCUIT ON:1', unit: 'bool', value: 1}],
        });
        unit.env.sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);
        expect(unit.env.sim.get('L:KLN90B_RollCommand', 'degrees')).toBeCloseTo(25, 6); // Precondition: frozen

        unit.env.sim.set('CIRCUIT ON:1', 'bool', false);
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.env.sim.get('L:KLN90B_RollCommand', 'degrees')).toBe(0);
        expect(unit.env.sim.get('L:KLN90B_HSI_TF_FLAGS', 'enum')).toBe(0);
        expect(unit.env.sim.get('L:KLN90B_GPS_WP_BEARING', 'radians')).toBe(0);
    });

    it('sibling C: the RMI bearing is the bearing to ABC (magvar 0) and the integrity warning 0 before the power-off', async () => {
        const unit = await banking();
        const {kaaa, abc} = standardRoute();
        const mid = pointBefore(kaaa, abc, 10);
        const aircraft = pointFrom(mid, courseDeg(mid, abc) + 90, 2); // The position of banking()

        expect(unit.env.sim.get('L:KLN90B_GPS_WP_BEARING', 'degrees')).toBeCloseTo(courseDeg(aircraft, abc), 2);
        expect(unit.env.sim.get('L:KLN90B_IntegrityWarn', 'bool')).toBe(0);
    });

    it('the RMI bearing is 0', async () => {
        const unit = await banking();

        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.env.sim.get('L:KLN90B_GPS_WP_BEARING', 'radians')).toBe(0);
    });

    // The warning is 1 while the GPS has no fix (#87); the dark unit drives nothing, so it is 0
    it('the integrity warning is 0', async () => {
        const unit = await bootUnit({
            coldGps: true,
            storage: {fastGpsAcquisition: false, lastLatitude: 47.0, lastLongitude: 8.0},
            position: {lat: 47.0, lon: 8.0},
        });
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.env.sim.get('L:KLN90B_IntegrityWarn', 'bool')).toBe(1); // Precondition: no fix yet

        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.env.sim.get('L:KLN90B_IntegrityWarn', 'bool')).toBe(0);
    });

    it('zeroes the RMI bearing and the integrity warning also with Output.WriteGPSSimVars off', async () => {
        const {kaaa, abc} = standardRoute();
        const unit = await bootOnStandardRoute({panelXml: panelXml({...HEADING_INPUT, ...NO_GPS_SIMVARS}), magvar: 0});
        const mid = pointBefore(kaaa, abc, 10);
        const dtk = courseDeg(mid, abc);
        await moveAircraft(unit, pointFrom(mid, dtk + 90, 2), {groundspeedKt: 120, trackTrue: dtk});
        expect(unit.env.sim.get('L:KLN90B_GPS_WP_BEARING', 'degrees')).toBeCloseTo(courseDeg(pointFrom(mid, dtk + 90, 2), abc), 2); // Precondition

        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.env.sim.get('L:KLN90B_GPS_WP_BEARING', 'radians')).toBe(0);
        expect(unit.env.sim.get('L:KLN90B_IntegrityWarn', 'bool')).toBe(0);
    });
});

// Public contract: with Output.WriteGPSSimVars false the unit writes no GPS SimVar and no K:GPS key event; the wiki page
// panel.xml customization lists the variables under "If set to true", and CLAUDE.md, "Public contract with aircraft",
// names the option. An aircraft that turns the option off leaves the GPS SimVars to another GPS. The unit is the known
// state of SensorsOutSimVars.test.ts: ABC active, 1 NM right of the first leg, moving at 120 kt, so every output has a
// value to write.
describe('GPS SimVars with Output.WriteGPSSimVars off (public contract) (#126)', () => {
    async function bootMovingOnRoute(xml?: string): Promise<HeadlessUnit> {
        const {kaaa, abc} = standardRoute();
        const onLeg = pointBefore(kaaa, abc, 20);
        const legCourse = courseDeg(onLeg, abc);
        const p = pointFrom(onLeg, legCourse + 90, 1);
        const unit = await bootOnStandardRoute({position: p, magvar: 4, panelXml: xml});
        await moveAircraft(unit, p, {groundspeedKt: 120, trackTrue: (legCourse + 10) % 360});
        await vi.advanceTimersByTimeAsync(4000);
        return unit;
    }

    /** The names written from the GPS SimVar namespace; FakeSim stores them in upper case */
    const writtenGpsNames = (unit: HeadlessUnit) =>
        [...new Set(unit.env.sim.writes.map(w => w.name.toUpperCase()).filter(n => n.startsWith('GPS ')))].sort();

    it('writes no GPS SimVar and no K:GPS key event while the unit runs', async () => {
        const unit = await bootMovingOnRoute(panelXml(NO_GPS_SIMVARS));

        // Preconditions: the unit runs and has a route, so the silence is the option and not a missing state
        expect(activeIdent(unit)).toBe('ABC');
        expect(unit.env.sim.lastWrite('L:KLN90B_HSI_TF_FLAGS')?.value).toBe(1);

        expect(writtenGpsNames(unit)).toEqual([]);
        expect(unit.env.sim.keyEvents.filter(k => k.name.startsWith('K:GPS'))).toEqual([]);
    });

    // The control of the two pins: the default panel.xml writes both variables, so that a pin that sees no write is
    // looking at the right names
    it('the default panel.xml writes GPS WP CROSS TRK and GPS COURSE TO STEER', async () => {
        const unit = await bootMovingOnRoute();

        // 1 NM right of the leg; the sign follows the SDK convention (negated), see SensorsOutSimVars.test.ts
        expect(unit.env.sim.get('GPS WP CROSS TRK', 'meters')).toBeCloseTo(-1852, -1);
        // Only that the name is written, with a finite number: the value has no contract source (the code adds the
        // variable on its own), so the characterization test below holds it
        const written = unit.env.sim.lastWrite('GPS COURSE TO STEER');
        expect(written).toBeDefined();
        expect(Number.isFinite(written!.value)).toBe(true);
    });

    // No contract source beyond the unit, radians (written as a plain number): this is what the code writes today. The
    // roll steering intercepts a leg it is 1 NM right of at 45 degrees, so the course is the leg's 50.75 less 45. It boots
    // with the heading input, because without one the course is 0 (the maintainer's decision, 2026-10-19, #143; held in
    // RollSteeringController.test.ts)
    it('writes GPS COURSE TO STEER as the intercept course in radians (characterization)', async () => {
        const unit = await bootMovingOnRoute(panelXml(HEADING_INPUT));

        const {kaaa, abc} = standardRoute();
        const legCourse = courseDeg(pointBefore(kaaa, abc, 20), abc);
        const cts = unit.env.sim.lastWrite('GPS COURSE TO STEER')!.value as number;
        expect(cts).toBeCloseTo((legCourse - 45) * Math.PI / 180, 2);
    });

    it('GPS COURSE TO STEER is not written (#126)', async () => {
        const unit = await bootMovingOnRoute(panelXml(NO_GPS_SIMVARS));

        expect(unit.env.sim.lastWrite('GPS COURSE TO STEER')).toBeUndefined();
    });

    it('GPS WP CROSS TRK is not written (#126)', async () => {
        const unit = await bootMovingOnRoute(panelXml(NO_GPS_SIMVARS));

        expect(unit.env.sim.lastWrite('GPS WP CROSS TRK')).toBeUndefined();
    });

    // Roll steering needs the heading input (2-69, #143), so this one boots with it
    it('L:KLN90B_RollCommand is still written, as an output of the unit', async () => {
        const unit = await bootMovingOnRoute(panelXml({...NO_GPS_SIMVARS, ...HEADING_INPUT}));

        // 1 NM right of the leg and on a track 10 degrees to the right of it, so the command is the full left bank (25
        // degrees, as in the power-off tests)
        const written = unit.env.sim.lastWrite('L:KLN90B_RollCommand');
        expect(written).toBeDefined();
        expect(written!.value).toBeCloseTo(25, 6);
    });
});

// Public contract (#158): L:KLN90B_XTK is the cross track the unit sends on ARINC 429 label 116 (GAMA ARINC 429 General
// Aviation Subset: nautical miles, positive = fly left), for EFIS displays that take the digital data. Being digital it
// is not smoothed like the analog D-bar, which GPS WP CROSS TRK follows (SignalOutputFilter), so it is opt-in. It is an
// output of the unit, written whatever Output.WriteGPSSimVars says.
describe('L:KLN90B_XTK, the ARINC 429 cross track (public contract) (#158)', () => {
    /** ABC active, 1 NM right of the first leg (fly left), moving at 120 kt along the leg */
    async function bootRightOfLeg(xml?: string) {
        const {kaaa, abc} = standardRoute();
        const onLeg = pointBefore(kaaa, abc, 20);
        const legCourse = courseDeg(onLeg, abc);
        const p = pointFrom(onLeg, legCourse + 90, 1);
        const unit = await bootOnStandardRoute({position: p, magvar: 0, panelXml: xml});
        await moveAircraft(unit, p, {groundspeedKt: 120, trackTrue: legCourse});
        return {unit, onLeg, legCourse};
    }

    it('is the cross track in nautical miles, positive to fly left', async () => {
        const {unit} = await bootRightOfLeg();

        expect(activeIdent(unit)).toBe('ABC'); // Precondition
        expect(unit.env.sim.get('L:KLN90B_XTK', 'nautical miles')).toBeCloseTo(1, 3);
    });

    it('is written also with Output.WriteGPSSimVars off', async () => {
        const {unit} = await bootRightOfLeg(panelXml(NO_GPS_SIMVARS));

        expect(unit.env.sim.get('L:KLN90B_XTK', 'nautical miles')).toBeCloseTo(1, 3);
    });

    it('is 0 without an active waypoint', async () => {
        const unit = await bootUnit();
        await settle(unit);

        expect(unit.props.memory.navPage.xtkToActive).toBeNull(); // Precondition
        expect(unit.env.sim.lastWrite('L:KLN90B_XTK')?.value).toBe(0);
    });

    // The aircraft jumps from 1 NM right of the leg to 1 NM left of it. Right after the calculation tick the LVar is the
    // new cross track, while the smoothed GPS WP CROSS TRK (negated: +1 NM is 1 NM left) is still on its way there: the
    // calculation tick ran 0 to 250 ms ago and τ = 0.24 s, so at least a third of the 2 NM is left to go.
    it('is not smoothed: right after a jump across the leg it is the new cross track', async () => {
        const {unit, onLeg, legCourse} = await bootRightOfLeg();
        const left = pointFrom(onLeg, legCourse - 90, 1);
        unit.env.sim.set('PLANE LATITUDE', 'degrees', left.lat);
        unit.env.sim.set('PLANE LONGITUDE', 'degrees', left.lon);
        await untilCalcTick(unit);

        expect(unit.props.memory.navPage.xtkToActive).toBeCloseTo(-1, 3); // Precondition: the unit has the new position
        expect(unit.env.sim.get('L:KLN90B_XTK', 'nautical miles')).toBeCloseTo(-1, 3);
        expect(unit.env.sim.get('GPS WP CROSS TRK', 'nautical miles')).toBeLessThan(0.4);

        // Sibling: the smoothed output gets there too, 12 τ later
        await vi.advanceTimersByTimeAsync(3000);
        expect(unit.env.sim.get('GPS WP CROSS TRK', 'nautical miles')).toBeCloseTo(-unit.env.sim.get('L:KLN90B_XTK', 'nautical miles'), 4);
    });

    it('is 0 at the power-off', async () => {
        const {unit} = await bootRightOfLeg();
        expect(unit.env.sim.get('L:KLN90B_XTK', 'nautical miles')).toBeCloseTo(1, 3); // Precondition

        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.env.sim.get('L:KLN90B_XTK', 'nautical miles')).toBe(0);
    });
});

// The D-bar filter's capacitor discharges while the unit is off, so after a power cycle GPS WP CROSS TRK starts from 0
// rather than from the deviation before the power-off. The first signal tick runs 62 ms after the power-on, before the
// first calculation tick.
describe('GPS WP CROSS TRK after a power cycle (#158)', () => {
    it('starts from 0', async () => {
        const {kaaa, abc} = standardRoute();
        const onLeg = pointBefore(kaaa, abc, 20);
        const p = pointFrom(onLeg, courseDeg(onLeg, abc) + 90, 1);
        const unit = await bootOnStandardRoute({position: p, magvar: 0});
        await moveAircraft(unit, p, {groundspeedKt: 120, trackTrue: courseDeg(onLeg, abc)});
        expect(unit.env.sim.get('GPS WP CROSS TRK', 'nautical miles')).toBeCloseTo(-1, 3); // Precondition

        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(3000);
        unit.send('KLN90B_Power_On');
        await vi.advanceTimersByTimeAsync(100);

        expect(unit.env.sim.get('GPS WP CROSS TRK', 'nautical miles')).toBe(0);
    });
});
