import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

/**
 * Line 6 of SET 2 (5-44): outside the primary coverage area (north of N 74) it takes a pilot-entered magnetic
 * variation, which the unit keeps in `memory.navPage.userMagvar`, east positive (as in KLNMagvar.test.ts). With a fix
 * the date and the time are read-only, so the cursor starts on the time zone, and line 6 is the next field.
 */
async function onSet2Magvar(): Promise<HeadlessUnit> {
    const unit = await bootUnit({position: {lat: 74.5, lon: 8.0}, magvar: 10});
    await settle(unit);
    await unit.panel.selectPage('L', 'SET 2');
    await unit.panel.cursor('L'); // the time zone
    await unit.panel.outer('L', 1); // line 6
    expect(Screen.read().rows('L')[5].slice(0, 5)).toBe('MAG V');
    return unit;
}

const line6 = () => Screen.read().rows('L')[5];

/** The characters of line 6 from `from` to `to` over n clicks of the inner knob, sorted */
async function choices(unit: HeadlessUnit, from: number, to: number, n: number): Promise<string[]> {
    const seen = new Set<string>();
    for (let i = 0; i < n; i++) {
        await unit.panel.inner('L', 1);
        seen.add(line6().slice(from, to));
    }
    return [...seen].sort();
}

describe('magnetic variation editor (5-44)', () => {
    // 5-44: outside the coverage area the variation is entered with the knobs; 9°E is a variation of +9
    it('enters 9°E as a variation of +9 (5-44)', async () => {
        const unit = await onSet2Magvar();

        await unit.panel.inner('L', 1); // the tens: the first click gives its first choice
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 10); // the first click gives 0, so the tenth is 9
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1); // E
        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        expect(unit.props.memory.navPage.userMagvar).toBe(9);
    });

    // 5-44: the variation is east or west (figure 5-134 shows W, figure 5-136 E); W is a negative variation
    it('offers E and W and enters 15°W as -15 (5-44)', async () => {
        const unit = await onSet2Magvar();
        await unit.panel.inner('L', 2); // the first click gives a blank, the second a 1
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 6); // 5
        await unit.panel.outer('L', 1);

        const seen = await choices(unit, 10, 11, 3); // the first click gives E, then W, E
        await unit.panel.inner('L', 1); // W
        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        expect(seen).toEqual(['E', 'W']);
        expect(line6().slice(7)).toBe('15°W');
        expect(unit.props.memory.navPage.userMagvar).toBe(-15);
    });
});

describe('magnetic variation editor (characterization)', () => {
    // The unit's pages disagree on the display form of a variation below 10 degrees, so the code's form is only
    // recorded: a blank in the tens place, ` 9°E`
    it('shows an entered 9°E with a blank in the tens place', async () => {
        const unit = await onSet2Magvar();
        await unit.panel.inner('L', 1);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 10); // 9
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1); // E
        expect(line6().slice(7)).toBe(' 9°E');
        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        expect(line6().slice(7)).toBe(' 9°E');
    });

    // The tens place offers a blank and 1 to 9 (no 0, the blank stands for it), the units 0 to 9; 99 is the largest
    // variation the two digits hold
    it('offers a blank and 1 to 9 in the tens place, and takes 99°E', async () => {
        const unit = await onSet2Magvar();

        const tens = await choices(unit, 7, 8, 11); // the first click gives the blank, the eleventh the blank again
        expect(tens).toEqual([' ', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
        await unit.panel.inner('L', -1); // 9
        expect(line6()[7]).toBe('9');
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 10);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1); // E
        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        expect(unit.props.memory.navPage.userMagvar).toBe(99);
    });
});
