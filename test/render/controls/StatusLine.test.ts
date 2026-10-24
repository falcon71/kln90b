import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../harness/boot';
import {standardRoute} from '../../harness/fixtures';
import {courseDeg} from '../../harness/flight/geo';
import {blinkCycle} from '../../harness/render/blink';
import {Screen} from '../../harness/render/screen';
import {messages} from '../../harness/readers';
import {APR_ARM_SWITCH, NO_ALTIMETER, NO_OBS, panelXml} from '../../harness/panelXml';
import {bootOnStandardRoute} from '../../harness/worldBoot';
import {showSuperNav5, SuperNav5} from '../../harness/render/superNav5';
import {EVT_APPR_ARM} from '../../../kln90b/HEvents';
import {StatusLineMessageEvents} from '../../../kln90b/controls/StatusLine';
import {NullPage} from '../../../kln90b/pages/NullPage';

/** The values L:KLN90B_MsgLight takes over 8 display ticks (250 ms each), two seconds */
async function msgLightOverTwoSeconds(unit: HeadlessUnit): Promise<Set<number>> {
    const seen = new Set<number>();
    for (let i = 0; i < 8; i++) {
        await vi.advanceTimersByTimeAsync(250);
        seen.add(unit.env.sim.get('L:KLN90B_MsgLight', 'bool'));
    }
    return seen;
}

// Spec tests of the remote MSG annunciator: 3-16 (the MSG prompt flashes while a message is new) and 3-59 (the remote
// annunciator follows the prompt). StatusLine writes the LVar on the display tick, so the LVar itself flashes and the
// aircraft must not add a flash of its own. A wrong external CDI course is the cheap trigger of a persistent message.
describe('L:KLN90B_MsgLight (spec)', () => {
    it('flashes while a message is unread (3-16, 3-59)', async () => {
        // A booted unit always has unread messages (test/README.md, section 6)
        const unit = await bootUnit();
        await settle(unit);

        expect(await msgLightOverTwoSeconds(unit)).toEqual(new Set([0, 1]));
    });

    it('is dark once all messages are read (3-16, 3-59)', async () => {
        const unit = await bootUnit();
        await settle(unit);

        // The boot messages: reading them all closes the MSG page
        await unit.panel.readMessages();

        expect(await msgLightOverTwoSeconds(unit)).toEqual(new Set([0]));
    });

    // 3-16: the MSG prompt stays steady while a condition that needs action persists, and 3-59 has the remote annunciator
    // follow the prompt. The condition is a wrong external course: ADJ NAV IND CRS TO nnn stays while Nav OBS:1 differs from
    // the DTK by more than 5 degrees (PersistentMessages.ts, active with the default Output.ObsTarget 0 and Input.ObsSource 1).
    it('is steady while a persistent message stays, and dark once its condition ends (3-16, 3-59)', async () => {
        const {kaaa, abc} = standardRoute();
        const magvar = 4;
        const unit = await bootOnStandardRoute({magvar});
        // On KAAA the DTK is the course of the first leg, and the unit shows it magnetic
        const dtk = courseDeg(kaaa, abc) - magvar;
        expect(Math.round(dtk)).toBe(46); // The literal of the message below follows from this, not from the unit

        unit.env.sim.set('Nav OBS:1', 'degrees', dtk + 30);
        await vi.advanceTimersByTimeAsync(15000); // Past the 10 s in which the message shows whatever the course is

        // Read every message: the MSG page marks them seen, and readMessages throws unless the page closed
        // A precondition: the setup raised the message, so the light below is held by it and not by something else
        expect(await unit.panel.readMessages()).toContain('ADJ NAV IND CRS TO 046°');

        // Read, and the message stays: steady at every display tick, not flashing
        expect(await msgLightOverTwoSeconds(unit)).toEqual(new Set([1]));

        // The course is set onto the DTK: the condition ends, the message goes and the light with it
        unit.env.sim.set('Nav OBS:1', 'degrees', dtk);
        await vi.advanceTimersByTimeAsync(3000);

        expect(await msgLightOverTwoSeconds(unit)).toEqual(new Set([0]));
    });
});

