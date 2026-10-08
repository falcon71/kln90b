import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../harness/boot';
import {standardRoute} from '../../harness/fixtures';
import {courseDeg} from '../../harness/flight/geo';
import {blinkCycle} from '../../harness/render/blink';
import {Screen} from '../../harness/render/screen';
import {savedFlightplan} from '../../harness/storage';

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
        // A booted unit always has unread messages (docs/testing.md, section 6)
        const unit = await bootUnit();
        await settle(unit);

        expect(await msgLightOverTwoSeconds(unit)).toEqual(new Set([0, 1]));
    });

    it('is dark once all messages are read (3-16, 3-59)', async () => {
        const unit = await bootUnit();
        await settle(unit);

        // The boot messages: reading them all closes the MSG page
        await unit.panel.press('KLN90B_MSG_Push');
        await unit.panel.press('KLN90B_MSG_Push');
        await unit.panel.press('KLN90B_MSG_Push');
        await vi.advanceTimersByTimeAsync(1000);

        expect(await msgLightOverTwoSeconds(unit)).toEqual(new Set([0]));
    });

    // 3-16: the MSG prompt stays steady while a condition that needs action persists, and 3-59 has the remote annunciator
    // follow the prompt. The condition is a wrong external course: ADJ NAV IND CRS TO nnn stays while Nav OBS:1 differs from
    // the DTK by more than 5 degrees (PersistentMessages.ts, active with the default Output.ObsTarget 0 and Input.ObsSource 1).
    it('is steady while a persistent message stays, and dark once its condition ends (3-16, 3-59)', async () => {
        const {kaaa, abc, kbbb} = standardRoute();
        const magvar = 4;
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb], storage: savedFlightplan(0, [kaaa, abc, kbbb]), magvar,
        });
        await settle(unit);
        // On KAAA the DTK is the course of the first leg, and the unit shows it magnetic
        const dtk = courseDeg(kaaa, abc) - magvar;
        expect(Math.round(dtk)).toBe(46); // The literal of the message below follows from this, not from the unit

        unit.env.sim.set('Nav OBS:1', 'degrees', dtk + 30);
        await vi.advanceTimersByTimeAsync(15000); // Past the 10 s in which the message shows whatever the course is

        // Read every message: the MSG page marks them seen
        await unit.panel.press('KLN90B_MSG_Push');
        const rows = Array.from({length: 6}, (_, r) => Screen.read().row(r).trimEnd());
        // A precondition: the setup raised the message, so the light below is held by it and not by something else
        expect(rows).toContain('ADJ NAV IND CRS TO 046°');
        for (let i = 0; i < 10 && Screen.read().status().left === ''; i++) {
            await unit.panel.press('KLN90B_MSG_Push');
        }
        expect(Screen.read().status().left).not.toBe(''); // The page closed: every message was read
        await vi.advanceTimersByTimeAsync(1000);

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

/** What `read` returns on 8 display ticks (two seconds, two blink cycles), one entry per distinct value */
async function overTwoSeconds(read: () => string): Promise<Set<string>> {
    return new Set([...await blinkCycle(read), ...await blinkCycle(read)]);
}

/** The text and the mask of the msg/ent prompt, cells 14 to 16 of the status row */
const prompt = () => {
    const {text, mask} = statusRow();
    return `${text.slice(14, 17)} ${mask.slice(14, 17)}`;
};

/** Reads the boot messages (testing.md section 6): MSG until the page closes; the one-time messages then go */
async function readBootMessages(unit: HeadlessUnit): Promise<void> {
    await unit.panel.msg();
    for (let i = 0; i < 10 && Screen.read().status().left === ''; i++) {
        await unit.panel.msg();
    }
    await vi.advanceTimersByTimeAsync(1000);
    expect(unit.props.messageHandler.hasMessages()).toBe(false); // the precondition: nothing is left
}

/**
 * The standard route in FPL 0, KAAA active, settled: MOD 2 then offers OBS with the ent prompt (5-33). Without an OBS
 * input (ObsSource 0) the unit reads no external course, so no ADJ NAV IND CRS message joins the boot messages
 */
