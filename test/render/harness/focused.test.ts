import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../harness/boot';
import {intersection, vor} from '../../harness/navdata/builders';
import {FrontPanel} from '../../harness/flight/FrontPanel';
import {Screen} from '../../harness/render/screen';

// NdbFreqEditor and DistanceEditor invert their decimal point with the digits (#302), so the focused field of the INT
// page's DIS row is one run of inverted cells
describe('FrontPanel.focused across the decimal point (harness)', () => {
    /** INT page of the new user intersection INT15 with REF ORD approved (5-19 steps 3 to 8), the cursor on RAD (5-19 step 8, #284) */
    async function refOrd(): Promise<HeadlessUnit> {
        const unit = await bootUnit({facilities: [intersection('KENZY', 47.2, 11.0), vor('ORD', 47.0, 11.0)], position: {lat: 47, lon: 8}});
        await unit.panel.selectPage('R', 'INT  ');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'INT15');
        await unit.panel.cursorTo('R', 'USER POS?');
        await unit.panel.ent();
        await unit.panel.outer('R', -3);
        await unit.panel.enterIdent('R', 'ORD');
        await unit.panel.ent(); // the waypoint page of ORD
        await unit.panel.ent(); // approved
        return unit;
    }

    it('reads the DIS field as one field', async () => {
        const unit = await refOrd();
        await unit.panel.outer('R', 1); // DIS
        expect(unit.panel.focused('R')).toEqual({row: 3, col: 16, text: '___._'});
    });

    /** The cursor on RAD after refOrd(), a radial is entered, then cursorTo to the DIS field (see the test below) */
    async function cursorAtDis(): Promise<HeadlessUnit> {
        const unit = await refOrd();
        await unit.panel.type('R', '0900');
        await unit.panel.ent(); // the cursor moves to DIS
        await unit.panel.outer('R', -2); // REF
        expect(unit.panel.focused('R')).toEqual({row: 1, col: 18, text: 'ORD  '});

        await unit.panel.cursorTo('R', '___._');
        return unit;
    }

    // With a radial entered, the next field after REF that shows ___._ is DIS (5-19 step 10: ENT on the radial moves
    // the cursor to DIS)
    it('lets cursorTo stop at the DIS field', async () => {
        const unit = await cursorAtDis();

        expect(unit.panel.focused('R')).toEqual({row: 3, col: 16, text: '___._'});
    });

    // Figure 5-74 (5-19) shows the open DIS field as one inverse block with the point inside, like the RAD field of
    // figures 5-72 and 5-73; DistanceEditor inverts its point as RadialEditor does. The field fills the cells 4 to 8 of
    // row 3 of the right half. The test above is its sibling: it finds the same field and keeps the text.
    it('covers the decimal point of the DIS field (5-19, figure 5-74, #302)', async () => {
        await cursorAtDis();

        expect(Screen.read().maskRows('R')[3]).toBe('....IIIII..');
    });

    describe('on a screen of its own', () => {
        const STATUS = '<pre><span class="statusline"><span>NAV 2</span>|<span>enr-leg</span> <span class="inverted">msg</span>|<span>INT  </span><br/></span></pre>';
        const focusedOf = (right: string) => {
            document.body.innerHTML = `<div id="pageContainer"><div><div class="left-page"><pre></pre></div><div class="right-page"><pre>${right}<br/></pre></div>${STATUS}</div></div>`;
            return new FrontPanel(() => undefined, () => Screen.read()).focused('R');
        };
        const inv = (text: string) => `<span class="inverted">${text}</span>`;

        it('reports two inverted runs with another character between them as an error', () => {
            expect(() => focusedOf(`D:${inv('012')}:${inv('3')}NM`)).toThrow(/expected one focused field on side R, found 2/);
        });

        it('reports two inverted runs with more than one cell between them as an error', () => {
            expect(() => focusedOf(`D:${inv('012')}..${inv('3')}NM`)).toThrow(/expected one focused field on side R, found 2/);
        });

        it('reports two inverted runs around a blinking cell as an error', () => {
            expect(() => focusedOf(`D:${inv('012')}${'<span class="blink">.</span>'}${inv('3')}NM`)).toThrow(/expected one focused field on side R, found 2/);
        });

        // The second run starts exactly one cell past the end of the first, so only the rows keep the two runs apart
        it('reports inverted runs on different rows as an error', () => {
            expect(() => focusedOf(`D:${inv('012')}<br/>D:xyz.${inv('3')}`)).toThrow(/expected one focused field on side R, found 2/);
        });
    });
});
