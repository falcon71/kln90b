import {describe, expect, it} from 'vitest';
import {TextDisplay} from '../../../../kln90b/controls/displays/TextDisplay';
import {mount} from '../../../harness/render/mount';

// TextDisplay has no format of its own: pages hand it finished text. What it holds is when the text reaches the screen.
describe('TextDisplay (characterization)', () => {
    it('characterization: shows its text as it is, blanks included', () => {
        const m = mount(new TextDisplay(' KAAA  '));
        expect(m.text()).toBe(' KAAA  ');
    });

    it('characterization: a new text shows at the next display tick, not before', () => {
        const d = new TextDisplay('KAAA');
        const m = mount(d);
        d.text = 'KBBB';
        expect(m.text()).toBe('KAAA');
        m.tick();
        expect(m.text()).toBe('KBBB');
    });
});
