import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../harness/boot';
import {standardRoute} from '../../harness/fixtures';
import {airport, vor} from '../../harness/navdata/builders';
import {Screen} from '../../harness/render/screen';
import {AIRDATA, fuelComputer, panelXml} from '../../harness/panelXml';
import {activeIdent} from '../../harness/readers';
import {savedFlightplan} from '../../harness/storage';
import {LEFT_PAGE_TREE, RIGHT_PAGE_TREE} from '../../../kln90b/pages/PageTreeController';

const left = () => Screen.read().status().left;
const right = () => Screen.read().status().right;

/** The page names the inner knob steps through on one side, from the first page of the group until the group wraps around */
async function walk(unit: HeadlessUnit, side: 'L' | 'R', first: string): Promise<string[]> {
    await unit.panel.selectPage(side, first);
    const read = () => Screen.read().status()[side === 'L' ? 'left' : 'right'];
    const names = [read()];
    for (let i = 0; i < 40; i++) {
        await unit.panel.inner(side, 1);
        const n = read();
        if (n === names[0]) return names;
        if (n !== names[names.length - 1]) names.push(n);
    }
    throw new Error(`walk: the inner knob did not come back to ${names[0]}: ${names.join(', ')}`);
}

/** OTH 1 to OTH n as the status line shows them: the two-digit page is OTH10, without the blank */
const oth = (n: number) => Array.from({length: n}, (_, i) => i + 1 < 10 ? `OTH ${i + 1}` : `OTH${i + 1}`);

// The OTH group has the air data pages (OTH 9 and 10 of the full group, named after the pages that remain: 5 and 6
// without a fuel computer) only for a unit with an air data input, and the fuel computer pages (OTH 5 to 8) only for a
// unit with a fuel computer. 5-42 describes the air data pages, 5-39 the fuel computer pages. PageTreeController prunes
// the module-level tree in place, and a power cycle builds the controller again over the pruned tree (#90).
describe('OTH pages of a unit with and without air data and fuel computer (#90)', () => {
    it('air data only: OTH 1 to OTH 6 before any power cycle (5-42)', async () => {
        const unit = await bootUnit({panelXml: panelXml(AIRDATA)});

        expect(await walk(unit, 'L', 'OTH 1')).toEqual(oth(6));
    });

    it('neither: OTH 1 to OTH 4 before any power cycle (5-42, 5-39)', async () => {
        const unit = await bootUnit({panelXml: panelXml()});

        expect(await walk(unit, 'L', 'OTH 1')).toEqual(oth(4));
    });

    it('fuel computer only: OTH 1 to OTH 8 before any power cycle (5-39)', async () => {
        const unit = await bootUnit({panelXml: panelXml(fuelComputer())});

        expect(await walk(unit, 'L', 'OTH 1')).toEqual(oth(8));
    });

    it('neither: OTH 1 to OTH 4 after a power cycle (5-42, 5-39)', async () => {
        const unit = await bootUnit({panelXml: panelXml()});
        await unit.panel.powerCycle();
        await unit.panel.approveSelfTest();

        expect(await walk(unit, 'L', 'OTH 1')).toEqual(oth(4));
    });

    it('fuel computer only: OTH 1 to OTH 8 after a power cycle (5-39)', async () => {
        const unit = await bootUnit({panelXml: panelXml(fuelComputer())});
        await unit.panel.powerCycle();
        await unit.panel.approveSelfTest();

        expect(await walk(unit, 'L', 'OTH 1')).toEqual(oth(8));
    });

    it('air data and fuel computer: OTH 1 to OTH 10 after a power cycle (5-42, 5-39)', async () => {
        const unit = await bootUnit({panelXml: panelXml({...AIRDATA, ...fuelComputer()})});
        await unit.panel.powerCycle();
        await unit.panel.approveSelfTest();

        expect(await walk(unit, 'L', 'OTH 1')).toEqual(oth(10));
    });

    // 5-42: the air data pages stay. Today the second controller prunes the already pruned tree: splice(4, 4) takes the air data pages away instead of
    // pages that are not there
    it.fails('air data only: still OTH 1 to OTH 6 after a power cycle (#90)', async () => {
        const unit = await bootUnit({panelXml: panelXml(AIRDATA)});
        await unit.panel.powerCycle();
        await unit.panel.approveSelfTest();

        expect(await walk(unit, 'L', 'OTH 1')).toEqual(oth(6));
    });
});


