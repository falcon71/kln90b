import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

/** A fuel computer installation; unit is the panel.xml fuel unit (GAL when absent) */
function fuelXml(unit?: string): string {
    return '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input>'
        + `<FuelComputer><IsInterfaced>true</IsInterfaced>${unit === undefined ? '' : `<Unit>${unit}</Unit>`}</FuelComputer>`
        + '</Input></Instrument></PlaneHTMLConfig>';
}

/**
 * OTH 7 of a unit with the given number of engines and fuel flows in pph. The fuel computer reads the number of engines
 * when the unit is built, so the SimVar goes in through the boot.
 */
async function oth7(engines: number, pph: number[], unitName?: string): Promise<HeadlessUnit> {
    const unit = await bootUnit({panelXml: fuelXml(unitName), simVars: [{name: 'NUMBER OF ENGINES', unit: 'number', value: engines}]});
    pph.forEach((flow, i) => unit.env.sim.set(`ENG FUEL FLOW PPH:${i + 1}`, 'pounds per hour', flow));
    await unit.panel.selectPage('L', 'OTH 7');
    await vi.advanceTimersByTimeAsync(1500);
    return unit;
}

/** The number on a row of OTH 7, after its label */
const flowOf = (row: string, label: string): string => {
    const m = new RegExp(`^${label}\\s+(\\d+)\\s*$`).exec(row);
    return m === null ? `no match: "${row}"` : m[1];
};

describe('OTH 7 page (characterization)', () => {
    it('characterization: a twin, 15 and 14 GAL/HR', async () => {
        await oth7(2, [90, 84]);

        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          " FUEL FLOW 
                     
               GAL/HR
          ENG 1  15  
          ENG 2  14  
          TOTAL  29  "
        `);
    });

    it('characterization: a single, 10 GAL/HR', async () => {
        await oth7(1, [60]);

        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          " FUEL FLOW 
                     
               GAL/HR
                     
                     
                 10  "
        `);
    });
});

describe('OTH 7 page, fuel flow (5-41)', () => {
    // 5-41: a twin shows the fuel flow of each engine and the total, in the fuel unit per hour. Avgas in US gallons is
    // 6 lb per gallon (the SDK's autogas gallon): 90 and 84 pph are 15 and 14 GAL/HR, 29 in total
    it('shows each engine and the total of a twin, in the fuel unit per hour (5-41)', async () => {
        await oth7(2, [90, 84]);

        const rows = Screen.read().rows('L');
        expect(rows[2].trim()).toBe('GAL/HR');
        expect([flowOf(rows[3], 'ENG 1'), flowOf(rows[4], 'ENG 2'), flowOf(rows[5], 'TOTAL')]).toEqual(['15', '14', '29']);
    });

    // 5-41: a single shows the total only. The unit is the configured one (5-39 lists LB): 75 pph are 75 LB/HR
    it('shows only the total of a single, in the configured unit (5-41, 5-39)', async () => {
        await oth7(1, [75], 'LB');

        const rows = Screen.read().rows('L');
        expect(rows[2]).toBe('      LB/HR'); // the unit is right-aligned in three cells, as GAL is
        expect([rows[3].trim(), rows[4].trim(), rows[5].trim()]).toEqual(['', '', '75']);
    });
});
