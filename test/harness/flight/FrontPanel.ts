import {vi} from 'vitest';
import {
    EVT_ALT, EVT_CLR, EVT_DCT, EVT_ENT, EVT_L_CURSOR, EVT_L_INNER_LEFT, EVT_L_INNER_RIGHT, EVT_L_OUTER_LEFT,
    EVT_L_OUTER_RIGHT, EVT_MSG, EVT_POWER, EVT_POWER_OFF, EVT_POWER_ON, EVT_R_CURSOR, EVT_R_INNER_LEFT,
    EVT_R_INNER_RIGHT, EVT_R_OUTER_LEFT, EVT_R_OUTER_RIGHT, EVT_R_SCAN,
} from '../../../kln90b/HEvents';
import {Screen} from '../render/screen';

export type Side = 'L' | 'R';

/**
 * Page groups in outer-knob order (PageTreeController LEFT_PAGE_TREE / RIGHT_PAGE_TREE), by the first three characters
 * of the status-line name. The harness test of selectPage walks the real trees and checks this list against them.
 */
export const PAGE_GROUPS: Record<Side, string[]> = {
    L: ['TRI', 'MOD', 'FPL', 'NAV', 'CAL', 'STA', 'SET', 'OTH'],
    R: ['CTR', 'REF', 'ACT', 'D/T', 'NAV', 'APT', 'VOR', 'NDB', 'INT', 'SUP'],
};

