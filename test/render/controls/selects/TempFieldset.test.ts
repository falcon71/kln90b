import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {storedSetting} from '../../../harness/storage';
import {mount} from '../../../harness/render/mount';
import {TempFieldset} from '../../../../kln90b/controls/selects/TempFieldset';

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
    // Set on 000, the minus must survive the next digit: -5 C is -5 (and 23 F), not +5.
    it('commits -5 C when the sign is set before the digits (5-10, #256)', async () => {
        const unit = await onCelsius(0, 32);
        await unit.panel.inner('L', 1);
        await unit.panel.outer('L', 2);
        await unit.panel.inner('L', 5);
        await vi.advanceTimersByTimeAsync(1000);

        expect(storedSetting(unit, 'cal5TempC')).toBe(-5);
        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['   -05°C   ', '   023°F   ']);
    });

    // The same for the tens digit: the sign first, then the tens: -40 C is -40 F (-40 * 9 / 5 + 32)
    it('commits -40 C when the sign is set before the tens digit (5-10, 5-13, #256)', async () => {
        const unit = await onCelsius(0, 32);
        await unit.panel.inner('L', 1);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 4);
        await vi.advanceTimersByTimeAsync(1000);

        expect(storedSetting(unit, 'cal5TempC')).toBe(-40);
        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['   -40°C   ', '   -40°F   ']);
    });

    // The sign cell stays the owner of the sign through further edits: with the minus set on 000, both digits are
    // turned (-15 C) and the sign is turned back to 0, which makes it +15 C; a digit after that stays positive
    it('keeps following the sign cell through the next digits (5-10, #256)', async () => {
        const unit = await onCelsius(0, 32);
        await unit.panel.inner('L', 1); // -
        await unit.panel.outer('L', 2);
        await unit.panel.inner('L', 5); // -05
        await unit.panel.outer('L', -1);
        await unit.panel.inner('L', 1); // -15
        await vi.advanceTimersByTimeAsync(1000);
        expect(storedSetting(unit, 'cal5TempC')).toBe(-15);

        await unit.panel.outer('L', -1);
        await unit.panel.inner('L', 1); // the sign: 0
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().rows('L')[1]).toBe('   015°C   ');
        expect(storedSetting(unit, 'cal5TempC')).toBe(15);

        await unit.panel.outer('L', 2);
        await unit.panel.inner('L', 1); // 016
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')[1]).toBe('   016°C   ');
        expect(storedSetting(unit, 'cal5TempC')).toBe(16);
    });

    // 5-10: the minus in the sign cell stays when a digit wraps (the wrap itself is the trainer's, T4): the tens digit of
    // -95 C turned up from 9 to 0 is -05 C, not +05
    it('keeps the minus when the tens digit wraps from 9 to 0 (5-10, checked in the KLN 89 trainer, ' +
        '2026-10-08, T4, #256)', async () => {
        const unit = await onCelsius(-95, -139);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L')[1]).toBe('   -05°C   ');
        expect(storedSetting(unit, 'cal5TempC')).toBe(-5);
    });

    // The positive side of the same edge: 05 C turned down in the tens wraps to 95 C
    it('keeps a positive temperature positive when the tens digit wraps from 0 to 9 (5-10, checked in the ' +
        'KLN 89 trainer, 2026-10-08, T4)', async () => {
        const unit = await onCelsius(5, 41);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', -1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L')[1]).toBe('   095°C   ');
        expect(storedSetting(unit, 'cal5TempC')).toBe(95);
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

