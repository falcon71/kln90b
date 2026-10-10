import {describe, expect, it, vi} from 'vitest';
import {FixTypeFlags} from '@microsoft/msfs-sdk';
import {bootToSelfTest, bootUnit, settle} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';
import {savedFlightplan} from '../../harness/storage';
import {approachWorld, standardRoute} from '../../harness/fixtures';
import {pointFrom} from '../../harness/flight/geo';
import {intersection} from '../../harness/navdata/builders';
import {approach, Leg, withProcedures} from '../../harness/navdata/procedures';
import {OneTimeMessage} from '../../../kln90b/data/MessageHandler';

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

    it('skips the fallback text of a canvas', () => {
        mount(`<div><div class="left-page"><canvas>ERROR</canvas><pre>N^&nbsp;&nbsp;&nbsp;40<br/></pre></div><div class="right-page"><pre></pre></div>${STATUS}</div>`);
        expect(Screen.read().row(0)).toBe('N^   40    |           ');
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

describe('Screen, rows wider than the half page', () => {
    const half = (row: string) => `<div><div class="left-page"><pre>${row}<br/></pre></div><div class="right-page"><pre></pre></div>${STATUS}</div>`;

    // The nearest selector of APT 1 and VOR leaves blanks past the edge in the DOM; the pilot sees nothing there
    it('reads a row whose cells past the edge are blank', () => {
        mount(half('ABCDEFGHIJK' + '&nbsp;'.repeat(4)));
        expect(Screen.read().row(0)).toBe('ABCDEFGHIJK|           ');
    });

    // A character past the edge is a rendering bug, e.g. the type letter of an NDB on the ACT page (#115)
    it('throws when a non-blank cell is past the edge', () => {
        mount(half('ABCDEFGHIJK' + '&nbsp;'.repeat(3) + 'X'));
        expect(() => Screen.read()).toThrow(/left row 0 is 15 cells wide, more than 11/);
    });

    it('throws when an inverted blank is past the edge, which the pilot would see', () => {
        mount(half('ABCDEFGHIJK<span class="inverted">&nbsp;</span>'));
        expect(() => Screen.read()).toThrow(/left row 0 is 12 cells wide, more than 11/);
    });
});

describe('Screen, the status line', () => {
    // KLN90B.scss .offset-left-cursor: a margin of one cell in front of CRSR or KYBD
    it('reads the left cursor field one cell in, as the pilot sees it', () => {
        mount(`<div><div class="left-page"><pre></pre></div><div class="right-page"><pre></pre></div><pre><span class="statusline">`
            + `<span class="inverted offset-left-cursor">CRSR</span>|<span>enr-leg</span> <span class="inverted">ent</span>|<span>APT 1</span><br/></span></pre></div>`);
        const screen = Screen.read();
        expect(screen.row(6)).toBe(' CRSR|enr-leg ent|APT 1');
        expect(screen.mask().split('\n')[6]).toBe('.IIII.........III......');
        expect(screen.status()).toEqual({left: 'CRSR', mode: 'enr-leg ent', right: 'APT 1'});
    });

    it('reads the fields of a status line without a cursor', () => {
        mount(`<div><div class="left-page"><pre></pre></div><div class="right-page"><pre></pre></div>${STATUS}</div>`);
        expect(Screen.read().status()).toEqual({left: 'NAV 2', mode: 'enr-leg msg', right: 'SUP'});
    });

    it('shows CRSR on the left and the page name on the right with the left cursor on (booted unit)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');

        expect(Screen.read().status()).toEqual({left: 'CRSR', mode: 'enr-leg msg', right: 'SUP'});
        expect(Screen.read().row(6)).toBe(' CRSR|enr-leg msg|SUP  ');
    });

    it('shows CRSR on both sides with both cursors on (booted unit)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.cursor('R');

        expect(Screen.read().status()).toEqual({left: 'CRSR', mode: 'enr-leg msg', right: 'CRSR'});
    });
});

