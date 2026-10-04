import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../harness/boot';
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
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
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
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const unit = await bootUnit();
        await publish(unit, errorWithStack('boom'));
        expect(isShown()).toBe(true);

        (button('OK and suppress further errors') as HTMLButtonElement).click();
        expect(isShown()).toBe(false);

        await publish(unit, errorWithStack('third'));
        expect(isShown()).toBe(false);
    });
});
