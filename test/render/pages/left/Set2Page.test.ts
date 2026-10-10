import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../../harness/boot';
import {messageLines, messages} from '../../../harness/readers';
import {Screen} from '../../../harness/render/screen';
import {storedSetting} from '../../../harness/storage';

describe('SET 2 page', () => {
    // 3-53, 5-14: the figures of SET 2 and CAL 6 show the first zone as CORD UNIV/Z. The half page is 11 characters
    // wide, and the name of the first timezone has 12
    it('fits the screen with the default timezone (#110)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 2');

        expect(Screen.read().rows('L')[4]).toBe('CORD UNIV/Z');
    });

    // Appendix B (B-1, B-3) lists the message as RECYCLE POWER TO USE CORRECT DATA BASE DATA
    it.fails('spells the message about a changed database validity correctly (#111)', async () => {
        // A booted unit has a fix at once, and the date is read-only with a fix
        const unit = await bootUnit({storage: {fastGpsAcquisition: false}, coldGps: true});
        await unit.panel.selectPage('L', 'SET 2');
        await unit.panel.cursor('L');
        await unit.panel.enterDate('L', 1, 1, [2, 7]); // 01 JAN 27
        expect(Screen.read().rows('L')[2]).toBe('  01 JAN 27');
        await unit.panel.ent(); // 1 Jan 2027 is after the expiration of the database

        expect(unit.errors).toEqual([]);
        expect(unit.props.database.isAiracCurrent()).toBe(false);
        expect(messageLines(unit)).toContainEqual(['RECYCLE POWER TO USE', 'CORRECT DATA BASE DATA']);
    });
});

/** The mask of the left half page's rows 2 and 3: the date, and the time with its zone */
const dateTimeMask = () => Screen.read().maskRows('L').slice(2, 4);

const ON_DATE = ['..IIIIIIIII', '...........'];
const ON_TIME = ['...........', 'IIIII......'];
const ON_ZONE = ['...........', '........III'];

// 3-53: the date and time cannot be set while the unit receives them from a satellite. SET 2 makes both read-only at the
// first fix, which leaves the time zone as the only field (the magnetic variation is read-only while it is valid, 5-44).
describe('SET 2 cursor when the GPS gets its first fix (3-53)', () => {
    // Holds the setup of the pins below: a cold unit lets the cursor on the date and the time, and after the fix a SET 2
    // page built anew puts it on the time zone
    it('moves the cursor over the date and the time without a fix, and only the time zone is left after it', async () => {
        const unit = await bootUnit({coldGps: true});
        await unit.panel.selectPage('L', 'SET 2');
        await unit.panel.cursor('L');
        expect(dateTimeMask()).toEqual(ON_DATE);
        await unit.panel.outer('L', 1);
        expect(dateTimeMask()).toEqual(ON_TIME);
        await unit.panel.cursor('L');

        await settle(unit);
        await unit.panel.selectPage('L', 'SET 1');
        await unit.panel.selectPage('L', 'SET 2');
        await unit.panel.cursor('L');

        expect(unit.errors).toEqual([]);
        expect(dateTimeMask()).toEqual(ON_ZONE);
    });

    // CursorController.setCursorActive clamps the remembered field to fields.length instead of fields.length - 1
    // (CursorController.ts:123), so the cursor comes on at a field that is gone and throws
    it.fails('turns the cursor on at the time zone when it was on the time before the fix (#217)', async () => {
        const unit = await bootUnit({coldGps: true});
        await unit.panel.selectPage('L', 'SET 2');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 1);
        await unit.panel.cursor('L');
        await settle(unit);

        await unit.panel.cursor('L');

        expect(unit.errors).toEqual([]);
        expect(dateTimeMask()).toEqual(ON_ZONE);
    });

    // Nothing moves the cursor when the focused field turns read-only under it, so every display tick asks a field that is
    // gone whether it takes ENT, and throws
    it.fails('stays usable when the fix comes while the cursor is on the time (#217)', async () => {
        const unit = await bootUnit({coldGps: true});
        await unit.panel.selectPage('L', 'SET 2');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 1);

        await settle(unit);
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.errors).toEqual([]);
    });
});

