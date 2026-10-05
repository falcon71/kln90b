import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

const panelXml = (alertEnabled: boolean) => '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Output>'
    + `<AltitudeAlertEnabled>${alertEnabled}</AltitudeAlertEnabled></Output></Instrument></PlaneHTMLConfig>`;

// Contract: wiki page panel.xml customization, "the SET 9 page will display FEATURE DISABLED" when the altitude alert
// is disabled; cfg/panel.xml (Output.AltitudeAlertEnabled).
describe('SET 9 page and Output.AltitudeAlertEnabled (contract)', () => {
    it('shows FEATURE DISABLED when the alert is disabled', async () => {
        const unit = await bootUnit({panelXml: panelXml(false)});
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

    // The explicit true equals the code default (#NEW-4-1), so this cannot fail if the key stops being read; it bites
    // once that default is fixed to false. The volume 99 is the default of the altAlertVolume setting.
    it('shows the volume instead when the alert is enabled', async () => {
        const unit = await bootUnit({panelXml: panelXml(true)});
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
