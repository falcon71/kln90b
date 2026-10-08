import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {legWorld} from '../../../harness/fixtures';
import {Screen} from '../../../harness/render/screen';
import {savedFlightplan, storedSetting} from '../../../harness/storage';

// VnavAngleFieldset: a sign that is shown and not entered, a units digit and a tenths digit around a fixed point.
// VnavDistanceFieldset: the two digits of the VNAV offset in whole NM. The angle is hosted on CAL 4 (row 4, after
// the three GS digits and the two FPM digits; setting cal4Angle), the offset on NAV 4 (row 4 after the waypoint;
// navPage.nav4VnavDist).

/** CAL 4 with the left cursor on the units of ANGLE */
async function onAngle(storage: Record<string, unknown>): Promise<HeadlessUnit> {
    const unit = await bootUnit({storage});
    await unit.panel.selectPage('L', 'CAL 4');
    await unit.panel.cursor('L');
    await unit.panel.outer('L', 5);
    expect(unit.panel.focused('L')).toMatchObject({row: 4, col: 7});
    return unit;
}

describe('VNAV angle fieldset', () => {
    // 5-12 (figures 5-40, 5-41), 5-8 step 5: the angle has a units digit and a tenths digit, each a cursor position;
    // the next position is the first field of the page again
    it('visits the units and the tenths of the angle (5-8, 5-12)', async () => {
        const unit = await onAngle({cal4GS: 160, cal4Fpm: 800, cal4Angle: 2.8});
        const seen = [unit.panel.focused('L')];
        await unit.panel.outer('L', 1);
        seen.push(unit.panel.focused('L'));

        expect(seen).toEqual([{row: 4, col: 7, text: '2'}, {row: 4, col: 9, text: '8'}]);
    });

    // 5-12: an angle entered gives the rate for the ground speed: 2.8 to 1.8 at 160 kt is 0500 ft/min (the guide's
    // figures 5-40 and 5-41 in reverse; 16203 * tan(1.8) = 509, shown in hundreds)
    it('takes 1.8 from the units digit and gives 0500 ft/min at 160 kt (5-12)', async () => {
        const unit = await onAngle({cal4GS: 160, cal4Fpm: 800, cal4Angle: 2.8});
        await unit.panel.inner('L', -1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L').slice(3, 5)).toEqual(['FPM:   0500', 'ANGLE: 1.8°']);
        expect(storedSetting(unit, 'cal4Angle')).toBe(1.8);
    });

    // Checked in the KLN 89 trainer, 2026-10-08, T4: a digit at the end of its list wraps in both directions. The units
    // digit of 2.8 turned down 3 clicks is 9 (9.8), and up one click is 0 (0.8)
    it('wraps the units digit of the angle (checked in the KLN 89 trainer, 2026-10-08, T4)', async () => {
        const unit = await onAngle({cal4GS: 160, cal4Fpm: 800, cal4Angle: 2.8});
        await unit.panel.inner('L', -3);
        expect(Screen.read().rows('L')[4]).toBe('ANGLE: 9.8°');

        await unit.panel.inner('L', 1);
        expect(Screen.read().rows('L')[4]).toBe('ANGLE: 0.8°');
    });

    // 5-12: the tenths digit: 2.8 to 2.3 at 160 kt is 16203 * tan(2.3) = 651, shown as 0700
    it('takes the tenths digit: 2.3 gives 0700 ft/min at 160 kt (5-12)', async () => {
        const unit = await onAngle({cal4GS: 160, cal4Fpm: 800, cal4Angle: 2.8});
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', -5);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L').slice(3, 5)).toEqual(['FPM:   0700', 'ANGLE: 2.3°']);
        expect(storedSetting(unit, 'cal4Angle')).toBe(2.3);
    });

    // The sibling of the pin below: at 60 kt (6076 ft/min) a rate of 1100 ft/min is atan(1100 / 6076) = 10.3 degrees,
    // an angle the units digit cannot hold. 1000 ft/min (9.3 degrees) still fits.
    it('reaches an angle of 10.3 degrees at 60 kt and 1100 ft/min (5-12)', async () => {
        const unit = await bootUnit({storage: {cal4GS: 60, cal4Fpm: 1000, cal4Angle: 9.35}});
        await unit.panel.selectPage('L', 'CAL 4');
        expect(Screen.read().rows('L')[4]).toBe('ANGLE: 9.4°');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 4); // the hundreds of FPM
        await unit.panel.inner('L', 1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L')[3]).toBe('FPM:   1100');
        expect(storedSetting(unit, 'cal4Angle')).toBeCloseTo(10.26, 2);
        expect(Screen.read().rows('L')[4].slice(0, 6)).toBe('ANGLE:');
    });

    // 5-12 (figures 5-39 to 5-41): the angle is a sign, a digit, the point and a digit, followed by the degree sign in
    // the last cell. At 10.3 degrees the tenths cell is empty (its value is not a number), so the degree sign moves one
    // cell left and the row reads "ANGLE: 1.°": an angle that reads as one degree and a field one cell short. What the
    // unit shows instead (a cap at 9.9, dashes) is open; any of them keeps the degree sign in the last cell.
    it.fails('keeps the degree sign in the last cell at 10.3 degrees (5-12, #314)', async () => {
        const unit = await bootUnit({storage: {cal4GS: 60, cal4Fpm: 1000, cal4Angle: 9.35}});
        await unit.panel.selectPage('L', 'CAL 4');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 4);
        await unit.panel.inner('L', 1);
        await vi.advanceTimersByTimeAsync(1000);

        const row = Screen.read().rows('L')[4];
        expect(row[10]).toBe('°');
        expect(row.slice(6, 10)).not.toMatch(/^ 1\.$/);
    });
});