describe('Screen, pages with their own layout', () => {
    // 3-3: the Turn-On page has seven rows and no status line
    it('reads the seven rows of the welcome page', async () => {
        const unit = await bootUnit({engineRunning: false});
        unit.send('KLN90B_Power_On');
        await vi.advanceTimersByTimeAsync(1000);

        const lines = Screen.read().text().split('\n');

        expect(lines).toHaveLength(7);
        expect(lines[0]).toBe(' GPS             ORS 20');
        expect(lines[1]).toBe(' ©1994 ALLIEDSIGNAL INC');
        expect(lines[6]).toBe(' SELF TEST IN PROGRESS ');
    });

    // MessagePage joins its lines with a newline inside one <pre>. The messages the boot posted are read first, so that
    // the page holds only the one the test posts
    it('reads the lines of the MSG page', async () => {
        const unit = await bootUnit();
        await unit.panel.readMessages();
        unit.props.messageHandler.addMessage(new OneTimeMessage(['SAMPLE MESSAGE', 'SECOND LINE']));
        await unit.panel.msg();

        expect(Screen.read().text().split('\n')).toEqual([
            'SAMPLE MESSAGE'.padEnd(23),
            ' SECOND LINE'.padEnd(23),
            ' '.repeat(23),
            ' '.repeat(23),
            ' '.repeat(23),
            ' '.repeat(23),
            '     |enr-leg msg|     ',
        ]);
    });

    it('starts a row at a newline inside a pre, and not outside one', () => {
        mount('<div><div class="left-page"><pre>ONE\nTWO<br/></pre></div><div class="right-page"><pre></pre></div>' + STATUS + '</div>');
        expect(Screen.read().rows('L').slice(0, 2)).toEqual(['ONE        ', 'TWO        ']);

        mount('<div><div class="left-page"><div>ONE\nTWO</div><pre></pre></div><div class="right-page"><pre></pre></div>' + STATUS + '</div>');
        // Outside a <pre> the browser collapses it to a space; the reader keeps it as the character it is, in the same row
        expect(Screen.read().cell(0, 3).ch).toBe('\n');
    });

    it('throws for Super NAV 5 and names the reader to use', () => {
        mount('<div><div class="full-page"><pre class="super-nav5-left-controls">1<br/>2<br/>3<br/>4<br/>5<br/>6<br/>7<br/></pre></div></div>');
        expect(() => Screen.read()).toThrow(/Super NAV 5 is not a text grid; use SuperNav5\.read/);
    });

    // The orientation and range of NAV 5 are positioned at the bottom of the half page with CSS, below the map
    it('reads the NAV 5 orientation and range at row 5', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'NAV 5');

        expect(Screen.read().rows('L')).toEqual([' '.repeat(11), ' '.repeat(11), ' '.repeat(11), ' '.repeat(11), ' '.repeat(11), 'N^       40']);
    });

    it('returns six rows for each half, and the mask of the same columns', () => {
        mount(`<div><div class="left-page"><pre>LEFT<br/></pre></div><div class="right-page"><pre>R<span class="inverted">IG</span>HT<br/></pre></div>${STATUS}</div>`);
        const screen = Screen.read();

        expect(screen.rows('L')).toEqual(['LEFT       ', ...Array(5).fill(' '.repeat(11))]);
        expect(screen.rows('R')[0]).toBe('RIGHT      ');
        expect(screen.maskRows('R')).toEqual(['.II........', ...Array(5).fill('.'.repeat(11))]);
        expect(screen.maskRows('L')).toEqual(Array(6).fill('.'.repeat(11)));
        expect(screen.half('R')).toBe(screen.rows('R').join('\n'));
    });
});

