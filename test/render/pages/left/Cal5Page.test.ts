import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

// Sources of the expected values: F = C * 9 / 5 + 32, and 1 kt = 1852 m / h = 1852 / 1609.344 mph = 1.150779 mph,
// computed by hand. The cursor visits the sign and two digits of C (row 1) and F (row 2), then three digits of kt
// (row 4) and of mph (row 5).

/** Moves the cursor to the cell at row, col (from the first field, turning right) and sets the digit there */
async function setCell(unit: HeadlessUnit, row: number, col: number, value: string): Promise<void> {
    for (let i = 0; i < 12; i++) {
        const f = unit.panel.focused('L');
        if (f.row === row && f.col === col) {
            const charset = col === 3 && row <= 2 ? ['-', '0'] : ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
            await unit.panel.inner('L', charset.indexOf(value) - charset.indexOf(f.text));
            return;
        }
        await unit.panel.outer('L', 1);
    }
    throw new Error(`no field at ${row},${col}\n${Screen.read().dump()}`);
}

async function cal5(): Promise<HeadlessUnit> {
    const unit = await bootUnit();
    await unit.panel.selectPage('L', 'CAL 5');
    await unit.panel.cursor('L');
    return unit;
}

describe('CAL 5 page (characterization)', () => {
    it('shows the conversions of a fresh unit (characterization)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'CAL 5');
        expect(unit.errors).toEqual([]);
        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          "TEMP/SPEED 
             000°C   
             032°F   
                     
             000kt   
             000mph  "
        `);
    });
});

describe('CAL 5 page (5-13)', () => {
    // 5-13, figure 5-43: 25 C entered gives 77 F
    it('converts 25 C to 077°F (5-13)', async () => {
        const unit = await cal5();
        await setCell(unit, 1, 4, '2');
        await setCell(unit, 1, 5, '5');
        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['   025°C   ', '   077°F   ']);
    });

    // 5-13: the other way, 50 F entered gives 10 C
    it('converts 50 F to 010°C (5-13)', async () => {
        const unit = await cal5();
        await setCell(unit, 2, 4, '5');
        await setCell(unit, 2, 5, '0');
        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['   010°C   ', '   050°F   ']);
    });

    // 5-10 and 5-13: a temperature below zero has - as its first digit; -40 C is -40 F
    it('converts -40 C to -40°F (5-10, 5-13)', async () => {
        const unit = await cal5();
        await setCell(unit, 1, 4, '4'); // 040
        await setCell(unit, 1, 3, '-'); // -40
        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['   -40°C   ', '   -40°F   ']);
    });

    // 5-10, step 5: the sibling of the pin below. The sign first, then the digits, as a pilot types -40 into 000
    it('shows -40°C when the sign is set before the digits (5-10)', async () => {
        const unit = await cal5();
        await setCell(unit, 1, 3, '-');
        await setCell(unit, 1, 4, '4');
        expect(Screen.read().rows('L')[1]).toBe('   -40°C   ');
    });

    // 5-10 and 5-13: the sign digit makes the temperature negative. Set on 000, the minus is lost when the next digit is
    // turned (TempFieldset formats -0 as +00), so the page converts +40 C instead of -40 C
    it.fails('converts -40 C entered sign first to -40°F (5-10, 5-13, #NEW-6-3)', async () => {
        const unit = await cal5();
        await setCell(unit, 1, 3, '-');
        await setCell(unit, 1, 4, '4');
        expect(Screen.read().rows('L')[2]).toBe('   -40°F   ');
    });

    // 5-13, figure 5-44: 145 kt entered gives 145 * 1.150779 = 166.9 mph, shown as 167
    it('converts 145 kt to 167mph (5-13)', async () => {
        const unit = await cal5();
        await setCell(unit, 4, 3, '1');
        await setCell(unit, 4, 4, '4');
        await setCell(unit, 4, 5, '5');
        expect(Screen.read().rows('L').slice(4)).toEqual(['   145kt   ', '   167mph  ']);
    });

    // 5-13, figure 5-42: 115 mph entered gives 115 / 1.150779 = 99.93 kt, shown as 100
    it('converts 115 mph to 100kt (5-13)', async () => {
        const unit = await cal5();
        await setCell(unit, 5, 3, '1');
        await setCell(unit, 5, 4, '1');
        await setCell(unit, 5, 5, '5');
        expect(Screen.read().rows('L').slice(4)).toEqual(['   100kt   ', '   115mph  ']);
    });
});
