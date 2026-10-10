import {describe, expect, it} from 'vitest';
import {Blink} from '../../../kln90b/controls/Blink';
import {mountedCycle} from '../../harness/render/blink';
import {mount} from '../../harness/render/mount';

// Introduction page I and figure 3-5: ACKNOWLEDGE? on the take-home warning page is shown in inverse video inside the
// white border that marks flashing. Blink is the control of that field (TakehomePage). Mounted directly: the take-home
// mode is not tested through the unit (testing.md section 9)
describe('Blink (spec)', () => {
    it('flashes its text in inverse video (I, 3-3, figure 3-5)', () => {
        const m = mount(new Blink('ACKNOWLEDGE?'));

        const cycle = mountedCycle(m, () => ({text: m.text(), mask: m.mask()}));

        // Three display ticks in inverse video, then the blink tick takes the inverse video away from every cell
        expect(cycle.slice(0, 3)).toEqual(Array(3).fill({text: 'ACKNOWLEDGE?', mask: 'IIIIIIIIIIII'}));
        expect(cycle[3].mask).not.toMatch(/I/);
        expect(cycle[3].text).toBe('ACKNOWLEDGE?'); // how the cell looks then is the characterization below
        // And the next tick brings the inverse video back
        m.tick(false);
        expect(m.mask()).toBe('IIIIIIIIIIII');
    });
});

// The guide does not say whether a flashing inverse field shows its text in normal video or nothing in the blink phase.
// Blink hides it (the .blink class), while the flashing cursor of the editors shows normal text (.inverted-blink)
describe('Blink (characterization)', () => {
    it('hides its text in the blink phase', () => {
        const m = mount(new Blink('ACKNOWLEDGE?'));

        expect(mountedCycle(m, () => m.mask())[3]).toBe('BBBBBBBBBBBB');
    });
});
