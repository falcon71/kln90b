import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {collectStatusMessages} from '../../../harness/statusLine';

/**
 * BearingEditor is the heading field of SET 1 (3-18, 3-19). The host is SET 1 of a parked unit in a world without
 * magnetic variation (so the magnetic and the true track agree; the variation is the #NEW-2-1 pin in Set1Page.test.ts).
 * CONFIRM? hands the track to the GPS, which keeps it while the aircraft stands still (below 2 kt, as the harness
 * helper `moveAircraft` documents), so the next SET 1 page shows the committed value.
 */
async function onTrack(): Promise<HeadlessUnit> {
    const unit = await bootUnit({position: {lat: 47.5, lon: 11.25}});
    await settle(unit);
    await unit.panel.selectPage('L', 'SET 1');
    await unit.panel.cursor('L'); // on WPT (3-18)
    await unit.panel.outer('L', 4); // latitude, longitude, ground speed, track
    expect(unit.panel.focused('L')).toEqual({row: 4, col: 7, text: '000'}); // precondition: the cursor is on the track
    return unit;
}

/** CONFIRM?, then SET 2 and back to SET 1: the page reads the GPS again */
async function confirmAndReselect(unit: HeadlessUnit): Promise<void> {
    await unit.panel.cursorTo('L', 'CONFIRM?');
    await unit.panel.ent();
    await unit.panel.selectPage('L', 'SET 2');
    await unit.panel.selectPage('L', 'SET 1');
}

describe('BearingEditor on SET 1 (3-19)', () => {
    // 3-19 (and 5-46): a heading may be entered on SET 1 instead of the one offered. The first click opens the field
    // with a 0 in the hundreds cell; a digit cell starts at 0 on its first click. 135°
    it('takes a heading selected with the knobs (3-19)', async () => {
        const unit = await onTrack();
        await unit.panel.inner('L', 1); // opens the field: 0__
        await unit.panel.inner('L', 1); // 1
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 4); // 3
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 6); // 5
        await unit.panel.ent();
        await confirmAndReselect(unit);

        expect(unit.errors).toEqual([]);
        expect(unit.props.sensors.in.gps.trackTrue).toBe(135);
        expect(Screen.read().rows('L')[4].slice(7)).toBe('135°');
    });
});

describe('BearingEditor on SET 1 (checked in the KLN 89 trainer, 2026-10-08)', () => {
    // Checked in the KLN 89 trainer, 2026-10-08: a digit cell wraps from 9 to 0 (the units of its latitude do). The
    // tens cell of the heading is such a cell: ten clicks after the opening 0 give 9, one more gives 0
    it('wraps a digit cell from 9 to 0 (checked in the KLN 89 trainer, 2026-10-08)', async () => {
        const unit = await onTrack();
        await unit.panel.inner('L', 1); // opens the field: 0__
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 10);
        expect(unit.panel.focused('L').text).toBe('09_');
        await unit.panel.inner('L', 1);

        expect(unit.panel.focused('L').text).toBe('00_');
    });
});

describe('BearingEditor on SET 1 (characterization)', () => {
    // A heading is below 360: convertToValue refuses 360 with INVALID ENT
    it('refuses 360 with INVALID ENT', async () => {
        const unit = await onTrack();
        const messages = collectStatusMessages(unit);
        await unit.panel.type('L', '360');
        await unit.panel.ent();

        expect(messages).toEqual(['INVALID ENT']);
    });

    // Sibling: 359 is taken
    it('takes 359', async () => {
        const unit = await onTrack();
        const messages = collectStatusMessages(unit);
        await unit.panel.type('L', '359');
        await unit.panel.ent();
        await confirmAndReselect(unit);

        expect(messages).toEqual([]);
        expect(unit.props.sensors.in.gps.trackTrue).toBe(359);
    });

    // The hundreds cell offers 0 to 3 and wraps: three clicks after the opening 0 give 3, one more gives 0
    it('wraps the hundreds cell from 3 to 0', async () => {
        const unit = await onTrack();
        await unit.panel.inner('L', 1);
        await unit.panel.inner('L', 3);
        expect(unit.panel.focused('L').text).toBe('3__');
        await unit.panel.inner('L', 1);

        expect(unit.panel.focused('L').text).toBe('0__');
    });
});
