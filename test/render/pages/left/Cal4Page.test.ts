import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

// Source of the expected angles: the descent angle is atan(vertical speed / ground speed), computed by hand, with
// 1 kt = 6076.12 ft / 60 min = 101.269 ft/min. 175 kt is 17722 ft/min and 160 kt is 16203 ft/min.

/** Sets the digit under the cursor by turning the inner knob from its present value */
async function setDigit(unit: HeadlessUnit, digit: number): Promise<void> {
    await unit.panel.inner('L', digit - Number(unit.panel.focused('L').text));
}

describe('CAL 4 page (characterization)', () => {
    it('shows the angle for 160 kt and 800 ft/min (characterization)', async () => {
        const unit = await bootUnit({storage: {cal4GS: 160, cal4Fpm: 800, cal4Angle: 2.8}});
        await unit.panel.selectPage('L', 'CAL 4');
        expect(unit.errors).toEqual([]);
        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          " VNV ANGLE 
                     
          GS:   160kt
          FPM:   0800
          ANGLE: 2.8°
                     "
        `);
    });
});

describe('CAL 4 page (5-12)', () => {
    // 5-12, figures 5-39 to 5-41, entered with the knobs in the order of steps 3 and 4: GS 175 and FPM 800 give
    // atan(800 / 17722) = 2.585 deg, ANGLE 2.6; GS 160 gives atan(800 / 16203) = 2.827, ANGLE 2.8; FPM 500 then gives
    // atan(500 / 16203) = 1.767, ANGLE 1.8
    it('shows ANGLE 2.6, 2.8 and 1.8 for the figures\' ground speeds and rates (5-12)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'CAL 4');
        await unit.panel.cursor('L');
        await setDigit(unit, 1);
        await unit.panel.outer('L', 1);
        await setDigit(unit, 7);
        await unit.panel.outer('L', 1);
        await setDigit(unit, 5); // GS 175
        await unit.panel.outer('L', 2);
        await setDigit(unit, 8); // FPM 0800
        expect(Screen.read().rows('L').slice(2, 5)).toEqual(['GS:   175kt', 'FPM:   0800', 'ANGLE: 2.6°']);

        await unit.panel.outer('L', -3);
        await setDigit(unit, 6);
        await unit.panel.outer('L', 1);
        await setDigit(unit, 0); // GS 160
        expect(Screen.read().rows('L')[4]).toBe('ANGLE: 2.8°');

        await unit.panel.outer('L', 2);
        await setDigit(unit, 5); // FPM 0500
        expect(Screen.read().rows('L').slice(2, 5)).toEqual(['GS:   160kt', 'FPM:   0500', 'ANGLE: 1.8°']);
    });

    // 5-12, step 4: an angle may be entered instead, and the page gives the rate it needs: 16203 * tan(1.8 deg) =
    // 509 ft/min, shown in the hundreds the FPM field holds as 0500
    it('shows FPM 0500 for an angle of 1.8 at 160 kt (5-12)', async () => {
        const unit = await bootUnit({storage: {cal4GS: 160}});
        await unit.panel.selectPage('L', 'CAL 4');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 5);
        expect(unit.panel.focused('L')).toEqual({row: 4, col: 7, text: '0'}); // the whole degrees of ANGLE
        await setDigit(unit, 1);
        await unit.panel.outer('L', 1);
        await setDigit(unit, 8);
        expect(Screen.read().rows('L').slice(3, 5)).toEqual(['FPM:   0500', 'ANGLE: 1.8°']);
    });
});

describe('CAL 4 FPM edited after an angle', () => {
    /** 160 kt and 800 ft/min stored; the angle 2.8 changed to 1.8 (FPM 0500), then the FPM thousands digit set to 1 */
    async function angleThenFpm(): Promise<HeadlessUnit> {
        const unit = await bootUnit({storage: {cal4GS: 160, cal4Fpm: 800, cal4Angle: 2.8}});
        await unit.panel.selectPage('L', 'CAL 4');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 5);
        await setDigit(unit, 1); // ANGLE 1.8
        await unit.panel.outer('L', -2);
        expect(unit.panel.focused('L')).toEqual({row: 3, col: 7, text: '0'}); // the thousands of FPM
        await setDigit(unit, 1);
        return unit;
    }

    // 5-12: the sibling of the pin below. The angle gave FPM 0500, and the thousands digit then reads 1
    it('shows FPM 1500 after the thousands digit of 0500 is set to 1 (5-12)', async () => {
        await angleThenFpm();
        expect(Screen.read().rows('L')[3]).toBe('FPM:   1500');
    });

    // 5-12: the angle is that of the rate shown. atan(1500 / 16203) = 5.289 deg, ANGLE 5.3. The FPM field keeps the
    // rate it had before the angle was entered (800), so the digit makes it 1800 and the angle 6.3
    it.fails('shows ANGLE 5.3 for the 1500 ft/min shown (5-12, #NEW-6-2)', async () => {
        const unit = await angleThenFpm();
        expect(Screen.read().rows('L')[4]).toBe('ANGLE: 5.3°');
        expect(unit.props.userSettings.getSetting('cal4Fpm').get()).toBe(1500);
    });
});
