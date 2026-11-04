import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../harness/boot';
import {storedSetting} from '../../harness/storage';
import {KLN90BUserRemarkSettings} from '../../../kln90b/settings/KLN90BUserRemarkSettings';

describe('failure persistence', () => {
    it('a failure is saved', async () => {
        const unit = await bootUnit();
        unit.props.failures.fail('arinc429Out');
        await vi.advanceTimersByTimeAsync(250);

        // storedSetting parses the saved JSON text; the setting's own value is the string "{}"
        expect(storedSetting(unit, 'failure_arinc429Out')).toBe('{}');
    });

    it('a saved failure is active in the next session', async () => {
        // One unit per test: the saved text of the test above stands in for the first session
        const unit = await bootUnit({storage: {failure_arinc429Out: '{}'}});

        expect(unit.props.failures.isActive('arinc429Out')).toBe(true);
        expect(unit.props.failures.isEffective('arinc429Out')).toBe(true);
    });

    it('a stored ineligible failure boots cleanly', async () => {
        const unit = await bootUnit({storage: {failure_rs232Out: '{}'}});

        expect(unit.errors).toEqual([]);
        expect(unit.props.failures.activeList().map(d => d.key)).toContain('rs232Out');
        expect(unit.props.failures.inactiveList().map(d => d.key)).not.toContain('rs232Out');
        expect(unit.props.failures.isEffective('rs232Out')).toBe(false);
    });

    it('the existing settings keep their values', async () => {
        const unit = await bootUnit({storage: {failure_arinc429Out: '{}', fastGpsAcquisition: false, rmk0: 'TEST REMARK'}});

        expect(unit.props.userSettings.getSetting('fastGpsAcquisition').get()).toBe(false);
        expect(KLN90BUserRemarkSettings.getManager(unit.props.bus).getSetting('rmk0').get()).toBe('TEST REMARK');
        expect(unit.props.failures.isActive('arinc429Out')).toBe(true);
    });
});
