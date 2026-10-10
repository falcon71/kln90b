import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {storedSetting} from '../../../harness/storage';
import {AIRDATA, ALTITUDE_ALERT, panelXml} from '../../../harness/panelXml';

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

/**
 * ALT, then the cursor moved to ALERT, whichever of OFF and ON it shows, and the inner knob turned to ON when it reads
 * OFF
 */
async function alertOn(unit: HeadlessUnit) {
    await unit.panel.alt();
    for (let i = 0; !['OFF', 'ON ›'].includes(unit.panel.focused('L').text.trim()); i++) {
        if (i >= 20) throw new Error(`alertOn: no ALERT field within 20 clicks\n${Screen.read().dump()}`);
        await unit.panel.outer('L', 1);
    }
    if (unit.panel.focused('L').text.trim() === 'OFF') {
        await unit.panel.inner('L', 1);
    }
}

describe('ALT page (characterization)', () => {
    it('shows the barometer, ALERT ON and the WARN line with the cursor on ALERT (characterization)', async () => {
        const unit = await bootUnit();
        await alertOn(unit);

        const screen = Screen.read();
        expect([...screen.rows('L'), ...screen.maskRows('L')].join('\n')).toMatchInlineSnapshot(`
          " ALTITUDE  
                     
          BARO:29.92"
          ALERT: ON ›
          WARN:±300ft
                     
          ...........
          ...........
          ...........
          .......IIII
          ...........
          ..........."
        `);
        expect(screen.status().left).toBe('CRSR');
    });

    // An air data computer that sends the baro setting (BaroSource 1): the page shows the altimeter's setting, and the
    // cursor starts on ALERT, because there is nothing to enter
    it('shows the baro setting of the altimeter and skips it with the cursor (characterization)', async () => {
        const unit = await bootUnit({
            panelXml: panelXml({...AIRDATA, 'Input.Airdata.BaroSource': 1}),
        });
        unit.env.sim.set('KOHLSMAN SETTING HG:1', 'inches of mercury', 30.12);
        await vi.advanceTimersByTimeAsync(1000);
        await unit.panel.alt();

        expect(Screen.read().rows('L')[1]).toBe('BARO:30.12"');
        expect(unit.panel.focused('L').row).toBe(2);
        unit.env.sim.set('KOHLSMAN SETTING HG:1', 'inches of mercury', 29.85);
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().rows('L')[1]).toBe('BARO:29.85"');
    });
});

describe('ALT page (spec)', () => {
    // 3-55 steps 1 to 3: the cursor starts over the first two digits of the baro field, which has three cursor
    // positions; one more step of the left outer knob puts it over ALERT
    it('steps the cursor through the three baro positions to ALERT (3-55)', async () => {
        const unit = await bootUnit();
        await unit.panel.alt();

        const fields = [unit.panel.focused('L')];
        for (let i = 0; i < 3; i++) {
            await unit.panel.outer('L', 1);
            fields.push(unit.panel.focused('L'));
        }

        expect(fields.map(f => [f.row, f.text.trim()])).toEqual([[1, '29'], [1, '9'], [1, '2'], [2, 'OFF']]);
    });

    // 3-39: with millibars chosen on SET 7, the page starts with the cursor on the leading two digits of the reading
    it('starts the cursor on the two leading digits of the millibar baro (3-39)', async () => {
        const unit = await bootUnit({storage: {barounit: false}});
        await unit.panel.alt();

        expect(Screen.read().rows('L')[1]).toBe('BARO:1013MB');
        expect(unit.panel.focused('L')).toEqual({row: 1, col: 5, text: '10'});
    });

    // 3-55 step 3 and figure 3-178: with ON an arrow follows ON and the WARN line appears; the lines move down one row,
    // and the warn altitude reads +-300 ft, the recommended value (step 4)
    it('shows the arrow after ON and the WARN line (3-55)', async () => {
        const unit = await bootUnit();
        await alertOn(unit);

        expect(Screen.read().rows('L')).toEqual([' ALTITUDE  ', '           ', 'BARO:29.92"', 'ALERT: ON ›', 'WARN:±300ft', '           ']);
        expect(unit.props.memory.altPage.alertEnabled).toBe(true);
    });

    // 3-55 step 4: the warn altitude is selectable in 100 ft steps from 200 to 900 ft
    it('offers the warn altitudes 200 to 900 ft in 100 ft steps (3-55)', async () => {
        const unit = await bootUnit();
        await alertOn(unit);
        await unit.panel.outer('L', 1);
        expect(unit.panel.focused('L')).toEqual({row: 4, col: 6, text: '3'});

        // Each row with the warn altitude the alerting then uses
        const seen = new Set<string>();
        for (let i = 0; i < 10; i++) {
            await unit.panel.inner('L', 1);
            seen.add(`${Screen.read().rows('L')[4]} ${unit.props.memory.altPage.alertWarn}`);
        }

        expect([...seen].sort()).toEqual([200, 300, 400, 500, 600, 700, 800, 900].map(ft => `WARN:±${ft}ft ${ft}`));
    });

    // 3-57 note: with altitude alerting disabled in the installation the ALT page shows OFF and it cannot be changed: the
    // outer knob only steps through the baro field
    it('shows ALERT OFF and keeps the cursor off it when the installation disables altitude alerting (3-57)', async () => {
        const unit = await bootUnit({
            panelXml: panelXml(ALTITUDE_ALERT(false)),
        });
        await unit.panel.alt();

        const rows = new Set<number>();
        for (let i = 0; i < 4; i++) {
            await unit.panel.outer('L', 1);
            rows.add(unit.panel.focused('L').row);
        }

        expect([...rows]).toEqual([1]);
        expect(Screen.read().rows('L')[2].replace(/ +/g, ' ')).toBe('ALERT: OFF');
    });
});

// 3-55 step 4: the pilot normally enters the warn altitude only the first time altitude alerting is used, so the unit
// keeps it. VolatileMemory.reset puts it back to 300 ft at every power-on
describe('ALT page WARN altitude over a power cycle', () => {
    /** WARN set to 500 ft, then a power cycle of one second and the self-test approved */
    async function warn500ThenCycle() {
        const unit = await bootUnit();
        await alertOn(unit);
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 2);
        expect(Screen.read().rows('L')[4]).toBe('WARN:±500ft');
        await unit.panel.alt();
        await unit.panel.powerCycle();
        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(2000);
        await alertOn(unit);
        return unit;
    }

    it('WARN 500 ft, a power cycle, and the WARN line shown again (3-55)', async () => {
        const unit = await warn500ThenCycle();

        expect(Screen.read().rows('L')[3]).toBe('ALERT: ON ›');
        expect(Screen.read().rows('L')[4]).toMatch(/^WARN:±[2-9]00ft$/);
    });

    it.fails('keeps the WARN altitude of 500 ft over a power cycle (3-55, #259)', async () => {
        const unit = await warn500ThenCycle();

        expect(Screen.read().rows('L')[4]).toBe('WARN:±500ft');
    });
});
