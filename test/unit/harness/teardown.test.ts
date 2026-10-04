import {describe, expect, it} from 'vitest';
import {runAll} from '../../harness/boot';

describe('teardown runner (harness)', () => {
    it('runs every step after one throws, then rethrows that error', () => {
        const ran: string[] = [];
        const steps = [
            () => {
                ran.push('one');
            },
            () => {
                throw new Error('two');
            },
            () => {
                ran.push('three');
            },
        ];

        expect(() => runAll(steps)).toThrow('two');
        expect(ran).toEqual(['one', 'three']);
    });

    it('rethrows the first error, not a later one', () => {
        const steps = [
            () => {
                throw new Error('first');
            },
            () => {
                throw new Error('second');
            },
        ];

        expect(() => runAll(steps)).toThrow('first');
    });

    it('returns normally when no step throws', () => {
        const ran: number[] = [];

        runAll([() => ran.push(1), () => ran.push(2)]);

        expect(ran).toEqual([1, 2]);
    });
});
