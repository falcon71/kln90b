import {describe, expect, it} from 'vitest';
import {FSComponent, VNode} from '@microsoft/msfs-sdk';
import {Inverted} from '../../../kln90b/controls/Inverted';
import {mount} from '../../harness/render/mount';
import {NO_CHILDREN, UiElement} from '../../../kln90b/pages/Page';

/** Inverted is a component, not a control: this wraps it so that mount() can render it */
class InvertedText implements UiElement {
    readonly children = NO_CHILDREN;

    constructor(private text: string) {
    }

    render(): VNode {
        return FSComponent.buildComponent(Inverted, null, this.text)!;
    }

    tick(): void {
    }
}

// 3-3, figure 3-3: the turn-on page shows SELF TEST IN PROGRESS in inverse video. Inverted is the control of that row
// (WelcomePage); mounted directly, the page itself belongs to the power-on tests
describe('Inverted (spec)', () => {
    it('shows its children in inverse video (3-3, figure 3-3)', () => {
        const m = mount(new InvertedText('SELF TEST IN PROGRESS'));

        expect(m.text()).toBe('SELF TEST IN PROGRESS');
        expect(m.mask()).toBe('I'.repeat(21));
    });
});
