import {describe, expect, it} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

describe('altitude fieldset', () => {
    it('keeps the other digits when the hundreds digit changes (#54)', async () => {
        const unit = await bootUnit();
        // CAL 2, cursor on: the first digit of ALT is the third field
        await unit.panel.selectPage('L', 'CAL 2');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 3);
        await unit.panel.inner('L', 3);
        await unit.panel.outer('L', 2);
        await unit.panel.inner('L', 1);

        expect(unit.errors).toEqual([]);
        // 5-11: the altitude entered on CAL 2 is the one CAL 1 shows; editing the hundreds digit must keep the 10000s digit
        expect(unit.props.userSettings.getSetting('cal12IndicatedAltitude').get()).toBe(30100);

        // CAL 2's own row reads 30100 even with the bug, so look at the value CAL 1 shows
        await unit.panel.cursor('L');
        await unit.panel.inner('L', -1); // raw: changing the CAL subpage is the subject
        expect(unit.props.userSettings.getSetting('cal12IndicatedAltitude').get()).toBe(30100);
        expect(Screen.read().status().left).toBe('CAL 1');
        expect(Screen.read().rows('L')[1]).toBe('IND:30100ft');
    });
});
