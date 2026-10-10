import {describe, expect, it, vi} from 'vitest';
import {BootOptions, bootToSelfTest, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {recordSounds} from '../../../harness/sounds';
import {AIRDATA, ALTITUDE_ALERT, NO_ALTIMETER, panelXml} from '../../../harness/panelXml';

// This is the snapshot of the page as the unit shows it after a cold boot: the clock's start date (not October, #112)
// and the cursor on the first two digits of the baro. The altitude row (row 3) is left out of the snapshot and of its
// mask: how it is formatted is open, so the tests of the row below parse the number
describe('self-test right page (characterization)', () => {
    const withoutAltitudeRow = (rows: string[]) => rows.filter((_, i) => i !== 3);

    it('shows the date, time, baro and APPROVE? without the altitude row (characterization)', async () => {
        const unit = await bootToSelfTest({magvar: 0});

        const s = Screen.read();
        expect([...withoutAltitudeRow(s.rows('R')), '', ...withoutAltitudeRow(s.maskRows('R'))].join('\n')).toMatchInlineSnapshot(`
          "DATE/TIME  
            01 JUN 26
          12:00:19UTC
          BARO:29.92"
            APPROVE? 

          ...........
          ...........
          ...........
          .....II....
          ..........."
        `);
        expect(s.status().right).toBe('CRSR');
        expect(unit.errors).toEqual([]);
    });
});

/** The self-test page of a cold boot */
function onSelfTestPage(opts: BootOptions = {}) {
    return bootToSelfTest({magvar: 0, ...opts});
}

/** The altitude of the ALT row as a number, whatever the padding of its five cells (the padding is a question) */
function altitudeShown(): number {
    const m = /^ALT\s*(-?\d+)ft$/i.exec(Screen.read().rows('R')[3]);
    if (m === null) throw new Error(`no altitude in the ALT row\n${Screen.read().dump()}`);
    return Number(m[1]);
}

/**
 * Turns the right outer knob counterclockwise until the field showing `text` has the cursor. The date, time and time
 * zone lie before the cursor's start, so the entry tests do not depend on where it starts (that is the cursor tests'
 * subject) nor on a wrap from APPROVE? to the date (#218)
 */
async function backTo(unit: HeadlessUnit, text: string) {
    for (let i = 0; unit.panel.focused('R').text !== text; i++) {
        if (i >= 7) throw new Error(`backTo: no field "${text}"\n${Screen.read().dump()}`);
        await unit.panel.outer('R', -1);
    }
}

/** The storage of a unit that acquires slowly, so that the GPS supplies no time while the self-test page shows */
const NO_FIX_YET = {fastGpsAcquisition: false};

describe('self-test right page cursor (spec)', () => {
    // 3-6 step 8 and figure 3-18: the cursor stands over the first two digits of the baro field
    it('starts the cursor on the first two baro digits (3-6)', async () => {
        const unit = await onSelfTestPage();

        expect(unit.panel.focused('R')).toEqual({row: 4, col: 17, text: '29'});
        expect(Screen.read().status().right).toBe('CRSR');
    });

    // 3-5 step 6: counterclockwise from the baro the cursor reaches the whole date field. 3-5 step 7 and 3-6: the time
    // zone follows the time field, which covers the hours and the minutes only (the seconds cannot be entered)
    it('steps back from the baro over the time zone and the time to the date (3-5, 3-6)', async () => {
        const unit = await onSelfTestPage();
        await unit.panel.cursorTo('R', '29'); // the walk starts on the baro, wherever the cursor started

        const fields = [];
        for (let i = 0; i < 3; i++) {
            await unit.panel.outer('R', -1);
            fields.push(unit.panel.focused('R'));
        }

        expect(fields).toEqual([
            {row: 2, col: 20, text: 'UTC'},
            {row: 2, col: 12, text: '12:00'},
            {row: 1, col: 14, text: '01 JUN 26'},
        ]);
    });

    // 3-7 step 9: the baro has three cursor positions, the first two digits, the third and the fourth; 3-7 step 11:
    // clockwise past them is APPROVE?
    it('steps forward over the three baro positions to APPROVE? (3-7)', async () => {
        const unit = await onSelfTestPage();
        await unit.panel.cursorTo('R', '29'); // the walk starts on the baro, wherever the cursor started

        const fields = [];
        for (let i = 0; i < 3; i++) {
            await unit.panel.outer('R', 1);
            fields.push(unit.panel.focused('R'));
        }

        expect(fields).toEqual([
            {row: 4, col: 20, text: '9'},
            {row: 4, col: 21, text: '2'},
            {row: 5, col: 14, text: 'APPROVE?'},
        ]);
    });
});

/** Enters 16:27 into the time field: the first inner click opens the entry on hour 00, the next ones count up */
async function enterTime1627(unit: HeadlessUnit) {
    await backTo(unit, '12:00');

    await unit.panel.inner('R', 17); // 00 to 16
    await unit.panel.outer('R', 1);
    await unit.panel.inner('R', 3); // the first click gives 0, the third 2
    await unit.panel.outer('R', 1);
    await unit.panel.inner('R', 8); // 7 after the first click
}

describe('self-test right page entries (spec)', () => {
    // 3-5 step 7 and its list: CST is UTC - 6, seven zones after UTC. The sim clock starts at 12:00:00 UTC
    // (DEFAULT_START)
    it('shows the time in the time zone selected with the inner knob (3-5)', async () => {
        const unit = await onSelfTestPage();
        await backTo(unit, 'UTC');

        await unit.panel.inner('R', 7);

        const row = Screen.read().rows('R')[2];
        expect(row.slice(0, 5)).toBe('06:00');
        expect(row.slice(8)).toBe('CST');
    });

    // 3-5 step 6: day, month and the two digits of the year are entered with the right knobs, then ENT
    it('takes a date entered before the GPS supplies one (3-5)', async () => {
        const unit = await onSelfTestPage({storage: NO_FIX_YET});
        await backTo(unit, '01 JUN 26');

        await unit.panel.enterDate('R', 3, 8, [2, 5]); // 03 AUG 25
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.props.sensors.in.gps.isValid()).toBe(false); // Precondition: no satellite time has replaced it
        expect(Screen.read().rows('R')[1]).toBe('  03 AUG 25');
    });

    // 3-5 and 3-6, step 7: hours and minutes are entered, ENT starts the clock from the entered time
    it('runs the clock from a time entered before the GPS supplies one (3-5, 3-6)', async () => {
        const unit = await onSelfTestPage({storage: NO_FIX_YET});
        await enterTime1627(unit);
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().rows('R')[2].slice(0, 5)).toBe('16:27');

        await vi.advanceTimersByTimeAsync(60_000); // one minute of the entered clock

        expect(unit.props.sensors.in.gps.isValid()).toBe(false); // Precondition: no satellite time has replaced it
        expect(Screen.read().rows('R')[2].slice(0, 5)).toBe('16:28');
    });

    // 3-6 and 3-7, steps 8 to 10, figures 3-18 to 3-21: with 29.92 the encoder's 1100 ft shows as ALT 1100; 30.02
    // entered, the ALT row shows 1200. Independently: the ISA altimeter setting correction for 30.02 against 29.92 inHg
    // is 145442 * (1 - (29.92 / 30.02) ^ 0.190263) = 92 ft, and 1192 ft shows as 1200
    it('shows the altitude corrected by the baro entered (3-6, 3-7, figures 3-18 to 3-21)', async () => {
        const unit = await onSelfTestPage({altitudeFt: 1100});
        expect(altitudeShown()).toBe(1100);
        await unit.panel.cursorTo('R', '29');

        await unit.panel.inner('R', 1); // 29 to 30: 30.92
        await unit.panel.outer('R', 1);
        await unit.panel.inner('R', -9); // 9 to 0: 30.02
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(2000);

        expect(Screen.read().rows('R')[4]).toBe('BARO:30.02"');
        expect(altitudeShown()).toBe(1200);
    });

    // The figures show the altitude in steps of 100 ft. The same formula: 29.97 gives 145442 * (1 - (29.92 / 29.97) ^
    // 0.190263) = 46 ft, so 1146 ft shows as 1100 (50 ft steps would give 1150); 30.07 gives 138 ft, so 1238 ft shows
    // as 1200 (50 ft steps would give 1250)
    it('rounds the corrected altitude to 100 ft: 29.97 gives 1100, 30.07 gives 1200 (3-6, 3-7, figures 3-18 to 3-21)',
        async () => {
            const unit = await onSelfTestPage({altitudeFt: 1100});
            await unit.panel.cursorTo('R', '29');
            await unit.panel.outer('R', 2); // the fourth digit
            await unit.panel.inner('R', 5); // 2 to 7: 29.97
            await unit.panel.ent();
            await vi.advanceTimersByTimeAsync(2000);
            expect(Screen.read().rows('R')[4]).toBe('BARO:29.97"'); // Precondition: the baro is in effect
            const at2997 = altitudeShown();

            await unit.panel.cursorTo('R', '29');
            await unit.panel.inner('R', 1); // 29 to 30: 30.97
            await unit.panel.outer('R', 1);
            await unit.panel.inner('R', -9); // 9 to 0: 30.07
            await unit.panel.ent();
            await vi.advanceTimersByTimeAsync(2000);
            expect(Screen.read().rows('R')[4]).toBe('BARO:30.07"'); // Precondition: the baro is in effect

            expect([at2997, altitudeShown()]).toEqual([1100, 1200]);
        });
});

