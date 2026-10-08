import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

// TimeFieldset: a time of day as the hour (00 to 23, one cell of two digits), the tens of the minutes (0 to 5) and the
// units of the minutes. Its only host is CAL 6 (5-14): the top time on row 1, its zone, the bottom time on row 4 and
// its zone. Both zones are UTC here (a fresh unit), so the two times are equal and the bottom one shows what the top
// one committed.

/** CAL 6 at `utc` with both zones UTC, the left cursor on the top hour */
async function onTopHour(utc: string): Promise<HeadlessUnit> {
    const unit = await bootUnit({start: new Date(utc)});
    await unit.panel.selectPage('L', 'CAL 6');
    await unit.panel.cursor('L');
    expect(unit.panel.focused('L')).toMatchObject({row: 1, col: 1});
    return unit;
}

const times = () => [Screen.read().rows('L')[1], Screen.read().rows('L')[4]];

describe('time fieldset', () => {
    // 5-14 step 5, 3-6: the hour cell steps whole hours in 24-hour time and keeps the minutes: 17:56 to 14:56; the
    // other time follows
    it('steps the hour and keeps the minutes: 17:56 to 14:56 (3-6, 5-14)', async () => {
        const unit = await onTopHour('2026-06-01T17:56:00Z');
        await unit.panel.inner('L', -3);

        expect(times()).toEqual([' 14:56 UTC ', ' 14:56 UTC ']);
    });

    // 5-14, 3-6: the tens and the units of the minutes: 17:56 to 17:23, units first so that a tens digit that
    // overwrote the units would show
    it('sets the minutes digit by digit: 17:56 to 17:23 (3-6, 5-14)', async () => {
        const unit = await onTopHour('2026-06-01T17:56:00Z');
        await unit.panel.outer('L', 2);
        await unit.panel.inner('L', -3);
        await unit.panel.outer('L', -1);
        await unit.panel.inner('L', -3);

        expect(times()).toEqual([' 17:23 UTC ', ' 17:23 UTC ']);

        // and the units keep the tens: 17:24
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1);
        expect(times()).toEqual([' 17:24 UTC ', ' 17:24 UTC ']);
    });

    // Checked in the KLN 89 trainer, 2026-10-08, T4: the tens of the minutes offer 0 to 5 (0 turned down gives 5)
    it('offers 0 to 5 in the tens of the minutes (checked in the KLN 89 trainer, 2026-10-08, T4)', async () => {
        const unit = await onTopHour('2026-06-01T17:06:00Z');
        await unit.panel.outer('L', 1);
        const seen = [unit.panel.focused('L').text];
        for (let i = 0; i < 6; i++) {
            await unit.panel.inner('L', 1);
            seen.push(unit.panel.focused('L').text);
        }
        expect(seen).toEqual(['0', '1', '2', '3', '4', '5', '0']);
    });
});

describe('time fieldset wrap', () => {
    // Checked in the KLN 89 trainer, 2026-10-08, T15 and T4: the hour of the trainer's CAL 3 alarm is one two-digit
    // position and 23 turned up one click gives 00 (T4: 00 turned down gives 23); the minutes do not change
    it('wraps the hour from 23 to 00 and keeps the minutes '
        + '(checked in the KLN 89 trainer, 2026-10-08, T15, T4)', async () => {
        const unit = await onTopHour('2026-06-01T23:41:00Z');
        await unit.panel.inner('L', 1);
        expect(times()).toEqual([' 00:41 UTC ', ' 00:41 UTC ']);
        await unit.panel.inner('L', -1);
        expect(times()).toEqual([' 23:41 UTC ', ' 23:41 UTC ']);
    });

    // Checked in the KLN 89 trainer, 2026-10-08, T4: the tens of the minutes turned down from 0 give 5 (the trainer's
    // time entry); the hour does not change
    it('wraps the tens of the minutes from 0 down to 5 (checked in the KLN 89 trainer, 2026-10-08, T4)', async () => {
        const unit = await onTopHour('2026-06-01T17:06:00Z');
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', -1);
        expect(times()).toEqual([' 17:56 UTC ', ' 17:56 UTC ']);
    });
});

describe('time fieldset (characterization)', () => {
    // The hour is one cursor position, then each digit of the minutes, then the zone: the cells the code lays out
    it('visits the hour, the tens and the units of the minutes, then the zone (characterization)', async () => {
        const unit = await onTopHour('2026-06-01T17:56:00Z');
        const seen = [unit.panel.focused('L')];
        for (let i = 0; i < 3; i++) {
            await unit.panel.outer('L', 1);
            seen.push(unit.panel.focused('L'));
        }
        expect(seen).toEqual([
            {row: 1, col: 1, text: '17'}, {row: 1, col: 4, text: '5'}, {row: 1, col: 5, text: '6'},
            {row: 1, col: 7, text: 'UTC'},
        ]);
    });
});