/** Row 6 of the screen: cells 6 to 12 are the mode, 14 to 16 the msg/ent prompt, and 6 to 16 a status line message */
const statusRow = () => {
    const s = Screen.read();
    return {text: s.row(6), mask: s.mask().split('\n')[6]};
};

/** What `read` returns on 8 display ticks (two seconds), as two blink cycles of four reads each */
async function twoCycles(read: () => string): Promise<string[][]> {
    const first = await blinkCycle(read);
    return [first, await blinkCycle(read)];
}

/** The distinct values of two cycles, for a cell that does not flash */
async function overTwoSeconds(read: () => string): Promise<Set<string>> {
    const [first, second] = await twoCycles(read);
    return new Set([...first, ...second]);
}

/**
 * A flashing cell shows its flashing phase on one display tick in four (the blink tick) and its steady phase on the
 * other three, in every cycle and on the same tick of both. A set of the values over two seconds would also accept the
 * phases swapped, or a cell stuck in one of them
 */
function expectFlashing(cycles: string[][], steady: string, flashing: string): void {
    const expected = [steady, steady, steady, flashing].sort();
    expect(cycles.map(c => [...c].sort())).toEqual([expected, expected]);
    expect(cycles[1].indexOf(flashing)).toBe(cycles[0].indexOf(flashing));
}

/** The text and the mask of the msg/ent prompt, cells 14 to 16 of the status row */
const prompt = () => {
    const {text, mask} = statusRow();
    return `${text.slice(14, 17)} ${mask.slice(14, 17)}`;
};

/**
 * The standard route in FPL 0, KAAA active, settled: MOD 2 then offers OBS with the ent prompt (5-33). Without an OBS
 * input (ObsSource 0) the unit reads no external course, so no ADJ NAV IND CRS message joins the boot messages
 */
const onRoute = (): Promise<HeadlessUnit> => bootOnStandardRoute({panelXml: panelXml(NO_OBS)});

/**
 * NO SUCH WPT on the REF page (C-2): an ident the database lacks, typed into the waypoint field and entered. FPL 0 and
 * DIRECT TO are not used, because #262 says they must offer to create a user waypoint instead
 */
async function noSuchWpt(unit: HeadlessUnit): Promise<void> {
    await unit.panel.selectPage('L', 'FPL 0');
    await unit.panel.selectPage('R', 'REF  ');
    await unit.panel.cursor('R');
    await unit.panel.type('R', 'QQQQ');
    await unit.panel.ent(); // one display tick of 250 ms follows the ENT
}

