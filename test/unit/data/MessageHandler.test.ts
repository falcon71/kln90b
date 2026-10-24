import {describe, expect, it} from 'vitest';
import {Message, MessageHandler, OneTimeMessage, ScratchpadMessage} from '../../../kln90b/data/MessageHandler';

/** A persistent message whose condition the test switches */
class Condition implements Message {
    public seen = false;
    public valid = false;
    public readonly message: string[];

    constructor(text: string) {
        this.message = [text];
    }

    public isConditionValid(): boolean {
        return this.valid;
    }
}

function texts(handler: MessageHandler): string[] {
    return handler.getMessages().map(m => m.message.join(' '));
}

/** What the MSG page does to every message it shows (MessagePage.buildPages) */
function readAll(handler: MessageHandler): void {
    handler.getMessages().forEach(m => m.seen = true);
}

describe('MessageHandler, one-time messages', () => {
    // 3-16: a new message lights the prompt, flashing; once read and with no condition behind it, the prompt goes out
    it('holds a one-time message unread until it is read, then drops it at the next tick (3-16)', () => {
        const handler = new MessageHandler();
        handler.addMessage(new OneTimeMessage(['USER DATA LOST']));
        handler.tick();

        expect(texts(handler)).toEqual(['USER DATA LOST']);
        expect(handler.hasUnreadMessages()).toBe(true);

        readAll(handler);
        expect(handler.hasUnreadMessages()).toBe(false);
        handler.tick();

        expect(texts(handler)).toEqual([]);
        expect(handler.hasMessages()).toBe(false);
    });

    it('keeps an unread one-time message over many ticks (3-16)', () => {
        const handler = new MessageHandler();
        handler.addMessage(new OneTimeMessage(['USER DATA LOST']));
        for (let i = 0; i < 100; i++) handler.tick();

        expect(texts(handler)).toEqual(['USER DATA LOST']);
        expect(handler.hasUnreadMessages()).toBe(true);
    });

    // The MSG page lists the newest first by reversing this list, so the handler must keep the posting order
    it('keeps the messages in posting order (characterization)', () => {
        const handler = new MessageHandler();
        handler.addMessage(new OneTimeMessage(['FIRST']));
        handler.addMessage(new OneTimeMessage(['SECOND']));
        handler.tick();

        expect(texts(handler)).toEqual(['FIRST', 'SECOND']);
    });
});

describe('MessageHandler, persistent messages', () => {
    it('posts a message when its condition starts, once, however many ticks it holds (3-16)', () => {
        const handler = new MessageHandler();
        const cond = new Condition('OBS WPT > 200NM');
        handler.persistentMessages = [cond];

        handler.tick();
        expect(texts(handler)).toEqual([]);

        cond.valid = true;
        for (let i = 0; i < 5; i++) handler.tick();

        expect(texts(handler)).toEqual(['OBS WPT > 200NM']);
        expect(handler.hasUnreadMessages()).toBe(true);
    });

    // 3-16: a message whose condition still needs action keeps the prompt on, but steady (read)
    it('keeps a read message while its condition holds, read (3-16)', () => {
        const handler = new MessageHandler();
        const cond = new Condition('OBS WPT > 200NM');
        handler.persistentMessages = [cond];
        cond.valid = true;
        handler.tick();

        readAll(handler);
        for (let i = 0; i < 5; i++) handler.tick();

        expect(texts(handler)).toEqual(['OBS WPT > 200NM']);
        expect(handler.hasMessages()).toBe(true);
        expect(handler.hasUnreadMessages()).toBe(false);
    });

    it('drops an unread message when its condition ends (characterization)', () => {
        const handler = new MessageHandler();
        const cond = new Condition('OBS WPT > 200NM');
        handler.persistentMessages = [cond];
        cond.valid = true;
        handler.tick();

        cond.valid = false;
        handler.tick();

        expect(texts(handler)).toEqual([]);
        expect(handler.hasMessages()).toBe(false);
    });

    // A condition that comes back is a new situation: the message is new again and the prompt flashes (3-16)
    it('posts a read message as new again when its condition ends and returns (3-16)', () => {
        const handler = new MessageHandler();
        const cond = new Condition('OBS WPT > 200NM');
        handler.persistentMessages = [cond];
        cond.valid = true;
        handler.tick();
        readAll(handler);
        handler.tick();
        expect(handler.hasUnreadMessages()).toBe(false);

        cond.valid = false;
        handler.tick();
        cond.valid = true;
        handler.tick();

        expect(texts(handler)).toEqual(['OBS WPT > 200NM']);
        expect(handler.hasUnreadMessages()).toBe(true);
    });

    it('posts a one-time message and a persistent one side by side, in posting order (characterization)', () => {
        const handler = new MessageHandler();
        const cond = new Condition('OBS WPT > 200NM');
        handler.persistentMessages = [cond];
        handler.addMessage(new OneTimeMessage(['USER DATA LOST']));
        cond.valid = true;
        handler.tick();

        expect(texts(handler)).toEqual(['USER DATA LOST', 'OBS WPT > 200NM']);
    });
});

