import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {ALTITUDE_ALERT, panelXml} from '../../../harness/panelXml';
import {Screen} from '../../../harness/render/screen';
import {storedSetting} from '../../../harness/storage';

describe('SET 9 page (characterization)', () => {
    it('characterization: the alert volume with the alert enabled by default', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 9');

        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          "ALTITUDE   
            ALERT    
           VOLUME:   
                     
              99     
                     "
        `);
    });
});

// Contract: wiki page panel.xml customization, "the SET 9 page will display FEATURE DISABLED" when the altitude alert
// is disabled; cfg/panel.xml (Output.AltitudeAlertEnabled).
describe('SET 9 page and Output.AltitudeAlertEnabled (contract)', () => {
    it('shows FEATURE DISABLED when the alert is disabled', async () => {
        const unit = await bootUnit({panelXml: panelXml(ALTITUDE_ALERT(false))});
        await unit.panel.selectPage('L', 'SET 9');
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L')).toEqual([
            'ALTITUDE   ',
            '  ALERT    ',
            ' VOLUME    ',
            '   OFF     ',
            ' FEATURE   ',
            ' DISABLED  ',
        ]);
        expect(unit.errors).toEqual([]);
    });

    // The explicit true equals the code default (#141), so this cannot fail if the key stops being read; it bites
    // once that default is fixed to false. The volume 99 is the default of the altAlertVolume setting.
    it('shows the volume instead when the alert is enabled', async () => {
        const unit = await bootUnit({panelXml: panelXml(ALTITUDE_ALERT(true))});
        await unit.panel.selectPage('L', 'SET 9');
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('L')).toEqual([
            'ALTITUDE   ',
            '  ALERT    ',
            ' VOLUME:   ',
            '           ',
            '    99     ',
            '           ',
        ]);
        expect(unit.errors).toEqual([]);
    });
});

// 3-57, figure 3-181: the volume runs from 00 to 99 and is set digit by digit with the left inner and outer knobs. It is
// the persisted setting altAlertVolume (CLAUDE.md "Public contract with aircraft": setting keys).
describe('SET 9 alert volume (3-57)', () => {
    it('sets the volume 02 digit by digit (3-57)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 9');
        await unit.panel.cursor('L'); // the tens digit of 99
        // The wraps of 9 to 0 below: checked in the KLN 89 trainer, 2026-10-08 (3-57 does not speak of the wrap)
        await unit.panel.inner('L', 1); // 9 wraps to 0
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 3); // 9 wraps to 0, then 1, 2
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')[4]).toBe('    02     ');
        expect(storedSetting(unit, 'altAlertVolume')).toBe(2);
    });
});
