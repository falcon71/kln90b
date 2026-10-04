import {describe, expect, it} from 'vitest';
import {clearStatic} from '../../harness/singletons';

describe('singleton reset (harness)', () => {
    it('clears a static field', () => {
        class Owner {
            public static INSTANCE: object | undefined = {};
        }
        clearStatic(Owner, 'INSTANCE', true);
        expect(Owner.INSTANCE).toBeUndefined();
    });

    it('throws when a required field does not exist, so a renamed singleton fails loudly', () => {
        class Owner {
            public static RENAMED: object | undefined = {};
        }
        expect(() => clearStatic(Owner, 'INSTANCE', true)).toThrow(/Owner\.INSTANCE does not exist/);
    });

    it('skips a missing field that was never created', () => {
        class Owner {
        }
        expect(() => clearStatic(Owner, 'INSTANCE', false)).not.toThrow();
    });
});
