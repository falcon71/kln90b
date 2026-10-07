import {describe, expect, it} from 'vitest';
import {VNode} from '@microsoft/msfs-sdk';
import {CursorController, EnterResult, Field} from '../../../kln90b/pages/CursorController';
import {NO_CHILDREN, UiElement, UIElementChildren} from '../../../kln90b/pages/Page';

/** A field that records the knob events it gets; enter() answers with the given result */
class FakeField implements Field {
    public isFocused = false;
    public isEntered = false;
    public readonly events: string[] = [];
    public enterResult = EnterResult.Not_Handled;

    constructor(public readonly id: string, public isReadonly = false, public readonly children: UIElementChildren<any> = NO_CHILDREN) {
    }

    setFocused(focused: boolean): void {
        this.isFocused = focused;
    }

    outerLeft(): boolean {
        this.events.push('outerLeft');
        return true;
    }

    outerRight(): boolean {
        this.events.push('outerRight');
        return true;
    }

    innerLeft(): boolean {
        this.events.push('innerLeft');
        return true;
    }

    innerRight(): boolean {
        this.events.push('innerRight');
        return true;
    }

    enter(): Promise<EnterResult> {
        this.events.push('enter');
        return Promise.resolve(this.enterResult);
    }

    clear(): boolean {
        return false;
    }

    keyboard(key: string): boolean {
        this.events.push(`keyboard ${key}`);
        return true;
    }

    isEnterAccepted(): boolean {
        return true;
    }

    isClearAccepted(): boolean {
        return false;
    }

    tick(): void {
    }

    render(): VNode | null {
        return null;
    }
}

/** A text or container element without isReadonly: not a field */
class Box implements UiElement {
    constructor(public readonly children: UIElementChildren<any> = NO_CHILDREN) {
    }

    tick(): void {
    }

    render(): VNode | null {
        return null;
    }
}

const children = (map: Record<string, UiElement>) => new UIElementChildren<any>(map);

/** The id of the focused field, '-' with the cursor off; also checks that exactly one field shows focus */
function focused(cc: CursorController, all: FakeField[]): string {
    const shown = all.filter(f => f.isFocused).map(f => f.id);
    const current = cc.getCurrentFocusedField() as FakeField | null;
    expect(shown).toEqual(current === null ? [] : [current.id]);
    return current?.id ?? '-';
}

/** The ids the outer knob visits clockwise from the cursor-on position, n steps */
function walk(cc: CursorController, all: FakeField[], n: number, dir: 1 | -1 = 1): string[] {
    const seen = [focused(cc, all)];
    for (let i = 0; i < n; i++) {
        if (dir === 1) cc.outerRight(); else cc.outerLeft();
        seen.push(focused(cc, all));
    }
    return seen;
}

// CLAUDE.md and docs/architecture.md (UI 2): the cursor finds the fields in the order the children are declared, depth
// first, and an element is a field when it has an isReadonly property (duck typing). The manual cannot say how the code
// orders its children, so these are characterization tests of the controller on a page built for the test.
describe('CursorController field order (characterization)', () => {
    it('visits the fields in declaration order, depth first, and skips elements that are not fields', () => {
        const a = new FakeField('a');
        const b = new FakeField('b');
        const c = new FakeField('c');
        const d = new FakeField('d');
        const e = new FakeField('e', false, children({d}));
        const all = [a, b, c, d, e];
        const cc = new CursorController(children({a, text: new Box(), box: new Box(children({b, c})), e}));

        cc.setCursorActive(true);

        // e is a field with a field inside: the container comes first, then its children
        expect(walk(cc, all, 4)).toEqual(['a', 'b', 'c', 'e', 'd']);
    });

    it('skips read-only fields, also a field that turns read-only after the controller is built', () => {
        const a = new FakeField('a');
        const b = new FakeField('b', true);
        const c = new FakeField('c');
        const d = new FakeField('d');
        const all = [a, b, c, d];
        const cc = new CursorController(children({a, b, c, d}));
        c.isReadonly = true;

        cc.setCursorActive(true);

        expect(walk(cc, all, 1)).toEqual(['a', 'd']);
    });

});

// 3-11: on a page without data entry the cursor button has no effect
describe('CursorController on a page without data entry (3-11)', () => {
    it('turns on only on a page with a field', () => {
        const cc = new CursorController(children({text: new Box(), ro: new FakeField('ro', true)}));

        expect(cc.toggleCursor()).toBe(false);
        expect(cc.cursorActive).toBe(false);
    });
});

