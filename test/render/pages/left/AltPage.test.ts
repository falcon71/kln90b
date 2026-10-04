import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {storedSetting} from '../../../harness/storage';

describe('ALT page (ee0b000)', () => {
    // 3-39: the ALT page sets the barometer with the left inner knob. Saving it in the settings is the project's own
    // persistence (the setting key), not a statement about the real unit.
    it('changes the barometer without an error and stores it (3-39)', async () => {
        const unit = await bootUnit();
        await unit.panel.alt();
        expect(Screen.read().rows('L').slice(0, 2)).toEqual([' ALTITUDE  ', 'BARO:29.92"']);

        await unit.panel.inner('L', 1);

        expect(unit.errors).toEqual([]);
        expect(unit.props.sensors.in.airdata.barometer).toBe(30.92);
        expect(Screen.read().rows('L')[1]).toBe('BARO:30.92"');

        // The sensors save the barometer in the 1 Hz tick
        await vi.advanceTimersByTimeAsync(1000);
        expect(unit.props.userSettings.getSetting('barosetting').get()).toBe(30.92);
        expect(storedSetting(unit, 'barosetting')).toBe(30.92);
    });
});
