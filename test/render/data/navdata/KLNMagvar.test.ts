import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../../harness/boot';
import {airport, vor} from '../../../harness/navdata/builders';
import {savedFlightplan} from '../../../harness/storage';
import {NO_OBS, panelXml} from '../../../harness/panelXml';
import {activeIdent, messages} from '../../../harness/readers';
import {angleDiff, finalCourseDeg} from '../../../harness/flight/geo';
import {Screen} from '../../../harness/render/screen';
import {NavMode} from '../../../../kln90b/data/VolatileMemory';

const MAGVAR_INVALID = 'MAGNETIC VAR INVALID ALL DATA REFERENCED TO TRUE NORTH';

/** The TK row of NAV 3 */
async function nav3Track(unit: HeadlessUnit): Promise<string> {
    return (await unit.panel.show('L', 'NAV 3'))[2];
}

// 3-1 and 5-44: the primary coverage area, with the magnetic variation of the database, runs from N 74 to S 60. The N 74
// side is in PersistentMessages.test.ts.
describe('MAGNETIC VAR INVALID at the southern limit (3-1, 5-44, B-2)', () => {
    it('shows at S 60.5 (3-1, 5-44, B-2)', async () => {
        const unit = await bootUnit({position: {lat: -60.5, lon: 8.0}});
        await settle(unit);

        expect(messages(unit)).toContain(MAGVAR_INVALID);
    });

    it('does not show at S 59.5 (3-1, 5-44, B-2)', async () => {
        const unit = await bootUnit({position: {lat: -59.5, lon: 8.0}});
        await settle(unit);

        expect(messages(unit)).not.toContain(MAGVAR_INVALID);
        // The list is the live one: the empty storage has no last position, so the first fix differs from it
        expect(messages(unit)).toContain('POSITION DIFFERS FROM LAST POSITION BY >2NM');
    });
});

// 5-44: outside the primary coverage area all navigation data is referenced to true north, unless the pilot enters a
// magnetic variation on SET 2. The world's variation is 10 E everywhere, so a magnetic track is the true track less 10.
// The unit settles inside the area first, so that it has a database variation to lose.
describe('the reference of the displayed track outside the coverage area', () => {
    async function flownOut() {
        const unit = await bootUnit({position: {lat: 73.5, lon: 8.0}, magvar: 10});
        await settle(unit);
        await moveAircraft(unit, {lat: 73.5, lon: 8.0}, {groundspeedKt: 120, trackTrue: 90});
        expect(await nav3Track(unit)).toBe('TK     080°'); // Inside: magnetic, 090 true less 10 E
        await moveAircraft(unit, {lat: 74.5, lon: 8.0}, {groundspeedKt: 120, trackTrue: 90});
        return unit;
    }

    it('shows the track true outside the area (5-44)', async () => {
        const unit = await flownOut();

        expect(await nav3Track(unit)).toBe('TK     090°');
    });

    it('shows the track with the variation the pilot entered on SET 2 (5-44)', async () => {
        const unit = await flownOut();
        // What MagvarEditor on SET 2 line 6 stores for 5 E (east positive, see the west case in PersistentMessages)
        unit.props.memory.navPage.userMagvar = 5;
        await vi.advanceTimersByTimeAsync(1000);

        expect(await nav3Track(unit)).toBe('TK     085°');
        expect(messages(unit)).not.toContain(MAGVAR_INVALID);
    });

    // KLNMagvar.tick sets the pilot's variation to 0 on every tick inside the area, so a variation entered outside is
    // gone after a visit inside
    it('forgets the pilot-entered variation once back inside the area (characterization)', async () => {
        const unit = await flownOut();
        unit.props.memory.navPage.userMagvar = 5;
        await moveAircraft(unit, {lat: 73.5, lon: 8.0}, {groundspeedKt: 120, trackTrue: 270});
        expect(unit.props.memory.navPage.userMagvar).toBe(0);

        await moveAircraft(unit, {lat: 74.5, lon: 8.0}, {groundspeedKt: 120, trackTrue: 90});

        expect(messages(unit)).toContain(MAGVAR_INVALID);
        expect(await nav3Track(unit)).toBe('TK     090°');
    });
});