// #257: a computed temperature that does not fit the sign cell and two digits. A positive one of 100 to 999 shows its
// hundreds digit in the sign cell; anything else out of range shows dashes (the KLN 89 shows dashes for its CAL values
// out of range, checked in the KLN 89 trainer, 2026-10-17). Either way the field holds no value, and a turn on any of its
// cells starts from 000 with the sign cell on 0. The 90B's own forms here, the hundreds digit in the sign cell
// included, are characterizations.
describe('a temperature that does not fit its cells (characterization, #257)', () => {
    /** CAL 5 from 0 C: the tens of the Celsius temperature turned to 4, 40 C */
    async function on40C(): Promise<HeadlessUnit> {
        const unit = await onCelsius(0, 32);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 4);
        await vi.advanceTimersByTimeAsync(1000);
        return unit;
    }

    // 40 * 9 / 5 + 32 = 104
    it('shows 40 C as 104 F, the hundreds digit in the sign cell (characterization, #257)', async () => {
        await on40C();
        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['   040°C   ', '   104°F   ']);
    });

    // -80 * 9 / 5 + 32 = -112, which does not fit the sign and two digits
    it('shows -80 C as dashes in F (characterization, #257)', async () => {
        const unit = await onCelsius(0, 32);
        await unit.panel.inner('L', 1); // the sign: -
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 8); // -80
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['   -80°C   ', '   ---°F   ']);
    });

    it('opens a stored 104 F as 104 (characterization)', async () => {
        await onCelsius(40, 104);
        expect(Screen.read().rows('L')[2]).toBe('   104°F   ');
    });

    // The bound is on the rounded value: -73 C is -99.4 F (-73 * 9 / 5 + 32), which rounds to -99 and fits
    it('shows -73 C as -99 F (characterization, #257)', async () => {
        const unit = await onCelsius(-70, -94);
        await unit.panel.outer('L', 2);
        await unit.panel.inner('L', 3); // the units: -73 C
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['   -73°C   ', '   -99°F   ']);
    });

    it('opens a stored 1000 F as dashes (characterization, #257)', async () => {
        await onCelsius(40, 1000);
        expect(Screen.read().rows('L')[2]).toBe('   ---°F   ');
    });

    // The field rendered on its own, before any display tick: what a page shows when it is built
    it('renders 104, -100 and none as 104 and dashes (characterization, #257)', () => {
        const noop = () => undefined;
        expect([104, -100, null].map(t => mount(new TempFieldset(t, noop)).text())).toEqual(['104', '---', '---']);
        expect(mount(new TempFieldset(-99, noop)).text()).toBe('-99'); // The sibling: the lowest temperature that fits
    });

    // From 104 F the tens turned up once: the field holds no value, so the edit starts from 000 and gives 010 F,
    // which is -12 C ((10 - 32) * 5 / 9 = -12.2)
    it('edits 104 F from 000: the tens up once give 010 F and -12 C (characterization, #257)', async () => {
        const unit = await on40C();
        await unit.panel.outer('L', 3); // the tens of the Fahrenheit temperature
        expect(unit.panel.focused('L')).toEqual({row: 2, col: 4, text: '0'});
        await unit.panel.inner('L', 1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['   -12°C   ', '   010°F   ']);
        expect(storedSetting(unit, 'cal5TempF')).toBe(10);
    });

    // The sign cell of 104 F shows the hundreds digit, but its value is still 0: one turn makes it -, and the edit starts
    // from 000, so the field is -00 F, which is -18 C ((0 - 32) * 5 / 9 = -17.8)
    it('edits 104 F from 000: the sign cell turned once gives -00 F and -18 C (characterization, #257)', async () => {
        const unit = await on40C();
        await unit.panel.outer('L', 2); // the sign cell of the Fahrenheit temperature
        expect(unit.panel.focused('L')).toEqual({row: 2, col: 3, text: '1'});
        await unit.panel.inner('L', 1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['   -18°C   ', '   -00°F   ']);
    });

    // -25 C (-13 F) with the tens turned to -85 C: -121 F, dashes. The units of F turned up once start from 000 with the
    // sign cell on 0, not on the minus of -13 F behind the dashes: 001 F, which is -17 C ((1 - 32) * 5 / 9 = -17.2)
    it('edits a dashed F from 000: the units up once give 001 F and -17 C (characterization, #257)', async () => {
        const unit = await onCelsius(-25, -13);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 6); // -85 C
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['   -85°C   ', '   ---°F   ']);
        await unit.panel.outer('L', 4); // the units of the Fahrenheit temperature
        await unit.panel.inner('L', 1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['   -17°C   ', '   001°F   ']);
        expect(storedSetting(unit, 'cal5TempF')).toBe(1);
    });

    // -45 C (-49 F) with the sign turned to 45 C: 113 F. The tens of F turned up once start from 000 with the sign cell
    // on 0, not on the minus of -49 F behind the 113: 010 F, which is -12 C
    it('edits 113 F from 000 after -49 F: the tens up once give 010 F and -12 C (characterization, #257)', async () => {
        const unit = await onCelsius(-45, -49);
        await unit.panel.inner('L', 1); // the sign: 45 C
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['   045°C   ', '   113°F   ']);
        await unit.panel.outer('L', 4); // the tens of the Fahrenheit temperature
        await unit.panel.inner('L', 1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['   -12°C   ', '   010°F   ']);
    });
});
