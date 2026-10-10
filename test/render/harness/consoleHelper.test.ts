import {describe, expect, it, onTestFinished, vi} from 'vitest';
import {muteConsoleError} from '../../harness/console';

describe('muteConsoleError (harness)', () => {
    it('keeps a console.error of the test from reaching the console it replaced, and puts that one back at the end', () => {
        const real = console.error;
        const reached: unknown[][] = [];
        const recorder = (...args: unknown[]) => {
            reached.push(args);
        };
        console.error = recorder;
        // Registered before muteConsoleError's callback, so it runs after it (Vitest runs onTestFinished callbacks last
        // registered first) and sees what the restore left; an assertion that fails here fails the test
        onTestFinished(() => {
            const restored = console.error;
            console.error = real;
            expect(vi.isMockFunction(restored)).toBe(false);
            expect(restored).toBe(recorder);
        });

        muteConsoleError();
        console.error('expected error');

        expect(reached).toEqual([]);
        expect(vi.isMockFunction(console.error)).toBe(true);
    });
});
