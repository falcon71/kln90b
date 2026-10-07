import {describe, expect, it} from 'vitest';
// A static import: the trees import every page of the instrument, which takes seconds the first time (see KLN90B.test.ts)
import {LEFT_PAGE_TREE, RIGHT_PAGE_TREE} from '../../../kln90b/pages/PageTreeController';

type Slot = abstract new (...args: any[]) => unknown;

/** The slots of a tree in order, as [group index, page index, class] */
function slots(tree: readonly (readonly unknown[])[]): [number, number, Slot][] {
    return tree.flatMap((group, g) => group.map((cls, p) => [g, p, cls as Slot] as [number, number, Slot]));
}

// PageTreeController.getPageIndices finds the slot of a page with instanceof and takes the first match. A class that
// fills two slots, or a slot class that extends the class of another slot of the same tree, makes the knobs land on the
// wrong slot (CLAUDE.md, "A tree slot is identified by instanceof, so every slot needs a distinct class"). The test runs
// in the unit stage, where nothing boots, so the trees are as the module declares them (a boot prunes the OTH group).
describe('page tree slots (structure)', () => {
    it.each([['left', LEFT_PAGE_TREE], ['right', RIGHT_PAGE_TREE]] as [string, unknown[][]][])(
        'every slot of the %s tree has its own class, and no slot class extends another', (_side, tree) => {
            const all = slots(tree);
            const collisions: string[] = [];
            for (const [ga, pa, a] of all) {
                for (const [gb, pb, b] of all) {
                    if (ga === gb && pa === pb) continue;
                    if (a === b || a.prototype instanceof b) {
                        collisions.push(`${a.name} at [${ga}][${pa}] is also matched by ${b.name} at [${gb}][${pb}]`);
                    }
                }
            }

            expect(collisions).toEqual([]);
        });

    // 3-12: the left page types and their page numbers. SET has one fictitious page more than the manual's 0 to 9 (SET 10,
    // the settings the real unit does not have, Set10Page.tsx), and OTH has its full 10 pages here: 1 to 4 plus the
    // fuel computer and air data pages that a boot prunes without those interfaces (the footnote of the table)
    it('has the left page groups of the manual with their number of pages (3-12)', () => {
        expect(LEFT_PAGE_TREE.map(group => group.length)).toEqual([
            7, // TRI 0-6
            2, // MOD 1-2
            26, // FPL 0-25
            5, // NAV 1-5
            7, // CAL 1-7
            5, // STA 1-5
            11, // SET 0-9, and SET 10
            10, // OTH 1-4, up to 10
        ]);
    });

    // 3-13: the right page types and their page numbers. ACT is one slot: its pages vary with the active waypoint, and the
    // ACT page keeps its own tree of the waypoint's pages
    it('has the right page groups of the manual with their number of pages (3-13)', () => {
        expect(RIGHT_PAGE_TREE.map(group => group.length)).toEqual([
            2, // CTR 1-2
            1, // REF
            1, // ACT
            4, // D/T 1-4
            5, // NAV 1-5
            8, // APT 1-8
            1, // VOR
            1, // NDB
            1, // INT
            1, // SUP
        ]);
    });
});