/**
 * Advances in 50 ms steps until the unit's clock has stepped to its next second. It steps once per calculation tick, so
 * the next step is then a second away, and the 250 ms of the next key press (one display tick) hold none. Reads the
 * clock only to find that moment
 */
async function untilClockSteps(unit: HeadlessUnit) {
    const seconds = () => unit.props.sensors.in.gps.timeZulu.getSeconds();
    const before = seconds();
    for (let i = 0; seconds() === before; i++) {
        if (i >= 40) throw new Error('untilClockSteps: the clock did not step within 2 s');
        await vi.advanceTimersByTimeAsync(50);
    }
}

describe('self-test right page time entry (spec)', () => {
    // 3-6: ENT starts the clock from the entered hours and minutes, and the seconds cannot be entered. The 90B guide
    // leaves the value of the seconds at ENT open, so the KLN 89 trainer decides (checked in the KLN 89 trainer,
    // 2026-10-09, T11): after ENT the entered value started at hh:mm:00 and rolled over to the next minute a minute
    // later, the time in the entry not added. The seconds are their own cells of the time row, `12:00:19UTC`: columns
    // 6 and 7 of the right half. The unit has no GPS time yet, so that its own clock is the time shown; the ENT is
    // pressed just after the clock steps, so that the seconds are read before the next step, which would show 01
    it.fails('starts the clock with the seconds at zero when the time is entered '
        + '(3-6; checked in the KLN 89 trainer, 2026-10-09, T11) (#331)', async () => {
        const unit = await onSelfTestPage({storage: NO_FIX_YET});
        await enterTime1627(unit);
        await untilClockSteps(unit);
        expect(unit.props.sensors.in.gps.isValid()).toBe(false); // Precondition: no satellite time has replaced it

        await unit.panel.ent();

        expect(Screen.read().rows('R')[2].slice(6, 8)).toBe('00');
    });
});

