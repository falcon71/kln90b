import {describe, expect, it} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {storedSetting} from '../../../harness/storage';

describe('CAL 1 page persistence (characterization)', () => {
    it('stores an edited barometer setting and shows it again (#31)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'CAL 1');
        expect(Screen.read().rows('L')[2]).toBe('BARO:00.00"');
        expect(unit.props.userSettings.getSetting('cal12Barometer').get()).toBe(0);

        // Edit 29.92 on the knobs: BARO is the second field
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 3);
        await unit.panel.inner('L', -2);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', -1);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 2);
        await unit.panel.cursor('L');

        expect(unit.errors).toEqual([]);
        expect(unit.props.userSettings.getSetting('cal12Barometer').get()).toBe(29.92);
        expect(storedSetting(unit, 'cal12Barometer')).toBe(29.92);
        expect(Screen.read().rows('L')[2]).toBe('BARO:29.92"');
    });

    it('restores the stored barometer setting at boot (#31)', async () => {
        const unit = await bootUnit({storage: {cal12Barometer: 29.92}});
        await unit.panel.selectPage('L', 'CAL 1');
        expect(Screen.read().rows('L')[2]).toBe('BARO:29.92"');
    });
});

describe('CAL 1 page (characterization)', () => {
    it('shows pressure and density altitude for 9000 ft, 29.92" and 5 C (characterization)', async () => {
        const unit = await bootUnit({storage: {cal12IndicatedAltitude: 9000, cal12Barometer: 29.92, cal1SAT: 5}});
        await unit.panel.selectPage('L', 'CAL 1');
        expect(unit.errors).toEqual([]);
        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          "  ALTITUDE 
          IND:09000ft
          BARO:29.92"
          PRS  9000ft
          TEMP: 005°C
          DEN  9900ft"
        `);
    });
});

describe('CAL 1 page (5-10)', () => {
    // 5-10, steps 3 to 5: the cursor goes over IND (to the nearest hundred feet, so three digits), then BARO, then TEMP,
    // and stops there (4-3, #218)
    it('moves the cursor over three IND digits, then BARO, then TEMP (5-10)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'CAL 1');
        await unit.panel.cursor('L');
        const rows: number[] = [];
        for (let i = 0; i < 10; i++) {
            rows.push(unit.panel.focused('L').row);
            await unit.panel.outer('L', 1);
        }
        expect(rows).toEqual([1, 1, 1, 2, 2, 2, 4, 4, 4, 4]);
    });

    // 5-10, step 5: the first digit of TEMP is 0 above zero and - below. Source of DEN: the ICAO standard atmosphere,
    // computed by hand: PRS 9001 ft at 29.92", ISA there -2.84 C, density altitude at -5 C 8743 ft, shown to 100 ft
    it('takes -5 C from the sign digit and shows DEN 8700ft at 9000 ft and 29.92" (5-10)', async () => {
        const unit = await bootUnit({storage: {cal12IndicatedAltitude: 9000, cal12Barometer: 29.92, cal1SAT: 5}});
        await unit.panel.selectPage('L', 'CAL 1');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 6);
        expect(unit.panel.focused('L')).toEqual({row: 4, col: 6, text: '0'}); // the sign digit
        await unit.panel.inner('L', -1);
        expect(Screen.read().rows('L').slice(3)).toEqual(['PRS  9000ft', 'TEMP: -05°C', 'DEN  8700ft']);
        expect(unit.props.userSettings.getSetting('cal1SAT').get()).toBe(-5);
    });

    // 5-10, the note on SET 7: with millibars selected the altimeter setting is entered in MB. Source of PRS and DEN:
    // the ICAO standard atmosphere, computed by hand: 1017 hPa is 30.032", so 8500 ft indicated is 8404 ft pressure
    // altitude, and at 6 C the density altitude is 9296 ft; both shown to 100 ft
    it('takes BARO in millibars when SET 7 selects them: 1017MB gives PRS 8400ft and DEN 9300ft (5-10)', async () => {
        const unit = await bootUnit({storage: {barounit: false, cal12IndicatedAltitude: 8500, cal12Barometer: 29.92, cal1SAT: 6}});
        await unit.panel.selectPage('L', 'CAL 1');
        expect(Screen.read().rows('L')[2]).toBe('BARO:1013MB'); // The precondition: 29.92" shown in MB
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 5);
        expect(unit.panel.focused('L')).toEqual({row: 2, col: 8, text: '3'}); // the last BARO digit
        await unit.panel.inner('L', 4);
        expect(Screen.read().rows('L').slice(2)).toEqual(['BARO:1017MB', 'PRS  8400ft', 'TEMP: 006°C', 'DEN  9300ft']);
    });
});

describe('CAL 1 barometer in millibars below 1000 (checked in the KLN 89 trainer, 2026-10-08, T16, #315)', () => {
    // The ALT page shares the fieldset (BaroFieldset.test.ts holds the cases); CAL 1 shows the blank too
    it('shows 993 MB with a blank in the first digit', async () => {
        const unit = await bootUnit({storage: {barounit: false, cal12Barometer: 29.32}});
        await unit.panel.selectPage('L', 'CAL 1');

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')[2]).toBe('BARO: 993MB');
    });
});

describe('CAL 1 temperature entered sign first', () => {
    /** 9000 ft at 29.92" with TEMP 000; the sign set to -, then the last digit to 5 */
    async function signFirst() {
        const unit = await bootUnit({storage: {cal12IndicatedAltitude: 9000, cal12Barometer: 29.92, cal1SAT: 0}});
        await unit.panel.selectPage('L', 'CAL 1');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 6);
        await unit.panel.inner('L', -1); // the sign: -
        await unit.panel.outer('L', 2);
        await unit.panel.inner('L', 5); // the last digit: 5
        return unit;
    }

    // 5-10, step 5: the sibling of the test below. The sign digit and the last digit are set, and the page shows the
    // temperature as entered
    it('shows TEMP -05 after the sign and then the last digit are set (5-10)', async () => {
        await signFirst();
        expect(Screen.read().rows('L')[4]).toBe('TEMP: -05°C');
    });

    // 5-10, step 5: the first digit makes the temperature negative. Set on 000, the minus must survive the next digit,
    // so DEN is that of -5 C (8700 ft), not that of +5 C (9900 ft). Source of 8700: as for the -5 C test above
    it('shows DEN 8700ft for -5 C entered sign first (5-10, #256)', async () => {
        const unit = await signFirst();
        expect(Screen.read().rows('L')[5]).toBe('DEN  8700ft');
        expect(unit.props.userSettings.getSetting('cal1SAT').get()).toBe(-5);
    });
});

describe('CAL 1 temperature at the ends of the field (5-10)', () => {
    /** 9000 ft at 29.92" with TEMP 000, the cursor on the sign of TEMP */
    async function onTemp() {
        const unit = await bootUnit({storage: {cal12IndicatedAltitude: 9000, cal12Barometer: 29.92, cal1SAT: 0}});
        await unit.panel.selectPage('L', 'CAL 1');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 6);
        return unit;
    }

    // 5-10, step 5: the field holds two digits, so -99 C is the lowest and 99 C the highest. Both ends are entered from
    // 000 with the sign first (the sign cell has two choices: 0 and -, so one click is the minus, two the plus again).
    it('takes -99 C entered sign first (5-10, #256)', async () => {
        const unit = await onTemp();
        await unit.panel.inner('L', 1); // the sign: -
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 9);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 9);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')[4]).toBe('TEMP: -99°C');
        expect(unit.props.userSettings.getSetting('cal1SAT').get()).toBe(-99);
    });

    it('takes 99 C entered digits first (5-10)', async () => {
        const unit = await onTemp();
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 9);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 9);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')[4]).toBe('TEMP: 099°C');
        expect(unit.props.userSettings.getSetting('cal1SAT').get()).toBe(99);
    });

    // The minus on zero changes nothing in the value: a temperature of -00 is 0 C and gives the density altitude of 0 C.
    // Source: ICAO standard atmosphere, density altitude = pressure altitude + 120 * (OAT - ISA); ISA at 9000 ft is
    // 15 - 9 * 1.98 = -2.82 C, so 120 * 2.82 = 338 ft more than the 9000 ft of pressure altitude is 9338, shown to
    // 100 ft: 9300 ft
    it('keeps the density altitude of 0 C with the minus on a value of zero (5-10)', async () => {
        const unit = await onTemp();
        await unit.panel.inner('L', 1); // the sign: -

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L').slice(4)).toEqual(['TEMP: -00°C', 'DEN  9300ft']);
    });
});