// 3-12: when the outer knob lands on a page type, the unit shows the page of that type the pilot looked at most recently
// (the manual's example is a CAL page); the right side works the same way (3-13)
describe('page memory of the page groups (3-12, 3-13)', () => {
    it('the left outer knob comes back to the CAL page last viewed', async () => {
        const unit = await bootUnit();
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 4);
        expect(left()).toBe('CAL 5'); // Precondition: the inner knob moves from CAL 1

        await unit.panel.outer('L', 1);
        expect(left().slice(0, 3)).toBe('STA');
        await unit.panel.outer('L', -1);

        expect(left()).toBe('CAL 5');
    });

    it('the right outer knob comes back to the D/T page last viewed', async () => {
        const unit = await bootUnit();
        await unit.panel.outer('R', 4); // SUP, CTR, REF, ACT, D/T
        await unit.panel.inner('R', 2);
        expect(right()).toBe('D/T 3');

        await unit.panel.outer('R', 1);
        expect(right()).toBe('NAV 1');
        await unit.panel.outer('R', -1);

        expect(right()).toBe('D/T 3');
    });

    // 3-28: the approval of a Direct To shows NAV 1 on the right. 3-12: the NAV group then remembers NAV 1, not the NAV page
    // the right knobs showed before
    it('continues from the NAV 1 page that a Direct To put on the right', async () => {
        const abc = vor('ABC', 47.2, 8.0);
        const unit = await bootUnit({facilities: [abc], position: {lat: 47.0, lon: 8.0}});
        await unit.panel.selectPage('R', 'NAV 3');
        await unit.panel.selectPage('R', 'APT 1');
        await unit.panel.directTo('ABC');
        expect(activeIdent(unit)).toBe('ABC'); // Preconditions
        expect(right()).toBe('NAV 1');

        await unit.panel.inner('R', 1);
        expect(right()).toBe('NAV 2');

        await unit.panel.outer('R', 1);
        await unit.panel.outer('R', -1);
        expect(right()).toBe('NAV 2');
    });
});

// The unit starts with NAV 2 on the left. The code records that start page in the NAV group, so the outer knob comes
// back to it and the inner knob moves on from it, as for any page viewed
describe('page memory of the page the unit starts on (characterization)', () => {
    it('counts the NAV 2 page of the start as the NAV page last viewed', async () => {
        const unit = await bootUnit();
        expect(left()).toBe('NAV 2');

        await unit.panel.outer('L', 1);
        await unit.panel.outer('L', -1);
        expect(left()).toBe('NAV 2');

        await unit.panel.inner('L', 1);
        expect(left()).toBe('NAV 3');
    });
});

// The ACT group is the one group that does not remember its page (checked in the KLN 89 trainer, 2026-10-07: with the
// active waypoint an airport, ACT 3 and ACT 5 each came back as ACT 1 after another page type; APT and SET came back to
// the page last viewed). The manual does not say it; 4-10 only says the page of the active waypoint is shown first.
// ActPagePage builds its own page tree on every visit, which is what the unit does.
describe('page memory of the ACT group (checked in the KLN 89 trainer, 2026-10-07)', () => {
    async function bootWithActiveAirport(): Promise<HeadlessUnit> {
        const {kaaa, kbbb} = standardRoute();
        const unit = await bootUnit({
            facilities: [kaaa, kbbb], position: {lat: 47.1, lon: 8.0}, storage: savedFlightplan(0, [kaaa, kbbb]),
        });
        await settle(unit);
        return unit;
    }

    it('comes back to ACT 1 after the pages of the active airport were turned to ACT 3', async () => {
        const unit = await bootWithActiveAirport();
        await unit.panel.outer('R', 3); // CTR, REF, ACT
        await unit.panel.inner('R', 2);
        expect(right()).toBe('ACT+3'); // Precondition: the ACT pages turn with the inner knob

        await unit.panel.outer('R', 1);
        expect(right()).toBe('D/T 1');
        await unit.panel.outer('R', -1);

        expect(right()).toBe('ACT 1');
    });

    // The sibling that makes the test above about the ACT group: the neighboring D/T group does remember its page
    it('comes back to the D/T page last viewed, as the other groups do', async () => {
        const unit = await bootWithActiveAirport();
        await unit.panel.outer('R', 4); // CTR, REF, ACT, D/T
        await unit.panel.inner('R', 2);
        expect(right()).toBe('D/T 3');

        await unit.panel.outer('R', -1); // ACT
        await unit.panel.outer('R', 1);

        expect(right()).toBe('D/T 3');
    });
});

// 3-9, 3-10: a "+" in the page name (APT+3) means there are two or more pages with that number. 3-44: the primary APT 3
// page, the runway list, follows the runway diagram, so the inner knob turns from the diagram to the list before it moves
// on to APT 4.
const kaaa = airport('KAAA', 47.1, 8.0);
/** The first row of the right page: blank on the runway diagram, the ident on the runway list */
const firstRow = () => Screen.read().rows('R')[0];
const DIAGRAM = '           ';
const LIST = ' KAAA      ';

