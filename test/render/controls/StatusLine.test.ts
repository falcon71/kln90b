import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../harness/boot';
import {standardRoute} from '../../harness/fixtures';
import {courseDeg} from '../../harness/flight/geo';
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
