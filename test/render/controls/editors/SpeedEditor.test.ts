import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

/**
 * SpeedEditor is the ground speed field of SET 1 (3-18, 3-19). The host is SET 1 of a unit without a fix (coldGps):
 * CONFIRM? hands the entered ground speed to the GPS, and without a fix nothing overwrites it, so the next SET 1 page
 * shows the committed value (with a fix the GPS takes the sim's ground speed at every calculation tick).
 */
async function onGroundspeed(): Promise<HeadlessUnit> {
    const unit = await bootUnit({storage: {fastGpsAcquisition: false}, coldGps: true});
    await unit.panel.selectPage('L', 'SET 1');
    await unit.panel.cursor('L'); // on WPT (3-18)
    await unit.panel.outer('L', 3); // latitude, longitude, ground speed
    expect(unit.panel.focused('L')).toMatchObject({row: 4, col: 0}); // precondition: the cursor is on the ground speed
    return unit;
}

/** With the cursor on the ground speed: 120 kt selected with the knobs and entered */
async function select120(unit: HeadlessUnit): Promise<void> {
    await unit.panel.inner('L', 1); // opens the field: the hundreds cell 0, the others dashed
    await unit.panel.inner('L', 1); // 1
    await unit.panel.outer('L', 1);
    await unit.panel.inner('L', 3); // 2
    await unit.panel.outer('L', 1);
    await unit.panel.inner('L', 1); // 0
    await unit.panel.ent();
}

describe('SpeedEditor on SET 1 (3-18, 3-19)', () => {
    // 3-19 (and 5-46): a ground speed may be entered on SET 1 (it moves the unit in the take-home mode). 120 kt with
    // the knobs, CONFIRM?, and the next SET 1 page shows it
    it('takes a ground speed selected with the knobs (3-19)', async () => {
        const unit = await onGroundspeed();
        await select120(unit);
        await unit.panel.confirmSet1AndReselect();

        expect(unit.errors).toEqual([]);
        expect(unit.props.sensors.in.gps.groundspeed).toBe(120);
        expect(Screen.read().rows('L')[4].slice(0, 6)).toBe('120 KT');
    });

    // Figures 3-57 to 3-60 show the ground speed with its leading zeros suppressed (0 KT), and the KLN 89 trainer shows
    // an entered 5 as blank-padded after ENT while the open field shows 005 (T11, checked in the KLN 89 trainer,
    // 2026-10-08): the hundreds and tens blank once entered
    it('shows an entered ground speed of 5 KT without leading zeros (3-18, figures 3-57 to 3-60, '
        + 'checked in the KLN 89 trainer, 2026-10-08, #245)', async () => {
        const unit = await onGroundspeed();
        await unit.panel.inner('L', 1); // opens the field with the hundreds 0
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1); // 0
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 6); // 5
        await unit.panel.ent();

        expect(Screen.read().rows('L')[4].slice(0, 6)).toBe('  5 KT');
    });

    // Sibling of the #245 test above: the same knob turns commit 5 kt
    it('takes a ground speed of 5 KT (3-19)', async () => {
        const unit = await onGroundspeed();
        await unit.panel.inner('L', 1);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 6);
        await unit.panel.ent();
        await unit.panel.confirmSet1AndReselect();

        expect(unit.props.sensors.in.gps.groundspeed).toBe(5);
    });
});

describe('SpeedEditor on SET 1 (checked in the KLN 89 trainer, 2026-10-08)', () => {
    // Checked in the KLN 89 trainer, 2026-10-08: a digit cell wraps from 9 to 0 (the units of its latitude do). The
    // tens cell of the ground speed is such a cell: ten clicks after the opening 0 give 9, one more gives 0
    it('wraps a digit cell from 9 to 0 (checked in the KLN 89 trainer, 2026-10-08)', async () => {
        const unit = await onGroundspeed();
        await unit.panel.inner('L', 1); // opens the field: the hundreds cell shows a 0
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 10);
        expect(unit.panel.focused('L').text).toBe('09_');
        await unit.panel.inner('L', 1);

        expect(unit.panel.focused('L').text).toBe('00_');
    });

    // Checked in the KLN 89 trainer, 2026-10-08 (T11): the open ground speed shows its zeros (005); the first click opens
    // the field with the hundreds 0
    it('opens the field with the hundreds 0 (checked in the KLN 89 trainer, 2026-10-08, #245)', async () => {
        const unit = await onGroundspeed();
        await unit.panel.inner('L', 1);

        expect(unit.panel.focused('L').text).toBe('0__');
    });
});

describe('SpeedEditor on SET 1 (characterization)', () => {
    // The hundreds cell offers 0 to 9 and wraps: ten clicks after the opening 0 come back to it
    it('wraps the hundreds cell from 9 to 0', async () => {
        const unit = await onGroundspeed();
        await unit.panel.inner('L', 1);
        await unit.panel.inner('L', 9);
        expect(unit.panel.focused('L').text).toBe('9__');
        await unit.panel.inner('L', 1);

        expect(unit.panel.focused('L').text).toBe('0__');
    });
});

describe('SpeedEditor keyboard', () => {
    // The hundreds cell has a 0 since #245, so the keyboard can type it (the ground speed half of #109; the date,
    // runway surface and NDB frequency halves stay open, the last one pinned in NdbFreqEditor.test.ts). The open field
    // shows its zeros (T11, checked in the KLN 89 trainer, 2026-10-08)
    it('types a ground speed below 100 KT with a leading 0 (#109)', async () => {
        const unit = await onGroundspeed();
        await unit.panel.type('L', '095');

        expect(unit.panel.focused('L').text).toBe('095');
    });

    // Sibling of the test above: the keyboard reaches the field and fills the cells that follow the hundreds 0, which the inner
    // knob set and the outer knob moved past. The open field shows its zeros
    it('types the tens and units after the hundreds 0 set with the knob (characterization)', async () => {
        const unit = await onGroundspeed();
        await unit.panel.inner('L', 1); // opens the field on the hundreds 0
        await unit.panel.outer('L', 1);
        await unit.panel.type('L', '95');

        expect(unit.panel.focused('L').text).toBe('095');
    });
});

describe('SpeedEditor, the outer knob at the ends of an open edit (checked in the KLN 89 trainer, 2026-10-08, #306)', () => {
    // The trainer check was made on a latitude, a radial, the date and an FPL 0 ident; the editors share the cell
    // index, and the ground speed has three cells. Open edit: the hundreds 0, the tens and units dashed.
    it('stops at the last cell: the next inner click turns the units again', async () => {
        const unit = await onGroundspeed();
        await unit.panel.inner('L', 1);
        await unit.panel.outer('L', 2);
        await unit.panel.inner('L', 1);
        expect(Screen.read().rows('L')[4].slice(0, 3)).toBe('0_0');

        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')[4].slice(0, 3)).toBe('0_1');
    });

    it('stops at the first cell: the next inner click turns the hundreds', async () => {
        const unit = await onGroundspeed();
        await unit.panel.inner('L', 1);
        expect(Screen.read().rows('L')[4].slice(0, 3)).toBe('0__');

        await unit.panel.outer('L', -1);
        await unit.panel.inner('L', 1);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')[4].slice(0, 3)).toBe('1__');
    });
});