// FlightplanList.tsx draws USE? over the first four cells of USE? INVRT? with a negative margin of eleven cells
// (KLN90B.scss .use-invert), so that the cursor on USE? inverts those four cells only
describe('Screen, the USE? overlay of a numbered flight plan', () => {
    /** The first row of a numbered plan as UseInvertButton renders it: USE? INVRT?, then USE? in the overlay span */
    const useRow = (invrtClass: string, useHtml: string) => mount(`<div><div class="left-page"><pre><span><span class="${invrtClass}">USE? INVRT?</span>`
        + `<span class="use-invert">${useHtml}</span></span><br/>  1:KAAA<br/></pre></div><div class="right-page"><pre></pre></div>${STATUS}</div>`);

    it('reads USE? INVRT? once, with the overlay over its first cells', () => {
        useRow('', '<span>USE?</span>');
        const screen = Screen.read();

        expect(screen.rows('L').slice(0, 2)).toEqual(['USE? INVRT?', '  1:KAAA   ']);
        expect(screen.maskRows('L')[0]).toBe('...........');
    });

    it('inverts only the four cells of USE? when the cursor is on it', () => {
        useRow('', '<span class="inverted">USE?</span>');

        expect(Screen.read().maskRows('L')[0]).toBe('IIII.......');
    });

    it('keeps the flashing attribute of the overlay', () => {
        useRow('', '<span class="inverted inverted-blink">USE?</span>');

        expect(Screen.read().maskRows('L')[0]).toBe('FFFF.......');
    });

    it('inverts all eleven cells when the cursor is on USE? INVRT? and the overlay is hidden', () => {
        useRow('inverted', '<span class="d-none">USE?</span>');
        const screen = Screen.read();

        expect(screen.rows('L')[0]).toBe('USE? INVRT?');
        expect(screen.maskRows('L')[0]).toBe('IIIIIIIIIII');
    });

    // UseInvertButton.tick hides USE? while USE? INVRT? has the cursor, because a normal USE? over the inverted cells
    // would fill them green
    it('throws when a normal overlay lies over inverted cells', () => {
        useRow('inverted', '<span>USE?</span>');

        expect(() => Screen.read()).toThrow(/USE\? overlay draws a normal "U" over an inverted cell 0/);
    });

    it('throws when a normal overlay lies over flashing cells', () => {
        useRow('inverted inverted-blink', '<span>USE?</span>');

        expect(() => Screen.read()).toThrow(/USE\? overlay draws a normal "U" over an inverted cell 0/);
    });

    it('throws when the overlay contains a line break', () => {
        useRow('', '<span>USE?<br/></span>');

        expect(() => Screen.read()).toThrow(/a line break inside the USE\? overlay/);
    });

    it('throws when the overlay shows other characters than the cells below it', () => {
        useRow('', '<span>LOAD</span>');

        expect(() => Screen.read()).toThrow(/USE\? overlay shows "L" over "U" in cell 0/);
    });

    it('throws when the overlay would start left of its row', () => {
        mount(`<div><div class="left-page"><pre><span>USE?</span><span class="use-invert"><span>USE?</span></span><br/></pre></div>`
            + `<div class="right-page"><pre></pre></div>${STATUS}</div>`);

        expect(() => Screen.read()).toThrow(/USE\? overlay "USE\?" does not lie over its row "USE\?"/);
    });

    // The rows of a numbered plan with waypoints could not be read before the reader handled the USE? overlay:
    // selectPage, focused and Screen.read() threw on 15 cells
    it('reads FPL 3 with waypoints and lets the panel find USE? and USE? INVRT? (booted unit)', async () => {
        const {kaaa, abc, kbbb} = standardRoute();
        const unit = await bootUnit({facilities: [kaaa, abc, kbbb], position: {lat: 47.0, lon: 8.0}, storage: savedFlightplan(3, [kaaa, abc, kbbb])});

        await unit.panel.selectPage('L', 'FPL 3');
        expect(Screen.read().rows('L')).toEqual(['USE? INVRT?', '  1:KAAA   ', '  2:ABC    ', '  3:KBBB   ', '  4:       ', '           ']);

        await unit.panel.cursor('L');
        expect(unit.panel.focused('L')).toEqual({row: 0, col: 0, text: 'USE?'});

        await unit.panel.outer('L', 1);
        expect(unit.panel.focused('L')).toEqual({row: 0, col: 0, text: 'USE? INVRT?'});
    });
});

