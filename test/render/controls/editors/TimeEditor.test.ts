import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

/**
 * The time of SET 2 (row 3: hh:mm, the seconds and the zone), editable without a satellite (3-53, 3-54): coldGps resets
 * the GPS and starts the slow search. The clock starts at 12:00:00 UTC on 1 June 2026 and the zone is UTC, so the
 * entered time is the UTC time.
 */
async function onSet2Time(): Promise<HeadlessUnit> {
    const unit = await bootUnit({storage: {fastGpsAcquisition: false}, coldGps: true});
    await unit.panel.selectPage('L', 'SET 2');
    expect(unit.props.sensors.in.gps.isValid()).toBe(false);
    await unit.panel.cursor('L'); // the date
    await unit.panel.outer('L', 1); // the time
    expect(Screen.read().rows('L')[3].slice(0, 5)).toBe('12:00');
    return unit;
}

const hhmm = () => Screen.read().rows('L')[3].slice(0, 5);

/** The characters one cell of the time shows over n clicks of the inner knob, sorted */
async function choices(unit: HeadlessUnit, from: number, to: number, n: number): Promise<string[]> {
    const seen = new Set<string>();
    for (let i = 0; i < n; i++) {
        await unit.panel.inner('L', 1);
        seen.add(hhmm().slice(from, to));
    }
    return [...seen].sort();
}

describe('time editor (3-54)', () => {
    // 3-54, figure 3-172: the hours are selected first, and the minutes show dashes until they are selected
    it('opens on the hours with the minutes dashed (3-54)', async () => {
        const unit = await onSet2Time();

        await unit.panel.inner('L', 1);

        expect(unit.errors).toEqual([]);
        expect(hhmm()).toMatch(/^\d\d:__$/);
    });

    // 3-54 steps 6 to 9: 24-hour time, the hour, the tens of the minutes and the units selected one after the other,
    // ENT starts the clock. 23:59 is the last minute of the day; the date stays 1 June.
    it('enters 23:59, the last minute of a 24-hour day (3-54)', async () => {
        const unit = await onSet2Time();

        await unit.panel.inner('L', 24); // the first click gives 00, so the 24th is 23
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 6); // 5
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 10); // 9
        expect(hhmm()).toBe('23:59');
        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        expect(hhmm()).toBe('23:59');
        const utc = unit.props.sensors.in.gps.timeZulu;
        expect([utc.getMonth(), utc.getDate(), utc.getHours(), utc.getMinutes()]).toEqual([5, 1, 23, 59]);
    });

    // 3-54 step 7: the tens of the minutes are one of 0 to 5 (an hour has 60 minutes)
    it('offers 0 to 5 for the tens of the minutes (3-54)', async () => {
        const unit = await onSet2Time();
        await unit.panel.inner('L', 1);
        await unit.panel.outer('L', 1);

        const seen = await choices(unit, 3, 4, 8);

        expect(unit.errors).toEqual([]);
        expect(seen).toEqual(['0', '1', '2', '3', '4', '5']);
    });
});

describe('time editor, the hours wrap (checked in the KLN 89 trainer, 2026-10-08)', () => {
    // Checked in the KLN 89 trainer, 2026-10-08 (T4): the hours wrap: one click counterclockwise from
    // the 00 of the first click is 23, and one click clockwise from 23 is 00 again
    it('wraps the hours from 00 to 23 and back (checked in the KLN 89 trainer, 2026-10-08)', async () => {
        const unit = await onSet2Time();
        await unit.panel.inner('L', 1);
        expect(hhmm()).toBe('00:__');

        await unit.panel.inner('L', -1);
        expect(hhmm()).toBe('23:__');
        await unit.panel.inner('L', 1);

        expect(unit.errors).toEqual([]);
        expect(hhmm()).toBe('00:__');
    });
});

describe('time editor (characterization)', () => {
    // The minutes left dashed count as 0 at ENT
    it('enters dashed minutes as 00', async () => {
        const unit = await onSet2Time();
        await unit.panel.inner('L', 8); // 07
        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        const utc = unit.props.sensors.in.gps.timeZulu;
        expect([utc.getHours(), utc.getMinutes()]).toEqual([7, 0]);
    });
});
