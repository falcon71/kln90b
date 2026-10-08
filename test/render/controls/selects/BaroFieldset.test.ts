import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {storedSetting} from '../../../harness/storage';

// BaroFieldset: the altimeter setting in inches (the first two digits as one cell, the point, two digit cells, ") or
// in millibars (the first two digits as one cell, two digit cells, MB), as SET 7 chooses. Its host here is the ALT
// page, which the ALT key shows with the cursor on the first cell (3-39, 3-55). The committed value is the sensors'
// barometer, saved as the setting barosetting. CAL 1, CAL 2 and the self-test page use the same fieldset.
// test/unit/controls/selects/BaroFieldset.test.ts holds the callbacks (#113).

async function onAltPage(storage: Record<string, unknown> = {}): Promise<HeadlessUnit> {
    const unit = await bootUnit({storage});
    await unit.panel.alt();
    return unit;
}

const baroRow = () => Screen.read().rows('L')[1];

describe('barometer fieldset in inches', () => {
    // 3-7 step 9 (figures 3-19, 3-20): the inner knob on the first two digits changes them as one number, 29.92 to
    // 30.92; the next position is the first digit after the point, 30.92 to 30.02. The same entry on the ALT page
    // (3-55)
    it('turns 29.92 into 30.92 with the first cell and 30.02 with the next (3-7, 3-55)', async () => {
        const unit = await onAltPage({barosetting: 29.92});
        expect(unit.panel.focused('L')).toEqual({row: 1, col: 5, text: '29'});
        await unit.panel.inner('L', 1);
        expect(baroRow()).toBe('BARO:30.92"');
        expect(unit.props.sensors.in.airdata.barometer).toBe(30.92);

        await unit.panel.outer('L', 1);
        expect(unit.panel.focused('L')).toEqual({row: 1, col: 8, text: '9'});
        await unit.panel.inner('L', 1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(baroRow()).toBe('BARO:30.02"');
        expect(storedSetting(unit, 'barosetting')).toBe(30.02);
    });

    // 3-55 step 2 (figures 3-175, 3-176): 30.13 to 30.09 with the two digits after the point
    it('sets the two digits after the point: 30.13 to 30.09 (3-55)', async () => {
        const unit = await onAltPage({barosetting: 30.13});
        await unit.panel.outer('L', 2);
        expect(unit.panel.focused('L')).toEqual({row: 1, col: 9, text: '3'});
        await unit.panel.inner('L', 6);
        await unit.panel.outer('L', -1);
        await unit.panel.inner('L', -1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(baroRow()).toBe('BARO:30.09"');
        expect(storedSetting(unit, 'barosetting')).toBe(30.09);
    });

    // 3-55 step 2: the last digit alone keeps the one before it: 29.92 to 29.95
    it('sets the last digit and keeps the others: 29.92 to 29.95 (3-55)', async () => {
        const unit = await onAltPage({barosetting: 29.92});
        await unit.panel.outer('L', 2);
        await unit.panel.inner('L', 3);
        await vi.advanceTimersByTimeAsync(1000);

        expect(baroRow()).toBe('BARO:29.95"');
        expect(storedSetting(unit, 'barosetting')).toBe(29.95);
    });
});

describe('barometer fieldset wrap', () => {
    // Checked in the KLN 89 trainer, 2026-10-08, T4: a digit at the end of its list wraps in both directions. The last
    // digit of 29.92 turned down 3 clicks is 9 (29.99), and up one click is 0 again (29.90)
    it('wraps the last digit of the setting (checked in the KLN 89 trainer, 2026-10-08, T4)', async () => {
        const unit = await onAltPage({barosetting: 29.92});
        await unit.panel.outer('L', 2);
        await unit.panel.inner('L', -3);
        expect(baroRow()).toBe('BARO:29.99"');

        await unit.panel.inner('L', 1);
        expect(baroRow()).toBe('BARO:29.90"');
    });
});

describe('barometer fieldset in millibars', () => {
    // 3-39: in millibars the first two digits are one cursor position; the next two digits are one position each.
    // 1013 MB to 1017 MB with the last digit is 1017 / 33.8639 = 30.03 inches
    it('sets 1017 MB with the last digit and commits it in inches (3-39, 5-10)', async () => {
        const unit = await onAltPage({barounit: false, barosetting: 29.92});
        expect(baroRow()).toBe('BARO:1013MB');
        await unit.panel.outer('L', 2);
        expect(unit.panel.focused('L')).toEqual({row: 1, col: 8, text: '3'});
        await unit.panel.inner('L', 4);
        await vi.advanceTimersByTimeAsync(1000);

        expect(baroRow()).toBe('BARO:1017MB');
        expect(unit.props.sensors.in.airdata.barometer).toBeCloseTo(30.03, 2);
    });

    // 3-39: the tens digit alone: 1013 MB to 1003 MB (1003 / 33.8639 = 29.62)
    it('sets the tens digit: 1013 MB to 1003 MB (3-39)', async () => {
        const unit = await onAltPage({barounit: false, barosetting: 29.92});
        await unit.panel.outer('L', 1);
        expect(unit.panel.focused('L')).toEqual({row: 1, col: 7, text: '1'});
        await unit.panel.inner('L', -1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(baroRow()).toBe('BARO:1003MB');
        expect(unit.props.sensors.in.airdata.barometer).toBeCloseTo(29.62, 2);
    });

});

describe('barometer fieldset in millibars below 1000', () => {
    // The sibling of the pin below: 29.32 inches are 993 MB, set in millibars (3-39, 5-10). The digits after the first
    // cell read 93 and the unit MB; the setting is the one stored
    it('reaches 993 MB with the barometer in millibars (3-39, 5-10)', async () => {
        const unit = await onAltPage({barounit: false, barosetting: 29.32});

        expect(baroRow().slice(7)).toBe('93MB');
        expect(unit.props.sensors.in.airdata.barometer).toBe(29.32);
    });

    // Checked in the KLN 89 trainer, 2026-10-08, T16: 993 MB shows with a blank in the first digit (the trainer's
    // ALT 1 turned down from 1013 MB), not with a zero. No figure of the 90B guide shows a millibar value below
    // 1000. The code shows BARO:0993MB.
    it.fails('shows 993 MB with a blank in the first digit '
        + '(checked in the KLN 89 trainer, 2026-10-08, T16, #NEW-4-4)', async () => {
        await onAltPage({barounit: false, barosetting: 29.32});

        expect(baroRow()).toBe('BARO: 993MB');
    });
});

describe('barometer fieldset in millibars (characterization)', () => {
    // The first two digits change as one cell, here from 10 to 09: 1013 MB becomes 913 MB, 26.96 inches in the sensors.
    // The cell's range 07 to 10 is the maintainer's model (#32, closed)
    it('steps the first two digits as one cell: 1013 MB to 913 MB (characterization)', async () => {
        const unit = await onAltPage({barounit: false, barosetting: 29.92});
        await unit.panel.inner('L', -1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.props.sensors.in.airdata.barometer).toBeCloseTo(26.96, 2);
        expect(storedSetting(unit, 'barosetting')).toBeCloseTo(26.96, 2);
    });
});