// KLN90B.scss .apt-8-iaf-list: the list of APT 8 and ACT 8 is positioned (one row down, sixteen cells from the screen's
// left edge, which is cell 4 of the right half), so a browser draws every row of it from that cell
describe('Screen, the positioned IAF list of APT 8', () => {
    const iafList = (rows: string) => mount(`<div><div class="left-page"><pre></pre></div><div class="right-page"><pre>R18-KPRC<br/>IAF `
        + `<div class="apt-8-iaf-list"><div>${rows}</div></div></pre></div>${STATUS}</div>`);

    it('draws the second and later rows of the list from cell 4, where the first row starts', () => {
        iafList('<span>1 IAFAA</span><br/><span>2 IAFAB</span><br/><span>3 IAFAC</span><br/>');

        expect(Screen.read().rows('R').slice(0, 4)).toEqual(['R18-KPRC   ', 'IAF 1 IAFAA', '    2 IAFAB', '    3 IAFAC']);
    });

    it('keeps the attributes of the list rows and leaves cells 0 to 3 of the shifted rows normal', () => {
        iafList('<span>1 IAFAA</span><br/><span class="inverted">2 IAFAB</span><br/>');

        expect(Screen.read().maskRows('R').slice(1, 3)).toEqual(['...........', '....IIIIIII']);
    });

    it('throws when the list does not start in cell 4', () => {
        mount(`<div><div class="left-page"><pre></pre></div><div class="right-page"><pre>R18-KPRC<br/>IAF  `
            + `<div class="apt-8-iaf-list"><div><span>1 IAFAA</span><br/><span>2 IAFAB</span><br/></div></div></pre></div>${STATUS}</div>`);

        expect(() => Screen.read()).toThrow(/the IAF list starts in cell 5, not 4/);
    });

    /** KPRC of approachWorld() with its RNAV 18 approach given a second IAF, IAFAB, west of IAFAA */
    function twoIafs() {
        const w = approachWorld();
        const at = pointFrom(w.iafaa, 270, 5);
        const iafab = intersection('IAFAB', at.lat, at.lon);
        const rnav18 = approach({
            type: ApproachType.APPROACH_TYPE_RNAV, runway: '18',
            transitions: [
                {name: 'IAFAA', legs: [Leg.IF(w.iafaa, FixTypeFlags.IAF), Leg.TF(w.ifaaa)]},
                {name: 'IAFAB', legs: [Leg.IF(iafab, FixTypeFlags.IAF), Leg.TF(w.ifaaa)]},
            ],
            final: [Leg.IF(w.ifaaa), Leg.TF(w.fafaa, FixTypeFlags.FAF), Leg.TF(w.mapaa, FixTypeFlags.MAP)],
        });
        const kprc = withProcedures(w.kprc, {approaches: [rnav18]});
        return {facilities: [kprc, w.enraa, w.iafaa, iafab, w.ifaaa, w.fafaa, w.mapaa], position: w.north(40)};
    }

    it('reads both IAFs of the approach on a booted unit', async () => {
        const unit = await bootUnit(twoIafs());
        await settle(unit);
        await unit.panel.selectPage('R', 'APT 8');
        await unit.panel.cursor('R');
        await unit.panel.ent(); // RNAV 18

        const rows = Screen.read().rows('R');
        expect(rows.slice(0, 3)).toEqual(['R18-KPRC   ', 'IAF 1 IAFAA', '    2 IAFAB']);
        // The list has no row of its own past its last IAF, and nothing follows it on the page
        expect(rows.slice(3)).toEqual(Array(3).fill(' '.repeat(11)));
    });
});

