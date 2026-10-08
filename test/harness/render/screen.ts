export type CellAttr = '.' | 'I' | 'B' | 'F';

export interface Cell {
    ch: string;
    attr: CellAttr;
}

const HALF_WIDTH = 11;
const FULL_WIDTH = 23;
const ROWS = 6;
/** The border between the half pages; the real screen draws a line there */
const SEPARATOR = '|';

/**
 * The attribute an element gives its text, by the CSS of KLN90B.scss: `.inverted` is black on green, `.inverted-blink`
 * (later in the file) takes the green background away and makes the text green, and `.blink` (later still) makes the
 * text transparent. So:
 * - `blink` hides the text, whatever else the element has: `B`;
 * - `inverted-blink` on top of `inverted` (the element itself or an ancestor) is the normal phase of a flashing field,
 *   which the screen alternates with the inverse phase: `F`;
 * - `inverted-blink` without `inverted` is plain green text, as normal as the cell without the class: it changes
 *   nothing (the StatusLine's `ent` keeps the class while an unread `msg` toggles it);
 * - `inverted` alone: `I`.
 */
function attrOf(el: Element, inherited: CellAttr): CellAttr {
    const inverted = el.classList.contains('inverted') || inherited === 'I' || inherited === 'F';
    if (el.classList.contains('blink')) return 'B';
    if (el.classList.contains('inverted-blink') && inverted) return 'F';
    if (el.classList.contains('inverted')) return 'I';
    return inherited;
}

/**
 * How far the USE? button of a numbered flight plan is pulled back over `USE? INVRT?`: a negative CSS margin of eleven
 * cells (KLN90B.scss .use-invert, FlightplanList.tsx UseInvertButton), so it covers the first four cells of its row.
 */
const USE_INVERT_SHIFT = 11;

/**
 * Reads the text that `read` adds to the current row as an overlay that starts USE_INVERT_SHIFT cells further left,
 * over cells already in the row. An inverted or flashing overlay cell replaces the cell below. A normal overlay cell has
 * no background of its own, so it shows the cell below, which must then be normal too: over an inverted cell its green
 * glyph would cover the black one and fill the cell green, which `UseInvertButton.tick` hides the USE? button to avoid
 * (FlightplanList.tsx). Both must be the same character, since the screen cannot show two glyphs in one cell. Either
 * case is a rendering bug and throws.
 */
function overlay(rows: Cell[][], read: () => void): void {
    const row = rows[rows.length - 1];
    const end = row.length;
    const count = rows.length;
    read();
    if (rows.length !== count) throw new Error('Screen: a line break inside the USE? overlay (.use-invert)');
    const cells = row.splice(end);
    if (cells.length === 0) return;
    const at = end - USE_INVERT_SHIFT;
    if (at < 0 || at + cells.length > end) {
        throw new Error(`Screen: the USE? overlay "${cells.map(c => c.ch).join('')}" does not lie over its row "${row.map(c => c.ch).join('')}"`);
    }
    cells.forEach((cell, i) => {
        const below = row[at + i];
        if (cell.ch !== below.ch) {
            throw new Error(`Screen: the USE? overlay shows "${cell.ch}" over "${below.ch}" in cell ${at + i}`);
        }
        if (cell.attr !== '.') {
            row[at + i] = cell;
        } else if (below.attr !== '.') {
            throw new Error(`Screen: the USE? overlay draws a normal "${cell.ch}" over an inverted cell ${at + i}`);
        }
    });
}

/**
 * The IAF list of APT 8 and ACT 8 is positioned with CSS (KLN90B.scss .apt-8-iaf-list): the browser draws each of its
 * rows from the cell where the list starts, cell 4 of the right half, while the DOM starts its later rows at the line
 * start.
 */
const IAF_LIST_CELL = 4;

/**
 * Reads the list that `read` adds to the rows, which the browser draws from `cell` in every row. The list starts in the
 * current row, which must have reached that cell (the "IAF " in front of the list), and every later row of the list,
 * the empty one after its last line break included, is moved right by `cell` blank cells. Nothing follows the list on
 * the pages that have it, so nothing is misplaced by that last row.
 */
function positioned(rows: Cell[][], cell: number, read: () => void): void {
    const first = rows.length - 1;
    if (rows[first].length !== cell) {
        throw new Error(`Screen: the IAF list starts in cell ${rows[first].length}, not ${cell}`);
    }
    read();
    for (let r = first + 1; r < rows.length; r++) {
        rows[r].unshift(...Array.from({length: cell}, (): Cell => ({ch: ' ', attr: '.'})));
    }
}