/** AlphabetEditorField.charset in kln90b/controls/editors/EditorField.tsx */
const ALPHABET = [' ', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'];
/** The characters of a waypoint selector (CHARSET in kln90b/controls/selects/WaypointSelector.tsx). It is the same cycle as ALPHABET, started at 0. */
const SELECTOR_CHARSET = [...'0123456789', ' ', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
/** One display tick, so the screen shows the result of each click (DOM changes only in display ticks) */
const CLICK_MS = 250;
/** The unit's own timing is in seconds (the 17 s welcome page), so waiting for a page moves in steps of one */
const WAIT_STEP_MS = 1000;
const WAIT_CAP_STEPS = 30;

export interface Field {
    row: number;
    col: number;
    text: string;
}

function sameName(shown: string, wanted: string): boolean {
    shown = shown.trim();
    wanted = wanted.trim();
    // With more than one sub-page, the status line shows "APT+3" for "APT 3"
    return shown === wanted || (shown[3] === '+' && shown.slice(0, 3) === wanted.slice(0, 3) && shown[4] === wanted[4]);
}

/** The page number of a status-line name ("FPL 0", "APT+3", "SET10"); null for a group without numbers ("ACT", "VOR") */
function pageNumber(name: string): number | null {
    const m = /^.{3}[ +]?(\d+)$/.exec(name.trim());
    if (m === null) return null;
    const n = Number(m[1]);
    // The SET group ends with SET 0 (PageTreeController: Set1Page to Set10Page, then Set0DummyPage)
    return name.startsWith('SET') && n === 0 ? 11 : n;
}

/** Clicks from one character of the set to another, the shorter way around; forward on a tie */
function steps(charset: string[], from: string, to: string): number {
    const a = charset.indexOf(from);
    const b = charset.indexOf(to);
    if (b < 0) throw new Error(`FrontPanel: "${to}" cannot be entered with the knob`);
    if (a < 0) return 1; // "_" (no value yet): one click enters or starts the field, then read again
    const forward = (b - a + charset.length) % charset.length;
    return forward <= charset.length / 2 ? forward : forward - charset.length;
}

/** The unit's controls, driven through the same H events as the sim and the aircraft's hardware. */
export class FrontPanel {
    constructor(private readonly send: (evt: string) => void, private readonly screen: () => Screen) {
    }

    public async press(evt: string, times = 1): Promise<void> {
        for (let i = 0; i < times; i++) {
            this.send(evt);
            await vi.advanceTimersByTimeAsync(CLICK_MS);
        }
    }

    /** Outer knob; positive clicks turn right */
    public outer(side: Side, clicks: number): Promise<void> {
        const evt = side === 'L' ? (clicks > 0 ? EVT_L_OUTER_RIGHT : EVT_L_OUTER_LEFT) : (clicks > 0 ? EVT_R_OUTER_RIGHT : EVT_R_OUTER_LEFT);
        return this.press(evt, Math.abs(clicks));
    }

    /** Inner knob; positive clicks turn right */
    public inner(side: Side, clicks: number): Promise<void> {
        const evt = side === 'L' ? (clicks > 0 ? EVT_L_INNER_RIGHT : EVT_L_INNER_LEFT) : (clicks > 0 ? EVT_R_INNER_RIGHT : EVT_R_INNER_LEFT);
        return this.press(evt, Math.abs(clicks));
    }

    public cursor(side: Side): Promise<void> {
        return this.press(side === 'L' ? EVT_L_CURSOR : EVT_R_CURSOR);
    }

    public ent(): Promise<void> {
        return this.press(EVT_ENT);
    }

    public clr(): Promise<void> {
        return this.press(EVT_CLR);
    }

    public dct(): Promise<void> {
        return this.press(EVT_DCT);
    }

    public msg(): Promise<void> {
        return this.press(EVT_MSG);
    }

    public alt(): Promise<void> {
        return this.press(EVT_ALT);
    }

    public scan(): Promise<void> {
        return this.press(EVT_R_SCAN);
    }

    public power(): Promise<void> {
        return this.press(EVT_POWER);
    }

    /** KLN90B_Power_Off: sets the switch off (unlike power(), which toggles it) */
    public powerOff(): Promise<void> {
        return this.press(EVT_POWER_OFF);
    }

    /** KLN90B_Power_On: sets the switch on. A unit that is already on ignores it. */
    public powerOn(): Promise<void> {
        return this.press(EVT_POWER_ON);
    }

    /** Off, a wait, on. After boot every power-on runs the full welcome and self-test, also on an engine-running unit. */
    public async powerCycle(o: { offSeconds?: number } = {}): Promise<void> {
        await this.powerOff();
        await vi.advanceTimersByTimeAsync((o.offSeconds ?? 1) * 1000);
        await this.powerOn();
    }

    /**
     * Gets a unit that is running its welcome page to its main page the way a pilot does: waits for the self-test page and
     * presses ENT on APPROVE?, then ENT on ACKNOWLEDGE? of the data base page. A unit that stops on another page (FOR VFR
     * USE ONLY, or the OBS warning unless allowObsWarning is set, which waits until the warning leaves by itself) throws
     * with the screen. The main page is recognized by the page name in its status line.
     */
    public async approveSelfTest(o: { allowObsWarning?: boolean } = {}): Promise<void> {
        await this.waitFor('APPROVE?', () => this.screen().text().includes('APPROVE?'));
        // The cursor starts on a field of the page, which one is up to the unit's settings (its barometer is read only
        // with an air data input), so go to the button
        await this.cursorTo('R', 'APPROVE?');
        await this.ent();
        await this.waitFor('ACKNOWLEDGE?', () => {
            const text = this.screen().text();
            if (text.includes('FOR VFR USE ONLY')) throw new Error(`approveSelfTest: the VFR only page asks for its own acknowledgement\n${this.screen().dump()}`);
            if (text.includes('SYSTEM IS IN OBS MODE') && !o.allowObsWarning) {
                throw new Error(`approveSelfTest: the unit starts in OBS mode (pass allowObsWarning to wait through the warning)\n${this.screen().dump()}`);
            }
            return text.includes('ACKNOWLEDGE?');
        });
        await this.ent();
        await this.waitFor('the main page', () => this.screen().status().left !== '' && !this.screen().text().includes('ACKNOWLEDGE?'));
    }

    /** Advances in steps of one second until the condition holds, at most WAIT_CAP_STEPS seconds */
    private async waitFor(what: string, done: () => boolean): Promise<void> {
        for (let i = 0; !done(); i++) {
            if (i >= WAIT_CAP_STEPS) throw new Error(`FrontPanel: ${what} did not show within ${WAIT_CAP_STEPS} s\n${this.screen().dump()}`);
            await vi.advanceTimersByTimeAsync(WAIT_STEP_MS);
        }
    }

    /**
     * Enters OBS mode the way a pilot does (5-34): MOD 2 shows PRESS ENT TO ACTIVATE in ENR-LEG, and ENT enters ENR-OBS
     * (the cursor is not needed). The unit needs an active waypoint.
     */
    public async obsMode(): Promise<void> {
        await this.selectPage('L', 'MOD 2');
        await this.ent();
    }

    /** The status-line name of the page on a side; the cursor on that side must be off (it shows CRSR or KYBD then) */
    private shownName(side: Side): string {
        const shown = this.screen().status()[side === 'L' ? 'left' : 'right'];
        if (shown === 'CRSR' || shown === 'KYBD') {
            throw new Error(`FrontPanel: the ${side} cursor is on, so the status line shows ${shown} and not the page name; turn it off first\n${this.screen().dump()}`);
        }
        return shown;
    }

    /**
     * Selects a page by its status-line name, e.g. 'FPL 0' or 'NAV 1'. The cursor on that side must be off. The outer
     * knob turns the shorter way around the groups of PAGE_GROUPS, and the inner knob steps toward the page number
     * (SET 0 comes after SET 10); a group without page numbers is stepped forward.
     */
    public async selectPage(side: Side, name: string): Promise<void> {
        name = name.replace(/^(.{3}) (\d\d)$/, '$1$2'); // The status line shows two-digit pages as "FPL10", not "FPL 10"
        const groups = PAGE_GROUPS[side];
        const wantedGroup = groups.indexOf(name.slice(0, 3));
        if (wantedGroup < 0) throw new Error(`selectPage: no page group ${name.slice(0, 3)} on side ${side}`);
        const currentGroup = groups.indexOf(this.shownName(side).slice(0, 3));
        if (currentGroup < 0) {
            throw new Error(`selectPage: the ${side} status line shows "${this.shownName(side)}", which is in no page group\n${this.screen().dump()}`);
        }
        const forward = (wantedGroup - currentGroup + groups.length) % groups.length;
        await this.outer(side, forward <= groups.length / 2 ? forward : forward - groups.length);
        if (this.shownName(side).slice(0, 3) !== groups[wantedGroup]) {
            throw new Error(`selectPage: no page group ${name.slice(0, 3)}\n${this.screen().dump()}`);
        }

        const wanted = pageNumber(name);
        for (let i = 0; !sameName(this.shownName(side), name); i++) {
            if (i > 30) throw new Error(`selectPage: no page ${name}\n${this.screen().dump()}`);
            const shown = pageNumber(this.shownName(side));
            await this.inner(side, shown !== null && wanted !== null && shown > wanted ? -1 : 1);
        }
    }

    /**
     * Types text with the keyboard (KLN90B_Internal_Key), one display tick per character. The side's cursor must be on.
     * Types into any field, including the waypoint selectors; enterIdent turns the knobs instead.
     */
    public async type(side: Side, text: string): Promise<void> {
        for (const ch of text) {
            await this.press(`KLN90B_Internal_Key:${side === 'L' ? 'LEFT' : 'RIGHT'}:${ch}`);
        }
    }

    /**
     * Types an ident with the knobs and does not press ENT. The cursor must be on the first character of an editor (the
     * run of inverted cells is the whole field) or of a waypoint selector (APT, VOR, NDB, INT and SUP pages; the run is
     * one cell). A short ident in an editor is followed by a blank, so that KAA stays KAA and does not autocomplete to
     * KAAA.
     */
    public async enterIdent(side: Side, ident: string): Promise<void> {
        const first = this.focused(side);
        if (first.text.length === 1) {
            await this.enterIntoSelector(side, ident, first);
            return;
        }
        for (let i = 0; i < ident.length; i++) {
            if (i > 0) await this.outer(side, 1);
            await this.setChar(side, i, ident[i], ALPHABET);
        }
        if (ident.length < first.text.length) {
            await this.outer(side, 1);
            await this.setChar(side, ident.length, ' ', ALPHABET);
        }
    }

    /** Turns the inner knob until the focused field shows the character at its position */
    private async setChar(side: Side, position: number, ch: string, charset: string[]): Promise<void> {
        for (let guard = 0; ; guard++) {
            const current = this.focused(side).text[position] ?? ' ';
            if (current === ch) return;
            if (guard > charset.length) throw new Error(`enterIdent: cannot reach "${ch}" at ${position}\n${this.screen().dump()}`);
            await this.inner(side, steps(charset, current, ch));
        }
    }

    /**
     * A waypoint selector has one field per character, so the outer knob moves between characters, and each change
     * starts a search that finishes within the display tick after it. Typing K into the APT selector autocompletes the
     * rest of a unique ident, so a shorter ident ends with a blank on the next character (see enterIdent).
     */
    private async enterIntoSelector(side: Side, ident: string, first: Field): Promise<void> {
        for (let i = 0; i < ident.length; i++) {
            if (i > 0) {
                await this.outer(side, 1);
                const at = this.focused(side);
                if (at.row !== first.row || at.col !== first.col + i || at.text.length !== 1) {
                    throw new Error(`enterIdent: "${ident}" is longer than the selector\n${this.screen().dump()}`);
                }
            }
            await this.setChar(side, 0, ident[i], SELECTOR_CHARSET);
            await vi.advanceTimersByTimeAsync(CLICK_MS);
        }
        const next = first.col + ident.length;
        const edge = side === 'L' ? 11 : 23;
        if (next < edge && this.screen().row(first.row)[next] !== ' ') {
            // The row shows more than was typed: an autocompleted ident, if the next cell belongs to the selector
            await this.outer(side, 1);
            const at = this.focused(side);
            if (at.row === first.row && at.col === next && at.text.length === 1) {
                await this.setChar(side, 0, ' ', SELECTOR_CHARSET);
                await vi.advanceTimersByTimeAsync(CLICK_MS);
            } else {
                await this.outer(side, -1);
            }
        }
    }

    /**
     * Turns the outer knob until the focused field shows the text, e.g. 'USER POS?'. Throws with the screen if it does
     * not come within maxClicks.
     */
    public async cursorTo(side: Side, text: string, maxClicks = 20): Promise<void> {
        for (let i = 0; this.focused(side).text.trim() !== text; i++) {
            if (i >= maxClicks) throw new Error(`cursorTo: no field "${text}" within ${maxClicks} clicks\n${this.screen().dump()}`);
            await this.outer(side, 1);
        }
    }

    /** Appends waypoints to FPL 0 with waypoint confirmation (two ENTs each), then turns the cursor off. */
    public async appendToFpl0(idents: string[]): Promise<void> {
        await this.selectPage('L', 'FPL 0');
        await this.cursor('L');
        for (let i = 0; this.focused('L').text.replace(/[_ ]/g, '') !== ''; i++) {
            if (i > 31) throw new Error(`appendToFpl0: no blank entry\n${this.screen().dump()}`);
            await this.outer('L', 1);
        }
        for (const ident of idents) {
            await this.enterIdent('L', ident);
            await this.ent();
            await this.ent();
        }
        await this.cursor('L');
    }

    /** The one run of inverted cells on a side, which is the focused field. Columns are those of the whole screen. */
    public focused(side: Side): Field {
        const s = this.screen();
        const [c0, c1] = side === 'L' ? [0, 11] : [12, 23];
        const runs: Field[] = [];
        for (let r = 0; r < 6; r++) {
            let c = c0;
            while (c < c1) {
                const highlighted = (col: number) => s.cell(r, col).attr === 'I' || s.cell(r, col).attr === 'F';
                if (highlighted(c)) {
                    const start = c;
                    while (c < c1 && highlighted(c)) c++;
                    runs.push({row: r, col: start, text: s.row(r).slice(start, c)});
                } else {
                    c++;
                }
            }
        }
        if (runs.length !== 1) {
            throw new Error(`FrontPanel: expected one focused field on side ${side}, found ${runs.length}\n${s.dump()}`);
        }
        return runs[0];
    }
}
