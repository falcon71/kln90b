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

/**
 * The page numbers of a group in the order the inner knob walks them, which wraps (PageTreeController.moveSubpage: past
 * the last page the knob comes back to the first). The SET group ends with SET 0. OTH is missing because its length
 * depends on the interfaces the unit has (OTH 5 to OTH 10 are pruned without them), so its pages are walked forward or
 * backward by their numbers without the wrap. A group without page numbers has a single page. The harness test of
 * selectPage walks the real trees and checks this table against them.
 */
export const PAGE_CYCLES: Record<string, number[]> = {
    TRI: range(0, 6),
    MOD: range(1, 2),
    FPL: range(0, 25),
    NAV: range(1, 5),
    CAL: range(1, 7),
    STA: range(1, 5),
    SET: [...range(1, 10), 0],
    CTR: range(1, 2),
    'D/T': range(1, 4),
    APT: range(1, 8),
};

function range(from: number, to: number): number[] {
    return Array.from({length: to - from + 1}, (_, i) => from + i);
}

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
    return Number(m[1]);
}

/**
 * The inner-knob direction from the page shown to the wanted one: the shorter way around the group's cycle (forward on
 * a tie), so SET 0, the last page of its group, is one click backward from SET 1. A group that is not in PAGE_CYCLES
 * counts by the page numbers, without the wrap; a group without numbers is stepped forward.
 */
