import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

// The zone list of 3-5 in the unit's order (Time.test.ts holds it): UTC is 0, EST 5, CST 7, PST 11.
const CST = 7;

/** Boots at 17:56 UTC on the default day with CST as the system zone (SET 2) and shows CAL 6 */
async function cal6At1756Cst(): Promise<HeadlessUnit> {
    const unit = await bootUnit({start: new Date('2026-06-01T17:56:00Z'), storage: {timezone: CST}});
    await unit.panel.selectPage('L', 'CAL 6');
    return unit;
}

describe('CAL 6 page (characterization)', () => {
    it('shows the system time of a fresh unit in UTC twice (characterization)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'CAL 6');
        expect(unit.errors).toEqual([]);
        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          " TIME CONV 
           12:00 UTC 
          CORD UNIV/Z
                     
           12:00 UTC 
          CORD UNIV/Z"
        `);
    });
});

describe('CAL 6 page (5-14)', () => {
    // 5-14, step 1 and figure 5-45: the first view shows the system time in the system zone on top and the same time
    // in UTC below
    it('shows 11:56 CST on top and 17:56 UTC below at its first view (5-14)', async () => {
        await cal6At1756Cst();
        expect(Screen.read().rows('L').slice(1)).toEqual([' 11:56 CST ', 'CENTRAL STD', '           ', ' 17:56 UTC ', 'CORD UNIV/Z']);
    });

    // 5-14, steps 3 to 5 and figures 5-46 to 5-48: the outer knob puts the cursor over the top zone after the three
    // digits of the time, the inner knob selects PST (9:56, UTC - 8); then the bottom zone becomes EST (12:56, UTC - 5)
    it('converts 09:56 PST to 12:56 EST with the zones selected by the knobs (5-14)', async () => {
        const unit = await cal6At1756Cst();
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 3);
        expect(unit.panel.focused('L')).toEqual({row: 1, col: 7, text: 'CST'});
        await unit.panel.inner('L', 4); // CST -> CDT -> MST -> MDT -> PST
        expect(Screen.read().rows('L').slice(1, 3)).toEqual([' 09:56 PST ', 'PACIFIC STD']);
        expect(Screen.read().rows('L').slice(4)).toEqual([' 17:56 UTC ', 'CORD UNIV/Z']);

        await unit.panel.outer('L', 4);
        expect(unit.panel.focused('L')).toEqual({row: 4, col: 7, text: 'UTC'});
        await unit.panel.inner('L', 5); // UTC -> ... -> EST
        expect(Screen.read().rows('L').slice(1)).toEqual([' 09:56 PST ', 'PACIFIC STD', '           ', ' 12:56 EST ', 'EASTERN STD']);
    });

    // 5-14, step 5: a time entered in either display changes the other to the corresponding time. 12:56 CST is
    // 18:56 UTC; 17:26 UTC is 11:26 CST
    it('changes the other time when the top or the bottom time is entered (5-14)', async () => {
        const unit = await cal6At1756Cst();
        await unit.panel.cursor('L');
        await unit.panel.inner('L', 1); // the top hour, 11 -> 12
        expect(Screen.read().rows('L')[1]).toBe(' 12:56 CST ');
        expect(Screen.read().rows('L')[4]).toBe(' 18:56 UTC ');

        await unit.panel.outer('L', 5);
        expect(unit.panel.focused('L')).toEqual({row: 4, col: 4, text: '5'}); // the bottom tens of minutes
        await unit.panel.inner('L', -3); // 18:56 -> 18:26
        await unit.panel.outer('L', -1);
        await unit.panel.inner('L', -1); // the bottom hour, 18 -> 17
        expect(Screen.read().rows('L')[4]).toBe(' 17:26 UTC ');
        expect(Screen.read().rows('L')[1]).toBe(' 11:26 CST ');
    });
});
