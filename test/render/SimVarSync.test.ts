import {describe, expect, it, onTestFinished, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../harness/boot';
import {Screen} from '../harness/render/screen';
import {standardRoute} from '../harness/fixtures';
import {panelXml} from '../harness/panelXml';
import {activeIdent} from '../harness/readers';
import {bootOnStandardRoute} from '../harness/worldBoot';
import {courseDeg} from '../harness/flight/geo';
import {PowerEvent} from '../../kln90b/PowerSupply';

const BLANK_ROW = ' '.repeat(23);

const CIRCUIT_XML = panelXml({'Input.ElectricitySimVar': 'CIRCUIT ON:1'});

// Public contract: the writable LVars of LVars.ts, and the wiki pages panel.xml customization ("You may change this value
// on the fly") and Hot Swapping and Package Detection. SimVarSync reads them every 100 ms, so each write is followed by
// 300 ms.
describe('L:KLN90B_Disabled (public contract)', () => {
    it('freezes the outputs and resumes at one write per second on the same page and waypoint', async () => {
        const unit = await bootOnStandardRoute();
        const sim = unit.env.sim;

        sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);
        const frozenAt = unit.env.sim.writeCount('L:KLN90B_HSI_TF_FLAGS');
        await vi.advanceTimersByTimeAsync(5000);
        expect(unit.env.sim.writeCount('L:KLN90B_HSI_TF_FLAGS')).toBe(frozenAt);

        sim.set('L:KLN90B_Disabled', 'bool', false);
        await vi.advanceTimersByTimeAsync(300);
        const resumedAt = unit.env.sim.writeCount('L:KLN90B_HSI_TF_FLAGS');
        await vi.advanceTimersByTimeAsync(10_000); // Ten 1 s ticks
        // A doubled tick rate after the resume (#24) would count 20
        expect(unit.env.sim.writeCount('L:KLN90B_HSI_TF_FLAGS') - resumedAt).toBe(10);

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

// The screen is asserted, not the opacity. bootUnit cannot preset a
// SimVar before init, so the unit boots, loses its electricity at the first SimVarSync tick and powers up again when the
// test sets the circuit; it comes up through the welcome page, which fills row 0.
describe('ElectricitySimVar and L:KLN90B_ElectricitySimVarIndex (public contract)', () => {
    it('powers the unit up and down with the SimVar of panel.xml', async () => {
        // Each loss of the circuit is waited out for 3 s, beyond the switch-over of the battery module (maintenance
        // manual, PDF 79: about 1.5 s; #332), so that the test holds whether or not a short loss is bridged
        const unit = await bootUnit({panelXml: CIRCUIT_XML});
        await vi.advanceTimersByTimeAsync(3000);
        expect(Screen.read().row(0)).toBe(BLANK_ROW);

        unit.env.sim.set('CIRCUIT ON:1', 'bool', true);
        await vi.advanceTimersByTimeAsync(2000);
        expect(Screen.read().row(0)).not.toBe(BLANK_ROW);

        unit.env.sim.set('CIRCUIT ON:1', 'bool', false);
        await vi.advanceTimersByTimeAsync(3000);
        expect(Screen.read().row(0)).toBe(BLANK_ROW);
    });

    // The first reading applies at once: a unit that loads without aircraft power must not show the Turn-On page while
    // the ride-through of a loss that never happened runs out (#332)
    it('applies the first reading at once: a unit booted without aircraft power stays dark (#332)', async () => {
        await bootUnit({panelXml: CIRCUIT_XML});
        await vi.advanceTimersByTimeAsync(200);

        expect(Screen.read().row(0)).toBe(BLANK_ROW);
    });

    it('the index LVar switches the circuit at runtime', async () => {
        const unit = await bootUnit({panelXml: CIRCUIT_XML});
        unit.env.sim.set('CIRCUIT ON:1', 'bool', true);
        await vi.advanceTimersByTimeAsync(2000);
        expect(Screen.read().row(0)).not.toBe(BLANK_ROW);

        // Circuit 2 is not powered; the loss is waited out for 3 s, beyond the switch-over (see the test above)
        unit.env.sim.set('L:KLN90B_ElectricitySimVarIndex', 'number', 2);
        await vi.advanceTimersByTimeAsync(3000);
        expect(Screen.read().row(0)).toBe(BLANK_ROW);

        unit.env.sim.set('CIRCUIT ON:2', 'bool', true);
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().row(0)).not.toBe(BLANK_ROW);
    });

    // The wiki panel.xml customization names any boolean SimVar, with an index only after a colon (cfg/panel.xml: "If an
    // index is used, it is synced with L:KLN90B_ElectricitySimVarIndex"). The colon of a prefix is part of the name (#136).
    it('an LVar as the ElectricitySimVar powers the unit (#136)', async () => {
        const unit = await bootUnit({panelXml: panelXml({'Input.ElectricitySimVar': 'L:MY_AVIONICS_BUS'})});
        unit.env.sim.set('L:MY_AVIONICS_BUS', 'bool', true);
        await vi.advanceTimersByTimeAsync(2000);

        expect(Screen.read().row(0)).not.toBe(BLANK_ROW);
        // The name is not rewritten by the sync, so the unit goes on running and follows the LVar down
        expect(unit.props.planeSettings.input.electricitySimVar).toBe('L:MY_AVIONICS_BUS');
        unit.env.sim.set('L:MY_AVIONICS_BUS', 'bool', false);
        await vi.advanceTimersByTimeAsync(3000);
        expect(Screen.read().row(0)).toBe(BLANK_ROW);
    });

    it('an A: prefix with an index powers the unit, and the index LVar switches the circuit (#136)', async () => {
        // FakeSim keys a variable by its name as written, so the prefix is part of the variable the test sets
        const unit = await bootUnit({panelXml: panelXml({'Input.ElectricitySimVar': 'A:CIRCUIT ON:1'})});
        unit.env.sim.set('A:CIRCUIT ON:1', 'bool', true);
        await vi.advanceTimersByTimeAsync(2000);

        expect(Screen.read().row(0)).not.toBe(BLANK_ROW);
        expect(unit.props.planeSettings.input.electricitySimVar).toBe('A:CIRCUIT ON:1');

        // Circuit 2 is not powered
        unit.env.sim.set('L:KLN90B_ElectricitySimVarIndex', 'number', 2);
        await vi.advanceTimersByTimeAsync(3000);
        expect(unit.props.planeSettings.input.electricitySimVar).toBe('A:CIRCUIT ON:2');
        expect(Screen.read().row(0)).toBe(BLANK_ROW);

        unit.env.sim.set('A:CIRCUIT ON:2', 'bool', true);
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().row(0)).not.toBe(BLANK_ROW);
    });

    // A pretty-printed element ends in whitespace; the unit trims it, so the sync still finds the index
    it('a pretty-printed value with an index powers the unit, and the index LVar switches the circuit (#136)', async () => {
        const unit = await bootUnit({panelXml: panelXml({'Input.ElectricitySimVar': '\n    CIRCUIT ON:1\n  '})});
        unit.env.sim.set('CIRCUIT ON:1', 'bool', true);
        await vi.advanceTimersByTimeAsync(2000);

        expect(Screen.read().row(0)).not.toBe(BLANK_ROW);
        expect(unit.props.planeSettings.input.electricitySimVar).toBe('CIRCUIT ON:1');

        unit.env.sim.set('L:KLN90B_ElectricitySimVarIndex', 'number', 2);
        await vi.advanceTimersByTimeAsync(3000);
        expect(unit.props.planeSettings.input.electricitySimVar).toBe('CIRCUIT ON:2');
        expect(Screen.read().row(0)).toBe(BLANK_ROW);
    });

    // The form without a prefix and without an index: the unit powers up with it and the sync leaves the name alone
    it('a SimVar without prefix and index powers the unit', async () => {
        const unit = await bootUnit({panelXml: panelXml({'Input.ElectricitySimVar': 'ELECTRICAL MAIN BUS VOLTAGE'})});
        unit.env.sim.set('ELECTRICAL MAIN BUS VOLTAGE', 'bool', true);
        await vi.advanceTimersByTimeAsync(2000);

        expect(Screen.read().row(0)).not.toBe(BLANK_ROW);
        expect(unit.props.planeSettings.input.electricitySimVar).toBe('ELECTRICAL MAIN BUS VOLTAGE');
    });

    // Only the trailing digits are the index, whatever their count
    it('replaces only the trailing digits of the index', async () => {
        const unit = await bootUnit({panelXml: panelXml({'Input.ElectricitySimVar': 'CIRCUIT ON:12'})});
        unit.env.sim.set('CIRCUIT ON:12', 'bool', true);
        await vi.advanceTimersByTimeAsync(2000);
        expect(Screen.read().row(0)).not.toBe(BLANK_ROW);

        unit.env.sim.set('L:KLN90B_ElectricitySimVarIndex', 'number', 3);
        await vi.advanceTimersByTimeAsync(300);
        expect(unit.props.planeSettings.input.electricitySimVar).toBe('CIRCUIT ON:3');
    });
});

// Maintenance manual, PDF 53 and 54 (the battery module) and 79 (its switch-over circuit): a dropout of the aircraft
// power shorter than a second is carried by the unit's own battery and the unit goes on running; after about 1.5 s
// the switch-over gives up and the unit is off. The aircraft power is the ElectricitySimVar of panel.xml (the power
// knob is a different input). The unit is brought to its main page on the circuit first
describe('aircraft power interruptions (maintenance manual)', () => {
    async function onCircuit(): Promise<HeadlessUnit> {
        const unit = await bootUnit({panelXml: CIRCUIT_XML});
        // CIRCUIT ON:1 is unset (reads 0) at the boot: 3 s, beyond the switch-over, so that the unit is off before the
        // circuit comes on (docs/test-next-steps.md: the boot cannot preset the circuit)
        await vi.advanceTimersByTimeAsync(3000);
        expect(Screen.read().row(0)).toBe(BLANK_ROW); // Precondition: off
        unit.env.sim.set('CIRCUIT ON:1', 'bool', true);
        await vi.advanceTimersByTimeAsync(2000);
        await unit.panel.approveSelfTest();
        expect(Screen.read().status().left).toBe('NAV 2'); // Precondition: the main page
        return unit;
    }

    // The sibling of the pin below: a loss of 3 s, beyond the switch-over, turns the unit off, and the power coming
    // back starts it with the Turn-On page (3-3)
    it('turns the unit off when the aircraft power is lost for 3 s (maintenance manual, PDF 53, 54, 79)', async () => {
        const unit = await onCircuit();

        unit.env.sim.set('CIRCUIT ON:1', 'bool', false);
        await vi.advanceTimersByTimeAsync(3000);
        expect(Screen.read().text()).toBe(Array.from({length: 7}, () => BLANK_ROW).join('\n'));

        unit.env.sim.set('CIRCUIT ON:1', 'bool', true);
        await vi.advanceTimersByTimeAsync(2000);
        expect(Screen.read().row(0)).toBe(' GPS             ORS 20');
    });

    // PowerSupply carries a loss shorter than its ride-through (RIDE_THROUGH_TIME) on the battery module: the unit goes on
    // running, with no Turn-On page and no self-test (#332)
    it('rides through a 0.5 s loss of the aircraft power (maintenance manual, PDF 53) (#332)', async () => {
        const unit = await onCircuit();
        const cycles = unit.props.userSettings.getSetting('powercycles').value;

        unit.env.sim.set('CIRCUIT ON:1', 'bool', false);
        await vi.advanceTimersByTimeAsync(500);
        unit.env.sim.set('CIRCUIT ON:1', 'bool', true);
        await vi.advanceTimersByTimeAsync(2000);

        expect(Screen.read().status().left).toBe('NAV 2');
        expect(unit.props.userSettings.getSetting('powercycles').value).toBe(cycles);
    });

    // The boundary of the switch-over (PDF 79: about 1.5 s): 1.4 s is carried, 1.6 s is not
    it('rides through a loss of 1.4 s (maintenance manual, PDF 79) (#332)', async () => {
        const unit = await onCircuit();
        const cycles = unit.props.userSettings.getSetting('powercycles').value;

        unit.env.sim.set('CIRCUIT ON:1', 'bool', false);
        await vi.advanceTimersByTimeAsync(1400);
        unit.env.sim.set('CIRCUIT ON:1', 'bool', true);
        await vi.advanceTimersByTimeAsync(2000);

        expect(Screen.read().status().left).toBe('NAV 2');
        expect(unit.props.userSettings.getSetting('powercycles').value).toBe(cycles);
    });

    it('turns the unit off after a loss of 1.6 s (maintenance manual, PDF 79) (#332)', async () => {
        const unit = await onCircuit();
        const cycles = unit.props.userSettings.getSetting('powercycles').value;

        unit.env.sim.set('CIRCUIT ON:1', 'bool', false);
        await vi.advanceTimersByTimeAsync(1600);
        expect(Screen.read().text()).toBe(Array.from({length: 7}, () => BLANK_ROW).join('\n'));

        unit.env.sim.set('CIRCUIT ON:1', 'bool', true);
        await vi.advanceTimersByTimeAsync(2000);
        expect(Screen.read().row(0)).toBe(' GPS             ORS 20');
        expect(unit.props.userSettings.getSetting('powercycles').value).toBe(cycles + 1);
    });

    // No battery charge model: every short loss is carried on its own
    it('rides through repeated short losses (#332)', async () => {
        const unit = await onCircuit();
        const cycles = unit.props.userSettings.getSetting('powercycles').value;

        for (let i = 0; i < 3; i++) {
            unit.env.sim.set('CIRCUIT ON:1', 'bool', false);
            await vi.advanceTimersByTimeAsync(1000);
            unit.env.sim.set('CIRCUIT ON:1', 'bool', true);
            await vi.advanceTimersByTimeAsync(100);
        }
        await vi.advanceTimersByTimeAsync(2000);

        expect(Screen.read().status().left).toBe('NAV 2');
        expect(unit.props.userSettings.getSetting('powercycles').value).toBe(cycles);
    });

    // The loss the knob cut short is a loss for good: the knob coming on again must not power the unit from a supply that is
    // gone, even before the next poll (SimVarSync reports the circuit every 100 ms) has said so
    it('does not power the unit when the knob is turned on again during the loss that was ridden through (#332)', async () => {
        const unit = await onCircuit();
        const cycles = unit.props.userSettings.getSetting('powercycles').value;

        unit.env.sim.set('CIRCUIT ON:1', 'bool', false);
        await vi.advanceTimersByTimeAsync(500);
        unit.send('KLN90B_Power_Off');
        unit.send('KLN90B_Power_On');
        await vi.advanceTimersByTimeAsync(50);

        expect(unit.props.userSettings.getSetting('powercycles').value).toBe(cycles);
        await vi.advanceTimersByTimeAsync(3000);
        expect(Screen.read().text()).toBe(Array.from({length: 7}, () => BLANK_ROW).join('\n'));
    });

    // With the knob off nothing runs on the battery module, so a loss has nothing to carry and applies at once
    it('applies a loss at once while the knob is off, so the knob does not power the unit afterwards (#332)', async () => {
        const unit = await onCircuit();
        const cycles = unit.props.userSettings.getSetting('powercycles').value;
        await unit.panel.powerOff();

        unit.env.sim.set('CIRCUIT ON:1', 'bool', false);
        await vi.advanceTimersByTimeAsync(500);
        await unit.panel.powerOn();
        await vi.advanceTimersByTimeAsync(300);

        expect(unit.props.userSettings.getSetting('powercycles').value).toBe(cycles);
    });

    // The off time of the power event counts from the moment the unit actually turned off, the end of the ride-through,
    // not from the loss (the GPS advances its clock by it). The poll of the circuit is 100 ms, so the power-on event
    // comes up to 100 ms after the circuit is restored
    it('counts the off time from the end of the ride-through (#332)', async () => {
        const unit = await onCircuit();
        const events: {isPowered: boolean, timeSincePowerChange: number, at: number}[] = [];
        unit.props.bus.getSubscriber<PowerEvent>().on('powerEvent').handle(e => events.push({...e, at: Date.now()}));
        events.length = 0; // The bus replays the last power event on subscribing

        unit.env.sim.set('CIRCUIT ON:1', 'bool', false);
        await vi.advanceTimersByTimeAsync(2000);
        expect(events.map(e => e.isPowered)).toEqual([false]); // Precondition: the ride-through has ended
        const turnedOffAt = events[0].at;

        await vi.advanceTimersByTimeAsync(turnedOffAt + 10_000 - Date.now());
        unit.env.sim.set('CIRCUIT ON:1', 'bool', true);
        await vi.advanceTimersByTimeAsync(500);

        const on = events.filter(e => e.isPowered);
        expect(on.length).toBe(1);
        expect(on[0].timeSincePowerChange).toBeGreaterThanOrEqual(10_000);
        expect(on[0].timeSincePowerChange).toBeLessThanOrEqual(10_100);
    });

    // The knob acts at once: the battery module only bridges the aircraft power, the pilot's switch is still the switch
    it('turns the unit off at once when the knob is turned off during a ride-through (#332)', async () => {
        const unit = await onCircuit();

        unit.env.sim.set('CIRCUIT ON:1', 'bool', false);
        await vi.advanceTimersByTimeAsync(500);
        await unit.panel.powerOff();
        await vi.advanceTimersByTimeAsync(100);
        expect(Screen.read().text()).toBe(Array.from({length: 7}, () => BLANK_ROW).join('\n'));

        unit.env.sim.set('CIRCUIT ON:1', 'bool', true);
        await vi.advanceTimersByTimeAsync(2000);
        expect(Screen.read().text()).toBe(Array.from({length: 7}, () => BLANK_ROW).join('\n'));
    });
});

// The wiki panel.xml customization: ObsTarget 1 writes the OBS course with K:VOR1_SET, 2 with K:VOR2_SET, 0 not at all
describe('L:KLN90B_ObsTarget (public contract)', () => {
    it('starts and stops the K:VOR1_SET events at runtime', async () => {
        const {kaaa, abc} = standardRoute();
        const unit = await bootOnStandardRoute({magvar: 4});
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
// writes no GPS SimVars and leaves GPS OVERRIDDEN to the sim's own GPS.
describe('L:KLN90B_WriteGpsSimvars (public contract)', () => {
    it('stops the GPS SimVar writes and releases GPS OVERRIDDEN, and resumes them', async () => {
        const unit = await bootOnStandardRoute();
        const sim = unit.env.sim;
        expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(1);

        sim.set('L:KLN90B_WriteGpsSimvars', 'bool', false);
        await vi.advanceTimersByTimeAsync(300);
        expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(0);
        const stoppedAt = unit.env.sim.writeCount('GPS WP DISTANCE');
        await vi.advanceTimersByTimeAsync(5000);
        expect(unit.env.sim.writeCount('GPS WP DISTANCE')).toBe(stoppedAt);

        sim.set('L:KLN90B_WriteGpsSimvars', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);
        expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(1);
        const resumedAt = unit.env.sim.writeCount('GPS WP DISTANCE');
        await vi.advanceTimersByTimeAsync(10_000); // Ten 1 s ticks
        // One write per calculation tick
        expect(unit.env.sim.writeCount('GPS WP DISTANCE') - resumedAt).toBe(10);
    });

    // The 16 Hz filter tick writes GPS WP CROSS TRK and the roll steering writes GPS COURSE TO STEER; both stop with the
    // rest (#126), while the roll command LVar, the unit's own output, keeps going
    it('stops GPS WP CROSS TRK and GPS COURSE TO STEER too, and resumes them', async () => {
        const unit = await bootOnStandardRoute();
        const sim = unit.env.sim;
        await vi.advanceTimersByTimeAsync(2000);
        expect(sim.writeCount('GPS WP CROSS TRK')).toBeGreaterThan(0);
        expect(sim.writeCount('GPS COURSE TO STEER')).toBeGreaterThan(0);

        sim.set('L:KLN90B_WriteGpsSimvars', 'bool', false);
        await vi.advanceTimersByTimeAsync(300);
        const crossTrk = sim.writeCount('GPS WP CROSS TRK');
        const steer = sim.writeCount('GPS COURSE TO STEER');
        const roll = sim.writeCount('L:KLN90B_RollCommand');
        await vi.advanceTimersByTimeAsync(5000);
        expect(sim.writeCount('GPS WP CROSS TRK')).toBe(crossTrk);
        expect(sim.writeCount('GPS COURSE TO STEER')).toBe(steer);
        expect(sim.writeCount('L:KLN90B_RollCommand')).toBeGreaterThan(roll);

        sim.set('L:KLN90B_WriteGpsSimvars', 'bool', true);
        await vi.advanceTimersByTimeAsync(2000);
        expect(sim.writeCount('GPS WP CROSS TRK')).toBeGreaterThan(crossTrk);
        expect(sim.writeCount('GPS COURSE TO STEER')).toBeGreaterThan(steer);
    });
});

// The Hot Swapping wiki page: a disabled unit does not claim the GPS (GPS OVERRIDDEN 0, see SensorsOut.test.ts #24), and
// neither toggling WriteGpsSimvars (#137) nor a power change (#350) changes that.
describe('GPS OVERRIDDEN while the unit is disabled (public contract)', () => {
    it('the sibling: the disabled unit has released GPS OVERRIDDEN', async () => {
        const unit = await bootOnStandardRoute();

        unit.env.sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);

        expect(unit.env.sim.get('GPS OVERRIDDEN', 'bool')).toBe(0);
    });

    it('stays released when WriteGpsSimvars is toggled (#137)', async () => {
        const unit = await bootOnStandardRoute();
        const sim = unit.env.sim;
        sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);

        sim.set('L:KLN90B_WriteGpsSimvars', 'bool', false);
        await vi.advanceTimersByTimeAsync(300);
        expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(0);
        sim.set('L:KLN90B_WriteGpsSimvars', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);

        expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(0);
    });

    it('claims the GPS again on the resume, with WriteGpsSimvars as it was toggled meanwhile', async () => {
        const unit = await bootOnStandardRoute();
        const sim = unit.env.sim;
        sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);
        sim.set('L:KLN90B_WriteGpsSimvars', 'bool', false);
        await vi.advanceTimersByTimeAsync(300);
        sim.set('L:KLN90B_WriteGpsSimvars', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);

        sim.set('L:KLN90B_Disabled', 'bool', false);
        await vi.advanceTimersByTimeAsync(300);

        expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(1);
    });

    // The other order: the option goes off while the unit is disabled and stays off, so the resume leaves the GPS to
    // the other unit
    it('leaves the GPS released on the resume when WriteGpsSimvars was switched off meanwhile', async () => {
        const unit = await bootOnStandardRoute();
        const sim = unit.env.sim;
        sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);
        sim.set('L:KLN90B_WriteGpsSimvars', 'bool', false);
        await vi.advanceTimersByTimeAsync(300);

        sim.set('L:KLN90B_Disabled', 'bool', false);
        await vi.advanceTimersByTimeAsync(300);

        expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(0);
    });

    // The condition is the disabled state and nothing wider: a running unit releases and claims the GPS with the LVar
    it('still follows WriteGpsSimvars while the unit is enabled', async () => {
        const unit = await bootOnStandardRoute();
        const sim = unit.env.sim;

        sim.set('L:KLN90B_WriteGpsSimvars', 'bool', false);
        await vi.advanceTimersByTimeAsync(300);
        expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(0);
        sim.set('L:KLN90B_WriteGpsSimvars', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);

        expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(1);
    });

    // A power change claims the GPS at once (SensorsOut.reset). The aircraft power is Input.ElectricitySimVar; a disabled
    // unit ignores the power H events (#138), so the circuit is its only power path
    const onCircuit = () => bootOnStandardRoute({panelXml: CIRCUIT_XML, simVars: [{name: 'CIRCUIT ON:1', unit: 'bool', value: 1}]});

    it('the sibling: a loss of the aircraft power claims the GPS of an enabled unit when the ride-through ends', async () => {
        const unit = await onCircuit();
        const sim = unit.env.sim;
        sim.set('GPS OVERRIDDEN', 'bool', false); // As another device would

        sim.set('CIRCUIT ON:1', 'bool', false);
        await vi.advanceTimersByTimeAsync(2000);

        expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(1);
    });

    it('stays released when the aircraft power goes off and comes back (#350)', async () => {
        const unit = await onCircuit();
        const sim = unit.env.sim;
        sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);

        sim.set('CIRCUIT ON:1', 'bool', false);
        await vi.advanceTimersByTimeAsync(3000);
        expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(0);
        sim.set('CIRCUIT ON:1', 'bool', true);
        await vi.advanceTimersByTimeAsync(3000);

        expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(0);
    });

    // A loss shorter than the ride-through is no power change, so there is nothing to claim either (#332)
    it('stays released through a short power loss while disabled (#350, #332)', async () => {
        const unit = await onCircuit();
        const sim = unit.env.sim;
        sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);

        const cycles = unit.props.userSettings.getSetting('powercycles').value;

        sim.set('CIRCUIT ON:1', 'bool', false);
        await vi.advanceTimersByTimeAsync(1000);
        sim.set('CIRCUIT ON:1', 'bool', true);
        await vi.advanceTimersByTimeAsync(2000);

        expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(0);
        expect(unit.props.userSettings.getSetting('powercycles').value).toBe(cycles); // Carried: no power cycle
    });

    // The sibling of the assertion above: a disabled unit does count the cycle of a loss beyond the ride-through, so that
    // the unchanged count above is meaningful
    it('counts a power cycle for a long power loss while disabled (#332)', async () => {
        const unit = await onCircuit();
        const sim = unit.env.sim;
        sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);
        const cycles = unit.props.userSettings.getSetting('powercycles').value;

        sim.set('CIRCUIT ON:1', 'bool', false);
        await vi.advanceTimersByTimeAsync(2000);
        sim.set('CIRCUIT ON:1', 'bool', true);
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.props.userSettings.getSetting('powercycles').value).toBe(cycles + 1);
    });

    it('claims the GPS on the resume after the aircraft power went off and came back while disabled (#350)', async () => {
        const unit = await onCircuit();
        const sim = unit.env.sim;
        sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);
        sim.set('CIRCUIT ON:1', 'bool', false);
        await vi.advanceTimersByTimeAsync(3000);
        sim.set('CIRCUIT ON:1', 'bool', true);
        await vi.advanceTimersByTimeAsync(3000);

        sim.set('L:KLN90B_Disabled', 'bool', false);
        await vi.advanceTimersByTimeAsync(300);

        expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(1);
    });

    // The maintainer's ruling: the gates read Hardware.isDisabled, never the LVar (see the read count of #138 below). The
    // gate of the power change (SensorsOut.reset) runs on each of the two power changes (the loss counts when the
    // ride-through of 1.5 s ends): three seconds of polls, ten per second, and no read of its own
    it('reads L:KLN90B_Disabled only in the poll, also when the aircraft power changes (#350)', async () => {
        const unit = await onCircuit();
        const sim = unit.env.sim;
        sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);
        const read = vi.spyOn(SimVar, 'GetSimVarValue');
        onTestFinished(() => read.mockRestore()); // A second spyOn on the method would return this one with its calls

        sim.set('CIRCUIT ON:1', 'bool', false);
        await vi.advanceTimersByTimeAsync(2000);
        sim.set('CIRCUIT ON:1', 'bool', true);
        await vi.advanceTimersByTimeAsync(1000);

        expect(read.mock.calls.filter(c => c[0] === 'L:KLN90B_Disabled').length).toBe(30);
        expect(sim.get('GPS OVERRIDDEN', 'bool')).toBe(0); // Precondition: the power change did not claim the GPS
    });
});