/**
 * Text rows of an element as the font renders them: <br> and a newline inside a <pre> start a row, d-none subtrees are
 * skipped, and so is the fallback text inside a <canvas> ("ERROR" in Canvas.tsx), which a browser that supports canvas never shows. The map
 * itself is not read, and text positioned over it with CSS (the NAV 5 range) reads in DOM order, not at its row.
 */
export function readRows(root: Element): Cell[][] {
    const rows: Cell[][] = [[]];
    const walk = (node: Node, attr: CellAttr, inPre: boolean) => {
        if (node.nodeType === 3) {
            for (const ch of node.textContent ?? '') {
                // A <pre> renders a newline in its text as a line break (the MSG page joins its lines with one)
                if (ch === '\n' && inPre) rows.push([]);
                else rows[rows.length - 1].push({ch: ch === '\u00a0' ? ' ' : ch, attr});
            }
            return;
        }
        if (node.nodeType !== 1) return;
        const el = node as Element;
        if (el.classList.contains('d-none') || el.tagName === 'CANVAS') return;
        if (el.tagName === 'BR') {
            rows.push([]);
            return;
        }
        // The left status field is pushed one cell to the right by a CSS margin while the left cursor is on
        // (KLN90B.scss .offset-left-cursor); the pilot sees that cell as a blank in front of CRSR/KYBD
        if (el.classList.contains('offset-left-cursor')) rows[rows.length - 1].push({ch: ' ', attr: '.'});
        const a = attrOf(el, attr);
        const pre = inPre || el.tagName === 'PRE';
        if (el.classList.contains('use-invert')) {
            overlay(rows, () => el.childNodes.forEach(c => walk(c, a, pre)));
            return;
        }
        if (el.classList.contains('apt-8-iaf-list')) {
            positioned(rows, IAF_LIST_CELL, () => el.childNodes.forEach(c => walk(c, a, pre)));
            return;
        }
        el.childNodes.forEach(c => walk(c, a, pre));
    };
    walk(root, '.', false);
    if (rows.length > 1 && rows[rows.length - 1].length === 0) rows.pop();
    return rows;
}

function fit(row: Cell[] | undefined, width: number, where: string): Cell[] {
    const r = [...(row ?? [])];
    // The DOM of some pages carries trailing blanks past the edge (the nearest selector of APT 1 and VOR); the pilot sees
    // nothing there. A visible character past the edge is a rendering bug and still throws (#115).
    while (r.length > width && r[r.length - 1].ch === ' ' && r[r.length - 1].attr === '.') r.pop();
    if (r.length > width) {
        throw new Error(`Screen: ${where} is ${r.length} cells wide, more than ${width}: "${r.map(c => c.ch).join('')}"`);
    }
    return [...r, ...Array.from({length: width - r.length}, (): Cell => ({ch: ' ', attr: '.'}))];
}

/**
 * The rows of a half page. The bottom line of NAV 5 (orientation and range) is positioned over the map with CSS, so it
 * reads at row 5, the last row of the half page, instead of in DOM order.
 */
function readHalf(half: Element): Cell[][] {
    const bottom = half.querySelector('.nav-5-bottom-controls');
    if (bottom === null) return readRows(half);
    const clone = half.cloneNode(true) as Element;
    clone.querySelector('.nav-5-bottom-controls')!.remove();
    const rows = readRows(clone);
    while (rows.length < 5) rows.push([]);
    if (rows.length > 5 && rows.slice(5).some(r => r.length > 0)) {
        throw new Error('Screen: the NAV 5 bottom controls share row 5 with other text');
    }
    rows[5] = readRows(bottom)[0] ?? [];
    return rows;
}

/**
 * A half page has six rows (row 7 is the status line). Text in a later row is not on the screen, and dropping it
 * silently hid a creation block that stayed visible under a waypoint page, so it throws; blank rows past the sixth are
 * tolerated.
 */
function overflow(rows: Cell[][], side: string): void {
    const extra = rows.slice(ROWS).find(r => r.some(c => c.ch !== ' ' || c.attr !== '.'));
    if (extra) throw new Error(`Screen: the ${side} half has a row past the sixth: "${extra.map(c => c.ch).join('')}"`);
}

