import {FSComponent} from '@microsoft/msfs-sdk';
import {UiElement} from '../../../kln90b/pages/Page';
import {readRows} from './screen';

/** A control rendered on its own, outside a booted unit */
export interface Mounted {
    /** The cells as the font renders them, rows joined with a newline (d-none subtrees left out, as on the screen) */
    text(): string;

    /** The attributes of those cells: `.` normal, `I` inverted, `B` blinking, `F` flashing inverse */
    mask(): string;

    /** One display tick of the control; `blink` is the tick on which flashing elements blink (every 4th) */
    tick(blink?: boolean): void;
}

/**
 * Renders a display or control into a detached element, the way a page renders its children, so that a test can read
 * the control's own format without booting a unit. There is no tick loop: a control whose text changes only on a
 * display tick (the arrows, the deviation bars, any value set after render) is ticked by the test with `tick()`
 * (testing.md section 4).
 */
export function mount(el: UiElement): Mounted {
    const host = document.createElement('div');
    FSComponent.render(el.render()!, host);
    const rows = () => readRows(host);
    return {
        text: () => rows().map(r => r.map(c => c.ch).join('')).join('\n'),
        mask: () => rows().map(r => r.map(c => c.attr).join('')).join('\n'),
        tick: (blink = false) => el.tick(blink),
    };
}

/** The text of a control after one display tick: mount, tick, read */
export function mountedText(el: UiElement): string {
    const m = mount(el);
    m.tick();
    return m.text();
}

/** The text and the attributes of a control after one display tick */
export function mountedRead(el: UiElement): { text: string, mask: string } {
    const m = mount(el);
    m.tick();
    return {text: m.text(), mask: m.mask()};
}