// The CSS of KLN90B.scss: .inverted is black on green, .inverted-blink (later) takes the background away and makes the
// text green, .blink (later still) makes the text transparent
describe('Screen, the inverted-blink class', () => {
    const left = (cells: string) => `<div><div class="left-page"><pre>${cells}<br/></pre></div><div class="right-page"><pre></pre></div>${STATUS}</div>`;
    const maskOf = (cells: string) => {
        mount(left(cells));
        return Screen.read().mask().split('\n')[0].slice(0, 11);
    };

    it('reads inverted-blink without inverted as normal text', () => {
        expect(maskOf('<span class="inverted-blink">AB</span>')).toBe('...........');
    });

    it('reads inverted-blink with inverted as flashing', () => {
        expect(maskOf('<span class="inverted inverted-blink">AB</span>')).toBe('FF.........');
    });

    it('reads inverted-blink inside an inverted element as flashing', () => {
        expect(maskOf('<span class="inverted"><span class="inverted-blink">AB</span>C</span>')).toBe('FFI........');
    });

    it('reads a cell with blink as blinking, also when it has inverted-blink too, since blink hides the text', () => {
        expect(maskOf('<span class="blink">A</span><span class="inverted inverted-blink blink">B</span>')).toBe('BB.........');
    });

    it('reads inverted-blink inside a cell that already reads flashing as flashing', () => {
        expect(maskOf('<span class="inverted inverted-blink"><span class="inverted-blink">A</span></span>')).toBe('F..........');
    });

    it('reads the plain cell next to an inverted-blink cell as normal', () => {
        expect(maskOf('<span class="inverted-blink">A</span>B<span class="inverted">C</span>')).toBe('..I........');
    });
});

describe('Screen, a seventh row of a half page', () => {
    const rows = (n: number, last: string) => Array.from({length: n}, (_, i) => i === n - 1 ? last : `ROW${i}`).join('<br/>') + '<br/>';
    const left = (html: string) => `<div><div class="left-page"><pre>${html}</pre></div><div class="right-page"><pre></pre></div>${STATUS}</div>`;
    const right = (html: string) => `<div><div class="left-page"><pre></pre></div><div class="right-page"><pre>${html}</pre></div>${STATUS}</div>`;

    it('throws when the left half has text in a seventh row, naming the side and the row', () => {
        mount(left(rows(7, 'HIDDEN')));
        expect(() => Screen.read()).toThrow('Screen: the left half has a row past the sixth: "HIDDEN"');
    });

    it('throws when the right half has text in a seventh row', () => {
        mount(right(rows(7, 'HIDDEN')));
        expect(() => Screen.read()).toThrow('Screen: the right half has a row past the sixth: "HIDDEN"');
    });

    it('throws for an inverted blank in a seventh row, which the pilot would see', () => {
        mount(left(rows(7, '<span class="inverted">&nbsp;</span>')));
        expect(() => Screen.read()).toThrow(/the left half has a row past the sixth/);
    });

    it('throws when only an eighth row holds text', () => {
        mount(left(rows(8, 'HIDDEN').replace('ROW6', '&nbsp;')));
        expect(() => Screen.read()).toThrow('Screen: the left half has a row past the sixth: "HIDDEN"');
    });

    it('reads a half page whose seventh row is blank', () => {
        mount(left(rows(7, '&nbsp;&nbsp;')));
        expect(Screen.read().rows('L')).toEqual(['ROW0       ', 'ROW1       ', 'ROW2       ', 'ROW3       ', 'ROW4       ', 'ROW5       ']);
    });

    it('reads a half page of exactly six rows', () => {
        mount(left(rows(6, 'ROW5')));
        expect(Screen.read().rows('L')[5]).toBe('ROW5       ');
    });
});

describe('Screen.inverse and pageRows', () => {
    // The Database page after APPROVE? is a full page: line 2 says the data base expires, and the cursor is on the
    // last row (3-7; the literals of AiracPage.test.ts)
    it('read the inverse field of a full-page row and the six trimmed rows', async () => {
        const unit = await bootToSelfTest();
        await unit.panel.cursorTo('R', 'APPROVE?');
        await unit.panel.ent();

        const screen = Screen.read();

        expect(screen.inverse(5)).toBe('ACKNOWLEDGE?');
        expect(screen.inverse(1)).toBe('');
        expect(screen.pageRows()[1]).toBe('DATA BASE EXPIRES');
        expect(screen.pageRows()).toHaveLength(6);
    });
});