/**
 * The 23×7 character screen as the pilot sees it, plus a mask of the inverse and flashing cells. Special glyphs stay as
 * the code points the KLN90B font maps them to (docs/architecture.md, UI 3).
 */
export class Screen {
    private constructor(private readonly grid: Cell[][]) {
    }

    public static read(container: Element | null = document.getElementById('pageContainer')): Screen {
        if (container === null) throw new Error('Screen: no #pageContainer; has the unit booted?');
        const visible = (sel: string) => {
            const el = container.querySelector(sel);
            return el !== null && el.closest('.d-none') === null ? el : null;
        };
        const statusEl = visible('.statusline');
        const status = fit(statusEl ? readRows(statusEl)[0] : [], FULL_WIDTH, 'status line');
        const left = visible('.left-page');
        const right = visible('.right-page');
        const full = visible('.full-page');
        const grid: Cell[][] = [];
        if (left && right) {
            const l = readHalf(left);
            const r = readHalf(right);
            overflow(l, 'left');
            overflow(r, 'right');
            for (let i = 0; i < ROWS; i++) {
                grid.push([...fit(l[i], HALF_WIDTH, `left row ${i}`), {ch: SEPARATOR, attr: '.'}, ...fit(r[i], HALF_WIDTH, `right row ${i}`)]);
            }
        } else if (full) {
            if (full.querySelector('.super-nav5-left-controls') !== null) {
                throw new Error('Screen: Super NAV 5 is not a text grid; use SuperNav5.read() (test/harness/render/superNav5.ts)');
            }
            const clone = full.cloneNode(true) as Element;
            clone.querySelectorAll('.statusline').forEach(s => s.closest('pre')?.remove());
            const f = readRows(clone);
            // Without a status line (the welcome page) the page owns all seven rows
            const max = statusEl ? ROWS : ROWS + 1;
            if (f.length > max) {
                throw new Error(`Screen: full page has ${f.length} rows, more than ${max}`);
            }
            for (let i = 0; i < max; i++) grid.push(fit(f[i], FULL_WIDTH, `row ${i}`));
            if (!statusEl) return new Screen(grid);
        } else {
            for (let i = 0; i < ROWS; i++) grid.push(fit([], FULL_WIDTH, 'blank row'));
        }
        grid.push(status);
        return new Screen(grid);
    }

    public text(): string {
        return this.grid.map(r => r.map(c => c.ch).join('')).join('\n');
    }

    public mask(): string {
        return this.grid.map(r => r.map(c => c.attr).join('')).join('\n');
    }

    public row(n: number): string {
        return this.grid[n].map(c => c.ch).join('');
    }

    public cell(row: number, col: number): Cell {
        return this.grid[row][col];
    }

    /** Text, a blank line and the mask; the format for snapshots and failure messages. */
    public dump(): string {
        return `${this.text()}\n\n${this.mask()}`;
    }

    /**
     * The left field of the status line (columns 0-4): the page name, or ' CRSR' / ' KYBD' while the left cursor is on
     * (one blank cell of margin in front of it, as the pilot sees it). Prefer status() for new tests.
     */
    public leftName(): string {
        return this.row(6).slice(0, 5);
    }

    /** The right field of the status line (columns 18-22): the page name, or 'CRSR ' / 'KYBD ' while the right cursor is on */
    public rightName(): string {
        return this.row(6).slice(18, 23);
    }

    /** The status line's fields as the pilot reads them: the left page name (or CRSR/KYBD), the mode field, the right page name */
    public status(): { left: string; mode: string; right: string } {
        const r = this.row(6);
        return {left: r.slice(0, 5).trim(), mode: r.slice(6, 17).trim(), right: r.slice(18, 23).trim()};
    }

    /** One half of the screen (11 columns, 6 rows), for assertions about one page */
    public half(side: 'L' | 'R'): string {
        return this.rows(side).join('\n');
    }

    /** The six rows of one half, as half() joins them */
    public rows(side: 'L' | 'R'): string[] {
        return this.halfOf(this.text(), side);
    }

    /** The mask of one half (same columns as rows()), one string of '.', 'I', 'B' and 'F' per row */
    public maskRows(side: 'L' | 'R'): string[] {
        return this.halfOf(this.mask(), side);
    }

    private halfOf(lines: string, side: 'L' | 'R'): string[] {
        return lines.split('\n').slice(0, ROWS).map(r => r.slice(side === 'L' ? 0 : 12, side === 'L' ? 11 : 23));
    }
}
