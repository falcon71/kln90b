import {vi} from 'vitest';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../boot';
import {arcWorld, legWorld} from '../fixtures';
import {pointFrom} from '../flight/geo';
import {savedFlightplan} from '../storage';
import {SuperNav5Page} from '../../../kln90b/pages/left/SuperNav5Page';
import {Cell, readRows, Screen} from './screen';

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
     * The focused field(s) of the Super NAV 5 left column: the text of its inverted runs, with no-break spaces turned
     * back into blanks. SuperNav5.read() has no mask, so this is how a test finds out which field the cursor is on.
     * The msg prompt is left out: it is the first span of the message and range overlay and is inverted while a message
     * is unread. The range selector shares that overlay and does count.
     */
    focused(container: Element | null = document.getElementById('pageContainer')): string[] {
        if (container === null) throw new Error('SuperNav5.focused: no #pageContainer; has the unit booted?');
        return [...container.querySelectorAll('.super-nav5-left-controls .inverted')]
            .filter(e => e.closest('.d-none') === null && !e.matches('.super-nav5-mgs-range > span:first-child'))
            .map(e => e.textContent!.replace(/\u00a0/g, ' '));
    },
};

/**
 * Shows Super NAV 5 (NAV 5 on both sides, 3-36): the right side first, because its shorter way passes NAV 5, which is
 * Super NAV 5 once the left shows NAV 5, then the left side, then the last click with the inner knob (Super NAV 5 hides
 * the status line that selectPage reads). Waits `waitMs` (default one second) and throws with the screen unless the
 * overlay is Super NAV 5, which a pending knob or a page that refused it would leave out.
 */
export async function showSuperNav5(unit: HeadlessUnit, o: { waitMs?: number } = {}): Promise<void> {
    await unit.panel.selectPage('R', 'NAV 4');
    await unit.panel.selectPage('L', 'NAV 5');
    await unit.panel.inner('R', 1);
    await vi.advanceTimersByTimeAsync(o.waitMs ?? 1000);
    if (!(unit.overlay() instanceof SuperNav5Page)) {
        let shown: string;
        try {
            shown = Screen.read().dump();
        } catch (e) {
            shown = String(e); // Screen refuses to read a Super NAV 5 that shows, which only the overlay check missed
        }
        throw new Error(`showSuperNav5: Super NAV 5 is not shown\n${shown}`);
    }
}

/**
 * Boots in the leg world on the leg to KDDD, `westNm` west of it and `rightNm` right of the course (south), moving at
 * `groundspeedKt` on track 090, and shows Super NAV 5 (NAV 5 on both sides; the right side first, its shorter way
 * passes NAV 5)
 */
export async function superNav5OnLeg(o: {
    westNm: number, rightNm?: number, groundspeedKt?: number, storage?: Record<string, unknown>, magvar?: number,
}): Promise<HeadlessUnit> {
    const {kaaa, kddd, keee, west} = legWorld();
    const start = west(o.westNm);
    const unit = await bootUnit({
        facilities: [kaaa, kddd, keee], position: start, magvar: o.magvar,
        storage: {...savedFlightplan(0, [kaaa, kddd, keee]), ...o.storage},
    });
    await settle(unit);
    const right = o.rightNm ?? 0;
    const at = pointFrom(start, right >= 0 ? 180 : 0, Math.abs(right));
    await moveAircraft(unit, at, {groundspeedKt: o.groundspeedKt ?? 120, trackTrue: 90});
    await showSuperNav5(unit);
    return unit;
}

/**
 * Boots in the arc world on the 225 radial of the left arc, loads the approach (the arc is active) and shows Super
 * NAV 5
 */
export async function superNav5OnArc(o: { storage?: Record<string, unknown>, magvar?: number } = {}): Promise<HeadlessUnit> {
    const w = arcWorld();
    const unit = await bootUnit({
        facilities: w.facilities, position: w.at(225, 10), magvar: o.magvar,
        storage: {...savedFlightplan(0, [w.kprc]), ...o.storage},
    });
    await settle(unit);
    await unit.panel.loadProcedure('APT 8');
    await showSuperNav5(unit);
    return unit;
}
