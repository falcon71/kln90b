import {describe, expect, it} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

describe('CAL values are shared between the calculator pages (characterization, KLN 89 trainer, #33)', () => {
    it('shows an altitude edited on CAL 2 as the indicated altitude on CAL 1', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'CAL 2');

        await unit.panel.cursor('L');
        await unit.panel.outer('L', 3);
        await unit.panel.inner('L', 1);
        expect(Screen.read().rows('L')[2]).toBe('ALT:10000ft');

        await unit.panel.cursor('L');
        await unit.panel.inner('L', -1); // raw: changing the CAL subpage is the subject
        expect(unit.errors).toEqual([]);
        expect(Screen.read().status().left).toBe('CAL 1');
        expect(Screen.read().rows('L')[1]).toBe('IND:10000ft');
    });

    it('resets the CAL 3 TAS to the value CAL 2 calculates when CAL 2 is only viewed', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'CAL 3');

        await unit.panel.cursor('L');
        await unit.panel.inner('L', 1);
        expect(Screen.read().rows('L')[1]).toBe('TAS   100kt');

        // CAL 2 has a CAS of 0, so its TAS is 0, and it writes that to CAL 3 as soon as it is shown
        await unit.panel.cursor('L');
        await unit.panel.inner('L', -1); // raw: changing the CAL subpage is the subject
        expect(Screen.read().status().left).toBe('CAL 2');
        await unit.panel.inner('L', 1);
        expect(unit.errors).toEqual([]);
        expect(Screen.read().status().left).toBe('CAL 3');
        expect(Screen.read().rows('L')[1]).toBe('TAS   000kt');
        expect(unit.props.userSettings.getSetting('cal3Tas').get()).toBe(0);
    });
});

describe('CAL 2 page (characterization)', () => {
    it('shows the TAS for CAS 144 kt at 8500 ft, 30.04" and 2 C (characterization)', async () => {
        const unit = await bootUnit({storage: {cal2Cas: 144, cal12IndicatedAltitude: 8500, cal12Barometer: 30.04, cal2TAT: 2}});
        await unit.panel.selectPage('L', 'CAL 2');
        expect(unit.errors).toEqual([]);
        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          "    TAS    
          CAS:  144kt
          ALT:08500ft
          BARO:30.04"
          TEMP: 002°C
          TAS   163kt"
        `);
    });
});

describe('CAL 2 page (5-11)', () => {
    // 5-11, steps 3 to 6: the cursor goes over CAS, then ALT (three digits, as on CAL 1), then BARO, then TEMP
    it('moves the cursor over CAS, ALT, BARO and TEMP (5-11)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'CAL 2');
        await unit.panel.cursor('L');
        const rows: number[] = [];
        for (let i = 0; i < 13; i++) {
            rows.push(unit.panel.focused('L').row);
            await unit.panel.outer('L', 1);
        }
        expect(rows).toEqual([1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 1]);
    });

    // 5-11, step 5: an altimeter setting made on CAL 1 is already displayed on CAL 2
    it('shows the altimeter setting entered on CAL 1 (5-11)', async () => {
        const unit = await bootUnit({storage: {cal12Barometer: 29.92}});
        await unit.panel.selectPage('L', 'CAL 1');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 5);
        await unit.panel.inner('L', 2); // 29.92 -> 29.94
        await unit.panel.cursor('L');
        expect(Screen.read().rows('L')[2]).toBe('BARO:29.94"'); // The precondition: CAL 1 took it

        await unit.panel.selectPage('L', 'CAL 2');
        expect(Screen.read().rows('L')[3]).toBe('BARO:29.94"');
    });

    // 5-11, step 6: CAL 1 takes the static and CAL 2 the total air temperature, so a temperature entered on CAL 1 is not
    // carried to CAL 2
    it('keeps its own temperature when the temperature on CAL 1 is changed (5-11)', async () => {
        const unit = await bootUnit({storage: {cal1SAT: 5, cal2TAT: 2}});
        await unit.panel.selectPage('L', 'CAL 1');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 8);
        await unit.panel.inner('L', 4); // 05 -> 09
        await unit.panel.cursor('L');
        expect(Screen.read().rows('L')[4]).toBe('TEMP: 009°C'); // The precondition: CAL 1 took it

        await unit.panel.selectPage('L', 'CAL 2');
        expect(Screen.read().rows('L')[4]).toBe('TEMP: 002°C');
    });
});
