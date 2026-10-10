import {describe, expect, it} from 'vitest';
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
    // 3-16: MSG opens the message page, and pressing it again goes through the messages until the page closes
    it('returns the rows of the messages and leaves none unread behind', async () => {
        const unit = await booted();
        unit.props.messageHandler.addMessage(new OneTimeMessage(['FIRST LINE', 'SECOND LINE']));
        unit.props.messageHandler.addMessage(new OneTimeMessage(['ONE LINE']));

        const seen = await unit.panel.readMessages();

        // The page lists the newest message first. The boot's own message (SYSTEM TIME UPDATED, #328) comes after them and is not relied on
        expect(seen.slice(0, 3)).toEqual(['ONE LINE', 'FIRST LINE', 'SECOND LINE']);
        expect(unit.props.messageHandler.getMessages()).toEqual([]);
        expect(Screen.read().status().left).not.toBe('');
    });

    it('rejects when the MSG page does not close within the presses', async () => {
        const unit = await booted();
        unit.props.messageHandler.addMessage(new OneTimeMessage(['UNREAD']));

        await expect(unit.panel.readMessages(0)).rejects.toThrow(/did not close/);
    });
});
