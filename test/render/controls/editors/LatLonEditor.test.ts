import {describe, expect, it} from 'vitest';
import {EventBus, FSComponent, VNode} from '@microsoft/msfs-sdk';
import {LatitudeEditor} from '../../../../kln90b/controls/editors/LatitudeEditor';
import {LongitudeEditor} from '../../../../kln90b/controls/editors/LongitudeEditor';

function text(editor: { render(): VNode }): string {
    const host = document.createElement('div');
    FSComponent.render(editor.render(), host);
    return host.textContent ?? '';
}

describe('latitude and longitude editors', () => {
    // 3-18, figure 3-59: the position fields show the hemisphere letter
    it('show the hemisphere of a nonzero value (3-18)', () => {
        const bus = new EventBus();

        expect(text(new LatitudeEditor(bus, 47.5, () => undefined))).toBe('N 47°30.00');
        expect(text(new LatitudeEditor(bus, -47.5, () => undefined))).toBe('S 47°30.00');
        expect(text(new LongitudeEditor(bus, 18.5, () => undefined))).toBe('E 18°30.00');
        expect(text(new LongitudeEditor(bus, -18.5, () => undefined))).toBe('W 18°30.00');
    });
});
