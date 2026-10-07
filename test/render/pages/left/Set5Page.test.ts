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

describe('SET 5 page (characterization)', () => {
    it('shows the alert off with the cursor off', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 5');
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')).toMatchInlineSnapshot(`
          [
            " HT ABOVE  ",
            " APT ALERT ",
            "   OFF     ",
            "           ",
            "           ",
            "           ",
          ]
        `);
        expect(Screen.read().maskRows('L')).toMatchInlineSnapshot(`
          [
            "...........",
            "...........",
            "...........",
            "...........",
            "...........",
            "...........",
          ]
        `);
    });
});

describe('SET 5 offset while the alert is off (characterization)', () => {
    // The hidden offset takes no cursor: the enable field is the only one, so the outer knob stays on it
    it('keeps the cursor on the enable field on a unit booted with the alert off', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 5');
        await unit.panel.cursor('L');
        const enable = unit.panel.focused('L');
        expect(enable.text.trim()).toBe('OFF');

        await unit.panel.outer('L', 1);

        expect(unit.errors).toEqual([]);
        expect(unit.panel.focused('L')).toEqual(enable);
    });

    it('takes the offset out of the cursor again when the alert is turned off', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 5');
        await unit.panel.cursor('L');
        const at = () => {
            const f = unit.panel.focused('L');
            return {row: f.row, col: f.col};
        };
        const enable = at();
        await unit.panel.inner('L', 1); // ON
        await unit.panel.outer('L', 1);
        expect(unit.panel.focused('L').text.trim()).toBe('8'); // the offset field holds the hundreds of feet
        await unit.panel.outer('L', 1);
        expect(at()).toEqual(enable);
        await unit.panel.inner('L', 1); // OFF

        await unit.panel.outer('L', 1);

        expect(unit.errors).toEqual([]);
        expect(at()).toEqual(enable);
    });
});

describe('SET 5 height above airport alert (3-58)', () => {
    // 3-58: the offset runs from 800 ft to 2000 ft; from the default 800 ft that is twelve steps of 100 ft. The row only
    // is asserted: the stored key is the #89 pin above.
    it('offers offsets up to 2000 ft (3-58)', async () => {
        const unit = await bootUnit();
        await unit.panel.selectPage('L', 'SET 5');
        await unit.panel.cursor('L');
        await unit.panel.inner('L', 1); // ON
        await unit.panel.outer('L', 1);
        expect(Screen.read().rows('L')[5]).toBe('  + 800ft  ');

        await unit.panel.inner('L', 12);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')[5]).toBe('  +2000ft  ');
    });

    // 3-57 and 3-59 (the NOTE): when the installation disables the altitude alerting and the height above airport alert,
    // SET 5 shows OFF and FEATURE DISABLED and cannot be changed. Also a contract test: panel.xml Output.AltitudeAlertEnabled
    // (cfg/panel.xml; the wiki page panel.xml customization).
    it('shows FEATURE DISABLED and takes no cursor when the installation disables the alert (3-57, 3-59)', async () => {
        const unit = await bootUnit({
            panelXml: '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Output>'
                + '<AltitudeAlertEnabled>false</AltitudeAlertEnabled></Output></Instrument></PlaneHTMLConfig>',
        });
        await unit.panel.selectPage('L', 'SET 5');
        await unit.panel.cursor('L');

        expect(unit.errors).toEqual([]);
        expect(Screen.read().rows('L')).toEqual([
            ' HT ABOVE  ',
            ' APT ALERT ',
            '   OFF     ',
            '           ',
            ' FEATURE   ',
            ' DISABLED  ',
        ]);
        expect(Screen.read().status().left).toBe('SET 5');
    });
});