// 5-44: the same holds in OBS mode while the active waypoint lies outside the area, even with the aircraft inside it.
// KFAR is at N 75; the aircraft is at N 73.5 on the leg KAAA - KFAR, inside the area.
describe('OBS mode with the active waypoint outside the coverage area', () => {
    const kaaa = airport('KAAA', 73.0, 8.0);
    const kfar = airport('KFAR', 75.0, 8.0);
    const OBS_SOURCE_OFF = panelXml(NO_OBS);

    async function toKfar() {
        const unit = await bootUnit({
            facilities: [kaaa, kfar], position: {lat: 73.5, lon: 8.0}, magvar: 10, panelXml: OBS_SOURCE_OFF,
            storage: savedFlightplan(0, [kaaa, kfar]),
        });
        await settle(unit);
        expect(activeIdent(unit)).toBe('KFAR');
        return unit;
    }

    // The counterpart of the OBS tests below: in Leg mode, with the aircraft inside the area, the message stays away
    it('does not show the message in Leg mode, with the aircraft inside the area (5-44)', async () => {
        const unit = await toKfar();

        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_LEG);
        expect(messages(unit)).not.toContain(MAGVAR_INVALID);
        // The list is the live one: the empty storage has no last position, so the first fix differs from it
        expect(messages(unit)).toContain('POSITION DIFFERS FROM LAST POSITION BY >2NM');
    });

    // The unit enters OBS mode on the leg to KFAR, which runs due north (characterization)
    it('switches to OBS mode with KFAR active (characterization, #190)', async () => {
        const unit = await toKfar();
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(2000);

        const nav = unit.props.memory.navPage;
        expect(nav.navmode).toBe(NavMode.ENR_OBS);
        expect(activeIdent(unit)).toBe('KFAR');
        expect(finalCourseDeg(kaaa, kfar)).toBeCloseTo(0, 5); // The leg runs due north
    });

    // 5-44: in OBS mode with the active waypoint outside the area the unit shows the message, although the aircraft is
    // still inside it
    it('shows MAGNETIC VAR INVALID in OBS mode (5-44, #190)', async () => {
        const unit = await toKfar();
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(2000);

        expect(messages(unit)).toContain(MAGVAR_INVALID);
    });

    // ObsSource 0: the unit chooses the OBS course itself, the DTK (000 true). Referenced to true north it is 000, not
    // 350 (000 less 10 E)
    it('chooses the OBS course referenced to true north (5-44, #190)', async () => {
        const unit = await toKfar();
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.props.modeController.getObsMag()).toBeCloseTo(0, 1);
    });

    // 5-44: in OBS mode with the active waypoint outside the area the unit references to true north; this holds for an
    // active VOR too, although 5-35 has an active VOR use its own variation inside the area (the maintainer's reading of
    // the two pages for #190). VFA at N 75 has a published variation of 10 E (the sim stores east as negative). Its ident
    // has three letters, so that it fits the row of NAV 2, which shows it as the nearest VOR
    it('references an active VOR outside the area to true north too (5-44, #190)', async () => {
        const vfar = vor('VFA', 75.0, 8.0, {magneticVariation: -10});
        const unit = await bootUnit({
            facilities: [kaaa, vfar], position: {lat: 73.5, lon: 8.0}, magvar: 10, panelXml: OBS_SOURCE_OFF,
            storage: savedFlightplan(0, [kaaa, vfar]),
        });
        await settle(unit);
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(2000);

        expect(activeIdent(unit)).toBe('VFA');
        expect(unit.props.modeController.getObsMag()).toBeCloseTo(0, 1);
    });

    // 5-44: with the variation invalid the pilot may enter one on SET 2, and the unit uses it. Checked in the KLN 89
    // trainer, 2026-10-25 (the second OBS block): a changed SET 2 variation keeps the true course and the line, and the
    // course shown changes by the variation. The course is 000 true through KFAR; 9°E entered makes it 351, and the
    // aircraft, on the line 90 NM before KFAR, stays on it (a line turned by 9° about KFAR would put it about 14 NM off)
    it('keeps the OBS line and shows the course with a variation entered on SET 2 (5-44, checked in the KLN 89 trainer, 2026-10-25, #425)', async () => {
        const unit = await toKfar();
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(2000);
        const nav = unit.props.memory.navPage;
        expect(Math.abs(nav.xtkToActive!)).toBeLessThan(0.05); // Preconditions: on the line, 000 shown
        expect(unit.props.modeController.getObsMag()).toBeCloseTo(0, 6);

        await unit.panel.selectPage('L', 'SET 2');
        await unit.panel.cursor('L'); // the time zone
        await unit.panel.outer('L', 1); // line 6, the variation
        await unit.panel.inner('L', 1); // the tens: the first click gives its first choice
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 10); // the first click gives 0, so the tenth is 9
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1); // E
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(2000);
        expect(nav.userMagvar).toBe(9); // Precondition: 9°E entered

        expect(Math.abs(angleDiff(unit.props.modeController.getObsMag(), 351))).toBeLessThan(1e-6);
        expect(Screen.read().status().mode).toMatch(/^enr:351/);
        expect(Math.abs(nav.xtkToActive!)).toBeLessThan(0.05);
    });
});

