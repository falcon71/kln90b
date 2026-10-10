import {describe, expect, it} from 'vitest';
import {DeviationBar} from '../../../../kln90b/controls/displays/DeviationBar';
import {mount, mountedRead} from '../../../harness/render/mount';

const TO = true;
const FROM = false;

/**
 * The CDI of NAV 1 after a display tick. `deviation` is the cross track in NM, negative left of the course (the sign of
 * navPage.xtkToActive), `scale` the full-scale deflection in NM (5, 1 or 0.3).
 *
 * The font draws the scale with Greek code points (DeviationBar.tsx): η a dot, θ the TO triangle, ι the FROM triangle,
 * Α to Κ a dot with the bar at ten positions from its left to its right edge, Λ to Υ the TO triangle with the bar,
 * Φ to ζ the FROM triangle with the bar. Index 4 of each run (Ε, Ο, α) is the bar through the middle of the cell.
 */
function cdi(deviation: number | null, toFrom: boolean, scale = 5): { text: string, mask: string } {
    return mountedRead(new DeviationBar(deviation, toFrom, scale));
}

describe('DeviationBar', () => {
    // 3-31: on the course the bar sits on the middle triangle, which points up for TO
    it('draws the bar through the TO triangle on the course (3-31)', () => {
        expect(cdi(0, TO).text).toBe('ηηηηηΟηηηηη');
    });

    // 3-31: the triangle points down for FROM
    it('draws the bar through the FROM triangle on the course (3-31)', () => {
        expect(cdi(0, FROM).text).toBe('ηηηηηαηηηηη');
    });

    // 3-31, figure 3-99: five dots each side, one NM a dot; the aircraft 2 NM left of the course puts the bar two dots
    // right of the center, like the needle of a CDI
    it('draws the bar two dots right of the center 2 NM left of the course (3-31)', () => {
        expect(cdi(-2, TO).text).toBe('ηηηηηθηΕηηη');
    });

    it('draws the bar two dots left of the center 2 NM right of the course (3-31)', () => {
        expect(cdi(2, TO).text).toBe('ηηηΕηθηηηηη');
    });

    // 3-31: the CDI shows five NM each side, so the bar stops at the outer dot
    it('stops the bar at the outer dot beyond full scale on either side (3-31)', () => {
        expect(cdi(-7, TO).text).toBe('ηηηηηθηηηηΕ');
        expect(cdi(7, TO).text).toBe('Εηηηηθηηηηη');
    });

    // 3-31: past the waypoint the triangle points down; the bar moves the same way
    it('moves the bar the same way flying FROM (3-31)', () => {
        expect(cdi(-2, FROM).text).toBe('ηηηηηιηΕηηη');
    });

    // 3-31 (note) and 5-37, 5-38: a full scale of 1 NM is 0.2 NM a dot, 0.3 NM is 0.06 NM a dot, so 0.4 NM and 0.12 NM
    // left of the course are two dots right of the center
    it('scales the dots with the CDI scale (3-31, 5-38)', () => {
        expect(cdi(-0.4, TO, 1).text).toBe('ηηηηηθηΕηηη');
        expect(cdi(-0.12, TO, 0.3).text).toBe('ηηηηηθηΕηηη');
    });

    // 3-31, figure 3-101: FLAG over the CDI when the unit is not usable for navigation, two dots left and right of it
    it('shows FLAG over the CDI without a deviation (3-31)', () => {
        expect(cdi(null, TO).text).toBe('ηηF L A Gηη');
    });

    // The FROM half of the #225 pin, which draws both glyphs today
    it('draws the whole bar next to the FROM triangle 0.55 NM left of the course (3-31)', () => {
        expect(cdi(-0.55, FROM).text).toBe('ηηηηηζΑηηηη');
    });

    // 3-31: the bar works like a CDI needle whatever the triangle shows. 0.55 NM left of the course puts the bar
    // between the triangle and the first dot right of it, which the font draws with two glyphs: the triangle with the
    // bar at its right edge (TO: Υ) and the dot with the bar at its left edge (Α). The TO case drops the dot glyph
    // (DeviationBar.tsx:72, an operator precedence slip). Pinned on NAV 1 as well.
    it.fails('draws the whole bar next to the TO triangle (3-31, #225)', () => {
        expect(cdi(-0.55, TO).text).toBe('ηηηηηΥΑηηηη');
    });
});

describe('DeviationBar (characterization)', () => {
    it('characterization: the FLAG letters are inverted', () => {
        expect(cdi(null, TO).mask).toBe('..IIIIIII..');
    });

    it('characterization: the bar between the first dot left of the center and the TO triangle has two glyphs', () => {
        expect(cdi(0.45, TO).text).toBe('ηηηηΚΛηηηηη');
    });

    it('characterization: a deviation that arrives after the render replaces FLAG at the next display tick', () => {
        const bar = new DeviationBar(null, TO, 5);
        const m = mount(bar);
        m.tick();
        expect(m.text()).toBe('ηηF L A Gηη');
        bar.deviation = -2;
        m.tick();
        expect(m.text()).toBe('ηηηηηθηΕηηη');
        bar.deviation = null;
        m.tick();
        expect(m.text()).toBe('ηηF L A Gηη');
    });
});
