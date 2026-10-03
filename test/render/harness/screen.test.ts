import {describe, expect, it} from 'vitest';
import {Screen} from '../../harness/render/screen';

function mount(html: string): Element {
    document.body.innerHTML = `<div id="pageContainer">${html}</div>`;
    return document.getElementById('pageContainer')!;
}

const STATUS = '<pre><span class="statusline"><span>NAV 2</span>|<span>enr-leg</span> <span class="inverted">msg</span>|<span>SUP&nbsp;&nbsp;</span><br/></span></pre>';

describe('Screen', () => {
    it('composes both half pages and the status line', () => {
        mount(`<div><div class="left-page"><pre>PRESENT POS<br/><br/>ABC&nbsp;&nbsp;180°fr<br/></pre></div>`
            + `<div class="right-page"><pre><span class="d-none">HIDDEN</span>SUP<br/></pre></div>${STATUS}</div>`);
        const screen = Screen.read();
        expect(screen.text().split('\n')).toEqual([
            'PRESENT POS|SUP        ',
            '           |           ',
            'ABC  180°fr|           ',
            '           |           ',
            '           |           ',
            '           |           ',
            'NAV 2|enr-leg msg|SUP  ',
        ]);
        expect(screen.mask().split('\n')[6]).toBe('..............III......');
        expect(screen.leftName()).toBe('NAV 2');
        expect(screen.rightName()).toBe('SUP  ');
    });

    it('marks inverse, blinking and flashing-inverse cells', () => {
        mount(`<div><div class="left-page"><pre><span class="inverted">A</span><span class="blink">B</span>`
            + `<span class="inverted inverted-blink">C</span>D<br/></pre></div><div class="right-page"><pre></pre></div>${STATUS}</div>`);
        // The separator column is a normal cell, so it shows as '.' in the mask
        expect(Screen.read().mask().split('\n')[0]).toBe('IBF....................');
    });

    it('throws when a row is wider than its half page', () => {
        mount(`<div><div class="left-page"><pre>TWELVE CHARS<br/></pre></div><div class="right-page"><pre></pre></div>${STATUS}</div>`);
        expect(() => Screen.read()).toThrow(/left row 0 is 12 cells wide, more than 11: "TWELVE CHARS"/);
    });

    it('inherits the attribute of an enclosing span into nested spans', () => {
        mount(`<div><div class="left-page"><pre><span class="inverted">A<span>B</span></span><span class="blink">C<span>D</span></span>`
            + `<span class="inverted"><span class="inverted-blink">E</span>F</span><br/></pre></div><div class="right-page"><pre></pre></div>${STATUS}</div>`);
        expect(Screen.read().mask().split('\n')[0]).toBe('IIBBFI' + '.'.repeat(17));
    });

    it('reads a full page that contains its own status line', () => {
        mount(`<div><div class="full-page"><pre>LINE ONE<br/>LINE TWO<br/></pre>${STATUS}</div></div>`);
        const lines = Screen.read().text().split('\n');
        expect(lines).toEqual([
            'LINE ONE'.padEnd(23),
            'LINE TWO'.padEnd(23),
            ' '.repeat(23),
            ' '.repeat(23),
            ' '.repeat(23),
            ' '.repeat(23),
            'NAV 2|enr-leg msg|SUP  ',
        ]);
    });

    it('reads a full-screen overlay while the half pages are hidden', () => {
        mount(`<div><div class="left-page d-none"><pre>LEFT<br/></pre></div><div class="right-page d-none"><pre>RIGHT<br/></pre></div>`
            + `<div class="full-page"><pre>OVERLAY<br/></pre></div>${STATUS}</div>`);
        const lines = Screen.read().text().split('\n');
        expect(lines[0]).toBe('OVERLAY'.padEnd(23));
        expect(lines.slice(1, 6)).toEqual(Array(5).fill(' '.repeat(23)));
        expect(lines[6]).toBe('NAV 2|enr-leg msg|SUP  ');
    });

    it('throws when a full page has more rows than the screen', () => {
        mount(`<div><div class="full-page"><pre>1<br/>2<br/>3<br/>4<br/>5<br/>6<br/>7<br/></pre></div>${STATUS}</div>`);
        expect(() => Screen.read()).toThrow(/full page has 7 rows, more than 6/);
    });
});
