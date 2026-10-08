import {describe, expect, it} from 'vitest';
import {SuperDeviationBar} from '../../../../kln90b/controls/displays/SuperDeviationBar';
import {mount} from '../../../harness/render/mount';

const TO = true;
const FROM = false;

/**
 * The CDI of Super NAV 1 after a display tick: 23 cells, a blank and a dot (Ш) in turn, the triangle in cell 11 (Щ
 * TO, Ъ FROM), so the five dots on each side are cells 1, 3, 5, 7, 9 and 13, 15, 17, 19, 21. The font draws the bar
 * with Cyrillic code points (SuperDeviationBar.tsx): Ѐ to Љ a dot with the bar at ten positions from left to right,
 * Њ to Г the TO triangle with the bar, Д to Н the FROM triangle with the bar, О to Ч a blank cell with the bar. Index
 * 4 of each run (Є, Ў, И, Т) is the bar through the middle of the cell. `deviation` is negative left of the course.
 */
function cdi(deviation: number | null, toFrom: boolean, scale = 5): { text: string, mask: string } {
    const m = mount(new SuperDeviationBar(deviation, toFrom, scale));
    m.tick();
    return {text: m.text(), mask: m.mask()};
}

describe('SuperDeviationBar', () => {
    // 3-32: Super NAV 1 carries the NAV 1 information; 3-31: on the course the bar sits on the middle triangle, which
    // points up for TO and down for FROM
    it('draws the bar through the triangle on the course (3-31, 3-32)', () => {
        expect(cdi(0, TO).text).toBe(' Ш Ш Ш Ш Ш Ў Ш Ш Ш Ш Ш ');
        expect(cdi(0, FROM).text).toBe(' Ш Ш Ш Ш Ш И Ш Ш Ш Ш Ш ');
    });

    // The sibling of the scale pins: 2 NM left of the course puts the bar into the second dot right of the triangle
    // (cell 15, at a position inside the cell that the pin below decides) and leaves every other cell as it is
    it('draws the bar in the second dot right of the triangle 2 NM left of the course (3-31, 3-32)', () => {
        const {text} = cdi(-2, TO);
        expect(text.slice(0, 15)).toBe(' Ш Ш Ш Ш Ш Щ Ш ');
        expect('ЀЁЂЃЄЅІЇЈЉ').toContain(text[15]);
        expect(text.slice(16)).toBe(' Ш Ш Ш ');
    });

    // 3-31: the triangle points down for FROM, also with the bar away from it. Only the triangle cell (11) is read, so
    // the test does not depend on where the bar lands (#NEW-7-2)
    it('keeps the FROM triangle in the middle with the bar 2 NM off the course (3-31, 3-32)', () => {
        expect(cdi(-2, FROM).text[11]).toBe('Ъ');
    });

    // 3-31: each dot is one NM, and 3-32: Super NAV 1 has the same information as NAV 1, whose bar sits on the second
    // dot 2 NM off the course. The second dot right of the triangle is cell 15. The code maps the full scale onto 11
    // cells each side ((dev + 1) * 11) where the dots are 2 cells apart (10 cells to the outer dot), so 2 NM lands at
    // cell 15.4.
    it.fails('draws the bar on the second dot 2 NM off the course (3-31, 3-32, #NEW-7-2)', () => {
        expect(cdi(-2, TO).text).toBe(' Ш Ш Ш Ш Ш Щ Ш Є Ш Ш Ш ');
        expect(cdi(2, TO).text).toBe(' Ш Ш Ш Є Ш Щ Ш Ш Ш Ш Ш ');
    });

    // 3-31: five NM each side, so beyond full scale the bar stops at the outer dot, cell 21; the code puts it in cell
    // 22, the blank after the outer dot
    it.fails('stops the bar at the outer dot beyond full scale (3-31, 3-32, #NEW-7-2)', () => {
        expect(cdi(-7, TO).text).toBe(' Ш Ш Ш Ш Ш Щ Ш Ш Ш Ш Є ');
    });

    // 3-31: the sibling of the scale pin. Beyond full scale the row keeps its 23 cells and the cells left of the outer
    // dot are the scale
    it('keeps the 23 cells of the row beyond full scale (3-31, 3-32)', () => {
        const {text} = cdi(-7, TO);
        expect(text).toHaveLength(23);
        expect(text.slice(0, 21)).toBe(' Ш Ш Ш Ш Ш Щ Ш Ш Ш Ш ');
    });

    // The FROM half of the #225 pin, which draws both glyphs today: 0.25 NM left of the course puts the bar on the
    // boundary between the triangle (cell 11) and the blank right of it (cell 12)
    it('draws the whole bar next to the FROM triangle 0.25 NM left of the course (3-31, 3-32)', () => {
        expect(cdi(-0.25, FROM).text).toBe(' Ш Ш Ш Ш Ш НОШ Ш Ш Ш Ш ');
    });

    // 3-31, 3-32: the same for TO. The TO case drops the second glyph (SuperDeviationBar.tsx:59, the operator
    // precedence slip of #225). The input lands on this boundary with either the code's scale or the one of #NEW-7-2.
    it.fails('draws the whole bar next to the TO triangle (3-31, 3-32, #225)', () => {
        expect(cdi(-0.25, TO).text).toBe(' Ш Ш Ш Ш Ш ГОШ Ш Ш Ш Ш ');
    });
});

describe('SuperDeviationBar (characterization)', () => {
    it('characterization: FLAG over the center of the CDI, inverted, without a deviation', () => {
        const {text, mask} = cdi(null, TO);
        expect(text).toBe(' Ш Ш Ш ШF L A GШ Ш Ш Ш');
        expect(mask).toBe('........IIIIIII.......');
    });
});
