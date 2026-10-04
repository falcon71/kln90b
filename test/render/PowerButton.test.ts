import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../harness/boot';
import {readRows, Screen} from '../harness/render/screen';

const BLANK_SCREEN = Array.from({length: 7}, () => ' '.repeat(23)).join('\n');

const powerWrites = (unit: HeadlessUnit) => unit.env.sim.writes.filter(w => w.name === 'L:KLN90B_POWER');
const powercycles = (unit: HeadlessUnit) => unit.props.userSettings.getSetting('powercycles').value;
const opacity = () => document.getElementById('InstrumentsContainer')!.style.opacity;

// The H events are public contract with hardware (HEvents.ts, wiki page on hardware): Power_On and Power_Off set the
// switch, they do not toggle it
describe('Power_On and Power_Off H events (characterization of the public contract) (#51)', () => {
    it('Power_On does nothing while the unit is on', async () => {
        const unit = await bootUnit();
        expect(powercycles(unit)).toBe(1);
        const writesBefore = powerWrites(unit).length;

        unit.send('KLN90B_Power_On');
        await vi.advanceTimersByTimeAsync(1000);

        expect(powercycles(unit)).toBe(1);
        expect(powerWrites(unit).length).toBe(writesBefore);
        expect(Screen.read().leftName()).toBe('NAV 2');
    });

    it('Power_Off blanks the screen and clears the LVar', async () => {
        const unit = await bootUnit();
        // The brightness ramp of the boot (warm-up and fade-in, BrightnessManager.ts) has run out by then
        await vi.advanceTimersByTimeAsync(15_000);

        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.env.sim.get('L:KLN90B_Power', 'bool')).toBe(0);
        expect(Screen.read().text()).toBe(BLANK_SCREEN);
        expect(opacity()).toBe('0');
    });

    it('Power_On twice after Power_Off powers up once', async () => {
        const unit = await bootUnit();
        const writesBefore = powerWrites(unit).length;
        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(1000);

        unit.send('KLN90B_Power_On');
        unit.send('KLN90B_Power_On');
        await vi.advanceTimersByTimeAsync(1000);

        expect(powercycles(unit)).toBe(2);
        expect(powerWrites(unit).slice(writesBefore).map(w => w.value)).toEqual([0, 1]);
        expect(unit.env.sim.get('L:KLN90B_Power', 'bool')).toBe(1);
        // The welcome page is a seven-row full page, which Screen cannot read; this is its first row
        const welcome = readRows(document.querySelector('.full-page')!);
        expect(welcome[0].map(c => c.ch).join('')).toBe(' GPS             ORS 20');
    });

    // BrightnessManager.powerUp() keeps ramping after the unit was switched off, and raises the opacity of the dark unit
    // to 1 again. The page is blank (NullPage), so the effect is small, but the instrument is no longer dark.
    it.fails('Power_Off during the fade-in keeps the instrument dark (#114)', async () => {
        const unit = await bootUnit();

        unit.send('KLN90B_Power_Off');
        await vi.advanceTimersByTimeAsync(6000);

        expect(opacity()).toBe('0');
    });
});
