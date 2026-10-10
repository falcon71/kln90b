import {describe, expect, it} from 'vitest';
import {TemperatureDisplay} from '../../../../kln90b/controls/displays/TemperatureDisplay';
import {mount, mountedText} from '../../../harness/render/mount';

/** The five cells of a temperature in °C after a display tick */
const shown = (celsius: number): string => mountedText(new TemperatureDisplay(celsius));

describe('TemperatureDisplay', () => {
    // 5-43, figure 5-132: SAT 20°C and TAT 26°C, two digits and the degree Celsius
    it('shows a temperature in whole degrees Celsius (5-43)', () => {
        expect(shown(20)).toBe(' 20°C');
        expect(shown(26)).toBe(' 26°C');
    });
});

// Whether a single-digit temperature carries a zero is open; what the code draws is held here
describe('TemperatureDisplay (characterization)', () => {
    it('characterization: a negative temperature takes the minus in front of two digits', () => {
        expect(shown(-25)).toBe('-25°C');
        expect(shown(-9)).toBe('-09°C');
    });

    it('characterization: a positive temperature below 10 has a zero', () => {
        expect(shown(8)).toBe(' 08°C');
    });

    it('characterization: a temperature is rounded to the degree', () => {
        expect(shown(20.4)).toBe(' 20°C');
        expect(shown(20.6)).toBe(' 21°C');
    });

    it('characterization: a value set after the render shows at the next display tick', () => {
        const d = new TemperatureDisplay(20);
        const m = mount(d);
        d.temperature = -25;
        expect(m.text()).toBe(' 20°C');
        m.tick();
        expect(m.text()).toBe('-25°C');
    });
});
