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

        const rows = Screen.read().rows('L');
        expect(rows[4]).toBe(' FEATURE   ');
        expect(rows[5]).toBe(' DISABLED  ');
        expect(unit.errors).toEqual([]);
    });

    it('shows the volume instead when the alert is enabled', async () => {
        const unit = await bootUnit({panelXml: panelXml(true)});
        await unit.panel.selectPage('L', 'SET 9');
        await vi.advanceTimersByTimeAsync(1000);

        const rows = Screen.read().rows('L');
        expect(rows.slice(0, 3)).toEqual(['ALTITUDE   ', '  ALERT    ', ' VOLUME:   ']);
        expect(rows[4]).toMatch(/^ +\d+ +$/);
        expect(rows[5]).toBe('           ');
        expect(unit.errors).toEqual([]);
    });
});
