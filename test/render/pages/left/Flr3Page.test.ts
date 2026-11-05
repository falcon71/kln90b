import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {fuelComputer, panelXml} from '../../../harness/panelXml';
import {openFlr3, rows} from '../../../harness/render/flrPages';

// #458: FLR 3, the failures the aircraft can have that are not active (docs/failures.md, "UI"). The page is fictional,
// as SET 10 is

describe('FLR 3 (#458)', () => {
    it('lists the eligible, inactive failures', async () => {
        const unit = await bootUnit();
        await openFlr3(unit);

        expect(Screen.read().status().left).toBe('FLR 3');
        expect(rows()).toEqual(['  INACTIVE', '429 OUTPUT', 'ALTITUDE', 'EEPROM', 'OBS INPUT', 'SUPERFLAG']);
        expect(unit.errors).toEqual([]);
    });

    it('fails with ENT, ENT', async () => {
        const unit = await bootUnit();
        await openFlr3(unit);
        await unit.panel.cursor('L');
        await unit.panel.cursorTo('L', 'ALTITUDE');

        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);
        expect(rows()[2]).toBe('FAIL      ?');
        expect(unit.props.failures.isActive('altitude')).toBe(false);

        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);
        expect(unit.props.failures.isActive('altitude')).toBe(true);
        expect(unit.props.failures.mtbfHours).toBe(0); // Also with the random failures off
        expect(rows()).toEqual(['  INACTIVE', '429 OUTPUT', 'EEPROM', 'OBS INPUT', 'SUPERFLAG', '']);

        await unit.panel.cursor('L'); // Off, so that the inner knob turns the pages
        await unit.panel.inner('L', -1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(rows()).toEqual(['  ACTIVE', 'ALTITUDE', '', '', '', '']);
        expect(unit.errors).toEqual([]);
    });

    it('CLR at the prompt cancels', async () => {
        const unit = await bootUnit();
        await openFlr3(unit);
        await unit.panel.cursor('L');
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);
        expect(rows()[1]).toBe('FAIL      ?');

        await unit.panel.clr();
        await vi.advanceTimersByTimeAsync(1000);

        expect(rows()[1]).toBe('429 OUTPUT');
        expect(unit.props.failures.activeList()).toEqual([]);
    });

    it('a random failure while FLR 3 is shown', async () => {
        const unit = await bootUnit();
        await openFlr3(unit);
        await unit.panel.cursor('L');
        await unit.panel.cursorTo('L', 'ALTITUDE');

        unit.props.failures.fail('arinc429Out');
        await vi.advanceTimersByTimeAsync(1000);

        expect(rows()).toEqual(['  INACTIVE', 'ALTITUDE', 'EEPROM', 'OBS INPUT', 'SUPERFLAG', '']);
        // The cursor keeps its position and stands on the entry that moved up into it
        expect(unit.panel.focused('L').text.trim()).toBe('EEPROM');
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);
        expect(rows()).toEqual(['  INACTIVE', 'ALTITUDE', 'FAIL      ?', 'OBS INPUT', 'SUPERFLAG', '']);
        expect(unit.errors).toEqual([]);
    });

    it('the list is refreshed only in a display tick', async () => {
        const unit = await bootUnit();
        await openFlr3(unit);

        unit.props.failures.fail('arinc429Out');
        await vi.advanceTimersByTimeAsync(0);
        expect(rows()[1]).toBe('429 OUTPUT');

        await vi.advanceTimersByTimeAsync(250);
        expect(rows()[1]).toBe('ALTITUDE');
    });

    it('more entries than rows scroll', async () => {
        const unit = await bootUnit({
            panelXml: panelXml({
                ...fuelComputer(),
                'Input.Airdata.IsInterfaced': true, 'Input.Airdata.Interface': 'ARINC429',
                'Output.RmiInstalled': true, 'Output.RmiInterface': 'OBI', 'Output.DataInterface': 'RS232',
            }),
        });
        await openFlr3(unit);
        expect(rows().slice(1)).toEqual(['429 AIRDATA', '429 OUTPUT', 'EEPROM', 'OBS INPUT', 'RMI OUTPUT']);

        await unit.panel.cursor('L');
        await unit.panel.cursorTo('L', 'RS-232 OUT');
        await vi.advanceTimersByTimeAsync(1000);

        expect(rows().slice(1)).toEqual(['OBS INPUT', 'RMI OUTPUT', 'RS-232 DATA', 'RS-232 IN', 'RS-232 OUT']);
        expect(unit.errors).toEqual([]);
    });
});