async function onRoute(): Promise<HeadlessUnit> {
    const {kaaa, abc, kbbb} = standardRoute();
    const unit = await bootUnit({
        facilities: [kaaa, abc, kbbb], storage: savedFlightplan(0, [kaaa, abc, kbbb]),
        panelXml: '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input><ObsSource>0</ObsSource></Input></Instrument></PlaneHTMLConfig>',
    });
    await settle(unit);
    return unit;
}

/** NO SUCH WPT on FPL 0: an ident the database lacks, typed into the first row and entered */
async function noSuchWpt(unit: HeadlessUnit): Promise<void> {
    await unit.panel.selectPage('L', 'FPL 0');
    await unit.panel.cursor('L');
    await unit.panel.enterIdent('L', 'QQQQ');
    await unit.panel.ent(); // one display tick of 250 ms follows the ENT
}

describe('status line, the center segment (spec)', () => {
    // 3-10, figure 3-37: a status line message takes the whole center segment, the mode and the prompt, in inverse video
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

        expect(await overTwoSeconds(prompt)).toEqual(new Set(['ent ...', 'ent BBB']));
    });

    // 3-16, figure 3-55: a new message makes the msg prompt flash in inverse video. The harness reads the flashing
    // inverse as I in one phase and F in the other
    it('flashes msg in inverse video while a message is unread (3-16, figure 3-55)', async () => {
        await bootUnit(); // the boot messages are unread (testing.md section 6)

        expect(await overTwoSeconds(prompt)).toEqual(new Set(['msg III', 'msg FFF']));
    });

    // 3-16: a message whose condition needs action keeps the prompt on, not flashing, once it is read. The condition is a
    // wrong external course, as in the MSG light test above
    it('keeps msg steady in inverse video once read while the condition stays (3-16)', async () => {
        const {kaaa, abc, kbbb} = standardRoute();
        const unit = await bootUnit({facilities: [kaaa, abc, kbbb], storage: savedFlightplan(0, [kaaa, abc, kbbb]), magvar: 4});
        await settle(unit);
        unit.env.sim.set('Nav OBS:1', 'degrees', courseDeg(kaaa, abc) - 4 + 30);
        await vi.advanceTimersByTimeAsync(15000);
        await unit.panel.msg();
        for (let i = 0; i < 10 && Screen.read().status().left === ''; i++) {
            await unit.panel.msg();
        }
        await vi.advanceTimersByTimeAsync(1000);
        // The preconditions: every message was read, and the persistent one stays
        expect(unit.props.messageHandler.getMessages().map(m => m.message.join(' '))).toEqual(['ADJ NAV IND CRS TO 046°']);
        expect(unit.props.messageHandler.hasUnreadMessages()).toBe(false);

        expect(await overTwoSeconds(prompt)).toEqual(new Set(['msg III']));
    });

    // 3-10: the last three cells of the center segment are blank without a message and without ENT
    it('shows three blanks without a message and without ENT (3-10)', async () => {
        const unit = await bootUnit();
        await readBootMessages(unit);

        expect(await overTwoSeconds(prompt)).toEqual(new Set(['    ...']));
    });

    // 3-11, figure 3-38 (left, one cell in) and figure 3-36 (right): with a cursor on, CRSR in inverse video replaces the
    // page name of that side
    it('replaces each page name with CRSR in inverse video while that cursor is on (3-11, figures 3-36, 3-38)', async () => {
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
        expect(await overTwoSeconds(leftName)).toEqual(new Set([' KYBD .IIII', ' KYBD .FFFF']));
    });
});

describe('status line after an ENT prompt (#NEW-6-1)', () => {
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
    it('shows msg after the ENT, the boot messages unread (sibling of #NEW-6-1) (3-16)', async () => {
        await entInTheBlinkPhase();

        const texts = new Set([...await overTwoSeconds(prompt)].map(s => s.slice(0, 3)));
        expect(texts).toEqual(new Set(['msg']));
    });

    // 3-16, figure 3-55: the unread message flashes the prompt in inverse video; the ENT prompt's flash must not hide it
    it.fails('flashes msg in inverse video after an ENT prompt that ended in the blink phase (3-16, #NEW-6-1)', async () => {
        await entInTheBlinkPhase();

        expect(await overTwoSeconds(prompt)).toEqual(new Set(['msg III', 'msg FFF']));
    });
});
