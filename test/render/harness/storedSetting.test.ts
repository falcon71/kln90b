import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../harness/boot';
import {storedSetting} from '../../harness/storage';

describe('storedSetting (harness)', () => {
    it('returns the parsed value after the unit saved a setting', async () => {
        const unit = await bootUnit();
        unit.props.userSettings.getSetting('barosetting').set(29.5);
        await vi.advanceTimersByTimeAsync(250);

        expect(storedSetting(unit, 'barosetting')).toBe(29.5);
    });

    it('parses a stored boolean, not just a number', async () => {
        const unit = await bootUnit({storage: {fastGpsAcquisition: false}});

        expect(storedSetting(unit, 'fastGpsAcquisition')).toBe(false);
    });

    it('returns undefined for a key that was never saved', async () => {
        const unit = await bootUnit();
        await vi.advanceTimersByTimeAsync(250);

        expect(storedSetting(unit, 'noSuchSetting')).toBeUndefined();
    });

    it('uses the ATC model the unit booted with', async () => {
        const unit = await bootUnit({atcModel: 'OTHER MODEL'});
        unit.props.userSettings.getSetting('barosetting').set(29.5);
        await vi.advanceTimersByTimeAsync(250);

        expect(unit.atcModel).toBe('OTHER MODEL');
        expect(storedSetting(unit, 'barosetting')).toBe(29.5);
        expect(unit.env.storage.data.get('persistent-setting.OTHER MODEL.profile_1.barosetting')).toBe('29.5');
    });
});
