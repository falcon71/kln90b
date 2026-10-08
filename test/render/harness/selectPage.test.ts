import {describe, expect, it, vi} from 'vitest';
import {bootUnit, settle} from '../../harness/boot';
import {PAGE_CYCLES, PAGE_GROUPS, Side} from '../../harness/flight/FrontPanel';
import {Screen} from '../../harness/render/screen';
import {savedFlightplan} from '../../harness/storage';
import {standardRoute} from '../../harness/fixtures';

// STA 3 shows the version, which the build injects into Version.ts; the source carries a placeholder 18 cells wide
vi.mock('../../../kln90b/Version', () => ({VERSION: '2.2.0'}));

/** Page names as the status line shows them: "FPL 9", "FPL10" */
const range = (prefix: string, from: number, to: number): string[] =>
    Array.from({length: to - from + 1}, (_, i) => `${prefix}${from + i < 10 ? ' ' : ''}${from + i}`);

/** Every page the unit has in the tree of a side. OTH 5 to OTH 10 are pruned unless fuel computer and air data are interfaced. */
const LEFT_PAGES = [
    ...range('TRI', 0, 6), ...range('MOD', 1, 2), ...range('FPL', 0, 25), ...range('NAV', 1, 5), ...range('CAL', 1, 7),
    ...range('STA', 1, 5), ...range('SET', 1, 10), 'SET 0', ...range('OTH', 1, 4),
];
const RIGHT_PAGES = [
    ...range('CTR', 1, 2), 'REF  ', 'ACT  ', ...range('D/T', 1, 4), ...range('NAV', 1, 5), ...range('APT', 1, 8), 'VOR  ', 'NDB  ',
    'INT  ', 'SUP  ',
];

/** The status-line name of a side, in the form selectPage takes ("APT+3" is APT 3 with several sub-pages) */
const shown = (side: Side): string => {
    const name = Screen.read().status()[side === 'L' ? 'left' : 'right'];
    return name[3] === '+' ? `${name.slice(0, 3)} ${name.slice(4)}` : name;
};