const MAGVAR_INVALID = 'MAGNETIC VAR INVALID ALL DATA REFERENCED TO TRUE NORTH';

/** At N 74.5, tracking 090 true, with 10 W entered on SET 2 line 6 and the cursor left where ENT puts it */
async function tenWestOutside(): Promise<HeadlessUnit> {
    const unit = await bootUnit({position: {lat: 74.5, lon: 8.0}, magvar: 10});
    await settle(unit);
    await moveAircraft(unit, {lat: 74.5, lon: 8.0}, {groundspeedKt: 120, trackTrue: 90});
    expect(messages(unit)).toContain(MAGVAR_INVALID); // The precondition: no variation yet
    await unit.panel.selectPage('L', 'SET 2');
    await unit.panel.cursor('L'); // the time zone: the date and the time are read-only with a fix
    await unit.panel.outer('L', 1); // line 6
    await unit.panel.inner('L', 2); // the first click enters a blank tens digit, so this is a 1
    await unit.panel.outer('L', 1);
    await unit.panel.inner('L', 1); // a 0
    await unit.panel.outer('L', 1);
    await unit.panel.inner('L', 2); // E, then W
    await unit.panel.ent();
    return unit;
}

// 5-44: outside the primary coverage area (N 74 to S 60) line 6 of SET 2 takes a pilot-entered magnetic variation,
// and the navigation data is referenced to it; inside the area line 6 is not shown (figure 5-133)
describe('SET 2 magnetic variation (5-44)', () => {
    it('shows no variation line inside the area, and the cursor stays on the time zone (5-44)', async () => {
        const unit = await bootUnit();
        await settle(unit);
        await unit.panel.selectPage('L', 'SET 2');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 1);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')[5]).toBe('           ');
        expect(unit.panel.focused('L')).toEqual({row: 3, col: 8, text: 'UTC'});
    });

    // Figure 5-134 shows the entered variation on line 6, which is too inexact to read a column off: the row is held
    // up to the blanks between the label and the value, and the characterization below holds the exact row. With 10 W,
    // a true track of 090 is a magnetic track of 100 (magnetic = true + west variation), and MAGNETIC VAR INVALID goes
    // away (B-2: it shows only without a pilot-entered variation).
    it('takes a variation entered with the knobs outside the area (5-44, B-2)', async () => {
        const unit = await tenWestOutside();
        expect(Screen.read().rows('L')[5]).toMatch(/^MAG V\s+10°W$/);
        await unit.panel.cursor('L');

        await unit.panel.selectPage('L', 'NAV 3');
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')[2]).toBe('TK     100°');
        expect(messages(unit)).not.toContain(MAGVAR_INVALID);
    });

    // The sibling of the pin below: back inside the area with the cursor off, line 6 is gone again (figure 5-133)
    it('hides the variation line again back inside the area (5-44)', async () => {
        const unit = await tenWestOutside();
        await unit.panel.cursor('L');
        await moveAircraft(unit, {lat: 73.5, lon: 8.0}, {groundspeedKt: 120, trackTrue: 180});
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().status().left).toBe('SET 2');
        expect(Screen.read().rows('L')[5]).toBe('           ');
    });

    // The same cause as the #217 pins of the first-fix describe above, on another field: nothing moves the cursor off
    // line 6 when it turns read-only inside the area, so every display tick asks a field that is gone whether it takes
    // ENT, and throws
    it.fails('stays usable when the aircraft enters the area with the cursor on line 6 (5-44, #217)', async () => {
        const unit = await tenWestOutside();
        await unit.panel.outer('L', 1); // ENT moved the cursor to the time zone; back to line 6
        expect(unit.panel.focused('L')).toEqual({row: 5, col: 7, text: '10°W'});
        await moveAircraft(unit, {lat: 73.5, lon: 8.0}, {groundspeedKt: 120, trackTrue: 180});
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.errors).toEqual([]);
    });
});

