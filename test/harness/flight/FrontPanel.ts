import {vi} from 'vitest';
import {
    EVT_ALT, EVT_CLR, EVT_DCT, EVT_ENT, EVT_L_CURSOR, EVT_L_INNER_LEFT, EVT_L_INNER_RIGHT, EVT_L_OUTER_LEFT,
    EVT_L_OUTER_RIGHT, EVT_MSG, EVT_POWER, EVT_R_CURSOR, EVT_R_INNER_LEFT, EVT_R_INNER_RIGHT, EVT_R_OUTER_LEFT,
    EVT_R_OUTER_RIGHT, EVT_R_SCAN,
} from '../../../kln90b/HEvents';
import {Screen} from '../render/screen';

export type Side = 'L' | 'R';

/** One display tick, so the screen shows the result of each click (DOM changes only in display ticks) */
const CLICK_MS = 250;

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
}
