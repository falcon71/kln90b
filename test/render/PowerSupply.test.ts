import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../harness/boot';
import {panelXml} from '../harness/panelXml';
import {Screen} from '../harness/render/screen';

const BLANK_SCREEN = Array.from({length: 7}, () => ' '.repeat(23)).join('\n');

const powercycles = (unit: HeadlessUnit) => unit.props.userSettings.getSetting('powercycles').value;

// Spec test of the public contract with aircraft; the source is the contract itself (CLAUDE.md, "Public contract", and
// the doc comments in HEvents.ts), not a manual page: Power_On and Power_Off set the switch, they do not toggle it
describe('Power_On and Power_Off H events (public contract) (#51)', () => {
    it('Power_On does nothing while the unit is on', async () => {
        const unit = await bootUnit();
        expect(powercycles(unit)).toBe(1);
        const writesBefore = unit.display.powerWrites().length;

        unit.send('KLN90B_Power_On');
        await vi.advanceTimersByTimeAsync(1000);

        expect(powercycles(unit)).toBe(1);
        expect(unit.display.powerWrites().length).toBe(writesBefore);
        expect(Screen.read().status().left).toBe('NAV 2');
    });

    it('Power_Off blanks the screen and clears the LVar', async () => {
        const unit = await bootUnit();
        // The brightness ramp of the boot (warm-up and fade-in, BrightnessManager.ts) has run out by then
        await vi.advanceTimersByTimeAsync(15_000);

        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.env.sim.get('L:KLN90B_Power', 'bool')).toBe(0);
        expect(Screen.read().text()).toBe(BLANK_SCREEN);
        expect(unit.display.opacity()).toBe(0);
    });

    it('Power_On twice after Power_Off powers up once', async () => {
        const unit = await bootUnit();
        const writesBefore = unit.display.powerWrites().length;
        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(1000);

        unit.send('KLN90B_Power_On');
        unit.send('KLN90B_Power_On');
        await vi.advanceTimersByTimeAsync(1000);

        expect(powercycles(unit)).toBe(2);
        expect(unit.display.powerWrites().slice(writesBefore).map(w => w.value)).toEqual([0, 1]);
        expect(unit.env.sim.get('L:KLN90B_Power', 'bool')).toBe(1);
        expect(Screen.read().row(0)).toBe(' GPS             ORS 20');
    });

    // The warm-up and fade-in of a power-on (BrightnessManager.powerUp) must not carry on once the unit is off
    it('Power_Off during the fade-in keeps the instrument dark (#114)', async () => {
        const unit = await bootUnit();

        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(6000);

        expect(unit.display.opacity()).toBe(0);
    });

    // The same during the warm-up of a cold unit (30 minutes off: 6 s), before the first step of the fade-in
    it('Power_Off during the warm-up keeps the instrument dark (#114)', async () => {
        const unit = await bootUnit();
        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(30 * 60_000);
        unit.send('KLN90B_Power_On');
        await vi.advanceTimersByTimeAsync(3000);
        expect(unit.display.opacity()).toBe(0); // the precondition: still warming up

        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(15_000);

        expect(unit.display.opacity()).toBe(0);
    });

    // A switch-off and a power-on during a running fade-in start one ramp, not two. Two ramps would raise the opacity
    // twice as fast, so the property is that the opacity 2 s into the new fade-in has risen but is still below the half
    // of the full brightness (two ramps are at about 0.95)
    it('Power_On during a fade-in starts a fade-in of its own, and the old one ends (#114)', async () => {
        const unit = await bootUnit();
        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(30 * 60_000);
        unit.send('KLN90B_Power_On');
        await vi.advanceTimersByTimeAsync(7000); // 6 s of warm-up, then the fade-in is running
        expect(unit.display.opacity()).toBeGreaterThan(0.1); // the precondition: the first ramp is in progress
        expect(unit.display.opacity()).toBeLessThan(0.5);

        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(200);
        expect(unit.display.opacity()).toBe(0);
        unit.send('KLN90B_Power_On');
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.display.opacity()).toBeGreaterThan(0);
        expect(unit.display.opacity()).toBeLessThan(0.5);
        await vi.advanceTimersByTimeAsync(3000);
        expect(unit.display.opacity()).toBe(1);
    });
});

// Public contract: the doc comment of LVAR_POWER in LVars.ts says the LVar is the position of the power switch and that the
// unit itself is still off when electricity is not available. The screen is asserted, not the opacity.
describe('L:KLN90B_Power reports the switch, not the powered state (public contract)', () => {
    it('is 1 while the unit has no electricity and shows nothing', async () => {
        const unit = await bootUnit({
            panelXml: panelXml({'Input.ElectricitySimVar': 'CIRCUIT ON:1'}),
        });
        // CIRCUIT ON:1 stays unset (reads 0), so the first SimVarSync tick takes the electricity away;
        // waited out for 3 s, beyond the switch-over of the battery module (maintenance manual, PDF 79; #332)
        await vi.advanceTimersByTimeAsync(3000);

        expect(Screen.read().row(0)).toBe(' '.repeat(23));
        expect(unit.env.sim.lastWrite('L:KLN90B_Power')?.value).toBe(1);
    });
});
