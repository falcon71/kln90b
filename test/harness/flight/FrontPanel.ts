import {vi} from 'vitest';
import {
    EVT_ALT, EVT_CLR, EVT_DCT, EVT_ENT, EVT_L_CURSOR, EVT_L_INNER_LEFT, EVT_L_INNER_RIGHT, EVT_L_OUTER_LEFT,
    EVT_L_OUTER_RIGHT, EVT_MSG, EVT_POWER, EVT_R_CURSOR, EVT_R_INNER_LEFT, EVT_R_INNER_RIGHT, EVT_R_OUTER_LEFT,
    EVT_R_OUTER_RIGHT, EVT_R_SCAN,
} from '../../../kln90b/HEvents';
import {Screen} from '../render/screen';

export type Side = 'L' | 'R';

/** AlphabetEditorField.charset in kln90b/controls/editors/EditorField.tsx */
const ALPHABET = [' ', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'];
/** One display tick, so the screen shows the result of each click (DOM changes only in display ticks) */
const CLICK_MS = 250;

interface Field {
    row: number;
    col: number;
    text: string;
}

function sameName(shown: string, wanted: string): boolean {
    // With more than one sub-page, the status line shows "APT+3" for "APT 3"
    return shown === wanted || (shown[3] === '+' && shown.slice(0, 3) === wanted.slice(0, 3) && shown[4] === wanted[4]);
}

function steps(from: string, to: string): number {
    const a = ALPHABET.indexOf(from);
    const b = ALPHABET.indexOf(to);
    if (b < 0) throw new Error(`FrontPanel: "${to}" cannot be entered with the knob`);
    if (a < 0) return 1; // "_" (no value yet): one click enters or starts the field, then read again
    const forward = (b - a + ALPHABET.length) % ALPHABET.length;
    return forward <= ALPHABET.length / 2 ? forward : forward - ALPHABET.length;
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

    /** Selects a page by its status-line name, e.g. 'FPL 0' or 'NAV 1'. The cursor on that side must be off. */
    public async selectPage(side: Side, name: string): Promise<void> {
        const shown = () => side === 'L' ? this.screen().leftName() : this.screen().rightName();
        for (let i = 0; shown().slice(0, 3) !== name.slice(0, 3); i++) {
            if (i > 12) throw new Error(`selectPage: no page group ${name.slice(0, 3)}\n${this.screen().dump()}`);
            await this.outer(side, 1);
        }
        for (let i = 0; !sameName(shown(), name); i++) {
            if (i > 30) throw new Error(`selectPage: no page ${name}\n${this.screen().dump()}`);
            await this.inner(side, 1);
        }
    }

    /**
     * Types text with the keyboard (KLN90B_Internal_Key), one display tick per character. The side's cursor must be on.
     * This is how the waypoint selectors of the APT, VOR, NDB, INT and SUP pages take an ident; enterIdent turns knobs
     * and cannot do that.
     */
    public async type(side: Side, text: string): Promise<void> {
        for (const ch of text) {
            await this.press(`KLN90B_Internal_Key:${side === 'L' ? 'LEFT' : 'RIGHT'}:${ch}`);
        }
    }

    /** Types an ident into the focused editor with the inner and outer knobs. Does not press ENT. */
    public async enterIdent(side: Side, ident: string): Promise<void> {
        for (let i = 0; i < ident.length; i++) {
            if (i > 0) await this.outer(side, 1);
            for (let guard = 0; ; guard++) {
                const current = this.focusedField(side).text[i] ?? ' ';
                if (current === ident[i]) break;
                if (guard > ALPHABET.length) throw new Error(`enterIdent: cannot reach "${ident[i]}" at ${i}\n${this.screen().dump()}`);
                await this.inner(side, steps(current, ident[i]));
            }
        }
    }

    /** Appends waypoints to FPL 0 with waypoint confirmation (two ENTs each), then turns the cursor off. */
    public async appendToFpl0(idents: string[]): Promise<void> {
        await this.selectPage('L', 'FPL 0');
        await this.cursor('L');
        for (let i = 0; this.focusedField('L').text.replace(/[_ ]/g, '') !== ''; i++) {
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

    /** The one run of inverted cells on a side, which is the focused field. */
    private focusedField(side: Side): Field {
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
