import {describe, expect, it} from 'vitest';
import {countAllocations, noAllocations} from '../../harness/allocation';

// The counters of the allocation check (#459) must count nothing of their own, see every kind they claim to see, and
// leave the built-ins as they were, also after a throw
describe('countAllocations', () => {
    it('counts nothing for a block that allocates nothing', () => {
        const {result, counts} = countAllocations(() => {
            let sum = 0;
            for (let i = 0; i < 3; i++) {
                sum += i;
            }
            return sum;
        });

        expect(result).toBe(3); // Precondition: the block ran
        expect(counts).toEqual(noAllocations());
    });

    it('sees an array method, Array.from and the iterators of arrays, sets and maps', () => {
        const set = new Set([1, 2]);
        const map = new Map([[1, 2]]);
        const array = [1, 2];
        const {counts} = countAllocations(() => {
            array.map(v => v);
            Array.from(array);
            [...array].includes(1);
            [...set].includes(1);
            [...map].includes([1, 2]);
        });

        expect(counts['Array.prototype.map']).toBe(1);
        expect(counts['Array.from']).toBe(1);
        expect(counts['Array.prototype[Symbol.iterator]']).toBeGreaterThan(0);
        expect(counts['Set.prototype[Symbol.iterator]']).toBe(1);
        expect(counts['Map.prototype[Symbol.iterator]']).toBe(1);
    });

    it('puts the built-ins back when the block throws', () => {
        const originals = {
            map: Array.prototype.map,
            from: Array.from,
            arrayIterator: Array.prototype[Symbol.iterator],
            setValues: Set.prototype.values,
            setIterator: Set.prototype[Symbol.iterator],
            mapIterator: Map.prototype[Symbol.iterator],
        };
        const error = new Error('thrown in the counted block');

        expect(() => countAllocations(() => {
            [1].map(v => v);
            throw error;
        })).toThrow(error);

        expect(Array.prototype.map).toBe(originals.map);
        expect(Array.from).toBe(originals.from);
        expect(Array.prototype[Symbol.iterator]).toBe(originals.arrayIterator);
        expect(Set.prototype.values).toBe(originals.setValues);
        expect(Set.prototype[Symbol.iterator]).toBe(originals.setIterator);
        expect(Map.prototype[Symbol.iterator]).toBe(originals.mapIterator);
        // A later block counts only its own calls: no wrapper of the thrown block is left to count twice
        const {counts} = countAllocations(() => [1].map(v => v));
        expect(counts['Array.prototype.map']).toBe(1);
    });
});
