import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../harness/boot';
import {storedSetting} from '../../harness/storage';
import {KLN90BEepromSettings, KLN90BEepromTypes} from '../../../kln90b/settings/KLN90BEepromSettings';

const KEYS: (keyof KLN90BEepromTypes)[] = ['eepromCrtCenterX', 'eepromCrtCenterY', 'eepromDbarCalPlus', 'eepromDbarCalMinus'];

describe('EEPROM settings', () => {
    it('a first start draws and stores the calibration', async () => {
        const unit = await bootUnit();
        await vi.advanceTimersByTimeAsync(250);

        for (const key of KEYS) {
            const raw = unit.env.storage.data.get(`persistent-setting.${unit.atcModel}.profile_1.${key}`);
            expect(raw, key).toBeDefined();
            const stored = JSON.parse(raw!);
            expect(typeof stored, key).toBe('number');
            expect(stored, key).not.toBe(0);
        }
    });

    it('a stored calibration is kept', async () => {
        const unit = await bootUnit({storage: {eepromCrtCenterX: 3, eepromCrtCenterY: -5, eepromDbarCalPlus: 200, eepromDbarCalMinus: -300}});
        const manager = KLN90BEepromSettings.getManager(unit.props.bus);

        expect(manager.getSetting('eepromCrtCenterX').get()).toBe(3);
        expect(manager.getSetting('eepromCrtCenterY').get()).toBe(-5);
        expect(manager.getSetting('eepromDbarCalPlus').get()).toBe(200);
        expect(manager.getSetting('eepromDbarCalMinus').get()).toBe(-300);
    });

    it('the save manager includes the EEPROM', async () => {
        const unit = await bootUnit();
        KLN90BEepromSettings.getManager(unit.props.bus).getSetting('eepromCrtCenterX').set(4.5);
        await vi.advanceTimersByTimeAsync(250);

        expect(storedSetting(unit, 'eepromCrtCenterX')).toBe(4.5);
    });

    it('the pages get the calibration', async () => {
        const unit = await bootUnit({storage: {eepromCrtCenterX: 3, eepromCrtCenterY: -5, eepromDbarCalPlus: 200, eepromDbarCalMinus: -300}});
        unit.props.failures.fail('eeprom');

        expect(unit.props.eepromCalibration.screenShiftXPx()).toBe(-12);
    });
});