describe('status line, the center segment (spec)', () => {
    // 3-10, figure 3-37: a status line message takes the whole center segment, the mode and the prompt, in inverse
    // video
    it('shows a status line message over the mode and the prompt, in inverse video (3-10, figure 3-37)', async () => {
        const unit = await bootUnit();
        await noSuchWpt(unit);

        const {text, mask} = statusRow();
        expect(text.slice(5, 18)).toBe('|NO SUCH WPT|');
        expect(mask.slice(5, 18)).toBe('.IIIIIIIIIII.');
    });

    // 3-10: the message stays about five seconds, then the segment shows what it showed before
    it('returns to the mode and the prompt about five seconds after a status line message (3-10)', async () => {
        const unit = await bootUnit();
        await noSuchWpt(unit);

        await vi.advanceTimersByTimeAsync(3750); // 4 s after the ENT
        expect(Screen.read().status().mode).toBe('NO SUCH WPT');
        await vi.advanceTimersByTimeAsync(2000); // 6 s after the ENT
        // The previous display: the mode, and ent for the ident still being edited
        expect(statusRow().text.slice(5, 18)).toBe('|enr-leg ent|');
    });

    // 3-10, 3-11, figure 3-36: ENT flashes in the last three cells of the center segment, in normal video, not inverse.
    // The boot messages stay unread here: Screen reads a stale inverted-blink without inverted as normal text, as the
    // sim draws it, so the unread msg that came before does not show in the mask
    it('flashes ent in normal video when ENT is needed (3-10, 3-11, figure 3-36)', async () => {
        const unit = await onRoute();
        await unit.panel.selectPage('L', 'MOD 2'); // PRESS ENT TO ACTIVATE (5-33)

        expectFlashing(await twoCycles(prompt), 'ent ...', 'ent BBB');
    });

    // 3-16, figure 3-55: a new message makes the msg prompt flash in inverse video. The harness reads the flashing
    // inverse as I in one phase and F in the other
    it('flashes msg in inverse video while a message is unread (3-16, figure 3-55)', async () => {
        await bootUnit(); // the boot messages are unread (test/README.md section 6)

        expectFlashing(await twoCycles(prompt), 'msg III', 'msg FFF');
    });

    // 3-16: a message whose condition needs action keeps the prompt on, not flashing, once it is read. The condition is
    // a wrong external course, as in the MSG light test above
    it('keeps msg steady in inverse video once read while the condition stays (3-16)', async () => {
        const {kaaa, abc} = standardRoute();
        const unit = await bootOnStandardRoute({magvar: 4});
        unit.env.sim.set('Nav OBS:1', 'degrees', courseDeg(kaaa, abc) - 4 + 30);
        await vi.advanceTimersByTimeAsync(15000); // Past the 10 s in which the message shows whatever the course is
        // readMessages throws unless the page closed; the persistent message is not removed by the reading
        await unit.panel.readMessages();
        // The preconditions: every message was read, and the persistent one stays
        expect(messages(unit)).toEqual(['ADJ NAV IND CRS TO 046°']);
        expect(unit.props.messageHandler.hasUnreadMessages()).toBe(false);

        expect(await overTwoSeconds(prompt)).toEqual(new Set(['msg III']));
    });

    // 3-10: the last three cells of the center segment are blank without a message and without ENT
    it('shows three blanks without a message and without ENT (3-10)', async () => {
        const unit = await bootUnit();
        await unit.panel.readMessages(); // MSG until the page closes; the one-time messages then go
        expect(unit.props.messageHandler.hasMessages()).toBe(false); // the precondition: nothing is left

        expect(await overTwoSeconds(prompt)).toEqual(new Set(['    ...']));
    });

    // 3-11, figure 3-38 (left, one cell in) and figure 3-36 (right): with a cursor on, CRSR in inverse video replaces
    // the page name of that side
    it('replaces each page name with CRSR in inverse video while that cursor is on (3-11, figures 3-36, 3-38)',
        async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.cursor('R'); // the SUP page of the boot has its CREATE NEW WPT choices

        const {text, mask} = statusRow();
        expect(text.slice(0, 5) + text.slice(17)).toBe(' CRSR|CRSR ');
        expect(mask.slice(0, 5) + mask.slice(17)).toBe('.IIII.IIII.');
    });
});

// KYBD is this project's keyboard mode (#75, #83), not a function of the real unit, so the tests describe the code
describe('status line, the keyboard mode (characterization)', () => {
    it('shows KYBD flashing in inverse video in place of CRSR on the side in keyboard mode', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        const input = document.querySelector('input.keyboard') as HTMLInputElement;
        // A left click on the CRSR field of the left status line (cells 1 to 5 of row 6, 9x13 px cells scaled by 4)
        input.dispatchEvent(new MouseEvent('mousedown', {button: 0, screenX: 100, screenY: 350}));
        input.focus();
        expect(unit.props.pageManager.isLeftKeyboardActive()).toBe(true);

        const leftName = () => {
            const {text, mask} = statusRow();
            return `${text.slice(0, 5)} ${mask.slice(0, 5)}`;
        };
        expectFlashing(await twoCycles(leftName), ' KYBD .IIII', ' KYBD .FFFF');
    });
});

// The status line mode segment is the 90B's own. The KLN 89 trainer (2026-10-07) shows the OBS course at north as 000,
// never 360; that rule is applied to this segment by analogy. A course of 359.7 shows as 000, the sibling 359.4 as 359
describe('status line, the OBS course at north (characterization)', () => {
    it('characterization: shows the OBS course 359.7 in the mode field as 000 (#263)', async () => {
        const unit = await onRoute();
        await unit.panel.obsMode();
        unit.props.modeController.setObs(359.7);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().status().mode.slice(0, 7)).toBe('enr:000');
    });

    it('characterization: shows the OBS course 359.4 in the mode field as 359 (#263)', async () => {
        const unit = await onRoute();
        await unit.panel.obsMode();
        unit.props.modeController.setObs(359.4);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().status().mode.slice(0, 7)).toBe('enr:359');
    });
});

