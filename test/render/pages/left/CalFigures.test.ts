import {describe, expect, it} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

// The calculator inputs are user settings, so a stored profile sets them without the knobs.
describe('CAL 1 and CAL 2 against the Pilot\'s Guide figures', () => {
    it('shows PRS 8400ft and DEN 9300ft for 8500 ft, 30.04" and 6 C (5-10, figure 5-33)', async () => {
        const unit = await bootUnit({storage: {cal12IndicatedAltitude: 8500, cal12Barometer: 30.04, cal1SAT: 6}});
        await unit.panel.selectPage('L', 'CAL 1');
        const rows = Screen.read().rows('L');
        expect(rows[3]).toBe('PRS  8400ft');
        expect(rows[5]).toBe('DEN  9300ft');
    });

    it('shows TAS 158kt for CAS 139 kt at 8500 ft, 30.04" and a total temperature of 2 C (5-11, figure 5-34)', async () => {
        const unit = await bootUnit({storage: {cal2Cas: 139, cal12IndicatedAltitude: 8500, cal12Barometer: 30.04, cal2TAT: 2}});
        await unit.panel.selectPage('L', 'CAL 2');
        expect(Screen.read().rows('L')[5]).toBe('TAS   158kt');
    });
});
