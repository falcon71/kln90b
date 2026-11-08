import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../harness/boot';
import {DEFAULT_START} from '../../harness/sim/clock';
import {storedSetting} from '../../harness/storage';
import {KLN90BUserRemarkSettings} from '../../../kln90b/settings/KLN90BUserRemarkSettings';

const YEAR_S = 365.25 * 86400;
// E:ABSOLUTE TIME counts from year 1; the harness clock starts at DEFAULT_START
const BOOT_S = DEFAULT_START.getTime() / 1000 + 62135596800;
const simNowS = (unit: Awaited<ReturnType<typeof bootUnit>>) => unit.env.sim.get('E:ABSOLUTE TIME', 'seconds') as number;

describe('battery persistence', () => {
    it('a first boot installs a new battery', async () => {
        const unit = await bootUnit();
        await vi.advanceTimersByTimeAsync(250);

        expect(Math.abs((storedSetting(unit, 'batteryDate') as number) - simNowS(unit))).toBeLessThan(2);
        expect(unit.props.battery.health).toBe(100);
    });

    it('a later session ages the battery', async () => {
        const unit = await bootUnit({storage: {batteryHealth: 50, batteryDate: BOOT_S - YEAR_S}});

        expect(unit.props.battery.health).toBeGreaterThanOrEqual(16.6);
        expect(unit.props.battery.health).toBeLessThanOrEqual(30.1);
    });

    it('a sim date set back does not age it', async () => {
        const later = BOOT_S + 86400;
        const unit = await bootUnit({storage: {batteryHealth: 50, batteryDate: later}});
        await vi.advanceTimersByTimeAsync(250);

        expect(unit.props.battery.health).toBe(50);
        expect(storedSetting(unit, 'batteryDate')).toBe(later);
    });
});

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
