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

/** CONFIRM?, then SET 2 and back to SET 1: the page reads the GPS again */
async function confirmAndReselect(unit: HeadlessUnit): Promise<void> {
    await unit.panel.cursorTo('L', 'CONFIRM?');
    await unit.panel.ent();
    await unit.panel.selectPage('L', 'SET 2');
    await unit.panel.selectPage('L', 'SET 1');
}

/** With the cursor on the ground speed: 120 kt selected with the knobs and entered */
async function select120(unit: HeadlessUnit): Promise<void> {
    await unit.panel.inner('L', 1); // opens the field: the hundreds cell blank, the others dashed
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
        await confirmAndReselect(unit);

        expect(unit.errors).toEqual([]);
        expect(unit.props.sensors.in.gps.groundspeed).toBe(120);
        expect(Screen.read().rows('L')[4].slice(0, 6)).toBe('120 KT');
    });

    // Figures 3-57 to 3-60 show the ground speed with its leading zeros suppressed (0 KT), and the KLN 89 trainer shows
    // an entered 5 as blank-padded after ENT (checked in the KLN 89 trainer, 2026-10-08); the tens digit of SpeedEditor
    // is a plain digit, so 5 kt shows 05 after ENT
    it.fails('shows an entered ground speed of 5 KT without leading zeros (3-18, figures 3-57 to 3-60, '
        + 'checked in the KLN 89 trainer, 2026-10-08, #245)', async () => {
        const unit = await onGroundspeed();
        await unit.panel.inner('L', 1); // opens the field with the blank
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1); // 0
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 6); // 5
        await unit.panel.ent();

        expect(Screen.read().rows('L')[4].slice(0, 6)).toBe('  5 KT');
    });

    // Sibling of the #245 pin: the same knob turns commit 5 kt
    it('takes a ground speed of 5 KT (3-19)', async () => {
        const unit = await onGroundspeed();
        await unit.panel.inner('L', 1);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 6);
        await unit.panel.ent();
        await confirmAndReselect(unit);

        expect(unit.props.sensors.in.gps.groundspeed).toBe(5);
    });
});

describe('SpeedEditor on SET 1 (checked in the KLN 89 trainer, 2026-10-08)', () => {
    // Checked in the KLN 89 trainer, 2026-10-08: a cell wraps past its last choice (the 89's ground speed is one block
    // of 1 kt steps; the 90B's own cell layout is the code's). The hundreds cell offers a blank and 1 to 9: ten clicks
    // after the opening blank come back to it
    it('wraps the hundreds cell from 9 to the blank (checked in the KLN 89 trainer, 2026-10-08)', async () => {
        const unit = await onGroundspeed();
        await unit.panel.inner('L', 1);
        await unit.panel.inner('L', 9);
        expect(unit.panel.focused('L').text).toBe('9__');
        await unit.panel.inner('L', 1);

        expect(unit.panel.focused('L').text).toBe(' __');
    });
});

describe('SpeedEditor keyboard', () => {
    // #109's suggested fix maps a typed 0 to the blank of a cell whose charset has a blank instead of a 0 (the keyboard
    // is the project's own feature, so the expectation is that issue's). Today the 0 is refused and the cursor stays on
    // the hundreds cell, where the 9 lands
    it.fails('types a ground speed below 100 KT with a leading 0 (#109)', async () => {
        const unit = await onGroundspeed();
        await unit.panel.type('L', '095');

        expect(unit.panel.focused('L').text).toBe(' 95');
    });

    // Sibling of the pin: the keyboard reaches the field and fills the cells that follow a blank hundreds cell. A pilot
    // cannot type that blank (the PC keyboard sends A to Z and 0 to 9, KLN90BCore.handleKeyboardEvent), so the inner
    // knob sets it and the outer knob moves on
    it('types the tens and units after a blank hundreds cell set with the knob (characterization)', async () => {
        const unit = await onGroundspeed();
        await unit.panel.inner('L', 1); // opens the field on the blank
        await unit.panel.outer('L', 1);
        await unit.panel.type('L', '95');

        expect(unit.panel.focused('L').text).toBe(' 95');
    });
});
