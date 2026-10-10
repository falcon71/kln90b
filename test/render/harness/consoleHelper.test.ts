import {afterAll, describe, expect, it, vi} from 'vitest';
import {muteConsoleError} from '../../harness/console';

const realConsoleError = console.error;
const reached: unknown[][] = [];
/** Stands for the console.error that muteConsoleError replaces: it records what reaches it */
const recorder = (...args: unknown[]) => {
    reached.push(args);
};

afterAll(() => {
    console.error = realConsoleError;
});

// The two tests run in order: the second looks at what the first one left behind after its end, which the callback
// registered by muteConsoleError restores (an onTestFinished of the first test cannot be asserted from inside it)
describe('muteConsoleError (harness)', () => {
    it('keeps a console.error of the test from reaching the console it replaced', () => {
        console.error = recorder;

        muteConsoleError();
        console.error('expected error');

        expect(reached).toEqual([]);
        expect(vi.isMockFunction(console.error)).toBe(true);
    });

    it('has put the console.error it replaced back when the test that muted it ended', () => {
        expect(vi.isMockFunction(console.error)).toBe(false);
        expect(console.error).toBe(recorder);
    });
});
