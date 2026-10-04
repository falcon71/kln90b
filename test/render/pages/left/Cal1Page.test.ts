import {describe, expect, it} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

const KEY = 'persistent-setting.KLN TEST.profile_1.cal12Barometer';

/** The left half page's row n (11 characters) */
function left(n: number): string {
    return Screen.read().half('L').split('\n')[n];
}

describe('CAL 1 page persistence (characterization)', () => {
    it('stores an edited barometer setting and shows it again (#31)', async () => {
        const unit = await bootUnit();
        await unit.panel.outer('L', 1);
        expect(left(2)).toBe('BARO:00.00"');
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
        expect(unit.env.storage.data.get(KEY)).toBe('29.92');
        expect(left(2)).toBe('BARO:29.92"');
    });

    it('restores the stored barometer setting at boot (#31)', async () => {
        const unit = await bootUnit({storage: {cal12Barometer: 29.92}});
        await unit.panel.outer('L', 1);
        expect(left(2)).toBe('BARO:29.92"');
    });
});