// A message describes the power-on in which it was posted (#176); the unit clears the handler at the power-off
describe('MessageHandler.clear (#176)', () => {
    it('drops the one-time messages, read or unread, and posts nothing by itself', () => {
        const handler = new MessageHandler();
        const read = new OneTimeMessage(['READ']);
        read.seen = true;
        handler.addMessage(read);
        handler.addMessage(new OneTimeMessage(['UNREAD']));

        handler.clear();
        handler.tick();

        expect(texts(handler)).toEqual([]);
        expect(handler.hasMessages()).toBe(false);
        expect(handler.hasUnreadMessages()).toBe(false);
    });

    it('keeps a message that is added after it', () => {
        const handler = new MessageHandler();
        handler.addMessage(new OneTimeMessage(['BEFORE']));

        handler.clear();
        handler.addMessage(new OneTimeMessage(['AFTER']));
        handler.tick();

        expect(texts(handler)).toEqual(['AFTER']);
    });
});

describe('MessageHandler.clear and the seen flags (#351)', () => {
    // The maintainer's ruling (#351): a read persistent message whose condition still holds after the power-on comes
    // back read. One whose condition ended meanwhile is new again when it returns, as at any other time (3-16)
    it('lets a read persistent message return read at the next tick while its condition holds, and new once it lapsed (#351)', () => {
        const handler = new MessageHandler();
        const holds = new Condition('HOLDS');
        const ends = new Condition('ENDS');
        handler.persistentMessages = [holds, ends];
        holds.valid = true;
        ends.valid = true;
        handler.tick();
        readAll(handler);
        expect(handler.hasUnreadMessages()).toBe(false);

        handler.clear();
        expect(handler.hasMessages()).toBe(false);
        ends.valid = false;
        handler.tick();

        expect(texts(handler)).toEqual(['HOLDS']);
        expect(holds.seen).toBe(true);
        expect(handler.hasUnreadMessages()).toBe(false);

        ends.valid = true;
        handler.tick();

        expect(texts(handler)).toEqual(['HOLDS', 'ENDS']);
        expect(ends.seen).toBe(false);
    });

    // #351: clear() keeps the seen flag as it is, so an unread message is not made read either
    it('lets an unread persistent message return unread (#351)', () => {
        const handler = new MessageHandler();
        const holds = new Condition('HOLDS');
        handler.persistentMessages = [holds];
        holds.valid = true;
        handler.tick();

        handler.clear();
        handler.tick();

        expect(texts(handler)).toEqual(['HOLDS']);
        expect(handler.hasUnreadMessages()).toBe(true);
    });
});

// #237: a status line message is also an entry of the MSG page. The status line posts, times and ends it
describe('MessageHandler, scratchpad messages (#237)', () => {
    // AVsoftech 90B trainer, 2026-10-24: reading the entry does not stop the MSG prompt from flashing
    it('a scratchpad message never counts as read (#237)', () => {
        const handler = new MessageHandler();
        const message = new ScratchpadMessage('NO APPROACH');
        handler.addMessage(message);

        message.seen = true;

        expect(message.seen).toBe(false);
        expect(handler.hasUnreadMessages()).toBe(true);
    });

    it('removes a message at once with removeMessage (#237)', () => {
        const handler = new MessageHandler();
        const first = new ScratchpadMessage('NO APPROACH');
        const second = new ScratchpadMessage('INVALID ENT');
        handler.addMessage(first);
        handler.addMessage(second);

        handler.removeMessage(first);

        expect(texts(handler)).toEqual(['INVALID ENT']);
    });

    it('drops an ended scratchpad message at the next tick (#237)', () => {
        const handler = new MessageHandler();
        const message = new ScratchpadMessage('NO APPROACH');
        handler.addMessage(message);
        handler.tick();
        expect(handler.hasMessages()).toBe(true); // the precondition: it stays while it has not ended

        message.ended = true;
        handler.tick();

        expect(handler.hasMessages()).toBe(false);
    });
});
