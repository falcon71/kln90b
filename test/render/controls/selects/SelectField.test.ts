import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {storedSetting} from '../../../harness/storage';

// SelectField is the cell of every fieldset: one value of a fixed list per cell, the inner knob steps through the list,
// the outer knob moves the cursor on. Its host here is the alert volume of SET 9, two digit cells and nothing else
// (3-57), saved as the setting altAlertVolume.

/** SET 9 with the left cursor on the tens of the volume, stored as `volume` */
async function onVolume(volume: number): Promise<HeadlessUnit> {
    const unit = await bootUnit({storage: {altAlertVolume: volume}});
    await unit.panel.selectPage('L', 'SET 9');
    await unit.panel.cursor('L');
    expect(unit.panel.focused('L')).toEqual({row: 4, col: 4, text: String(volume).padStart(2, '0')[0]});
    return unit;
}

const volumeRow = () => Screen.read().rows('L')[4];

describe('select field', () => {
    // Checked in the KLN 89 trainer, 2026-10-08, T4: a digit at the end of its list wraps in both directions (the
    // trainer's CAL 5 temperature digits, the date, hour and minute cells). The 90B guide (3-57) does not speak of it.
    it('wraps a digit from 9 to 0 and from 0 to 9 (checked in the KLN 89 trainer, 2026-10-08, T4)', async () => {
        const unit = await onVolume(95);
        await unit.panel.inner('L', 1);
        expect(volumeRow()).toBe('    05     ');

        await unit.panel.inner('L', -1);
        expect(volumeRow()).toBe('    95     ');
    });

    // ENT on a field moves the cursor to the next field: the video of a real unit that CursorController.enter cites
    // (https://www.youtube.com/shorts/9We5fcd2-VE). On a select cell ENT commits nothing of its own: the value stays.
    it('keeps the value and moves the cursor to the next cell on ENT '
        + '(video of a real unit, youtube.com/shorts/9We5fcd2-VE)', async () => {
        const unit = await onVolume(37);
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        expect(volumeRow()).toBe('    37     ');
        expect(unit.panel.focused('L')).toEqual({row: 4, col: 5, text: '7'});
        expect(storedSetting(unit, 'altAlertVolume')).toBe(37);
    });
});

describe('select field (characterization)', () => {
    // Each step of the cell is committed at once, without ENT
    it('commits every step of the cell at once (characterization)', async () => {
        const unit = await onVolume(95);
        await unit.panel.inner('L', 1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(storedSetting(unit, 'altAlertVolume')).toBe(5);

        await unit.panel.inner('L', -1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(storedSetting(unit, 'altAlertVolume')).toBe(95);
    });

    // The keyboard (the private KLN90B_Internal_Key event) sets a cell to a typed character of its list and moves the
    // cursor to the next cell, as the outer knob would
    it('takes a typed digit and moves on to the next cell (characterization)', async () => {
        const unit = await onVolume(99);
        await unit.panel.type('L', '4');

        expect(volumeRow()).toBe('    49     ');
        expect(unit.panel.focused('L')).toEqual({row: 4, col: 5, text: '9'});
        await unit.panel.type('L', '2');
        await vi.advanceTimersByTimeAsync(1000);
        expect(storedSetting(unit, 'altAlertVolume')).toBe(42);
    });

    // A typed character outside the cell's list changes nothing, and the cursor stays
    it('ignores a typed letter on a digit cell (characterization)', async () => {
        const unit = await onVolume(99);
        await unit.panel.type('L', 'A');

        expect(volumeRow()).toBe('    99     ');
        expect(unit.panel.focused('L')).toEqual({row: 4, col: 4, text: '9'});
    });

    // CLR has no meaning on a select cell: the value and the cursor stay
    it('keeps the value and the cursor on CLR (characterization)', async () => {
        const unit = await onVolume(37);
        await unit.panel.clr();
        await vi.advanceTimersByTimeAsync(1000);

        expect(volumeRow()).toBe('    37     ');
        expect(unit.panel.focused('L')).toEqual({row: 4, col: 4, text: '3'});
        expect(storedSetting(unit, 'altAlertVolume')).toBe(37);
    });
});
