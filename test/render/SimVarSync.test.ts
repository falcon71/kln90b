import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../harness/boot';
import {Screen} from '../harness/render/screen';
import {standardRoute} from '../harness/fixtures';
import {savedFlightplan} from '../harness/storage';
import {courseDeg} from '../harness/flight/geo';

const BLANK_ROW = ' '.repeat(23);

const xml = (inner: string) => `<PlaneHTMLConfig><Instrument><Name>KLN90B</Name>${inner}</Instrument></PlaneHTMLConfig>`;
const CIRCUIT_XML = xml('<Input><ElectricitySimVar>CIRCUIT ON:1</ElectricitySimVar></Input>');

/** FakeSim stores the names in upper case, so a plain filter on the name would count nothing */
const writeCount = (unit: HeadlessUnit, name: string): number => unit.env.sim.writes.filter(w => w.name === name.toUpperCase()).length;

/** FPL 0 is KAAA, ABC, KBBB, the aircraft stands at KAAA and ABC is active after the settle */
async function onRoute(magvar = 0) {
    const {kaaa, abc, kbbb} = standardRoute();
    const unit = await bootUnit({
        facilities: [kaaa, abc, kbbb],
        storage: savedFlightplan(0, [kaaa, abc, kbbb]),
        position: {lat: kaaa.lat, lon: kaaa.lon},
        magvar,
    });
    await settle(unit);
    return {unit, kaaa, abc, kbbb};
}

const activeIdent = (unit: HeadlessUnit) => unit.props.memory.navPage.activeWaypoint.getActiveWpt()?.icaoStruct.ident;

// Public contract: the writable LVars of LVars.ts, and the wiki pages panel.xml customization ("You may change this value
// on the fly") and Hot Swapping and Package Detection. SimVarSync reads them every 100 ms, so each write is followed by
// 300 ms.
describe('L:KLN90B_Disabled (public contract)', () => {
    it('freezes the outputs and resumes at one write per second on the same page and waypoint', async () => {
        const {unit} = await onRoute();
        const sim = unit.env.sim;

        sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);
        const frozenAt = writeCount(unit, 'L:KLN90B_HSI_TF_FLAGS');
        await vi.advanceTimersByTimeAsync(5000);
        expect(writeCount(unit, 'L:KLN90B_HSI_TF_FLAGS')).toBe(frozenAt);

        sim.set('L:KLN90B_Disabled', 'bool', false);
        await vi.advanceTimersByTimeAsync(300);
        const resumedAt = writeCount(unit, 'L:KLN90B_HSI_TF_FLAGS');
        await vi.advanceTimersByTimeAsync(10_000);
        // A doubled tick rate after the resume (#24) would count 20
        expect(writeCount(unit, 'L:KLN90B_HSI_TF_FLAGS') - resumedAt).toBe(10);

        expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(1);
        expect(Screen.read().status().left).toBe('NAV 2');
        expect(activeIdent(unit)).toBe('ABC');
    });
});

describe('L:KLN90B_ObsSource (public contract)', () => {
    it('switches the OBS input from Nav OBS:1 to Nav OBS:2', async () => {
        const unit = await bootUnit();
        await settle(unit);
        unit.env.sim.set('Nav OBS:1', 'degrees', 51);
        unit.env.sim.set('Nav OBS:2', 'degrees', 77);

        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.props.sensors.in.obsMag).toBe(51);

        unit.env.sim.set('L:KLN90B_ObsSource', 'number', 2);
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.props.sensors.in.obsMag).toBe(77);
    });
});

// The screen is asserted, not the opacity: #114 lets the opacity ramp on an unpowered unit. bootUnit cannot preset a
// SimVar before init, so the unit boots, loses its electricity at the first SimVarSync tick and powers up again when the
// test sets the circuit; it comes up through the welcome page, which fills row 0.
describe('ElectricitySimVar and L:KLN90B_ElectricitySimVarIndex (public contract)', () => {
    it('powers the unit up and down with the SimVar of panel.xml', async () => {
        const unit = await bootUnit({panelXml: CIRCUIT_XML});
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().row(0)).toBe(BLANK_ROW);

        unit.env.sim.set('CIRCUIT ON:1', 'bool', true);
        await vi.advanceTimersByTimeAsync(2000);
        expect(Screen.read().row(0)).not.toBe(BLANK_ROW);

        unit.env.sim.set('CIRCUIT ON:1', 'bool', false);
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().row(0)).toBe(BLANK_ROW);
    });

    it('the index LVar switches the circuit at runtime', async () => {
        const unit = await bootUnit({panelXml: CIRCUIT_XML});
        unit.env.sim.set('CIRCUIT ON:1', 'bool', true);
        await vi.advanceTimersByTimeAsync(2000);
        expect(Screen.read().row(0)).not.toBe(BLANK_ROW);

        // Circuit 2 is not powered
        unit.env.sim.set('L:KLN90B_ElectricitySimVarIndex', 'number', 2);
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().row(0)).toBe(BLANK_ROW);

        unit.env.sim.set('CIRCUIT ON:2', 'bool', true);
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().row(0)).not.toBe(BLANK_ROW);
    });

    // The wiki panel.xml customization names any boolean SimVar, with an index only after a colon. The parser takes the
    // part after the first colon for the index (KLN90BPlaneSettings.ts:97-99) and SimVarSync replaces it (:31-35), so the
    // name becomes L:NaN and the unit never powers up. The sibling is the CIRCUIT ON:1 test above.
    it.fails('an LVar as the ElectricitySimVar powers the unit (#NEW-3-6)', async () => {
        const unit = await bootUnit({panelXml: xml('<Input><ElectricitySimVar>L:MY_AVIONICS_BUS</ElectricitySimVar></Input>')});
        unit.env.sim.set('L:MY_AVIONICS_BUS', 'bool', true);
        await vi.advanceTimersByTimeAsync(2000);

        expect(Screen.read().row(0)).not.toBe(BLANK_ROW);
    });
});

