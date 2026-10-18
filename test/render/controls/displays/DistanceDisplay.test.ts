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

    // 4-8: the display adds no zero below 10 NM unless asked for (the nearest views do), so DIS keeps its blank
    it('pads a distance below 10 NM with a blank (4-8)', () => {
        expect(shown(4, 4.1)).toBe(' 4.1');
    });

    // 3-31, figure 3-101: without navigation DIS is dashed with the decimal point in its place
    it('shows dashes around the decimal point without a value (3-31)', () => {
        expect(shown(4, null)).toBe('--.-');
    });

    // The sibling of the #226 test: 99.94 NM stays below the cutoff and keeps its four cells
    it('shows 99.9 just below 100 NM (3-31)', () => {
        expect(shown(4, 99.94)).toBe('99.9');
    });

    // 3-31: DIS has four cells, tenths below 100 NM and whole NM above. 99.97 NM is below the cutoff but its tenth
    // rounds up to 100.0, five cells. Expected: 100 (rounded) or 99.9 (truncated). Also tested on NAV 1.
    it('keeps a distance that rounds up to 100 NM in its four cells (3-31, #226)', () => {
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

    // 3-32: the sibling of the #226 test below, 9.94 NM stays below the cutoff and keeps its tenth in the three cells
    it('shows 9.9 just below 10 NM (3-32)', () => {
        expect(shown(3, 9.94)).toBe('9.9');
    });

    // 3-32: three cells. 9.97 NM rounds up to 10.0, four cells. Expected: 10 (rounded) or 9.9 (truncated). Also tested
    // on NAV 3. The three-cell form is the class default; the NAV 3 page itself uses the four-cell form of #231 below
    it('keeps a cross track that rounds up to 10 NM in its three cells (3-32, #226)', () => {
        expect([' 10', '9.9']).toContain(shown(3, 9.97));
    });
});

/** The cells of the NAV 3 cross track (four cells, hundredths below 1 NM, #231) */
const shownXtk = (distance: number | null): string => mountedText(new DistanceDisplay(4, distance, false, true));

// #231, the maintainer's ruling after a photo of a real unit (TCAS,_GPS_and_Altitude_Alerter_(250504914).jpg, FLY
// R0.09NM): below 1 NM the cross track takes the blank after L or R and shows hundredths with a zero in front; from
// 1 NM it keeps the blank and the three-cell form of 3-32
describe('DistanceDisplay, the NAV 3 cross track (#231)', () => {
    it('shows hundredths below 1 NM in four cells (#231)', () => {
        expect(shownXtk(0.09)).toBe('0.09');
        expect(shownXtk(0.994)).toBe('0.99');
    });

    it('shows a tenth after a blank from 1 NM, also where hundredths round up to 1 (#231)', () => {
        expect(shownXtk(0.996)).toBe(' 1.0');
        expect(shownXtk(9.94)).toBe(' 9.9');
    });

    it('shows whole NM from 10 NM and dashes without a value after the blank (#231)', () => {
        expect(shownXtk(12.3)).toBe('  12');
        expect(shownXtk(null)).toBe(' -.-');
    });
});

// The six cells of the VOR distance on NAV 2
describe('DistanceDisplay, six cells', () => {
    // 3-8, figure 3-27 (8.2nm) and 3-32, figure 3-103 (15.2nm): the distance from the VOR has a tenth, right-aligned
    it('shows the VOR distance with a tenth (3-8, 3-32)', () => {
        expect(shown(6, 8.2)).toBe('   8.2');
        expect(shown(6, 15.2)).toBe('  15.2');
    });

    // 3-8, figure 3-27: the VOR distance below 10 NM keeps its blank; the zero is the nearest views' (#266)
    it('pads a VOR distance below 10 NM with a blank (3-8)', () => {
        expect(shown(6, 4.1)).toBe('   4.1');
    });

    // 3-8, figure 3-26: before the first fix the distance is dashed with the decimal point in its place (a photo of a
    // real unit, KLN90B 2.jpg, shows the same)
    it('shows dashes around the decimal point without a value (3-8)', () => {
        expect(shown(6, null)).toBe('----.-');
    });
});

// The five cells of the distance on the nearest APT, VOR and NDB pages: the nearest views ask for the leading zero
describe('DistanceDisplay, five cells', () => {
    /** The five cells the nearest views build: with the leading zero */
    const nearest = (distance: number | null): string => mountedText(new DistanceDisplay(5, distance, true));

    // 3-22, figure 3-72 (27.7nm on the nearest APT 1) and 3-49, figure 3-152 (32.6nm on the nearest VOR page): a
    // nearest distance of 10 NM or more has a tenth
    it('shows a nearest distance of 10 NM or more with a tenth (3-22, 3-49)', () => {
        expect(nearest(27.7)).toBe(' 27.7');
        expect(nearest(32.6)).toBe(' 32.6');
    });

    // Figures 3-71, 3-76, 3-134 and 3-154 show a nearest distance below 10 NM with a leading zero (04.1nm, 03.1nm,
    // 06.5nm); the KLN 89 trainer shows none, and the maintainer ruled for the 90B figures. The nearest views of
    // APT 1, VOR and NDB pass the leading zero, and the pages of #266 pin it there as well.
    it('shows a nearest distance below 10 NM with a leading zero (3-22, #266)', () => {
        expect(nearest(4.1)).toBe(' 04.1');
        expect(nearest(3.1)).toBe(' 03.1');
        expect(nearest(0.04)).toBe(' 00.0');
    });

    // 3-22, the cutoff of the zero: 9.94 rounds to 9.9 and keeps it, 9.96 rounds to 10.0 and has two digits in front.
    // The figures show tenths and a zero below 10 only; that the cutoff is the rounded value is inferred from them.
    it('keeps the leading zero up to 9.9 NM and shows 10.0 above (3-22)', () => {
        expect(nearest(9.94)).toBe(' 09.9');
        expect(nearest(9.96)).toBe(' 10.0');
        expect(nearest(10)).toBe(' 10.0');
    });

    it('characterization: the nearest display shows whole NM from 1000 NM on, the zero changes nothing there', () => {
        expect(nearest(1234.4)).toBe(' 1234');
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
