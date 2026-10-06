import {describe, expect, it} from 'vitest';
import {Message, MessageHandler, OneTimeMessage} from '../../../kln90b/data/MessageHandler';

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

    // The MSG page lists the newest first (3-16) by reversing this list, so the handler must keep the posting order
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

    it('drops an unread message when its condition ends (3-16)', () => {
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
