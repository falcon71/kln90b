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
