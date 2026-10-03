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

function attrOf(el: Element, inherited: CellAttr): CellAttr {
    if (el.classList.contains('inverted-blink')) return 'F';
    if (el.classList.contains('blink')) return 'B';
    if (el.classList.contains('inverted')) return 'I';
    return inherited;
}

/** Text rows of an element as the font renders them: <br> starts a row, d-none subtrees are skipped. */
export function readRows(root: Element): Cell[][] {
    const rows: Cell[][] = [[]];
    const walk = (node: Node, attr: CellAttr) => {
        if (node.nodeType === 3) {
            for (const ch of node.textContent ?? '') {
                rows[rows.length - 1].push({ch: ch === '\u00a0' ? ' ' : ch, attr});
            }
            return;
        }
        if (node.nodeType !== 1) return;
        const el = node as Element;
        if (el.classList.contains('d-none')) return;
        if (el.tagName === 'BR') {
            rows.push([]);
            return;
        }
        const a = attrOf(el, attr);
        el.childNodes.forEach(c => walk(c, a));
    };
    walk(root, '.');
    if (rows.length > 1 && rows[rows.length - 1].length === 0) rows.pop();
    return rows;
}

function fit(row: Cell[] | undefined, width: number, where: string): Cell[] {
    const r = row ?? [];
    if (r.length > width) {
        throw new Error(`Screen: ${where} is ${r.length} cells wide, more than ${width}: "${r.map(c => c.ch).join('')}"`);
    }
    return [...r, ...Array.from({length: width - r.length}, (): Cell => ({ch: ' ', attr: '.'}))];
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
            const l = readRows(left);
            const r = readRows(right);
            for (let i = 0; i < ROWS; i++) {
                grid.push([...fit(l[i], HALF_WIDTH, `left row ${i}`), {ch: SEPARATOR, attr: '.'}, ...fit(r[i], HALF_WIDTH, `right row ${i}`)]);
            }
        } else if (full) {
            const clone = full.cloneNode(true) as Element;
            clone.querySelectorAll('.statusline').forEach(s => s.closest('pre')?.remove());
            const f = readRows(clone);
            if (f.length > ROWS) {
                throw new Error(`Screen: full page has ${f.length} rows, more than ${ROWS} (SevenLinePage pages such as Super NAV 5 are not supported)`);
            }
            for (let i = 0; i < ROWS; i++) grid.push(fit(f[i], FULL_WIDTH, `row ${i}`));
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

    /** Page name in the status line (columns 0-4); shows CRSR while the left cursor is on */
    public leftName(): string {
        return this.row(6).slice(0, 5);
    }

    /** Page name in the status line (columns 18-22); shows CRSR while the right cursor is on */
    public rightName(): string {
        return this.row(6).slice(18, 23);
    }

    /** One half of the screen (11 columns, 6 rows), for assertions about one page */
    public half(side: 'L' | 'R'): string {
        return this.grid.slice(0, ROWS).map(r => r.slice(side === 'L' ? 0 : 12, side === 'L' ? 11 : 23).map(c => c.ch).join('')).join('\n');
    }
}