function pageDirection(group: string, shown: number | null, wanted: number | null): 1 | -1 {
    if (shown === null || wanted === null) return 1;
    const cycle = PAGE_CYCLES[group];
    const a = cycle === undefined ? -1 : cycle.indexOf(shown);
    const b = cycle === undefined ? -1 : cycle.indexOf(wanted);
    if (a < 0 || b < 0) return shown > wanted ? -1 : 1;
    const forward = (b - a + cycle.length) % cycle.length;
    return forward <= cycle.length / 2 ? 1 : -1;
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
     * USE ONLY, or the OBS warning unless allowObsWarning is set, which waits, up to the cap, until the warning leaves, i.e. until the GPS CRS switch is back in LEG) throws
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
        await this.waitFor('the main page', () => {
            // The self-test and data base pages show CRSR (or no name) where the main page shows a page name
            const left = this.screen().status().left;
            return left !== '' && left !== 'CRSR' && !this.screen().text().includes('ACKNOWLEDGE?');
        });
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
     * knob turns the shorter way around the groups of PAGE_GROUPS, and the inner knob the shorter way around the pages
     * of the group (PAGE_CYCLES; SET 0 is the last SET page, so it is one click backward from SET 1); a group without
     * page numbers is stepped forward. The shorter way can pass through a page that changes the screen: NAV 5 on
     * either side while the other side shows NAV 5 is Super NAV 5, which has no status line, so select the side whose
     * way passes NAV 5 first. A bare group name ("ACT", "VOR") ends on whichever page of the group shows: the ACT page of
     * an active airport has pages ACT 1 to ACT 8 and none of them is named "ACT".
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

        if (name.trim().length === 3) return; // a bare group ("ACT", "VOR"): whichever page of the group shows

        const wanted = pageNumber(name);
        for (let i = 0; !sameName(this.shownName(side), name); i++) {
            if (i > 30) throw new Error(`selectPage: no page ${name}\n${this.screen().dump()}`);
            await this.inner(side, pageDirection(groups[wantedGroup], pageNumber(this.shownName(side)), wanted));
        }
    }

    /**
     * Types text with the keyboard (KLN90B_Internal_Key), one display tick per character. The side's cursor must be on.
     * Types into any field, including the waypoint selectors; enterIdent turns the knobs instead. Only A to Z and 0 to
     * 9 can be typed, because the PC keyboard path sends nothing else (KLN90BCore.handleKeyboardEvent, which also maps
     * the numpad digits): a pilot cannot type a blank, a hyphen or a decimal point, so a cell that needs one is entered
     * with the knobs. A test of the raw H event itself presses it with press('KLN90B_Internal_Key:RIGHT:x'), since only
     * an aircraft's H event can send such a character.
     */
    public async type(side: Side, text: string): Promise<void> {
        // Checked before the first key goes out, so that a refused text leaves the field as it was
        for (const ch of text) {
            if (!/^[A-Z0-9]$/.test(ch)) {
                throw new Error(`type: '${ch}' cannot be typed on the PC keyboard `
                    + '(KLN90BCore.handleKeyboardEvent passes only A to Z and 0 to 9); '
                    + 'turn the knobs, or press the H event itself');
            }
        }
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
            const turned = await this.setChar(side, i, ident[i], ALPHABET);
            if (i === 0 && !turned) {
                // The first character showed the wanted letter already, so no click started the edit (Editor.innerRight:
                // the first click enters the editor), and the outer knob would leave the field. Start it as a pilot
                // would, with one click, and set the character again.
                await this.inner(side, 1);
                await this.setChar(side, 0, ident[0], ALPHABET);
            }
        }
        if (ident.length < first.text.length) {
            await this.outer(side, 1);
            await this.setChar(side, ident.length, ' ', ALPHABET);
        }
    }

    /** Turns the inner knob until the focused field shows the character at its position; true if it turned the knob */
    private async setChar(side: Side, position: number, ch: string, charset: string[]): Promise<boolean> {
        let turned = false;
        for (let guard = 0; ; guard++) {
            const current = this.focused(side).text[position] ?? ' ';
            if (current === ch) return turned;
            if (guard > charset.length) throw new Error(`enterIdent: cannot reach "${ch}" at ${position}\n${this.screen().dump()}`);
            await this.inner(side, steps(charset, current, ch));
            turned = true;
        }
    }

    /**
     * A waypoint selector has one field per character, so the outer knob moves between characters, and each change
     * starts a search for the characters up to the one turned, which finishes within the display tick the click itself
     * advances. Typing K into the APT selector autocompletes the rest of a unique ident, so a shorter ident ends with a
     * blank on the next character (see enterIdent).
     *
     * A character that already shows the wanted letter needs no click, but then no search has run for the whole ident:
     * the page may show a longer or a duplicate ident (a fresh VOR page showing ABC SOUTH, entering ABC, which is the
     * first ABC in the list). A pilot who sees that turns the last character one click away and one click back, and so
     * does this: the second click searches for exactly the typed ident.
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
            const turned = await this.setChar(side, 0, ident[i], SELECTOR_CHARSET);
            if (i === ident.length - 1 && !turned) {
                await this.inner(side, 1);
                await this.inner(side, -1);
            }
        }
        const next = first.col + ident.length;
        const edge = side === 'L' ? 11 : 23;
        if (next < edge && this.screen().row(first.row)[next] !== ' ') {
            // The row shows more than was typed: an autocompleted ident, if the next cell belongs to the selector
            await this.outer(side, 1);
            const at = this.focused(side);
            if (at.row === first.row && at.col === next && at.text.length === 1) {
                await this.setChar(side, 0, ' ', SELECTOR_CHARSET);
            } else {
                await this.outer(side, -1);
            }
        }
    }

    /**
     * Turns the outer knob until the focused field shows the text, e.g. 'USER POS?'. A cursor position without a focused
     * field (the SUP page without user waypoints has one between the ident characters and the next field) is stepped over. Throws
     * with the screen if the field does not come within maxClicks.
     */
    public async cursorTo(side: Side, text: string, maxClicks = 20): Promise<void> {
        // A page name in the status field means the cursor is off: the outer knob would turn the pages, and the search
        // would end on another page. (The self-test pages show no name there.)
        const status = this.screen().status()[side === 'L' ? 'left' : 'right'];
        if (status !== '' && status !== 'CRSR' && status !== 'KYBD') {
            throw new Error(`cursorTo: the ${side} cursor is off (the status line shows ${status}); turn it on first\n${this.screen().dump()}`);
        }
        for (let i = 0; ; i++) {
            const runs = this.focusedRuns(side);
            if (runs.length > 1) this.focused(side); // throws with the screen
            if (runs.length === 1 && runs[0].text.trim() === text) return;
            if (i >= maxClicks) throw new Error(`cursorTo: no field "${text}" within ${maxClicks} clicks\n${this.screen().dump()}`);
            await this.outer(side, 1);
        }
    }

    /**
     * Loads the first procedure of APT 7 or APT 8 into FPL 0 the way a pilot does (testing.md, Procedures): select the
     * page, enter the airport when given (the APT pages open on the first airport of the scan list), cursor, ENT on the
     * first entry (its only transition is taken without a question), ENT on LOAD IN FPL, cursor off. FPL 0 scrolls to the
     * active leg only at the next calculation tick, so it waits one second.
     */
    public async loadProcedure(page: 'APT 7' | 'APT 8', o: { ident?: string } = {}): Promise<void> {
        if (o.ident !== undefined) {
            // The APT pages show one airport; it is chosen with the ident selector of APT 1 (3-42)
            await this.selectPage('R', 'APT 1');
            await this.cursor('R');
            await this.enterIdent('R', o.ident);
            await this.cursor('R');
        }
        await this.selectPage('R', page);
        await this.cursor('R');
        await this.ent();
        await this.ent();
        if (this.screen().status().right === 'CRSR') await this.cursor('R');
        await vi.advanceTimersByTimeAsync(1000);
    }

    /**
     * Opens the MSG page and presses MSG until it closes (3-16; the status line's left field is empty while it shows),
     * then waits a second, so that the one-time messages read go. Returns the non-blank rows of every MSG page seen, in
     * order, each trimmed. Throws with the screen if the page is still open after `max` presses.
     */
    public async readMessages(max = 10): Promise<string[]> {
        const seen: string[] = [];
        await this.msg();
        for (let i = 0; this.screen().status().left === ''; i++) {
            if (i >= max) throw new Error(`readMessages: the MSG page did not close after ${max} presses\n${this.screen().dump()}`);
            seen.push(...this.screen().text().split('\n').slice(0, 6).map(r => r.trim()).filter(r => r !== ''));
            await this.msg();
        }
        await vi.advanceTimersByTimeAsync(1000);
        return seen;
    }

    /**
     * A Direct To the way a pilot enters one (3-28): D->, the ident typed on the left, ENT on the waypoint page that
     * confirms it, ENT to approve, then `waitMs` (default one second: one calculation tick).
     */
    public async directTo(ident: string, o: { waitMs?: number } = {}): Promise<void> {
        await this.dct();
        await this.enterIdent('L', ident);
        await this.ent();
        await this.ent();
        await vi.advanceTimersByTimeAsync(o.waitMs ?? 1000);
    }

    /** Selects a page, waits `waitMs` (default one second) and returns the six rows of that side */
    public async show(side: Side, name: string, o: { waitMs?: number } = {}): Promise<string[]> {
        await this.selectPage(side, name);
        await vi.advanceTimersByTimeAsync(o.waitMs ?? 1000);
        return this.screen().rows(side);
    }

    /** SET 1: CONFIRM?, ENT, then SET 2 and back to SET 1, so that the page reads the GPS again */
    public async confirmSet1AndReselect(): Promise<void> {
        await this.cursorTo('L', 'CONFIRM?');
        await this.ent();
        await this.selectPage('L', 'SET 2');
        await this.selectPage('L', 'SET 1');
    }

    /**
     * Enters a date in the open date editor on a side: the first click opens it with day 01, the first click on the
     * dashed month gives JAN and on a dashed year digit 0, so the day d takes d clicks, the month m (1 to 12) m clicks,
     * a year digit y + 1 clicks. The cursor must be on the day.
     */
    public async enterDate(side: Side, day: number, month: number, year: [number, number]): Promise<void> {
        await this.inner(side, day);
        await this.outer(side, 1);
        await this.inner(side, month);
        await this.outer(side, 1);
        await this.inner(side, year[0] + 1);
        await this.outer(side, 1);
        await this.inner(side, year[1] + 1);
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
        const runs = this.focusedRuns(side);
        if (runs.length !== 1) {
            throw new Error(`FrontPanel: expected one focused field on side ${side}, found ${runs.length}\n${this.screen().dump()}`);
        }
        return runs[0];
    }

    /**
     * Every run of inverted cells on a side: none at a cursor position without a field of its own. Two runs that one plain
     * "." separates are one field (joinAcrossPoint).
     */
    private focusedRuns(side: Side): Field[] {
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
        return this.joinAcrossPoint(s, runs);
    }

    /**
     * Joins two runs of a row that one plain "." separates: the NDB frequency and DIS editors do not invert their point,
     * so the digits around it are two runs of one field. Whether the real cursor covers the point is open (Session 9b).
     */
    private joinAcrossPoint(s: Screen, runs: Field[]): Field[] {
        const out: Field[] = [];
        for (const run of runs) {
            const prev = out[out.length - 1];
            const gap = prev === undefined ? -1 : prev.col + prev.text.length;
            if (prev !== undefined && prev.row === run.row && run.col === gap + 1
                && s.cell(run.row, gap).ch === '.' && s.cell(run.row, gap).attr === '.') {
                out[out.length - 1] = {row: prev.row, col: prev.col, text: prev.text + '.' + run.text};
            } else {
                out.push(run);
            }
        }
        return out;
    }
}
