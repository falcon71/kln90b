import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {storedSetting} from '../../../harness/storage';
import {AIRDATA, panelXml} from '../../../harness/panelXml';

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
    // 993 MB is reached with the knobs in millibars (3-39, 5-10): the first cell of 1013 MB turned down to 09 (913
    // MB), then the tens digit turned up from 1 to 9. The digits after the first cell read 93 and the unit MB; the
    // sensors hold 993 / 33.8639 = 29.32 inches
    it('reaches 993 MB with the knobs in millibars (3-39, 5-10)', async () => {
        const unit = await onAltPage({barounit: false, barosetting: 29.92});
        await unit.panel.inner('L', -1);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 8);
        await vi.advanceTimersByTimeAsync(1000);

        expect(baroRow().slice(7)).toBe('93MB');
        expect(unit.props.sensors.in.airdata.barometer).toBeCloseTo(29.32, 2);
    });

    // Checked in the KLN 89 trainer, 2026-10-08, T16: 993 MB shows with a blank in the first digit (the trainer's
    // ALT 1 turned down from 1013 MB), not with a zero. No figure of the 90B guide shows a millibar value below
    // 1000.
    it('shows 993 MB with a blank in the first digit '
        + '(checked in the KLN 89 trainer, 2026-10-08, T16, #315)', async () => {
        await onAltPage({barounit: false, barosetting: 29.32});

        expect(baroRow()).toBe('BARO: 993MB');
    });

    // The same row reached with the knobs: the first cell turned down to 09 shows the blank, and the blank stays while
    // the tens and the units are turned
    it('keeps the blank while the digits are turned (checked in the KLN 89 trainer, 2026-10-08, T16, #315)', async () => {
        const unit = await onAltPage({barounit: false, barosetting: 29.92});
        await unit.panel.inner('L', -1);
        expect(baroRow()).toBe('BARO: 913MB');
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 8);
        expect(baroRow()).toBe('BARO: 993MB');
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1);

        expect(unit.errors).toEqual([]);
        expect(baroRow()).toBe('BARO: 994MB');
    });

    // The edge of the blank at 1000 MB (29.50 inches are 998.9 hPa, 29.53 inches are 1000.0 hPa): the setting just
    // below has the blank, the one that shows 1000 has none
    it('shows 999 MB with a blank (checked in the KLN 89 trainer, 2026-10-08, T16, #315)', async () => {
        await onAltPage({barounit: false, barosetting: 29.50});

        expect(baroRow()).toBe('BARO: 999MB');
    });

    it('shows 1000 MB without a blank (checked in the KLN 89 trainer, 2026-10-08, T16, #315)', async () => {
        await onAltPage({barounit: false, barosetting: 29.53});

        expect(baroRow()).toBe('BARO:1000MB');
    });

    // An air data computer that sends the setting (BaroSource 1) changes the shown value through setBaro, a second
    // route to the cells: the blank comes and goes with the value
    it('shows the blank when the setting of the altimeter changes below and above 1000 MB ' +
        '(checked in the KLN 89 trainer, 2026-10-08, T16, #315)', async () => {
        const unit = await bootUnit({
            storage: {barounit: false},
            panelXml: panelXml({...AIRDATA, 'Input.Airdata.BaroSource': 1}),
        });
        unit.env.sim.set('KOHLSMAN SETTING HG:1', 'inches of mercury', 29.32);
        await vi.advanceTimersByTimeAsync(1000);
        await unit.panel.alt();
        expect(baroRow()).toBe('BARO: 993MB');

        unit.env.sim.set('KOHLSMAN SETTING HG:1', 'inches of mercury', 29.92);
        await vi.advanceTimersByTimeAsync(1000);
        expect(baroRow()).toBe('BARO:1013MB');

        unit.env.sim.set('KOHLSMAN SETTING HG:1', 'inches of mercury', 29.50);
        await vi.advanceTimersByTimeAsync(1000);
        expect(unit.errors).toEqual([]);
        expect(baroRow()).toBe('BARO: 999MB');
    });

    // The ends of the range of the fieldset (the cell offers 07 to 10, the maintainer's model, #32): 700 MB, which
    // is also the lowest the fieldset shows, has the blank, 1099 MB, the highest, has none
    it('characterization: shows the lowest setting, 700 MB, with a blank (#315)', async () => {
        await onAltPage({barounit: false, barosetting: 20.67});

        expect(baroRow()).toBe('BARO: 700MB');
    });

    it('characterization: shows the highest setting, 1099 MB, without a blank (#315)', async () => {
        await onAltPage({barounit: false, barosetting: 32.45});

        expect(baroRow()).toBe('BARO:1099MB');
    });
});

describe('barometer fieldset in millibars (characterization)', () => {
    // Beyond the range the cell offers (#32, closed) the fieldset shows its ends: a setting of 20.00 inches (677 MB)
    // shows 700 MB, a setting of 33.00 inches (1118 MB) shows 1099 MB
    it('shows 700 MB for a setting of 20.00 inches (characterization)', async () => {
        await onAltPage({barounit: false, barosetting: 20.0});
        expect(baroRow()).toBe('BARO: 700MB');
    });

    it('shows 1099 MB for a setting of 33.00 inches (characterization)', async () => {
        await onAltPage({barounit: false, barosetting: 33.0});
        expect(baroRow()).toBe('BARO:1099MB');
    });

    // The first two digits change as one cell, here from 10 to 09: 1013 MB becomes 913 MB, 26.96 inches in the sensors.
    // The cell's range 07 to 10 is the maintainer's model (#32, closed)
    it('steps the first two digits as one cell: 1013 MB to 913 MB (characterization)', async () => {
        const unit = await onAltPage({barounit: false, barosetting: 29.92});
        await unit.panel.inner('L', -1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(baroRow()).toBe('BARO: 913MB');
        expect(unit.props.sensors.in.airdata.barometer).toBeCloseTo(26.96, 2);
        expect(storedSetting(unit, 'barosetting')).toBeCloseTo(26.96, 2);
    });

    // The same cell at the other end of its range: 880 MB (25.98 inches) turned down from 08 to 07 is 780 MB, which
    // is 23.03 inches in the sensors. The cell's first entry is 07, so a list without it would wrap to 10 instead
    it('steps the first two digits down to the first entry: 880 MB to 780 MB (characterization)', async () => {
        const unit = await onAltPage({barounit: false, barosetting: 25.98});
        expect(baroRow()).toBe('BARO: 880MB'); // precondition
        await unit.panel.inner('L', -1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(baroRow()).toBe('BARO: 780MB');
        expect(unit.props.sensors.in.airdata.barometer).toBeCloseTo(23.03, 2);
        expect(storedSetting(unit, 'barosetting')).toBeCloseTo(23.03, 2);
    });
});