// The Hot Swapping wiki page: a disabled unit suspends and resumes where it left off, so the input meant for the unit
// that replaced it must not reach it. The maintainer's ruling (#138): while the unit is disabled every H event is
// ignored, the power and brightness events included; its power then follows only the electricity SimVar
describe('H events while the unit is disabled (public contract)', () => {
    async function disable(unit: HeadlessUnit): Promise<void> {
        unit.env.sim.set('L:KLN90B_Disabled', 'bool', true);
        await vi.advanceTimersByTimeAsync(300);
    }

    async function resume(unit: HeadlessUnit): Promise<void> {
        unit.env.sim.set('L:KLN90B_Disabled', 'bool', false);
        await vi.advanceTimersByTimeAsync(2000);
    }

    it('the sibling: two clicks of the left inner knob move NAV 1 to NAV 3', async () => {
        const unit = await bootOnStandardRoute();
        await unit.panel.selectPage('L', 'NAV 1');

        await unit.panel.press('KLN90B_LeftSmallKnob_Right');
        await unit.panel.press('KLN90B_LeftSmallKnob_Right');

        expect(Screen.read().status().left).toBe('NAV 3');
    });

    it('are ignored: the left page is still NAV 1 after the resume (#138)', async () => {
        const unit = await bootOnStandardRoute();
        await unit.panel.selectPage('L', 'NAV 1');
        await disable(unit);

        await unit.panel.press('KLN90B_LeftSmallKnob_Right');
        await unit.panel.press('KLN90B_LeftSmallKnob_Right');
        await resume(unit);

        expect(Screen.read().status().left).toBe('NAV 1');
    });

    // The sibling of the next test: on an enabled unit KLN90B_Power_Off switches the unit off and writes the switch LVar
    it('the sibling: KLN90B_Power_Off switches an enabled unit off', async () => {
        const unit = await bootOnStandardRoute();

        await unit.panel.powerOff();
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.env.sim.get('L:KLN90B_Power', 'bool')).toBe(0);
        expect(Screen.read().row(0)).toBe(BLANK_ROW);
    });

    it('ignores KLN90B_Power_Off: the unit is still on after the resume (#138)', async () => {
        const unit = await bootOnStandardRoute();
        await unit.panel.selectPage('L', 'NAV 1');
        const cycles = unit.props.userSettings.getSetting('powercycles').value;
        await disable(unit);

        await unit.panel.powerOff();
        await vi.advanceTimersByTimeAsync(2000);
        await resume(unit);

        expect(unit.env.sim.get('L:KLN90B_Power', 'bool')).toBe(1);
        expect(Screen.read().status().left).toBe('NAV 1');
        expect(unit.props.userSettings.getSetting('powercycles').value).toBe(cycles);
    });

    // The scan knob is pulled by KLN90B_RightScan_Toggle, which writes L:KLN90B_RightScan and makes the right inner knob
    // the scan knob (KLN90BCore.onInteractionEvent)
    it('ignores the scan toggle: neither L:KLN90B_RightScan nor the right inner knob changes (#138)', async () => {
        const unit = await bootOnStandardRoute();
        await unit.panel.selectPage('R', 'NAV 1');
        await disable(unit);
        const scanWrites = unit.env.sim.writeCount('L:KLN90B_RightScan');

        await unit.panel.scan();
        await resume(unit);

        expect(unit.env.sim.writeCount('L:KLN90B_RightScan')).toBe(scanWrites);
        expect(unit.props.hardware.isScanPulled).toBe(false);
        await unit.panel.press('KLN90B_RightSmallKnob_Right'); // A page step, not a scan
        expect(Screen.read().status().right).toBe('NAV 2');
    });

    it('ignores the brightness events: L:KLN90B_Brightness and the screen stay as they were (#138)', async () => {
        const unit = await bootOnStandardRoute();
        await vi.advanceTimersByTimeAsync(5000); // the fade-in of the boot is done
        const opacity = unit.display.opacity();
        expect(unit.env.sim.get('L:KLN90B_Brightness', 'number')).toBe(1); // Precondition: full brightness
        await disable(unit);

        await unit.panel.press('KLN90B_Brt_Dec', 2);
        await resume(unit);

        expect(unit.env.sim.get('L:KLN90B_Brightness', 'number')).toBe(1);
        expect(unit.display.opacity()).toBe(opacity);
    });

    // The maintainer's ruling: L:KLN90B_Disabled is read only by the 100 ms poll of SimVarSync, which keeps the state on
    // Hardware; the gates read the kept state, because reading the LVar is expensive. Ten polls in a second, whatever
    // input arrives
    it('reads L:KLN90B_Disabled only in the poll, also while H events arrive (#138)', async () => {
        const unit = await bootOnStandardRoute();
        await disable(unit);
        const read = vi.spyOn(SimVar, 'GetSimVarValue');

        await unit.panel.press('KLN90B_LeftSmallKnob_Right', 4); // 4 clicks of 250 ms: one second
        await unit.panel.press('KLN90B_ENT_Push', 4);

        expect(read.mock.calls.filter(c => c[0] === 'L:KLN90B_Disabled').length).toBe(20);
    });
});
