import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

/**
 * SET 2 with the date editable. A booted unit has a GPS fix at once, even with slow acquisition;
 * coldGps resets it and starts the slow search, which gives the date and time pages their editable state (3-53).
 */
async function bootOnSet2(): Promise<HeadlessUnit> {
    const unit = await bootUnit({storage: {fastGpsAcquisition: false}, coldGps: true});
    await unit.panel.selectPage('L', 'SET 2');
    expect(unit.props.sensors.in.gps.isValid()).toBe(false);
    return unit;
}

describe('date editor on SET 2', () => {
    it('defaults an entered blank date to 1 Jan 1988 (characterization, #64)', async () => {
        const unit = await bootOnSet2();
        await unit.panel.cursor('L');
        expect(Screen.read().rows('L')[2]).toBe('  01 JUN 26');

        await unit.panel.inner('L', 1);
        expect(Screen.read().rows('L')[2]).toBe('  01 ___ __');

        await unit.panel.ent();
        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')[2]).toBe('  01 JAN 88');
        const time = unit.props.sensors.in.gps.timeZulu;
        expect([time.getYear(), time.getMonth(), time.getDate()]).toEqual([1988, 0, 1]);
    });

    it('inverts the static characters of the editor with the cursor on (10c5a3d, characterization)', async () => {
        const unit = await bootOnSet2();
        await unit.panel.cursor('L');
        expect(unit.errors).toEqual([]);
        expect(Screen.read().maskRows('L')[2]).toBe('..IIIIIIIII');
    });

    // The month is OCT in English; the field offers OKT (EditorField.tsx, MonthEditorField)
    it.fails('names the tenth month OCT (#112)', async () => {
        const unit = await bootOnSet2();
        await unit.panel.cursor('L');
        await unit.panel.inner('L', 1); // day 01
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 10); // the first click enters JAN

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')[2]).toBe('  01 OCT __');
    });
});

/**
 * CAL 7 (5-15): its date is always editable, and the entered date is kept in `memory.calPage.cal7DateZ`. The clock
 * starts at 12:00 UTC on 1 June 2026 and the system zone is UTC, so the page opens on 01 JUN 26.
 */
async function onCal7Date(): Promise<HeadlessUnit> {
    const unit = await bootUnit();
    await unit.panel.selectPage('L', 'CAL 7');
    await unit.panel.cursor('L'); // the waypoint
    await unit.panel.outer('L', 1); // the date
    expect(Screen.read().rows('L')[2]).toBe('  01 JUN 26');
    return unit;
}

/**
 * Selects a date in the open editor: the first click opens the editor with day 01, the first click on the dashed month
 * gives JAN and on a dashed year digit 0, so the day d takes d clicks, the month m (1 to 12) m clicks, a year digit
 * y + 1 clicks
 */
async function selectDate(unit: HeadlessUnit, day: number, month: number, year: [number, number]): Promise<void> {
    await unit.panel.inner('L', day);
    await unit.panel.outer('L', 1);
    await unit.panel.inner('L', month);
    await unit.panel.outer('L', 1);
    await unit.panel.inner('L', year[0] + 1);
    await unit.panel.outer('L', 1);
    await unit.panel.inner('L', year[1] + 1);
}

const dateRow = () => Screen.read().rows('L')[2];
const cal7Date = (unit: HeadlessUnit) => {
    const d = unit.props.memory.calPage.cal7DateZ!;
    return [d.getYear(), d.getMonth(), d.getDate()];
};

describe('date editor (3-53, 5-15, C-1)', () => {
    // 3-53 steps 3 to 10: the day, the month, the tens and the units of the year are selected one after the other, and
    // ENT enters the date. 5-15: CAL 7 takes any date up to 31 December 2087, so 27 is 2027.
    it('enters a date selected cell by cell (3-53, 5-15)', async () => {
        const unit = await onCal7Date();

        await selectDate(unit, 15, 3, [2, 7]);
        expect(dateRow()).toBe('  15 MAR 27');
        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        expect(dateRow()).toBe('  15 MAR 27');
        expect(cal7Date(unit)).toEqual([2027, 2, 15]);
    });

    // 5-15: the last date CAL 7 takes is 31 December 2087, so the year 87 is 2087 (and 88 is 1988, #64)
    it('takes 31 DEC 87 as the last day of 2087 (5-15)', async () => {
        const unit = await onCal7Date();

        await selectDate(unit, 31, 12, [8, 7]);
        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        expect(dateRow()).toBe('  31 DEC 87');
        expect(cal7Date(unit)).toEqual([2087, 11, 31]);
    });

    // C-1: INVALID ENT is the answer to an entry that is not valid, and the guide's example is a date of 30 FEB 92.
    // The date entered before stays.
    it('refuses 30 FEB 92 with INVALID ENT and keeps the date (C-1)', async () => {
        const unit = await onCal7Date();

        await selectDate(unit, 30, 2, [9, 2]);
        await unit.panel.ent();
        expect(Screen.read().status().mode).toBe('INVALID ENT');
        await unit.panel.cursor('L');

        expect(unit.errors).toEqual([]);
        expect(cal7Date(unit)).toEqual([2026, 5, 1]);
        expect(dateRow()).toBe('  01 JUN 26');
    });

    // C-1 by the calendar: 2028 is a leap year, so 29 FEB 28 is a valid date
    it('takes 29 FEB 28, a leap day (C-1)', async () => {
        const unit = await onCal7Date();

        await selectDate(unit, 29, 2, [2, 8]);
        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        expect(cal7Date(unit)).toEqual([2028, 1, 29]);
    });

    // C-1 by the calendar: 2027 is not a leap year, so 29 FEB 27 is not a date
    it('refuses 29 FEB 27 with INVALID ENT (C-1)', async () => {
        const unit = await onCal7Date();

        await selectDate(unit, 29, 2, [2, 7]);
        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        expect(Screen.read().status().mode).toBe('INVALID ENT');
        expect(cal7Date(unit)).toEqual([2026, 5, 1]);
    });
});

describe('date editor, the day wraps (checked in the KLN 89 trainer, 2026-10-08)', () => {
    // Checked in the KLN 89 trainer, 2026-10-08 (T4): the day runs from 01 to 31 and wraps: one click
    // counterclockwise from the 01 of the first click is 31, and one click clockwise from 31 is 01 again
    it('wraps the day from 01 to 31 and back (checked in the KLN 89 trainer, 2026-10-08)', async () => {
        const unit = await onCal7Date();
        await unit.panel.inner('L', 1);
        expect(dateRow()).toBe('  01 ___ __');

        await unit.panel.inner('L', -1);
        expect(dateRow()).toBe('  31 ___ __');
        await unit.panel.inner('L', 1);

        expect(unit.errors).toEqual([]);
        expect(dateRow()).toBe('  01 ___ __');
    });
});

describe('date editor (characterization)', () => {

    // After INVALID ENT the edit stays open with what was selected, so the pilot can correct it
    it('keeps the refused date open for a correction', async () => {
        const unit = await onCal7Date();
        await selectDate(unit, 30, 2, [9, 2]);
        await unit.panel.ent();
        expect(Screen.read().status().mode).toBe('INVALID ENT');

        await unit.panel.outer('L', -3); // back to the day
        await unit.panel.inner('L', -2); // 28
        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        expect(dateRow()).toBe('  28 FEB 92');
        expect(cal7Date(unit)).toEqual([1992, 1, 28]);
    });
});
