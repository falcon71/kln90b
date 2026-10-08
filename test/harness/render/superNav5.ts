import {Cell, readRows} from './screen';

export interface SuperNav5Text {
    /** The seven rows of the left column (distance, ident, mode, ground speed, fields 1 to 3) */
    left: string[];
    /** The message indicator above the range ("msg" or blanks) */
    msg: string;
    /** The map range selector */
    range: string;
    /** VOR, NDB, APT and orientation rows; null while the right cursor is off and they are hidden */
    right: string[] | null;
    /** The direct-to window; null while hidden */
    directTo: string | null;
}

const text = (row: Cell[] | undefined): string => (row ?? []).map(c => c.ch).join('');

/**
 * Super NAV 5 (NAV 5 on both sides, 3-36) is a map with text positioned over it by CSS, not a 23x7 text grid, so Screen
 * cannot read it (Screen.read throws and points here). This reads the text parts from the DOM, built by
 * SuperNav5Page, SuperNav5Left, SuperNav5Right and SuperNav5DirectToSelector. The map itself is not read. Where the
 * parts sit on screen is CSS (KLN90B.scss, .super-nav5-*), so they are separate fields here.
 */
export const SuperNav5 = {
    read(container: Element | null = document.getElementById('pageContainer')): SuperNav5Text {
        if (container === null) throw new Error('SuperNav5.read: no #pageContainer; has the unit booted?');
        const leftEl = container.querySelector('.super-nav5-left-controls');
        if (leftEl === null) throw new Error('SuperNav5.read: Super NAV 5 is not shown (NAV 5 on both sides)');
        const left = leftEl.cloneNode(true) as Element;
        const mgsRange = left.querySelector('.super-nav5-mgs-range')!;
        mgsRange.remove();
        const overlay = readRows(mgsRange);
        const visible = (sel: string): Element | null => {
            const el = container.querySelector(sel);
            return el !== null && el.closest('.d-none') === null ? el : null;
        };
        const right = visible('.super-nav5-right-controls-parent');
        const directTo = visible('.super-nav5-directto-window');
        return {
            left: readRows(left).map(text),
            msg: text(overlay[0]),
            range: text(overlay[1]),
            right: right === null ? null : readRows(right).map(text),
            directTo: directTo === null ? null : text(readRows(directTo)[0]),
        };
    },

    /**
     * The focused field(s) of the Super NAV 5 left column: the text of its inverted runs, without the msg prompt (the
     * first span of the message and range overlay, inverted while a message is unread; the range selector, which shares
     * the overlay, counts), with no-break spaces turned back into blanks. SuperNav5.read() has no mask,
     * so this is how a test finds out which field the cursor is on.
     */
    focused(container: Element | null = document.getElementById('pageContainer')): string[] {
        if (container === null) throw new Error('SuperNav5.focused: no #pageContainer; has the unit booted?');
        return [...container.querySelectorAll('.super-nav5-left-controls .inverted')]
            .filter(e => e.closest('.d-none') === null && !e.matches('.super-nav5-mgs-range > span:first-child'))
            .map(e => e.textContent!.replace(/\u00a0/g, ' '));
    },
};
