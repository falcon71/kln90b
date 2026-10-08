import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {savedUserWaypoints, storedSetting} from '../../../harness/storage';

/**
 * ElevationEditor is the ELV field of APT 2 of a user airport, and its subclass RunwayLengthEditor the runway length of
 * APT 3 of a user airport (5-17 steps 9 and 10). The host is UAPT, a stored user airport without an elevation or a
 * runway; its ident sorts before the default airport, so the APT pages open on it. The committed value is the saved
 * user waypoint (V2 format, docs/architecture.md Core 7): after the type, the region, eight blanks, the ident padded to
 * eight, the latitude (+4700.00) and the longitude (+00800.00) come the elevation in meters (columns 36 to 41) and the
 * runway length in feet (42 to 47).
 */
async function onApt(page: 'APT 2' | 'APT 3'): Promise<HeadlessUnit> {
    const unit = await bootUnit({storage: savedUserWaypoints([{kind: 'apt', ident: 'UAPT', lat: 47.0, lon: 8.0}])});
    await unit.panel.selectPage('R', page);
    expect(Screen.read().rows('R')[0]).toBe(' UAPT      '); // precondition: the page shows UAPT
    await unit.panel.cursor('R');
    await unit.panel.cursorTo('R', '_____');
    return unit;
}

/** With the cursor on a five-digit field: 01250 selected with the knobs and entered */
async function select01250(unit: HeadlessUnit): Promise<void> {
    await unit.panel.inner('R', 1); // opens the field: 0____
    await unit.panel.outer('R', 1);
    await unit.panel.inner('R', 2); // 1
    await unit.panel.outer('R', 1);
    await unit.panel.inner('R', 3); // 2
    await unit.panel.outer('R', 1);
    await unit.panel.inner('R', 6); // 5
    await unit.panel.outer('R', 1);
    await unit.panel.inner('R', 1); // 0
    await unit.panel.ent();
}

/** The saved string of UAPT, a moment after the change (the unit saves with a delay) */
async function saved(unit: HeadlessUnit): Promise<string> {
    await vi.advanceTimersByTimeAsync(1000);
    return storedSetting(unit, 'wpt0') as string;
}

describe('ElevationEditor on APT 2 of a user airport (5-17)', () => {
    // 5-17 step 9, figures 5-59 and 5-60: the elevation is selected digit by digit and stored with ENT; the page shows
    // it with its leading zero (ELV 01250ft). 1250 ft are 381 m (1250 x 0.3048 = 381.0)
    it('takes an elevation selected with the knobs (5-17, figure 5-60)', async () => {
        const unit = await onApt('APT 2');
        await select01250(unit);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('R')[3]).toBe('ELV 01250ft');
        expect((await saved(unit)).slice(36, 42)).toBe('+00381');
    });

    // Figure 5-60: a stored elevation shows in the closed field with its leading zero. The save format holds 1250 ft as
    // 381 m, which APT 2 shows rounded to 10 ft (3-43) as 1250 again
    it('shows a stored elevation with its leading zero (5-17, figure 5-60)', async () => {
        const unit = await bootUnit({
            storage: savedUserWaypoints([{kind: 'apt', ident: 'UAPT', lat: 47.0, lon: 8.0, elevationFt: 1250}]),
        });
        await unit.panel.selectPage('R', 'APT 2');

        expect(Screen.read().rows('R').slice(0, 4))
            .toEqual([' UAPT      ', '           ', '           ', 'ELV 01250ft']);
    });

    // Figure 5-60: each of the five cells of a stored elevation holds its own digit. 12350 ft are 3764 m (3764.28),
    // which APT 2 shows rounded to 10 ft (3-43) as 12350 again; no digit of it equals the one beside it
    it('shows each digit of a stored elevation in its own cell (5-17, figure 5-60)', async () => {
        const unit = await bootUnit({
            storage: savedUserWaypoints([{kind: 'apt', ident: 'UAPT', lat: 47.0, lon: 8.0, elevationFt: 12350}]),
        });
        await unit.panel.selectPage('R', 'APT 2');

        expect(Screen.read().rows('R')[3]).toBe('ELV 12350ft');
    });
});

describe('ElevationEditor on APT 2 of a user airport (checked in the KLN 89 trainer, 2026-10-08)', () => {
    // Checked in the KLN 89 trainer, 2026-10-08: a digit cell wraps from 9 to 0 (the units of its latitude do). The
    // first cell of the elevation offers 0 to 9: ten clicks after the opening 0 come back to it
    it('wraps a digit cell from 9 to 0 (checked in the KLN 89 trainer, 2026-10-08)', async () => {
        const unit = await onApt('APT 2');
        await unit.panel.inner('R', 1); // opens the field with 0
        await unit.panel.inner('R', 9);
        expect(unit.panel.focused('R').text).toBe('9____');
        await unit.panel.inner('R', 1);

        expect(unit.panel.focused('R').text).toBe('0____');
    });
});

describe('RunwayLengthEditor on APT 3 of a user airport (5-17)', () => {
    // 5-17 step 10, figures 5-61 and 5-62: the runway length is selected digit by digit and approved with ENT, which
    // moves the cursor to the surface; the page shows the length with its leading zero (02300' in figure 5-62; 01250
    // here). The format saves the length in feet
    it('takes a runway length selected with the knobs (5-17, figure 5-62)', async () => {
        const unit = await onApt('APT 3');
        await select01250(unit);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('R')[3].slice(0, 7)).toBe(" 01250'");
        expect(unit.panel.focused('R').text).toBe('___'); // the surface
        expect((await saved(unit)).slice(42, 48)).toBe('+01250');
    });
});