describe('pages with several pages of the same number (3-9, 3-10, 3-44)', () => {

    it('turns the inner knob clockwise through the runway diagram and the runway list of APT 3 to APT 4', async () => {
        const unit = await bootUnit({facilities: [kaaa]});
        await unit.panel.selectPage('R', 'APT 2');

        await unit.panel.inner('R', 1);
        expect([right(), firstRow()]).toEqual(['APT+3', DIAGRAM]);
        await unit.panel.inner('R', 1);
        expect([right(), firstRow()]).toEqual(['APT+3', LIST]);
        await unit.panel.inner('R', 1);
        expect(right()).toBe('APT 4');
    });
});

// The way back from APT 4 enters APT 3 on its last page (the runway list), then the diagram. The manual does not say it.
describe('pages with several pages of the same number, backward (characterization)', () => {
    it('turns the inner knob counterclockwise from APT 4 to the last APT 3 page, then the first (characterization)', async () => {
        const unit = await bootUnit({facilities: [kaaa]});
        await unit.panel.selectPage('R', 'APT 4');

        await unit.panel.inner('R', -1);
        expect([right(), firstRow()]).toEqual(['APT+3', LIST]);
        await unit.panel.inner('R', -1);
        expect([right(), firstRow()]).toEqual(['APT+3', DIAGRAM]);
        await unit.panel.inner('R', -1);
        expect(right()).toBe('APT 2');
    });
});

// CLAUDE.md: page names are exactly five characters; the status line shows them in its five cells. The prefixes and
// numbers are the page types of 3-12 and 3-13; a type with a single page has no number (3-9). The names the manual does
// not give (SET 10, the position of SET 0, ACT) are in the characterization describe below.
const numbered = (type: string, from: number, to: number) =>
    Array.from({length: to - from + 1}, (_, i) => `${type}${String(from + i).padStart(2, ' ')}`);

/** The name of a page built from each slot, by group */
async function names(tree: unknown[][]): Promise<string[][]> {
    const unit = await bootUnit({panelXml: panelXml({...AIRDATA, ...fuelComputer()})});
    return tree.map(group => group.map(cls => (new (cls as any)(unit.props)).name as string));
}

describe('page names of the tree slots (3-9, 3-12, 3-13)', () => {
    // The SET group has two slots more than the manual's SET 1 to SET 9 (see the characterization below)
    it('names the left pages TRI 0 to OTH10', async () => {
        const left = await names(LEFT_PAGE_TREE);
        expect([...left.slice(0, 6), left[6].slice(0, 9), left[7]]).toEqual([
            numbered('TRI', 0, 6), numbered('MOD', 1, 2), numbered('FPL', 0, 25), numbered('NAV', 1, 5),
            numbered('CAL', 1, 7), numbered('STA', 1, 5), numbered('SET', 1, 9), numbered('OTH', 1, 10),
        ]);
    });

    // The REF group (index 1) and the ACT group (index 2) are left out here: REF is pinned below, ACT is a characterization
    it('names the right pages CTR 1 to SUP', async () => {
        const right = await names(RIGHT_PAGE_TREE);
        expect([right[0], ...right.slice(3)]).toEqual([
            numbered('CTR', 1, 2), numbered('D/T', 1, 4), numbered('NAV', 1, 5), numbered('APT', 1, 8),
            ['VOR  '], ['NDB  '], ['INT  '], ['SUP  '],
        ]);
    });

    // RefPage.name is "REF " today. The status line pads it (StatusLine.tsx), so the screen shows the five cells anyway
    it.fails('names the REF page with five characters (#216)', async () => {
        expect(await names([[RIGHT_PAGE_TREE[1][0]]])).toEqual([['REF  ']]);
    });
});

// The manual lists SET 0 to SET 9 and gives no name for the ACT slot, whose pages vary with the active waypoint. The code
// has SET 10 (the fictitious settings, Set10Page.tsx), puts SET 0 after it, and names the ACT slot "ACT  "
describe('page names of the tree slots that the manual does not give (characterization)', () => {
    it('names the last two SET slots SET10 and SET 0', async () => {
        expect((await names(LEFT_PAGE_TREE))[6].slice(9)).toEqual(['SET10', 'SET 0']);
    });

    it('names the ACT slot ACT with two blanks', async () => {
        expect((await names(RIGHT_PAGE_TREE))[2]).toEqual(['ACT  ']);
    });
});
