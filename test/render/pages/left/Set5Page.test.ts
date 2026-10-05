import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {storedSetting} from '../../../harness/storage';

// 3-58: SET 5 turns the height above airport alert ON or OFF and sets its offset above the field elevation. The offset
// is the setting `htAboveAptOffset` (persisted user data, CLAUDE.md "Public contract with aircraft": setting keys are
// never repurposed).

/** SET 5 with the left cursor: alert ON, the offset field, then the offset to +1000ft, and the cursor off */
async function setOffsetTo1000(unit: HeadlessUnit): Promise<void> {
    await unit.panel.selectPage('L', 'SET 5');
    await unit.panel.cursor('L');
    await unit.panel.inner('L', 1);
    await unit.panel.outer('L', 1);
    await unit.panel.inner('L', 2);
    await unit.panel.cursor('L');
    await vi.advanceTimersByTimeAsync(1000);
}

describe('SET 5 height above airport alert offset (#89)', () => {
    // The sibling of the pin below: the knob sequence lands on the alert ON and +1000ft, and the enable flag is stored
    it('turns the alert on and shows the offset +1000ft', async () => {
        const unit = await bootUnit();

        await setOffsetTo1000(unit);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')[5]).toBe('  +1000ft  ');
        expect(storedSetting(unit, 'htAboveAptEnabled')).toBe(true);
    });

    it.fails('stores the offset under htAboveAptOffset and leaves the SUA buffer alone (#89)', async () => {
        const unit = await bootUnit();

        await setOffsetTo1000(unit);

        expect(storedSetting(unit, 'htAboveAptOffset')).toBe(1000);
        expect(storedSetting(unit, 'airspaceAlertBuffer')).toBeUndefined();
    });
});