// The wiki panel.xml customization: ObsTarget 1 writes the OBS course with K:VOR1_SET, 2 with K:VOR2_SET, 0 not at all
describe('L:KLN90B_ObsTarget (public contract)', () => {
    it('starts and stops the K:VOR1_SET events at runtime', async () => {
        const {unit, kaaa, abc} = await onRoute(4);
        const sim = unit.env.sim;
        const vorEvents = () => sim.keyEvents.filter(k => k.name.startsWith('K:VOR'));
        expect(vorEvents()).toEqual([]);

        sim.set('L:KLN90B_ObsTarget', 'number', 1);
        await vi.advanceTimersByTimeAsync(2000);

        const events = vorEvents();
        expect(new Set(events.map(e => e.name))).toEqual(new Set(['K:VOR1_SET']));
        // The OBS is magnetic: the true course of the leg less the variation of 4 degrees east
        expect(events[events.length - 1].value).toBeCloseTo(courseDeg(kaaa, abc) - 4, 1);

        sim.set('L:KLN90B_ObsTarget', 'number', 0);
        await vi.advanceTimersByTimeAsync(300);
        const count = vorEvents().length;
        await vi.advanceTimersByTimeAsync(3000);
        expect(vorEvents().length).toBe(count);
    });
});

// CLAUDE.md "Public contract with aircraft" (GPS SimVars) and the Hot Swapping wiki page: with the LVar at 0 the unit
// writes no GPS SimVars and leaves GPS OVERRIDDEN to the sim's own GPS. GPS WP CROSS TRK is no probe for "stopped", it
// keeps being written (#126).
describe('L:KLN90B_WriteGpsSimvars (public contract)', () => {
    it('stops the GPS SimVar writes and releases GPS OVERRIDDEN, and resumes them', async () => {
        const {unit} = await onRoute();
        const sim = unit.env.sim;
        expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(1);

        sim.set('L:KLN90B_WriteGpsSimvars', 'bool', false);
        await vi.advanceTimersByTimeAsync(300);
        expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(0);
        const stoppedAt = writeCount(unit, 'GPS WP DISTANCE');
        await vi.advanceTimersByTimeAsync(5000);
        expect(writeCount(unit, 'GPS WP DISTANCE')).toBe(stoppedAt);

        sim.set('L:KLN90B_WriteGpsSimvars', 'bool', true);
        await vi.advanceTimersByTimeAsync(3000);
        expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(1);
        expect(writeCount(unit, 'GPS WP DISTANCE')).toBeGreaterThan(stoppedAt);
    });
});

// The Hot Swapping wiki page: a disabled unit does not claim the GPS (GPS OVERRIDDEN 0, see SensorsOut.test.ts #24).
// Toggling WriteGpsSimvars while the unit is disabled writes GPS OVERRIDDEN again (SimVarSync.ts:53-56).
describe('GPS OVERRIDDEN while the unit is disabled (public contract)', () => {
    it('the sibling: the disabled unit has released GPS OVERRIDDEN', async () => {
        const {unit} = await onRoute();

        unit.env.sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);

        expect(unit.env.sim.get('GPS OVERRIDDEN', 'bool')).toBe(0);
    });

    it.fails('stays released when WriteGpsSimvars is toggled (#NEW-3-7)', async () => {
        const {unit} = await onRoute();
        const sim = unit.env.sim;
        sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);

        sim.set('L:KLN90B_WriteGpsSimvars', 'bool', false);
        await vi.advanceTimersByTimeAsync(300);
        sim.set('L:KLN90B_WriteGpsSimvars', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);

        expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(0);
    });
});

// The Hot Swapping wiki page: a disabled unit suspends and resumes where it left off, so the input meant for the unit
// that replaced it must not reach it. KLN90BCore.onInteractionEvent has no check of L:KLN90B_Disabled, so the knob clicks
// are applied and NAV 3 shows after the resume.
describe('H events while the unit is disabled (public contract)', () => {
    it('the sibling: two clicks of the left inner knob move NAV 1 to NAV 3', async () => {
        const {unit} = await onRoute();
        await unit.panel.selectPage('L', 'NAV 1');

        await unit.panel.press('KLN90B_LeftSmallKnob_Right');
        await unit.panel.press('KLN90B_LeftSmallKnob_Right');

        expect(Screen.read().status().left).toBe('NAV 3');
    });

    it.fails('are ignored: the left page is still NAV 1 after the resume (#NEW-3-8)', async () => {
        const {unit} = await onRoute();
        await unit.panel.selectPage('L', 'NAV 1');
        unit.env.sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);

        await unit.panel.press('KLN90B_LeftSmallKnob_Right');
        await unit.panel.press('KLN90B_LeftSmallKnob_Right');
        unit.env.sim.set('L:KLN90B_Disabled', 'bool', false);
        await vi.advanceTimersByTimeAsync(2000);

        expect(Screen.read().status().left).toBe('NAV 1');
    });
});
