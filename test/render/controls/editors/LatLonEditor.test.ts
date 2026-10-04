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
    it('show the hemisphere of a nonzero value', () => {
        const bus = new EventBus();

        expect(text(new LatitudeEditor(bus, 47.5, () => undefined))).toBe('N 47°30.00');
        expect(text(new LatitudeEditor(bus, -47.5, () => undefined))).toBe('S 47°30.00');
        expect(text(new LongitudeEditor(bus, 8.5, () => undefined))).toBe('E 08°30.00');
        expect(text(new LongitudeEditor(bus, -8.5, () => undefined))).toBe('W 08°30.00');
    });

    // The manual does not say what the unit shows for exactly 0. The editors choose the hemisphere with value > 0, so
    // the equator reads S and the prime meridian reads W; N and E are the usual convention for zero.
    it.fails('show N and E for exactly zero (#NEW-5-6)', () => {
        const bus = new EventBus();

        expect(text(new LatitudeEditor(bus, 0, () => undefined))).toBe('N 00°00.00');
        expect(text(new LongitudeEditor(bus, 0, () => undefined))).toBe('E 00°00.00');
    });
});
