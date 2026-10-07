import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

/** Air data and a fuel computer, so the air data pages are OTH 9 and OTH 10 (5-42) */
const AIRDATA_XML = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input>'
    + '<Airdata><IsInterfaced>true</IsInterfaced></Airdata>'
    + '<FuelComputer><IsInterfaced>true</IsInterfaced></FuelComputer>'
    + '</Input></Instrument></PlaneHTMLConfig>';

async function oth10(o: { satC: number; tatC: number; pressureAltFt: number }): Promise<HeadlessUnit> {
    const unit = await bootUnit({panelXml: AIRDATA_XML});
    unit.env.sim.set('AMBIENT TEMPERATURE', 'celsius', o.satC);
    unit.env.sim.set('TOTAL AIR TEMPERATURE', 'celsius', o.tatC);
    unit.env.sim.set('PRESSURE ALTITUDE', 'feet', o.pressureAltFt);
    await unit.panel.selectPage('L', 'OTH10');
    await vi.advanceTimersByTimeAsync(1500);
    return unit;
}

describe('OTH 10 page (characterization)', () => {
    it('characterization: 12340 ft at 8 °C', async () => {
        await oth10({satC: 8, tatC: 12, pressureAltFt: 12340});

        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          " AIR DATA  
                     
          SAT    08°C
          TAT    12°C
          PRS 12300ft
          DEN 14400ft"
        `);
    });
});

describe('OTH 10 page, a negative temperature (characterization)', () => {
    // The temperatures are formatted with a sign and two digits, so a leading zero follows the minus sign
    it('characterization: shows a negative temperature as -09°C', async () => {
        await oth10({satC: -9, tatC: -4, pressureAltFt: 12340});

        expect(Screen.read().rows('L').slice(2, 4).map(r => r.replace(/\s+/g, ' '))).toEqual(['SAT -09°C', 'TAT -04°C']);
    });
});

describe('OTH 10 page, air data (5-43)', () => {
    // 5-43: SAT and TAT in degrees Celsius; the pressure altitude to the nearest 100 ft: 6460 ft shows as 6500
    it('shows SAT and TAT in degrees Celsius and the pressure altitude to the nearest 100 ft (5-43)', async () => {
        await oth10({satC: 20, tatC: 26, pressureAltFt: 6460});

        const rows = Screen.read().rows('L');
        expect(rows.slice(2, 5).map(r => r.replace(/\s+/g, ' '))).toEqual(['SAT 20°C', 'TAT 26°C', 'PRS 6500ft']);
    });

    // 5-43: the density altitude to the nearest 100 ft. 5-10 (the CAL 1 figures) gives the density altitude for a
    // pressure altitude of 9000 ft at 5 °C as 9900 ft; the ICAO standard atmosphere computed by hand gives 9912 ft
    // (Conversions.test.ts), which rounds to the same 9900
    it('shows the density altitude to the nearest 100 ft (5-43, 5-10)', async () => {
        await oth10({satC: 5, tatC: 9, pressureAltFt: 9000});

        expect(Screen.read().rows('L')[5].replace(/\s+/g, ' ')).toBe('DEN 9900ft');
    });
});
