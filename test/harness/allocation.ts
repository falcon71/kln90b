/**
 * The built-ins a hot path allocates through: the array methods that build an array or take a closure, Array.from, and
 * the iterators of arrays, sets and maps (a spread or a for-of over them). A path that must allocate nothing (the 16 Hz
 * D-bar write, #459) calls none of them.
 */
const TARGETS: [string, object, PropertyKey][] = [
    ['Array.prototype.find', Array.prototype, 'find'],
    ['Array.prototype.filter', Array.prototype, 'filter'],
    ['Array.prototype.map', Array.prototype, 'map'],
    ['Array.prototype.slice', Array.prototype, 'slice'],
    ['Array.prototype.concat', Array.prototype, 'concat'],
    ['Array.prototype.some', Array.prototype, 'some'],
    ['Array.prototype.forEach', Array.prototype, 'forEach'],
    ['Array.prototype[Symbol.iterator]', Array.prototype, Symbol.iterator],
    ['Array.from', Array, 'from'],
    ['Set.prototype.values', Set.prototype, 'values'],
    ['Set.prototype.keys', Set.prototype, 'keys'],
    ['Set.prototype.entries', Set.prototype, 'entries'],
    ['Set.prototype[Symbol.iterator]', Set.prototype, Symbol.iterator],
    ['Map.prototype.values', Map.prototype, 'values'],
    ['Map.prototype.keys', Map.prototype, 'keys'],
    ['Map.prototype.entries', Map.prototype, 'entries'],
    ['Map.prototype[Symbol.iterator]', Map.prototype, Symbol.iterator],
];

/**
 * Runs fn and counts its calls of the allocating built-ins. The originals are put back in a `finally`, so also when fn
 * throws (the error is passed on). The counts are taken before any assertion runs, so that the matchers' own use of
 * these built-ins is not counted.
 *
 * Plain counting wrappers, not vi.spyOn: a spy calls the array iterator and the array methods itself, which recurses
 * once they are spied. The wrappers and the code here use index loops, `arguments` and no destructuring or spread, so
 * that they call none of the built-ins they count.
 */
export function countAllocations<T>(fn: () => T): { result: T, counts: Record<string, number> } {
    const calls: number[] = [];
    const originals: PropertyDescriptor[] = [];
    let result: T;
    try {
        for (let i = 0; i < TARGETS.length; i++) {
            const target = TARGETS[i][1];
            const key = TARGETS[i][2];
            const original = Object.getOwnPropertyDescriptor(target, key)!;
            const wrapped = original.value as (...args: unknown[]) => unknown;
            const index = i;
            calls.push(0);
            originals.push(original);
            Object.defineProperty(target, key, {
                ...original,
                value: function (this: unknown) {
                    calls[index]++;
                    // eslint-disable-next-line prefer-rest-params
                    return wrapped.apply(this, arguments as unknown as unknown[]);
                },
            });
        }
        result = fn();
    } finally {
        //Only the wrappers installed so far, if an install threw. Once they are gone nothing adds to the counts
        for (let i = 0; i < originals.length; i++) {
            Object.defineProperty(TARGETS[i][1], TARGETS[i][2], originals[i]);
        }
    }
    const counts: Record<string, number> = {};
    for (let i = 0; i < TARGETS.length; i++) {
        counts[TARGETS[i][0]] = calls[i];
    }
    return {result, counts};
}

/** The counts of a path that allocates nothing: every built-in at 0 */
export function noAllocations(): Record<string, number> {
    return Object.fromEntries(TARGETS.map(([name]) => [name, 0]));
}