// The variation in use for the OBS course can change without a pilot's action: here the aircraft leaves the coverage
// area, so the course is referenced to true north instead of the active VOR's published 10 E (5-44, #190). The unit
// holds the true course, so the number changes (by analogy with the SET 2 change the KLN 89 trainer showed, 2026-10-25,
// #425), and an indicator the unit drives is slewed to the new number (5-35) and not read back over it (#261)
describe('a driven OBS indicator when the aircraft leaves the coverage area (characterization)', () => {
    // FPL 0 KAAA - VNE, due north; VNE at N 73.8 with a published 10 E. The aircraft is on the leg at N 73.5, ObsSource 1
    // and ObsTarget 1 (the default reads the indicator, the target drives it), and the fake moves the indicator on
    // K:VOR1_SET as the sim does. OBS 000 true is 350 magnetic at VNE; past N 74 it is 000
    it('characterization: holds 000 true and slews the indicator from 350 to 000 when the aircraft leaves the area (#261, #425)', async () => {
        const kaaa = airport('KAAA', 73.0, 8.0);
        const vne = vor('VNE', 73.8, 8.0, {magneticVariation: -10});
        const unit = await bootUnit({
            facilities: [kaaa, vne], position: {lat: 73.5, lon: 8.0}, magvar: 10,
            panelXml: panelXml({'Output.ObsTarget': 1}), storage: savedFlightplan(0, [kaaa, vne]),
        });
        await settle(unit);
        unit.env.sim.applyObsKeyEvents = true;
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(2000);
        const mc = unit.props.modeController;
        expect(activeIdent(unit)).toBe('VNE'); // Preconditions: 000 true, 350 on the indicator
        expect(Math.abs(angleDiff(mc.getObsTrue(), 0))).toBeLessThan(1e-6);
        expect(Math.abs(angleDiff(unit.env.sim.get('Nav OBS:1', 'degrees'), 350))).toBeLessThan(0.5);

        await moveAircraft(unit, {lat: 74.5, lon: 8.0}, {groundspeedKt: 120, trackTrue: 0});
        await vi.advanceTimersByTimeAsync(2000);
        expect(messages(unit)).toContain(MAGVAR_INVALID); // Precondition: outside the area

        expect(Math.abs(angleDiff(mc.getObsTrue(), 0))).toBeLessThan(1e-6);
        expect(Math.abs(angleDiff(unit.env.sim.get('Nav OBS:1', 'degrees'), 0))).toBeLessThan(0.5);
        expect(Math.abs(unit.props.memory.navPage.xtkToActive!)).toBeLessThan(0.05); // A course of 350 through VNE would be 7 NM off here
    });
});
