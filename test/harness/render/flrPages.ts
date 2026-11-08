import {vi} from 'vitest';
import {HeadlessUnit} from '../boot';
import {Screen} from './screen';

// #458: the way to the FLR pages and the left page's rows, shared by the tests of FLR 1, FLR 2 and FLR 3

/** SET 10, the FAILURES button, ENT: FLR 1 opens */
export async function openFlr1(unit: HeadlessUnit): Promise<void> {
    await unit.panel.selectPage('L', 'SET 10');
    await unit.panel.cursor('L');
    await unit.panel.cursorTo('L', 'FAILURES?');
    await unit.panel.ent();
    await vi.advanceTimersByTimeAsync(1000);
}

async function openFlrPage(unit: HeadlessUnit, innerSteps: 1 | 2): Promise<void> {
    await openFlr1(unit);
    for (let i = 0; i < innerSteps; i++) {
        await unit.panel.inner('L', 1);
    }
    await vi.advanceTimersByTimeAsync(1000);
}

export const openFlr2 = (unit: HeadlessUnit) => openFlrPage(unit, 1);
export const openFlr3 = (unit: HeadlessUnit) => openFlrPage(unit, 2);

/** The rows of the left page without their trailing blanks */
export const rows = () => Screen.read().rows('L').map(r => r.trimEnd());
