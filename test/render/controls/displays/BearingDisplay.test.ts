import {describe, expect, it} from 'vitest';
import {BearingDisplay} from '../../../../kln90b/controls/displays/BearingDisplay';
import {mountedCycle} from '../../../harness/render/blink';
import {mount} from '../../../harness/render/mount';

/** The four cells of a bearing after a display tick */
function shown(bearing: number | null): string {
    const m = mount(new BearingDisplay(bearing));
    m.tick();
    return m.text();
}

describe('BearingDisplay', () => {
    // 3-31, figure 3-97: BRG 303°, three digits and the degree sign
    it('shows a bearing in three digits with the degree sign (3-31)', () => {
        expect(shown(303)).toBe('303°');
    });

    // 3-32, figure 3-103 (LGA 045°fr) and 3-22, figure 3-71 (003° to the nearest airport): leading zeros
    it('pads a bearing below 100 with zeros (3-22, 3-32)', () => {
        expect(shown(45)).toBe('045°');
        expect(shown(3)).toBe('003°');
    });

    // 3-31, figure 3-101: without navigation BRG is dashed, the degree sign kept
    it('shows dashes without a value (3-31)', () => {
        expect(shown(null)).toBe('---°');
    });

    // 4-9: DTK flashes on NAV 3 and Super NAV 5 when the selected course differs from it by more than 10 degrees. The
    // display flashes on the blink tick (every fourth display tick) and is steady on the others.
    it('flashes on the blink tick when told to flash (4-9)', () => {
        const d = new BearingDisplay(303);
        const m = mount(d);
        d.flash = true;
        expect(mountedCycle(m, () => m.mask())).toEqual(['....', '....', '....', 'BBBB']);
    });

    // 4-9: only a differing course makes DTK flash
    it('stays steady on the blink tick when not told to flash (4-9)', () => {
        const m = mount(new BearingDisplay(303));
        expect(mountedCycle(m, () => m.mask())).toEqual(['....', '....', '....', '....']);
    });
});

describe('BearingDisplay at north', () => {
    // 5-12, figure 5-37 (CAL 3 HDG 000°) and 3-22, figure 3-71 (003°): a bearing has three digits, padded with zeros.
    // The sibling of the pin: a bearing that rounds down to north shows 000°
    it('shows a bearing just above north as 000° (5-12, 3-22)', () => {
        expect(shown(0.4)).toBe('000°');
    });

    // 3-31, figure 3-97 (BRG 303°): the sibling of the pin, a bearing that rounds down below north keeps its degrees
    it('shows 359.4 as 359° (3-31)', () => {
        expect(shown(359.4)).toBe('359°');
    });

    // 5-12, figure 5-37 (HDG 000°), 3-22, figure 3-71 (003°) and the KLN 89 trainer, 2026-10-08: a bearing swept
    // through north went from 359° to 0° and never showed 360° (the 89 pads with blanks, 0°; the 90B figures pad with
    // zeros, so 000°). The code rounds 359.5 up to 360. The OBS course of #263 shows the same 360.
    it.fails('shows 359.5 as 000°, never 360° (5-12, 3-22, checked in the KLN 89 trainer, 2026-10-08, #263)', () => {
        expect(shown(359.5)).toBe('000°');
    });
});

describe('BearingDisplay (characterization)', () => {
    it('characterization: a bearing is rounded to the degree', () => {
        expect(shown(88.8)).toBe('089°');
        expect(shown(88.4)).toBe('088°');
    });

    it('characterization: a hidden display shows nothing, and shows its value again once visible', () => {
        const d = new BearingDisplay(303);
        const m = mount(d);
        d.isVisible = false;
        m.tick();
        expect(m.text()).toBe('');
        d.isVisible = true;
        m.tick();
        expect(m.text()).toBe('303°');
    });

    it('characterization: a value set after the render shows at the next display tick', () => {
        const d = new BearingDisplay(null);
        const m = mount(d);
        d.bearing = 303;
        expect(m.text()).toBe('---°');
        m.tick();
        expect(m.text()).toBe('303°');
    });
});
