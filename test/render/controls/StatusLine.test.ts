import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../harness/boot';

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
// aircraft must not add a flash of its own. The steady light while a persistent message stays is left untested: no
// cheap trigger.
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
});
