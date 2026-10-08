import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {storedSetting} from '../../../harness/storage';

// TempFieldset: a sign cell and two digit cells, degrees C or F. Its host here is CAL 5, whose first field is the
// Celsius temperature (row 1) and whose second is the Fahrenheit temperature (row 2); each value is saved as a setting
// (cal5TempC, cal5TempF). CAL 1 and CAL 2 use the same fieldset (Cal1Page.test.ts, Cal2Page.test.ts).

/** CAL 5 with the left cursor on the sign cell of the Celsius temperature, stored as `tempC` */
async function onCelsius(tempC: number, tempF: number): Promise<HeadlessUnit> {
    const unit = await bootUnit({storage: {cal5TempC: tempC, cal5TempF: tempF}});
    await unit.panel.selectPage('L', 'CAL 5');
    await unit.panel.cursor('L');
    expect(unit.panel.focused('L')).toMatchObject({row: 1, col: 3});
    return unit;
}

describe('temperature fieldset', () => {
    // 5-10 step 5, 5-11 step 6: the first digit of a temperature is 0 above zero and - below zero; nothing else
    it('offers only 0 and - in the sign cell (5-10, 5-11)', async () => {
        const unit = await onCelsius(25, 77);
        const seen = [unit.panel.focused('L').text];
        for (let i = 0; i < 2; i++) {
            await unit.panel.inner('L', 1);
            seen.push(unit.panel.focused('L').text);
        }
        expect(seen).toEqual(['0', '-', '0']);
    });

    // Checked in the KLN 89 trainer, 2026-10-08, T4: a calculator value changes at once, without ENT (the trainer's
    // CAL 5 density altitude followed every click of the temperature). Here the tens digit of 25 C turned to 35 C:
    // 95 F
    it('changes the temperature at once, without ENT (checked in the KLN 89 trainer, 2026-10-08, T4)', async () => {
        const unit = await onCelsius(25, 77);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1);

        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['   035°C   ', '   095°F   ']);
        expect(storedSetting(unit, 'cal5TempC')).toBe(35);
    });

    // Checked in the KLN 89 trainer, 2026-10-08, T4: a digit at the end of its list wraps in both directions (the
    // trainer's CAL 5 temperature). The tens digit of 25 C: 2 turned down 3 clicks is 9, and 9 up one click is 0
    it('wraps the tens digit of the temperature (checked in the KLN 89 trainer, 2026-10-08, T4)', async () => {
        const unit = await onCelsius(25, 77);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', -3);
        expect(Screen.read().rows('L')[1]).toBe('   095°C   ');

        await unit.panel.inner('L', 1);
        expect(Screen.read().rows('L')[1]).toBe('   005°C   ');
    });

    // 5-13 (figure 5-43): the units digit alone: 25 C turned to 27 C keeps the tens and shows 81 F
    it('takes 27 C from the units digit of 25 C and keeps the tens (5-13)', async () => {
        const unit = await onCelsius(25, 77);
        await unit.panel.outer('L', 2);
        await unit.panel.inner('L', 2);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['   027°C   ', '   081°F   ']);
        expect(storedSetting(unit, 'cal5TempC')).toBe(27);
    });

    // 5-10, 5-11: the minus in the first digit stays when a digit after it is turned: -25 C to -35 C is -31 F
    it('keeps the minus when the tens digit of -25 C is turned to -35 C (5-10, 5-11)', async () => {
        const unit = await onCelsius(-25, -13);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['   -35°C   ', '   -31°F   ']);
        expect(storedSetting(unit, 'cal5TempC')).toBe(-35);
    });

    // 5-10, 5-13: the sign cell turns 25 C into -25 C, which is -13 F (-25 * 9 / 5 + 32)
    it('makes 25 C negative with the sign cell: -25 C is -13 F (5-10, 5-13)', async () => {
        const unit = await onCelsius(25, 77);
        await unit.panel.inner('L', 1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['   -25°C   ', '   -13°F   ']);
        expect(storedSetting(unit, 'cal5TempC')).toBe(-25);
    });

    // 5-13 (figure 5-43): the cursor is put over the Celsius digits; the sign cell and the two digits are three
    // positions, then the cursor goes on to the Fahrenheit temperature
    it('visits the sign and the two digits, then the next temperature (5-10, 5-13)', async () => {
        const unit = await onCelsius(25, 77);
        const seen = [unit.panel.focused('L')];
        for (let i = 0; i < 3; i++) {
            await unit.panel.outer('L', 1);
            seen.push(unit.panel.focused('L'));
        }
        expect(seen).toEqual([
            {row: 1, col: 3, text: '0'}, {row: 1, col: 4, text: '2'}, {row: 1, col: 5, text: '5'},
            {row: 2, col: 3, text: '0'},
        ]);
    });

    // 5-13 (figure 5-43): 25 C entered digit by digit from 000 is 77 F. The units first, so that a tens digit that
    // overwrote the units would show
    it('takes 25 C digit by digit and shows 77 F (5-13)', async () => {
        const unit = await onCelsius(0, 32);
        await unit.panel.outer('L', 2);
        await unit.panel.inner('L', 5);
        await unit.panel.outer('L', -1);
        await unit.panel.inner('L', 2);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['   025°C   ', '   077°F   ']);
        expect(storedSetting(unit, 'cal5TempC')).toBe(25);
    });

    // 5-10 step 5: a temperature below zero shows - in its first digit; -25 C is -13 F
    it('shows a stored -25 C with the minus in the sign cell (5-10)', async () => {
        const unit = await onCelsius(-25, -13);

        expect(unit.panel.focused('L')).toEqual({row: 1, col: 3, text: '-'});
        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['   -25°C   ', '   -13°F   ']);
    });

    // The sibling of the pin below: from 000 the sign is set first, then the last digit; the field shows -05
    it('shows -05 after the sign and then the last digit are set on 000 (5-10)', async () => {
        const unit = await onCelsius(0, 32);
        await unit.panel.inner('L', 1); // the sign: -
        await unit.panel.outer('L', 2);
        await unit.panel.inner('L', 5); // the last digit: 5

        expect(Screen.read().rows('L')[1]).toBe('   -05°C   ');
    });

    // 5-10 step 5: a minus in the first digit makes the temperature negative, whatever order the digits are set in.
    // Set on 000, the minus is lost when the next digit is turned: -5 C is stored as +5 (and F shows 041).
    it.fails('commits -5 C when the sign is set before the digits (5-10, #256)', async () => {
        const unit = await onCelsius(0, 32);
        await unit.panel.inner('L', 1);
        await unit.panel.outer('L', 2);
        await unit.panel.inner('L', 5);
        await vi.advanceTimersByTimeAsync(1000);

        expect(storedSetting(unit, 'cal5TempC')).toBe(-5);
    });
});

describe('temperature fieldset (characterization)', () => {
    // The sign cell takes a typed minus. The PC keyboard cannot send it (unit.panel.type refuses anything but A to
    // Z and 0 to 9), so the raw H event is pressed: only an aircraft's H event can send that character.
    it('takes a typed minus in the sign cell (characterization)', async () => {
        const unit = await onCelsius(25, 77);
        await unit.panel.press('KLN90B_Internal_Key:LEFT:-');
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L')[1]).toBe('   -25°C   ');
        expect(unit.panel.focused('L')).toEqual({row: 1, col: 4, text: '2'});
        expect(storedSetting(unit, 'cal5TempC')).toBe(-25);
    });
});