describe('status line after an ENT prompt (#320)', () => {
    /**
     * MOD 2 with the ent prompt and the boot messages unread; display ticks run until the blink phase (the MSG light is
     * dark in that phase while a message is unread, 3-59), then ENT activates OBS, so the next tick shows msg again
     */
    async function entInTheBlinkPhase(): Promise<HeadlessUnit> {
        const unit = await onRoute();
        await unit.panel.selectPage('L', 'MOD 2');
        for (let i = 0; i < 4 && unit.env.sim.get('L:KLN90B_MsgLight', 'bool') !== 0; i++) {
            await vi.advanceTimersByTimeAsync(250);
        }
        expect(statusRow().text.slice(14, 17)).toBe('ent'); // the preconditions: the prompt was ent,
        expect(unit.env.sim.get('L:KLN90B_MsgLight', 'bool')).toBe(0); // and its last tick was in the blink phase
        await unit.panel.ent();
        expect(Screen.read().status().mode).toMatch(/^enr:[0-9]{3} msg$/); // OBS is on, and the prompt is msg again
        expect(unit.props.messageHandler.hasUnreadMessages()).toBe(true);
        return unit;
    }

    // 3-16: an unread message puts the msg prompt on the status line; the ENT prompt before it does not change that
    it('shows msg after the ENT, the boot messages unread (3-16, #320)', async () => {
        await entInTheBlinkPhase();

        const texts = new Set([...await overTwoSeconds(prompt)].map(s => s.slice(0, 3)));
        // Text only: the masks of this prompt are the subject of the tests below
        expect(texts).toEqual(new Set(['msg']));
    });

    // 3-16, figure 3-55: the unread message flashes the prompt in inverse video; the ENT prompt's flash must not hide
    // it
    it('flashes msg in inverse video after an ENT prompt that ended in the blink phase (3-16, #320)',
        async () => {
            await entInTheBlinkPhase();

            expectFlashing(await twoCycles(prompt), 'msg III', 'msg FFF');
        });

    // 3-16: a read message that stays keeps the prompt steady; the ENT prompt's blink must not hide that one either
    it('keeps a read msg steady and visible after an ENT prompt that ended in the blink phase (3-16, #320)',
        async () => {
            // ALTITUDE FAIL stays after it is read (B-1) and does not depend on the mode
            const unit = await bootOnStandardRoute({panelXml: panelXml({...NO_OBS, ...NO_ALTIMETER})});
            await unit.panel.readMessages();
            expect(messages(unit)).toEqual(['ALTITUDE FAIL']);
            expect(unit.props.messageHandler.hasUnreadMessages()).toBe(false);
            await unit.panel.selectPage('L', 'MOD 2');
            for (let i = 0; i < 4 && prompt() !== 'ent BBB'; i++) {
                await vi.advanceTimersByTimeAsync(250);
            }
            expect(prompt()).toBe('ent BBB'); // the preconditions: the prompt is ent, in its blink phase
            await unit.panel.ent();
            // OBS is on and the read message stays
            expect(Screen.read().status().mode).toMatch(/^enr:[0-9]{3} msg$/);
            expect(messages(unit)).toEqual(['ALTITUDE FAIL']);

            expect(await overTwoSeconds(prompt)).toEqual(new Set(['msg III']));
        });
});