/** NAV 4 on the left in the leg world, 40 NM west of KDDD at 7500 ft, the cursor on the tens of the offset */
async function onOffset(): Promise<HeadlessUnit> {
    const {kaaa, kddd, keee, west} = legWorld();
    const unit = await bootUnit({
        facilities: [kaaa, kddd, keee], position: west(40), altitudeFt: 7500,
        storage: savedFlightplan(0, [kaaa, kddd, keee]),
    });
    await settle(unit);
    await unit.panel.selectPage('L', 'NAV 4');
    await unit.panel.cursor('L');
    await unit.panel.cursorTo('L', 'KDDD');
    await unit.panel.outer('L', 1);
    expect(unit.panel.focused('L')).toEqual({row: 4, col: 7, text: '0'});
    return unit;
}

describe('VNAV distance fieldset', () => {
    // 5-8 step 4 (figure 5-25): the offset before the waypoint is entered in whole NM; 2 NM reads -02nm. The two
    // digits are two cursor positions.
    it('takes an offset of 2 NM in the units digit and shows -02nm (5-8)', async () => {
        const unit = await onOffset();
        await unit.panel.outer('L', 1);
        expect(unit.panel.focused('L')).toEqual({row: 4, col: 8, text: '0'});
        await unit.panel.inner('L', 2);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L')[4]).toBe('KDDD :-02nm');
        expect(unit.props.memory.navPage.nav4VnavDist).toBe(2);
    });

    // 5-8: the tens digit: 12 NM reads -12nm. The units first, so that a tens digit that overwrote the units would
    // show.
    it('takes an offset of 12 NM digit by digit (5-8)', async () => {
        const unit = await onOffset();
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 2);
        await unit.panel.outer('L', -1);
        await unit.panel.inner('L', 1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L')[4]).toBe('KDDD :-12nm');
        expect(unit.props.memory.navPage.nav4VnavDist).toBe(12);
    });

    // Checked in the KLN 89 trainer, 2026-10-08, T4: a digit at the end of its list wraps in both directions. The tens
    // digit of the offset turned down one click is 9 (-90nm), and up one click is 0 again
    it('wraps the tens digit of the offset (checked in the KLN 89 trainer, 2026-10-08, T4)', async () => {
        const unit = await onOffset();
        await unit.panel.inner('L', -1);
        expect(Screen.read().rows('L')[4]).toBe('KDDD :-90nm');

        await unit.panel.inner('L', 1);
        expect(Screen.read().rows('L')[4]).toBe('KDDD :-00nm');
    });

    // 5-8: the other order: the tens first, then the units: 21 NM reads -21nm
    it('takes an offset of 21 NM tens first (5-8)', async () => {
        const unit = await onOffset();
        await unit.panel.inner('L', 2);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L')[4]).toBe('KDDD :-21nm');
        expect(unit.props.memory.navPage.nav4VnavDist).toBe(21);
    });
});