const AIR_DATA_BARO_XML = panelXml({...AIRDATA, 'Input.Airdata.BaroSource': 1});
const ALTIMETER_AT_30_12 = [{name: 'KOHLSMAN SETTING HG:1', unit: 'inches of mercury', value: 30.12}];

describe('self-test right page with an air data baro (spec)', () => {
    // 3-6 (note): with an air data or altimeter system that sends the baro setting, the baro field is no cursor field
    it('leaves the baro out of the cursor fields (3-6)', async () => {
        const unit = await onSelfTestPage({panelXml: AIR_DATA_BARO_XML, simVars: ALTIMETER_AT_30_12});

        const texts = new Set([unit.panel.focused('R').text]);
        for (let i = 0; i < 6; i++) {
            await unit.panel.outer('R', 1);
            texts.add(unit.panel.focused('R').text);
        }

        expect(texts).toEqual(new Set(['01 JUN 26', '12:00', 'UTC', 'APPROVE?']));
    });

    // 3-6 (note): the system updates the baro field when the altimeter's setting changes
    it('shows the altimeter setting and follows it (3-6)', async () => {
        const unit = await onSelfTestPage({panelXml: AIR_DATA_BARO_XML, simVars: ALTIMETER_AT_30_12});
        expect(Screen.read().rows('R')[4]).toBe('BARO:30.12"');

        unit.env.sim.set('KOHLSMAN SETTING HG:1', 'inches of mercury', 29.85);
        await vi.advanceTimersByTimeAsync(2000);

        expect(Screen.read().rows('R')[4]).toBe('BARO:29.85"');
    });
});

const NO_ALTITUDE_ALERT_XML = panelXml(ALTITUDE_ALERT(false));

describe('approving the self-test page (spec)', () => {
    // 3-7 step 11 and Installation Manual 2-69: five beeps on the alert audio when the self-test page is approved. The
    // tones are requested one at a time on the bus (AudioGenerator.test.ts); kln_short_beep is the id the aircraft
    // declares (public contract). The recorder reports the end of each tone as the sim does
    it('plays five short beeps (3-7)', async () => {
        const unit = await onSelfTestPage();
        const sounds = recordSounds(unit);
        await unit.panel.cursorTo('R', 'APPROVE?');
        expect(sounds.ids).toEqual([]);

        await unit.panel.ent();
        sounds.finishAll();

        expect(sounds.ids).toEqual(Array(5).fill('kln_short_beep'));
    });

    // 3-7 step 11: the beeps are heard only where the alert audio is used in the installation
    it('plays no beep without the altitude alert output (3-7)', async () => {
        const unit = await onSelfTestPage({panelXml: NO_ALTITUDE_ALERT_XML});
        const sounds = recordSounds(unit);
        await unit.panel.cursorTo('R', 'APPROVE?');

        await unit.panel.ent();
        sounds.finishAll();

        // Precondition: the page was approved
        expect(Screen.read().rows('R').map(r => r.trim())).not.toContain('APPROVE?');
        expect(sounds.ids).toEqual([]);
    });
});

const NO_ALTIMETER_XML = panelXml(NO_ALTIMETER);

describe('self-test right page altitude (characterization)', () => {
    it('shows dashes for the altitude without an altitude input (characterization)', async () => {
        await onSelfTestPage({panelXml: NO_ALTIMETER_XML});

        expect(Screen.read().rows('R')[3].slice(0, 9)).toBe('ALT -----');
    });
});