// 4-3 tells the pilot to turn the left outer knob all the way counterclockwise to reach USE? on the FPL page, which only
// makes sense when the cursor stops at the first field. Checked in the KLN 89 trainer (2026-10-07) on FPL 0 and SET 2:
// turned further, the cursor stays on the first field counterclockwise and on the last field clockwise, and never wraps.
// The code wraps both ways (CursorController.ts, outerLeft and outerRight). The trainer's first field is its mode field
// in the status column, which the 90B does not have, so only the ends of the page's own fields are asserted.
describe('CursorController outer knob at the ends of the page (4-3, checked in the KLN 89 trainer, 2026-10-07)', () => {
    // The sibling of the pins: inside the list the knob steps one field at a time in both directions
    it('steps from field to field clockwise and counterclockwise inside the list', () => {
        const all = [new FakeField('a'), new FakeField('b'), new FakeField('c')];
        const cc = new CursorController(children({a: all[0], b: all[1], c: all[2]}));
        cc.setCursorActive(true);

        expect(walk(cc, all, 2)).toEqual(['a', 'b', 'c']);
        expect(walk(cc, all, 2, -1)).toEqual(['c', 'b', 'a']);
    });

    it.fails('stays on the last field when turned further clockwise (4-3, #218)', () => {
        const all = [new FakeField('a'), new FakeField('b'), new FakeField('c')];
        const cc = new CursorController(children({a: all[0], b: all[1], c: all[2]}));
        cc.setCursorActive(true);
        cc.outerRight();
        cc.outerRight();
        expect(focused(cc, all)).toBe('c'); // Precondition: the last field

        cc.outerRight();

        expect(focused(cc, all)).toBe('c');
    });

    it.fails('stays on the first field when turned further counterclockwise (4-3, #218)', () => {
        const all = [new FakeField('a'), new FakeField('b'), new FakeField('c')];
        const cc = new CursorController(children({a: all[0], b: all[1], c: all[2]}));
        cc.setCursorActive(true);
        expect(focused(cc, all)).toBe('a'); // Precondition: the first field

        cc.outerLeft();

        expect(focused(cc, all)).toBe('a');
    });
});

describe('CursorController outer knob (characterization)', () => {
    it('hands the outer knob to a field that is being entered, and the cursor stays on it', () => {
        const a = new FakeField('a');
        const b = new FakeField('b');
        const cc = new CursorController(children({a, b}));
        cc.setCursorActive(true);
        a.isEntered = true;

        cc.outerRight();
        cc.outerLeft();

        expect(a.events).toEqual(['outerRight', 'outerLeft']);
        expect(focused(cc, [a, b])).toBe('a');
    });

    it('hands the inner knob to the focused field, and nothing when the cursor is off', () => {
        const a = new FakeField('a');
        const b = new FakeField('b');
        const cc = new CursorController(children({a, b}));

        expect(cc.innerRight()).toBe(false);
        cc.setCursorActive(true);
        cc.outerRight();
        cc.innerRight();
        cc.innerLeft();

        expect(a.events).toEqual([]);
        expect(b.events).toEqual(['innerRight', 'innerLeft']);
    });

    // The real unit has no keyboard; the code takes key presses from the sim's keyboard (KeyboardService) and hands them
    // to the field under the cursor
    it('hands a key press to the focused field, and nothing when the cursor is off', () => {
        const a = new FakeField('a');
        const b = new FakeField('b');
        const cc = new CursorController(children({a, b}));

        expect(cc.keyboard('X')).toBe(false);
        cc.setCursorActive(true);
        cc.outerRight();
        expect(cc.keyboard('Y')).toBe(true);

        expect(a.events).toEqual([]);
        expect(b.events).toEqual(['keyboard Y']);
    });
});

// The code remembers the field the cursor was on and puts it back on that field (CursorController.setCursorActive). The
// manual does not state this for pages in general.
describe('CursorController cursor on and off (characterization)', () => {
    it('comes back on the field it was on when it was turned off', () => {
        const all = [new FakeField('a'), new FakeField('b'), new FakeField('c')];
        const cc = new CursorController(children({a: all[0], b: all[1], c: all[2]}));
        cc.setCursorActive(true);
        cc.outerRight();
        cc.outerRight();

        cc.toggleCursor();
        expect(focused(cc, all)).toBe('-');
        cc.toggleCursor();

        expect(focused(cc, all)).toBe('c');
    });
});

// 3-53: the date and time cannot be set while satellites provide them, so on SET 2 they turn read-only at the first fix.
// A cursor turned on afterwards must land on a field that is still there; it throws today (Math.min against
// fields.length instead of fields.length - 1, CursorController.ts:123). The passing sibling is the cursor memory test
// above (the same flow without a field turning read-only); the render pins on SET 2 are in Set2Page.test.ts.
describe('CursorController when fields turn read-only (3-53, #217)', () => {
    it.fails('comes back on the last field when the field it was on has turned read-only (#217)', () => {
        const all = [new FakeField('date'), new FakeField('time'), new FakeField('zone')];
        const cc = new CursorController(children({date: all[0], time: all[1], zone: all[2]}));
        cc.setCursorActive(true);
        cc.outerRight();
        cc.setCursorActive(false);
        all[0].isReadonly = true;
        all[1].isReadonly = true;

        cc.setCursorActive(true);

        expect(focused(cc, all)).toBe('zone');
    });

    // The same, with the cursor on: the focused field turns read-only under it. Every later call on the focused field
    // throws today
    it.fails('moves on to a field that is still there when the focused field turns read-only (#217)', () => {
        const all = [new FakeField('date'), new FakeField('time'), new FakeField('zone')];
        const cc = new CursorController(children({date: all[0], time: all[1], zone: all[2]}));
        cc.setCursorActive(true);
        cc.outerRight();
        all[0].isReadonly = true;
        all[1].isReadonly = true;

        expect(cc.isEnterAccepted()).toBe(true);
        expect(cc.innerRight()).toBe(true);
        expect(all[2].events).toEqual(['innerRight']);
    });
});