describe('FrontPanel.selectPage (harness)', () => {
    it('turns the outer knob the shorter way: from SUP, INT is one click back', async () => {
        const unit = await bootUnit();
        const outer = vi.spyOn(unit.panel, 'outer');

        await unit.panel.selectPage('R', 'INT  ');

        expect(outer.mock.calls).toEqual([['R', -1]]);
        expect(Screen.read().status().right).toBe('INT');
    });

    it('wraps around the end of the groups: from SUP, CTR is one click forward', async () => {
        const unit = await bootUnit();
        const outer = vi.spyOn(unit.panel, 'outer');

        await unit.panel.selectPage('R', 'CTR 1');

        expect(outer.mock.calls).toEqual([['R', 1]]);
        expect(Screen.read().status().right).toBe('CTR 1');
    });

    it('turns the inner knob toward the page number, and SET 0 comes after SET 10', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET10');
        const inner = vi.spyOn(unit.panel, 'inner');

        await unit.panel.selectPage('L', 'SET 0');
        expect(inner.mock.calls).toEqual([['L', 1]]);
        expect(Screen.read().status().left).toBe('SET 0');

        inner.mockClear();
        await unit.panel.selectPage('L', 'SET 9');
        expect(inner.mock.calls).toEqual([['L', -1], ['L', -1]]);
        expect(Screen.read().status().left).toBe('SET 9');
    });

    // The inner knob wraps (PageTreeController.moveSubpage), and SET 0 is the last page of the SET group
    it('turns the inner knob the shorter way around the group: SET 0 is one click back from SET 1', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 1');
        const inner = vi.spyOn(unit.panel, 'inner');

        await unit.panel.selectPage('L', 'SET 0');
        expect(inner.mock.calls).toEqual([['L', -1]]);
        expect(Screen.read().status().left).toBe('SET 0');

        inner.mockClear();
        await unit.panel.selectPage('L', 'SET 1');
        expect(inner.mock.calls).toEqual([['L', 1]]);

        inner.mockClear();
        await unit.panel.selectPage('L', 'SET10');
        expect(inner.mock.calls).toEqual([['L', -1], ['L', -1]]);
        expect(Screen.read().status().left).toBe('SET10');
    });

    // MOD has two pages, so the way is one click either direction: a tie, which goes forward
    it('turns the inner knob forward on a tie: MOD 2 is one click forward from MOD 1', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'MOD 1');
        const inner = vi.spyOn(unit.panel, 'inner');

        await unit.panel.selectPage('L', 'MOD 2');

        expect(inner.mock.calls).toEqual([['L', 1]]);
        expect(Screen.read().status().left).toBe('MOD 2');
    });

    it('wraps the inner knob in a group with a first page 0 too: FPL 25 is one click back from FPL 0', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'FPL 0');
        const inner = vi.spyOn(unit.panel, 'inner');

        await unit.panel.selectPage('L', 'FPL25');

        expect(inner.mock.calls).toEqual([['L', -1]]);
        expect(Screen.read().status().left).toBe('FPL25');
    });

    // The harness keeps the page numbers of each group itself, because it cannot read them from the unit. Walk the real
    // trees with the inner knob and compare. A page with sub-pages shows the same name for several clicks.
    describe('PAGE_CYCLES', () => {
        const number = (name: string): number => Number(/^.{3}[ +]?(\d+)$/.exec(name)![1]);

        it.each(Object.keys(PAGE_CYCLES).flatMap(group => (['L', 'R'] as Side[])
            .filter(side => PAGE_GROUPS[side].includes(group)).map(side => [side, group])) as [Side, string][])(
            'is the order of the inner knob on the %s side in the %s group', async (side, group) => {
                const unit = await bootUnit();
                const cycle = PAGE_CYCLES[group];
                await unit.panel.selectPage(side, `${group} ${cycle[0]}`);
                const seen = [cycle[0]];

                for (let clicks = 0; clicks < 100; clicks++) {
                    await unit.panel.inner(side, 1);
                    const n = number(Screen.read().status()[side === 'L' ? 'left' : 'right']);
                    if (n === cycle[0] && seen.length > 1) {
                        seen.push(n); // the wrap back to the first page
                        break;
                    }
                    if (n !== seen[seen.length - 1]) seen.push(n);
                }

                expect(seen).toEqual([...cycle, cycle[0]]);
            });
    });

    // The booted pages are NAV 2 on the left and SUP on the right. Each page is reached from the one before it, forward
    // through the list and then back, so that both directions of both knobs are used
    it.each([['L', LEFT_PAGES], ['R', RIGHT_PAGES]] as [Side, string[]][])('reaches every page of the %s tree', async (side, pages) => {
        const unit = await bootUnit();

        for (const name of [...pages, ...pages.slice().reverse()]) {
            await unit.panel.selectPage(side, name);
            expect(shown(side)).toBe(name.trim());
        }
        expect(unit.errors).toEqual([]);
    });

    // The ACT page of an active airport has pages ACT 1 to ACT 8, so the bare group name never matches the status line
    it('ends on whichever page of the group shows when the name is a bare group: ACT of an active airport', async () => {
        const {kaaa, kbbb} = standardRoute();
        const unit = await bootUnit({facilities: [kaaa, kbbb], position: {lat: 47.0, lon: 8.0}, storage: savedFlightplan(0, [kaaa, kbbb])});
        await settle(unit);
        const inner = vi.spyOn(unit.panel, 'inner');

        await unit.panel.selectPage('R', 'ACT');

        expect(Screen.read().status().right).toMatch(/^ACT[ +]\d$/);
        expect(inner.mock.calls).toEqual([]);
    });

    it('still ends on the bare page of a group that has none when nothing is active: ACT without an active waypoint', async () => {
        const unit = await bootUnit();

        await unit.panel.selectPage('R', 'ACT');

        expect(Screen.read().status().right).toBe('ACT');
    });

    it('takes a two-digit page with a space too', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'FPL 12');
        expect(Screen.read().status().left).toBe('FPL12');
    });

    it('throws with the screen when the page is not in the group', async () => {
        const unit = await bootUnit();
        await expect(unit.panel.selectPage('L', 'MOD 7')).rejects.toThrow(/no page MOD 7/);
        await expect(unit.panel.selectPage('L', 'XYZ 1')).rejects.toThrow(/no page group XYZ/);
    });

    it('throws when the cursor is on, because the status line shows CRSR instead of the page name', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await expect(unit.panel.selectPage('L', 'NAV 1')).rejects.toThrow(/cursor is on/);
    });

    // The harness keeps the group order itself, because it cannot read it from the unit. The order of the real trees
    // is what the outer knob walks, so walk it and compare.
    describe('PAGE_GROUPS', () => {
        it.each([['L'], ['R']] as [Side][])('is the order of the outer knob on the %s side', async side => {
            const unit = await bootUnit();
            const groups = PAGE_GROUPS[side];
            const seen: string[] = [];

            for (let i = 0; i <= groups.length; i++) {
                seen.push(Screen.read().status()[side === 'L' ? 'left' : 'right'].slice(0, 3));
                await unit.panel.outer(side, 1);
            }

            // The walk starts at the group of the booted page (NAV on the left, SUP on the right) and comes round to it
            const start = groups.indexOf(seen[0]);
            expect(start).toBeGreaterThanOrEqual(0);
            expect(seen).toEqual([...groups.slice(start), ...groups.slice(0, start), seen[0]]);
        });
    });
});