describe('SET 2 magnetic variation line (characterization)', () => {
    it('shows the variation as MAG V  10°W', async () => {
        const unit = await tenWestOutside();

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')[5]).toBe('MAG V  10°W');
    });
});

// 3-54, figures 3-169 to 3-174: SET 2 shows the time in the selected time zone, with the zone's name on line 5. The
// zone is the persisted setting `timezone`, an index into the list of 3-5 (CLAUDE.md "Public contract with aircraft":
// setting keys and their values are never repurposed).
describe('SET 2 time zone (3-5, 3-54)', () => {
    /** Hours and minutes, and the zone, of the time row */
    const timeRow = () => {
        const row = Screen.read().rows('L')[3];
        return `${row.slice(0, 5)} ${row.slice(8, 11)}`;
    };

    // The fake clock starts at 12:00:00 UTC (DEFAULT_START), and the test reads the time within the first minute.
    // Figure 3-170: switching to CDT shows the time five hours earlier and the name CENTRAL DAY.
    it('shows the time in Central Daylight Time, five hours behind UTC (3-54)', async () => {
        const unit = await bootUnit();
        await settle(unit);
        await unit.panel.selectPage('L', 'SET 2');
        expect(timeRow()).toBe('12:00 UTC');
        await unit.panel.cursor('L'); // the time zone: the date and the time are read-only with a fix

        await unit.panel.inner('L', 8);

        expect(timeRow()).toBe('07:00 CDT');
        expect(Screen.read().rows('L')[4]).toBe('CENTRAL DAY');
        await vi.advanceTimersByTimeAsync(1000);
        expect(storedSetting(unit, 'timezone')).toBe(8);
    });

    // 3-5: the list of zones starts with UTC and ends with the Samoa daylight time, ten hours behind UTC, so one click
    // counterclockwise from UTC reaches it, and one click clockwise from it is UTC again. The sweep of the whole list
    // is left out on purpose (it would copy the table of the guide).
    it('offers UTC first, the last zone of 3-5 one click counterclockwise, and UTC again one click on (3-5)', async () => {
        const unit = await bootUnit();
        await settle(unit);
        await unit.panel.selectPage('L', 'SET 2');
        await unit.panel.cursor('L');
        expect(timeRow()).toBe('12:00 UTC');

        await unit.panel.inner('L', -1);
        expect(timeRow()).toBe('02:00 SDT');

        await unit.panel.inner('L', 1);
        expect(timeRow()).toBe('12:00 UTC');
    });

    // 3-54, figures 3-171 to 3-174: without a satellite the time can be set in the selected zone; the outer knob turned
    // counterclockwise from the zone reaches the time. 18:37 CDT is 23:37 UTC on the same day.
    it('sets the time in the selected zone (3-54)', async () => {
        const unit = await bootUnit({storage: {fastGpsAcquisition: false}, coldGps: true});
        await unit.panel.selectPage('L', 'SET 2');
        expect(unit.props.sensors.in.gps.isValid()).toBe(false);
        await unit.panel.cursor('L'); // the date
        await unit.panel.cursorTo('L', 'UTC'); // the time zone
        await unit.panel.inner('L', 8); // CDT
        await unit.panel.outer('L', -1); // the time
        await unit.panel.inner('L', 19); // the first click enters 00, so this is 18
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 4); // the first click enters a 0, so this is a 3
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 8); // a 7
        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        expect(timeRow()).toBe('18:37 CDT');
        const utc = unit.props.sensors.in.gps.timeZulu;
        expect([utc.getDate(), utc.getHours(), utc.getMinutes()]).toEqual([1, 23, 37]);
    });
});
