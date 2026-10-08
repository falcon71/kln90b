import {describe, expect, it} from 'vitest';
import {Alignment, RoundedDistanceDisplay} from '../../../../kln90b/controls/displays/RoundedDistanceDisplay';
import {mount} from '../../../harness/render/mount';

/** The four cells of a whole-NM distance after a display tick */
function shown(alignment: Alignment, distance: number | null): string {
    const m = mount(new RoundedDistanceDisplay(alignment, distance));
    m.tick();
    return m.text();
}

describe('RoundedDistanceDisplay', () => {
    // 4-11, figure 4-43: beside FPL 0 the D/T 1 distances are whole NM in a column of three digits at the left of the
    // four cells ( 34,  76, 163, 477)
    it('shows whole NM in three digits at the left beside a flight plan (4-11)', () => {
        expect(shown(Alignment.left, 34)).toBe(' 34 ');
        expect(shown(Alignment.left, 163)).toBe('163 ');
    });

    // 4-11, figure 4-46: with a non-plan page on the left, D/T 1 shows the distance whole and right-aligned (DIS 34NM),
    // while NAV 1 beside it shows the same distance as 34.2
    it('shows a distance of 34.2 NM as 34, right-aligned (4-11)', () => {
        expect(shown(Alignment.right, 34.2)).toBe('  34');
    });

    // 5-3, figure 5-6: TRI 1 shows 404nm
    it('shows three digits right-aligned on the TRI pages (5-3)', () => {
        expect(shown(Alignment.right, 404)).toBe(' 404');
    });

    // 4-16, figure 4-56: before the unit can navigate, D/T 1 shows four dashes for each distance
    it('shows four dashes without a value (4-16)', () => {
        expect(shown(Alignment.left, null)).toBe('----');
        expect(shown(Alignment.right, null)).toBe('----');
    });
});

describe('RoundedDistanceDisplay (characterization)', () => {
    it('characterization: the distance is rounded to the NM', () => {
        expect(shown(Alignment.right, 34.5)).toBe('  35');
        expect(shown(Alignment.right, 34.49)).toBe('  34');
    });

    it('characterization: 1000 NM and more fill all four cells', () => {
        expect(shown(Alignment.left, 1234)).toBe('1234');
        expect(shown(Alignment.right, 1234)).toBe('1234');
    });

    it('characterization: a hidden display shows nothing, and shows its value again once visible', () => {
        const d = new RoundedDistanceDisplay(Alignment.right, 404);
        const m = mount(d);
        d.isVisible = false;
        m.tick();
        expect(m.text()).toBe('');
        d.isVisible = true;
        m.tick();
        expect(m.text()).toBe(' 404');
    });

    it('characterization: a value set after the render shows at the next display tick', () => {
        const d = new RoundedDistanceDisplay(Alignment.left, null);
        const m = mount(d);
        d.distance = 163;
        expect(m.text()).toBe('----');
        m.tick();
        expect(m.text()).toBe('163 ');
    });
});
