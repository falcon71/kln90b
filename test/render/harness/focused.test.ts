import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../harness/boot';
import {intersection, vor} from '../../harness/navdata/builders';
import {FrontPanel} from '../../harness/flight/FrontPanel';
import {Screen} from '../../harness/render/screen';

// NdbFreqEditor and DistanceEditor draw their decimal point as plain text and invert only the digits around it, so the
// focused field of the INT page's DIS row is two runs of inverted cells with one plain "." between them
describe('FrontPanel.focused across a plain decimal point (harness)', () => {
    /** INT page of the new user intersection INT15 with REF ORD approved (5-19 steps 3 to 8), the cursor at the REF row */
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
        await unit.panel.outer('R', 2); // RAD, DIS
        expect(unit.panel.focused('R')).toEqual({row: 3, col: 16, text: '___._'});
    });

    /** The cursor on REF after a radial is entered, then cursorTo to the DIS field (see the test below) */
    async function cursorAtDis(): Promise<HeadlessUnit> {
        const unit = await refOrd();
        await unit.panel.outer('R', 1); // RAD
        await unit.panel.type('R', '0900');
        await unit.panel.ent(); // the cursor moves to DIS
        await unit.panel.outer('R', -2); // REF
        expect(unit.panel.focused('R')).toEqual({row: 1, col: 18, text: 'ORD  '});

        await unit.panel.cursorTo('R', '___._');
        return unit;
    }

    // With a radial entered, the next field after REF that shows ___._ is DIS (5-19 step 10: ENT on the radial moves
    // the cursor to DIS). cursorTo walks over the radial and used to throw at DIS, where it found two runs
    it('lets cursorTo stop at the DIS field', async () => {
        const unit = await cursorAtDis();

        expect(unit.panel.focused('R')).toEqual({row: 3, col: 16, text: '___._'});
    });

    // The digits around the point are inverted, the point is not: the two runs that focused() joins. Figure 5-74 (5-19)
    // shows the open DIS field as one inverse block with the point inside, like the RAD field of figures 5-72 and
    // 5-73 (RadialEditor does invert its point); DistanceEditor draws the point as plain text. The field fills the
    // cells 4 to 8 of row 3 of the right half. The test above is its sibling: it finds the same field and keeps the
    // text.
    it.fails('covers the decimal point of the DIS field (5-19, figure 5-74, #302)', async () => {
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

        it('joins two runs that one plain point separates', () => {
            expect(focusedOf(`D:${inv('012')}.${inv('3')}NM`)).toEqual({row: 0, col: 14, text: '012.3'});
        });

        it('does not join runs that another character separates', () => {
            expect(() => focusedOf(`D:${inv('012')}:${inv('3')}NM`)).toThrow(/expected one focused field on side R, found 2/);
        });

        it('does not join runs that more than one cell separates', () => {
            expect(() => focusedOf(`D:${inv('012')}..${inv('3')}NM`)).toThrow(/expected one focused field on side R, found 2/);
        });

        it('does not join a point that is itself in a field of its own', () => {
            expect(() => focusedOf(`D:${inv('012')}${'<span class="blink">.</span>'}${inv('3')}NM`)).toThrow(/expected one focused field on side R, found 2/);
        });

        // The second run starts exactly one cell past the end of the first, and a plain point lies in the cell between
        // them in its own row, so only the rows keep the two runs apart
        it('does not join runs on different rows', () => {
            expect(() => focusedOf(`D:${inv('012')}<br/>D:xyz.${inv('3')}`)).toThrow(/expected one focused field on side R, found 2/);
        });
    });
});
