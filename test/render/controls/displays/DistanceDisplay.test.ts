import {describe, expect, it} from 'vitest';
import {DistanceDisplay} from '../../../../kln90b/controls/displays/DistanceDisplay';
import {mount, mountedText} from '../../../harness/render/mount';

/** The cells of a distance display of `length` cells after a display tick */
const shown = (length: number, distance: number | null): string => mountedText(new DistanceDisplay(length, distance));

// The four cells of DIS on NAV 1 and Super NAV 1 (and RANGE on OTH 6)
describe('DistanceDisplay, four cells', () => {
    // 5-7, figure 5-21 (DIS 64.8nm) and 4-7, figure 4-31 (DIS 52.4nm): below 100 NM the distance has a tenth (photos of
    // real units show DIS 14.2NM and 47.1NM the same way), and 4-8, figure 4-35: below 1 NM the tenth follows a zero
    it('shows a tenth below 100 NM, with a zero in front of it below 1 NM (5-7, 4-7, 4-8)', () => {
        expect(shown(4, 64.8)).toBe('64.8');
        expect(shown(4, 0.4)).toBe(' 0.4');
    });

    // 3-31, figure 3-97: from 100 NM on DIS shows whole nautical miles (683nm), right-aligned in the four cells
    it('shows whole NM from 100 NM on (3-31)', () => {
        expect(shown(4, 683)).toBe(' 683');
        expect(shown(4, 100)).toBe(' 100');
        expect(shown(4, 150.4)).toBe(' 150');
    });

    // 3-31, figure 3-101: without navigation DIS is dashed with the decimal point in its place
    it('shows dashes around the decimal point without a value (3-31)', () => {
        expect(shown(4, null)).toBe('--.-');
    });

    // The setup sibling of the pin: 99.94 NM stays below the cutoff and keeps its four cells
    it('shows 99.9 just below 100 NM (3-31)', () => {
        expect(shown(4, 99.94)).toBe('99.9');
    });

    // 3-31: DIS has four cells, tenths below 100 NM and whole NM above. 99.97 NM is below the cutoff but its tenth
    // rounds up to 100.0, five cells. Expected: 100 (rounded) or 99.9 (truncated). Pinned on NAV 1 as well.
    it.fails('keeps a distance that rounds up to 100 NM in its four cells (3-31, #226)', () => {
        expect([' 100', '99.9']).toContain(shown(4, 99.97));
    });
});

// The three cells of the cross track on NAV 3 (FLY L/R)
describe('DistanceDisplay, three cells', () => {
    // 3-32, figures 3-104 and 3-105: FLY L 2.7nm and FLY R 0.2nm
    it('shows a tenth below 10 NM, with a zero in front of it below 1 NM (3-32)', () => {
        expect(shown(3, 2.7)).toBe('2.7');
        expect(shown(3, 0.2)).toBe('0.2');
    });

    // 3-32: the field has three cells (figures 3-104, 3-105), so from 10 NM on there is no room for a tenth
    it('shows whole NM from 10 NM on (3-32)', () => {
        expect(shown(3, 12.3)).toBe(' 12');
    });

    // 3-32: three cells. 9.97 NM rounds up to 10.0, four cells. Expected: 10 (rounded) or 9.9 (truncated). Pinned on
    // NAV 3 as well. The sibling above holds the 0.2 below 1 NM in three cells; a fix of #231 (whether the real unit
    // shows hundredths below 1 NM) would change that spec test, not this pin
    it.fails('keeps a cross track that rounds up to 10 NM in its three cells (3-32, #226)', () => {
        expect([' 10', '9.9']).toContain(shown(3, 9.97));
    });
});

// The six cells of the VOR distance on NAV 2
describe('DistanceDisplay, six cells', () => {
    // 3-8, figure 3-27 (8.2nm) and 3-32, figure 3-103 (15.2nm): the distance from the VOR has a tenth, right-aligned
    it('shows the VOR distance with a tenth (3-8, 3-32)', () => {
        expect(shown(6, 8.2)).toBe('   8.2');
        expect(shown(6, 15.2)).toBe('  15.2');
    });

    // 3-8, figure 3-26: before the first fix the distance is dashed with the decimal point in its place (a photo of a
    // real unit, KLN90B 2.jpg, shows the same)
    it('shows dashes around the decimal point without a value (3-8)', () => {
        expect(shown(6, null)).toBe('----.-');
    });
});

// The five cells of the distance on the nearest APT, VOR and NDB pages
describe('DistanceDisplay, five cells', () => {
    // 3-22, figure 3-72 (27.7nm on the nearest APT 1) and 3-49, figure 3-152 (32.6nm on the nearest VOR page): a
    // nearest distance of 10 NM or more has a tenth
    it('shows a nearest distance of 10 NM or more with a tenth (3-22, 3-49)', () => {
        expect(shown(5, 27.7)).toBe(' 27.7');
        expect(shown(5, 32.6)).toBe(' 32.6');
    });

    // Figures 3-71, 3-76, 3-134 and 3-154 show a nearest distance below 10 NM with a leading zero (04.1nm, 03.1nm,
    // 06.5nm); the KLN 89 trainer shows none, and the maintainer ruled for the 90B figures. Pinned on APT 1, VOR and
    // NDB as well. DistanceDisplay(5) is used by the nearest views only (CoordOrNearestView,
    // AirportCoordOrNearestView).
    // This pin presumes the fix lands in DistanceDisplay: a fix in the nearest views instead would leave it failing
    // for the wrong reason, and the one who fixes #266 there removes it.
    it.fails('shows a nearest distance below 10 NM with a leading zero (3-22, #266)', () => {
        expect(shown(5, 4.1)).toBe(' 04.1');
    });

    // The sibling of the pin: the same value reaches the display and shows its tenth
    it('shows 4.1 NM with its tenth (3-22)', () => {
        expect(shown(5, 4.1).trim()).toMatch(/^0?4\.1$/);
    });
});

describe('DistanceDisplay (characterization)', () => {
    it('characterization: three cells without a value are a dash, the decimal point and a dash', () => {
        expect(shown(3, null)).toBe('-.-');
    });

    it('characterization: six cells keep a tenth up to 9999.9 NM', () => {
        expect(shown(6, 1234.56)).toBe('1234.6');
        expect(shown(6, 12345.6)).toBe(' 12346');
    });

    it('characterization: five cells show whole NM from 1000 NM on', () => {
        expect(shown(5, 123.4)).toBe('123.4');
        expect(shown(5, 1234.4)).toBe(' 1234');
    });

    it('characterization: a hidden display shows nothing, and shows its value again once visible', () => {
        const d = new DistanceDisplay(4, 64.8);
        const m = mount(d);
        d.isVisible = false;
        m.tick();
        expect(m.text()).toBe('');
        d.isVisible = true;
        m.tick();
        expect(m.text()).toBe('64.8');
    });

    it('characterization: a value set after the render shows at the next display tick', () => {
        const d = new DistanceDisplay(4, null);
        const m = mount(d);
        d.distance = 64.8;
        expect(m.text()).toBe('--.-');
        m.tick();
        expect(m.text()).toBe('64.8');
    });
});