// Lists (OTH 3, the FPL pages, APT 7 and 8) hand the controller a new set of children with refreshChildren, and set the
// field the cursor comes up on with setDefaultCursorField. Characterization: the manual describes the pages, not this.
describe('CursorController lists (characterization)', () => {
    it('keeps the cursor on the last field when the list shrinks under it', () => {
        const all = [new FakeField('a'), new FakeField('b'), new FakeField('c')];
        const cc = new CursorController(children({a: all[0], b: all[1], c: all[2]}));
        cc.setCursorActive(true);
        cc.outerRight();
        cc.outerRight(); // c
        all[2].setFocused(false); // the row is gone with its list item

        cc.refreshChildren(children({a: all[0], b: all[1]}));

        expect(focused(cc, all)).toBe('b');
    });

    it('turns the cursor off when the list loses its last field', () => {
        const a = new FakeField('a');
        const changes: boolean[] = [];
        const cc = new CursorController(children({a}), active => changes.push(active));
        cc.setCursorActive(true);

        cc.refreshChildren(children({text: new Box()}));

        expect(cc.cursorActive).toBe(false);
        expect(changes).toEqual([true, false]);
    });

    it('keeps the field under the cursor when a default field is set while the cursor is on, and uses it next time', () => {
        const all = [new FakeField('a'), new FakeField('b'), new FakeField('c')];
        const cc = new CursorController(children({a: all[0], b: all[1], c: all[2]}));
        cc.setCursorActive(true);

        cc.setDefaultCursorField(2);
        expect(focused(cc, all)).toBe('a');
        cc.outerRight();
        expect(focused(cc, all)).toBe('b');

        cc.setCursorActive(false);
        cc.setDefaultCursorField(2);
        cc.setCursorActive(true);
        expect(focused(cc, all)).toBe('c');
    });

    it('hands CLR to the focused field only when the field accepts it', () => {
        const a = new FakeField('a');
        const cleared: string[] = [];
        a.clear = () => {
            cleared.push('a');
            return true;
        };
        const cc = new CursorController(children({a}));
        cc.setCursorActive(true);

        expect(cc.clear()).toBe(false);
        a.isClearAccepted = () => true;
        expect(cc.clear()).toBe(true);
        expect(cleared).toEqual(['a']);
    });
});

// ENT always moves the cursor to the next field (f347a2c; https://www.youtube.com/shorts/9We5fcd2-VE, cited in the
// code), unless the field keeps the focus. The render test of f347a2c holds the case of a field that does not handle
// ENT.
describe('CursorController ENT (characterization, f347a2c)', () => {
    it.each([
        ['did not handle it', 'b', EnterResult.Not_Handled],
        ['handled it and is done', 'b', EnterResult.Handled_Move_Focus],
        ['handled it and keeps the focus', 'a', EnterResult.Handled_Keep_Focus],
    ])('after ENT on field a that %s, the cursor is on field %s', async (_what, expected, result) => {
        const all = [new FakeField('a'), new FakeField('b'), new FakeField('c')];
        const cc = new CursorController(children({a: all[0], b: all[1], c: all[2]}));
        cc.setCursorActive(true);
        all[0].enterResult = result;

        expect(await cc.enter()).toBe(result);

        expect(all[0].events).toEqual(['enter']);
        expect(focused(cc, all)).toBe(expected);
    });

    // A field that keeps the focus but lost it while handling ENT (the delete of OTH 3, where the next item moves into
    // the row) gets the focus back
    it('focuses the field at the cursor again when ENT keeps the focus but the field lost it', async () => {
        const all = [new FakeField('a'), new FakeField('b')];
        const cc = new CursorController(children({a: all[0], b: all[1]}));
        cc.setCursorActive(true);
        all[0].enterResult = EnterResult.Handled_Keep_Focus;
        all[0].enter = () => {
            all[0].isFocused = false;
            return Promise.resolve(EnterResult.Handled_Keep_Focus);
        };

        await cc.enter();

        expect(focused(cc, all)).toBe('a');
    });

    it('does nothing with ENT while the cursor is off', async () => {
        const a = new FakeField('a');
        const cc = new CursorController(children({a}));

        expect(await cc.enter()).toBe(EnterResult.Not_Handled);
        expect(a.events).toEqual([]);
    });
});
