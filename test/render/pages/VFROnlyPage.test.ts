import {describe, expect, it} from 'vitest';
import {bootToSelfTest, BootOptions, HeadlessUnit} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';

// The VFR only page (VFROnlyPage), shown after the approval of the Self Test page on a unit installed for VFR only
// (3-7). The OBS warning that can follow it is in ObsWarningPage.test.ts, the Database page in AiracPage.test.ts.

const VFR_ONLY = '<VFROnly>true</VFROnly>';
const panelXml = (...parts: string[]) =>
    `<PlaneHTMLConfig><Instrument><Name>KLN90B</Name>${parts.join('')}</Instrument></PlaneHTMLConfig>`;

/** Cold and dark, switched on, through the Turn-On page, then ENT on APPROVE? of the Self Test page */
async function approveSelfTestPage(opts: BootOptions = {}): Promise<HeadlessUnit> {
    const unit = await bootToSelfTest(opts);
    await unit.panel.cursorTo('R', 'APPROVE?');
    await unit.panel.ent();
    return unit;
}

/** The six rows of the full-width page, trimmed */
const pageRows = () => Screen.read().text().split('\n').slice(0, 6).map(r => r.trim());

/** The characters of a full-width row that are shown inverse: the field under the cursor */
function inverseText(row: number): string {
    const s = Screen.read();
    const text = s.row(row);
    const mask = s.mask().split('\n')[row];
    return [...text].filter((_, i) => mask[i] === 'I').join('');
}

describe('VFR only page (3-7)', () => {
    /**
     * The two texts of the page with their cells: the title on the second row, three cells in, and the button on the
     * sixth row, five cells in (figure 3-22 is not column-exact; the cells are the code's). The other rows are the
     * business of the #327 pin below
     */
    const expectVfrPage = () => {
        expect([Screen.read().row(1), Screen.read().row(5)])
            .toEqual(['   FOR VFR USE ONLY'.padEnd(23), '     ACKNOWLEDGE?'.padEnd(23)]);
    };

    // 3-7 step 11, figure 3-22: a unit installed for VFR only shows FOR VFR USE ONLY after APPROVE?, with the cursor on
    // ACKNOWLEDGE?; ENT leads on to the Database page (step 12)
    it('shows FOR VFR USE ONLY after APPROVE? and goes on to the Database page with ENT (3-7)', async () => {
        const unit = await approveSelfTestPage({panelXml: panelXml(VFR_ONLY)});

        expectVfrPage();
        expect(inverseText(5)).toBe('ACKNOWLEDGE?');

        await unit.panel.ent();

        expect(pageRows()[1]).toBe('DATA BASE EXPIRES');
        expect(unit.errors).toEqual([]);
    });

    // Figure 3-22: the page shows FOR VFR USE ONLY and ACKNOWLEDGE? and nothing else. VFROnlyPage.render has a comma
    // after a <br/>, which the page shows at the start of its fourth row. The sibling above holds the page itself.
    it.fails('shows nothing but FOR VFR USE ONLY and ACKNOWLEDGE? (3-7, #327)', async () => {
        await approveSelfTestPage({panelXml: panelXml(VFR_ONLY)});

        expect(pageRows().filter(r => r !== '')).toEqual(['FOR VFR USE ONLY', 'ACKNOWLEDGE?']);
    });
});
