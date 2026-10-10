import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../harness/boot';
import {muteConsoleError} from '../../harness/console';
import {ErrorEvent} from '../../../kln90b/controls/ErrorPage';

function errorWithStack(message: string): Error {
    const e = new Error(message);
    e.stack = `Error: ${message}\n    at first (a.ts:1:1)\n    at second (b.ts:2:2)`;
    return e;
}

async function publish(unit: HeadlessUnit, e: Error): Promise<void> {
    unit.core.bus.getPublisher<ErrorEvent>().pub('error', e);
    await vi.advanceTimersByTimeAsync(250);
}

const page = () => document.querySelector('.errorpage')!;
const isShown = () => !page().classList.contains('d-none');
const button = (label: string) => [...page().querySelectorAll('button')].find(b => b.textContent!.trim() === label)!;

// The error page is a debugging aid of this project and not part of the real unit, so these tests describe the code
describe('error page (characterization) (#5)', () => {
    it('shows the message and the stack, OK hides the page and the next error shows it again', async () => {
        muteConsoleError();
        const unit = await bootUnit();
        expect(isShown()).toBe(false);

        await publish(unit, errorWithStack('boom'));

        expect(isShown()).toBe(true);
        const message = page().querySelector('.errormessage')!;
        expect(message.textContent!.startsWith('Error: boom')).toBe(true);
        expect(message.innerHTML).toBe('Error: boom<br>Error: boom\n    at first (a.ts:1:1)\n    at second (b.ts:2:2)');

        (button('OK') as HTMLButtonElement).click();
        expect(isShown()).toBe(false);

        await publish(unit, errorWithStack('again'));
        expect(isShown()).toBe(true);
        expect(page().querySelector('.errormessage')!.textContent!.startsWith('Error: again')).toBe(true);
    });

    it('OK and suppress hides the page and keeps later errors away', async () => {
        muteConsoleError();
        const unit = await bootUnit();
        await publish(unit, errorWithStack('boom'));
        expect(isShown()).toBe(true);

        (button('OK and suppress further errors') as HTMLButtonElement).click();
        expect(isShown()).toBe(false);

        await publish(unit, errorWithStack('third'));
        expect(isShown()).toBe(false);
    });
});

// CLAUDE.md, Architecture: exceptions in ticks and in input are caught and shown on the error page. The throws are
// injected with a spy, because a throw the code makes on its own is a bug that a fix would remove from the test
describe('error page, the paths that reach it (characterization)', () => {
    it('shows an error thrown in a display tick', async () => {
        muteConsoleError();
        const unit = await bootUnit();
        // StatusLine asks for the messages on every display tick
        vi.spyOn(unit.props.messageHandler, 'hasMessages').mockImplementation(() => {
            throw new Error('display boom');
        });
        await vi.advanceTimersByTimeAsync(250);

        expect(isShown()).toBe(true);
        expect(page().querySelector('.errormessage')!.textContent!.startsWith('Error: display boom')).toBe(true);
    });

    it('shows an error thrown in a calculation tick', async () => {
        muteConsoleError();
        const unit = await bootUnit();
        // MessageHandler is one of the calculation tickables
        vi.spyOn(unit.props.messageHandler, 'tick').mockImplementation(() => {
            throw new Error('calc boom');
        });
        await vi.advanceTimersByTimeAsync(1000);

        expect(isShown()).toBe(true);
        expect(page().querySelector('.errormessage')!.textContent!.startsWith('Error: calc boom')).toBe(true);
    });

    it('shows an error thrown while a knob event is handled', async () => {
        muteConsoleError();
        const unit = await bootUnit();
        vi.spyOn(unit.props.pageManager, 'onInteractionEvent').mockImplementationOnce(() => {
            throw new Error('input boom');
        });
        expect(isShown()).toBe(false);

        await unit.panel.inner('L', 1);

        expect(isShown()).toBe(true);
        expect(page().querySelector('.errormessage')!.textContent!.startsWith('Error: input boom')).toBe(true);
    });
});
