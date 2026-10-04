import {describe, expect, it, onTestFinished, vi} from 'vitest';
import {bootUnit} from '../../harness/boot';

const original = console.error;

/** The first two tests run in order: the second checks what the unit of the first one left behind. */
describe('console.error collector (harness)', () => {
    it('records a console.error call after the boot', async () => {
        const unit = await bootUnit();
        expect(unit.consoleErrors).toEqual([]);

        console.error('x', 42);

        expect(unit.consoleErrors).toEqual([['x', 42]]);
    });

    it('has the original console.error back after the unit', () => {
        expect(console.error).toBe(original);
    });

    it('passes the call on to the console.error it replaced', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        // Registered before the boot, so it runs after the teardown has put the spy back
        onTestFinished(() => spy.mockRestore());
        const unit = await bootUnit();

        console.error('x', 42);

        expect(spy).toHaveBeenCalledExactlyOnceWith('x', 42);
        expect(unit.consoleErrors).toEqual([['x', 42]]);
    });
});