// The AVsoftech 90B trainer (third party, unreliable; the maintainer and agent checks, 2026-10-24, see
// docs/kln89-trainer-record.md) lists every status line message on the MSG page and flashes the MSG light until the status
// line has shown it for 5 s; Super NAV 5 hides the status line, so there the message waits. 3-10 gives the status line and 3-16
// the MSG page.
//
// NO APPROACH is the trigger: the approach arm button without an approach (6-1, C-1). Timing: a press advances 250 ms and
// the display ticks run every 250 ms, so the message is first shown by a display tick up to 250 ms after the press and ends
// at the display tick 5 s after that, between 5.0 and 5.25 s after the press. Every "still shown" check below sits at 4.5 s
// or earlier from the press, and every "gone" check at 5.75 s or later, 500 ms clear of that window.
describe('scratchpad messages on the MSG page (AVsoftech 90B trainer, 2026-10-24, #237)', () => {
    /** A unit with the approach arm switch, no flight plan and the boot messages read, so that nothing else holds the light */
    async function armUnit(): Promise<HeadlessUnit> {
        const unit = await bootUnit({panelXml: panelXml(APR_ARM_SWITCH)});
        await settle(unit);
        await unit.panel.readMessages();
        expect(messages(unit)).toEqual([]); // the precondition: the list is empty
        return unit;
    }

    const status = () => Screen.read().status().mode;
    const msgPageRow0 = () => Screen.read().row(0).trim();
    const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms);

    it('flashes the MSG light while it shows and goes dark when it clears (#237)', async () => {
        const unit = await armUnit();

        await unit.panel.press(EVT_APPR_ARM); // 0.25 s after the press
        expect(status()).toBe('NO APPROACH');
        expect(await msgLightOverTwoSeconds(unit)).toEqual(new Set([0, 1])); // to 2.25 s
        await wait(3750); // 6 s

        expect(status()).not.toBe('NO APPROACH');
        expect(messages(unit)).not.toContain('NO APPROACH');
        expect(await msgLightOverTwoSeconds(unit)).toEqual(new Set([0]));
    });

    it('lists it on the MSG page and keeps it there after the status line clears (#237)', async () => {
        const unit = await armUnit();
        await unit.panel.press(EVT_APPR_ARM);

        await unit.panel.msg(); // 0.5 s
        expect(msgPageRow0()).toBe('NO APPROACH');
        expect(status()).toBe('NO APPROACH');
        await wait(5500); // 6 s

        expect(msgPageRow0()).toBe('NO APPROACH');
        expect(status()).not.toBe('NO APPROACH');
    });

    it('keeps the light flashing after the MSG page has shown it (#237)', async () => {
        const unit = await armUnit();
        await unit.panel.press(EVT_APPR_ARM);
        await unit.panel.msg();
        await unit.panel.msg(); // the page is closed, 0.75 s

        // A read entry would hold the light steady, this one flashes it
        expect(await msgLightOverTwoSeconds(unit)).toEqual(new Set([0, 1])); // to 2.75 s
    });

    it('keeps the light flashing on Super NAV 5 past 5 s (#237)', async () => {
        const unit = await armUnit();
        await showSuperNav5(unit);

        await unit.panel.press(EVT_APPR_ARM);
        await wait(10000);

        expect(await msgLightOverTwoSeconds(unit)).toEqual(new Set([0, 1]));
        expect(messages(unit)).toContain('NO APPROACH');
        expect(SuperNav5.read().msg).toBe('msg');
    });

    // The 5 s run on while the status line is hidden again. A clock restarted at the second display (the MSG page closed at
    // 2.25 s, reopened at 3.25 s) would still show the message at 6 s. That the clock starts at the first display and not at
    // the post is the next test: this one opens the MSG page one tick after the press
    it('keeps counting the 5 s while Super NAV 5 hides the status line again (#237)', async () => {
        const unit = await armUnit();
        await showSuperNav5(unit);
        await unit.panel.press(EVT_APPR_ARM);

        await unit.panel.msg(); // M = the start of this press, the first display tick within 250 ms of it; now M + 0.25 s
        expect(status()).toBe('NO APPROACH');
        await wait(1750);
        await unit.panel.msg(); // closed, back on Super NAV 5: M + 2.25 s
        await wait(750);
        await unit.panel.msg(); // reopened: M + 3.25 s
        expect(status()).toBe('NO APPROACH');
        await wait(1250); // M + 4.5 s
        expect(status()).toBe('NO APPROACH');
        await wait(1500); // M + 6 s

        expect(status()).not.toBe('NO APPROACH');
        expect(msgPageRow0()).toBe('NO APPROACH');
    });

    // 3-10 and the trainer (2026-10-24): leaving Super NAV 5 shows the message on the status line for 5 s, however long it
    // waited, so the clock starts at the first visible display and not at the post. M is the start of the MSG press; the
    // first visible display tick is within 250 ms after it and the message ends 5 s after that, between M + 5.0 and
    // M + 5.25 s: shown at M + 4.5 s, gone at M + 6 s (500 ms clear of the window)
    it('shows it for 5 s from the first visible display, after it waited more than 5 s on Super NAV 5 (#237)', async () => {
        const unit = await armUnit();
        await showSuperNav5(unit);
        await unit.panel.press(EVT_APPR_ARM);
        await wait(8000); // the status line has been hidden for more than 5 s

        await unit.panel.msg(); // M + 0.25 s
        expect(status()).toBe('NO APPROACH');
        await wait(4250); // M + 4.5 s
        expect(status()).toBe('NO APPROACH');
        await wait(1500); // M + 6 s

        expect(status()).not.toBe('NO APPROACH');
        expect(msgPageRow0()).toBe('NO APPROACH');
    });

    it('clears at once when the status line returns after more than 5 s, still listed (#237)', async () => {
        const unit = await armUnit();
        await showSuperNav5(unit);
        await unit.panel.press(EVT_APPR_ARM);
        await unit.panel.msg();
        await wait(750);
        await unit.panel.msg(); // closed, back on Super NAV 5
        await wait(6000);
        expect(await msgLightOverTwoSeconds(unit)).toEqual(new Set([0, 1])); // past 8 s, the entry waits

        await unit.panel.msg();

        expect(msgPageRow0()).toBe('NO APPROACH');
        expect(status()).not.toBe('NO APPROACH');
        expect(await msgLightOverTwoSeconds(unit)).toEqual(new Set([0]));
    });

    it('does not add a message posted while the MSG page is open to the open page (#237)', async () => {
        const unit = await armUnit();
        await unit.panel.msg(); // the empty MSG page

        await unit.panel.press(EVT_APPR_ARM);

        expect(status()).toBe('NO APPROACH');
        expect(Screen.read().text().split('\n').slice(0, 6).map(r => r.trim())).toEqual(['', '', '', '', '', '']);
        await unit.panel.msg(); // closed
        await unit.panel.msg(); // reopened within the 5 s
        expect(msgPageRow0()).toBe('NO APPROACH');
    });

    it('drops the scratchpad entry at a power cycle (#237)', async () => {
        const unit = await armUnit();
        await unit.panel.press(EVT_APPR_ARM);
        expect(messages(unit)).toContain('NO APPROACH'); // the precondition

        await unit.panel.powerCycle();
        await unit.panel.approveSelfTest();

        expect(messages(unit)).not.toContain('NO APPROACH');
    });

    // The screen change is the one a power-off makes: the page manager replaces the main page with the null page
    it('drops the entry when its status line is destroyed (#237)', async () => {
        const unit = await armUnit();
        await unit.panel.press(EVT_APPR_ARM);
        expect(messages(unit)).toContain('NO APPROACH'); // the precondition

        unit.props.pageManager.setCurrentPage(NullPage, {});

        expect(messages(unit)).not.toContain('NO APPROACH');
    });

    // The AVsoftech 90B trainer instead clears the second message 5 s after the first one's first display, and in its one
    // usable sample listed only the first. That case is too rare to trust the trainer on (the maintainer, 2026-10-24), so
    // the unit does the simpler thing: the newest message replaces the older, with its own 5 s, and only it is listed.
    it('characterization: a second message replaces the first, with its own 5 s, and only it is listed (#237)', async () => {
        const unit = await armUnit();
        await unit.panel.press(EVT_APPR_ARM); // P, now P + 0.25 s
        await wait(2750); // P + 3 s

        unit.props.bus.getPublisher<StatusLineMessageEvents>().pub('statusLineMessage', 'INVALID ENT');
        await wait(4000); // P + 7 s: the first one's clock would have ended it, the second one's has not

        expect(status()).toBe('INVALID ENT');
        expect(messages(unit)).toContain('INVALID ENT');
        expect(messages(unit)).not.toContain('NO APPROACH');
        await wait(1750); // P + 8.75 s: 5.75 s after the second, clear of its end at 5 to 5.25 s

        expect(status()).not.toBe('INVALID ENT');
        expect(status()).not.toBe('NO APPROACH');
        expect(messages(unit)).not.toContain('INVALID ENT');
    });
});
