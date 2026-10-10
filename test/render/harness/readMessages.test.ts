import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';
import {OneTimeMessage} from '../../../kln90b/data/MessageHandler';

// The last position matches the boot position, so that POSITION DIFFERS does not post (testing.md section 6)
async function booted(): Promise<HeadlessUnit> {
    const unit = await bootUnit({storage: {lastLatitude: 47, lastLongitude: 8}, position: {lat: 47, lon: 8}});
    await settle(unit);
    return unit;
}

describe('FrontPanel.readMessages (harness)', () => {
    // 3-16: MSG opens the message page, and pressing it again goes through the messages until the page closes. A page
    // holds six lines, so three two-line messages fill the first page, including its sixth row, and the fourth is the
    // first on the second page
    it('returns the rows of every page, newest message first, and leaves none unread behind', async () => {
        const unit = await booted();
        for (const n of ['ONE', 'TWO', 'THREE', 'FOUR']) {
            unit.props.messageHandler.addMessage(new OneTimeMessage([`${n} A`, `${n} B`]));
        }

        const seen = await unit.panel.readMessages();

        // The boot's own message (SYSTEM TIME UPDATED, #328) is older and follows these on the second page; it is not relied on
        expect(seen.slice(0, 8)).toEqual(['FOUR A', 'FOUR B', 'THREE A', 'THREE B', 'TWO A', 'TWO B', 'ONE A', 'ONE B']);
        expect(unit.props.messageHandler.getMessages()).toEqual([]);
        expect(Screen.read().status().left).not.toBe('');
    });

    it('waits a second after the page closes, so that the messages read go', async () => {
        const unit = await booted();
        unit.props.messageHandler.addMessage(new OneTimeMessage(['A MESSAGE']));
        const advance = vi.spyOn(vi, 'advanceTimersByTimeAsync');
        try {
            await unit.panel.readMessages();

            expect(advance.mock.calls[advance.mock.calls.length - 1]).toEqual([1000]);
        } finally {
            advance.mockRestore();
        }
    });

    it('rejects when the MSG page does not close within the presses', async () => {
        const unit = await booted();
        unit.props.messageHandler.addMessage(new OneTimeMessage(['UNREAD']));

        await expect(unit.panel.readMessages(0)).rejects.toThrow(/did not close/);
    });
});
