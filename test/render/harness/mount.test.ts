import {describe, expect, it, vi} from 'vitest';
import {mount} from '../../harness/render/mount';
import {BearingDisplay} from '../../../kln90b/controls/displays/BearingDisplay';
import {Blink} from '../../../kln90b/controls/Blink';
import {TextDisplay} from '../../../kln90b/controls/displays/TextDisplay';

describe('mount (harness)', () => {
    it('renders a display on its own and reads its text', () => {
        expect(mount(new BearingDisplay(null)).text()).toBe('---°');
    });

    it('passes the blink flag of tick() to the control, false by default', () => {
        const el = new BearingDisplay(null);
        const m = mount(el);
        const tick = vi.spyOn(el, 'tick');

        m.tick(true);
        m.tick();

        expect(tick.mock.calls).toEqual([[true], [false]]);
    });

    // A display changes its text on a display tick only (testing.md section 4), so the test ticks the mounted control
    it('shows a text set after the render only after tick()', () => {
        const el = new TextDisplay('OLD');
        const m = mount(el);

        el.text = 'NEW';
        expect(m.text()).toBe('OLD');

        m.tick();
        expect(m.text()).toBe('NEW');
    });

    it('reads the attributes of the cells as the mask of a screen does', () => {
        const m = mount(new Blink('AB'));

        m.tick(false);
        expect(m.mask()).toBe('II');
        m.tick(true);
        expect(m.mask()).toBe('BB');
    });

    it('leaves a d-none subtree out of the text, as the screen does', () => {
        const el = new BearingDisplay(120);
        el.isVisible = false;
        const m = mount(el);

        expect(m.text()).toBe('120°');
        m.tick();
        expect(m.text()).toBe('');
    });
});
