import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit} from '../../../harness/boot';
import {fuelComputer, panelXml} from '../../../harness/panelXml';
import {Screen} from '../../../harness/render/screen';

/**
 * OTH 8 of a unit with the given number of engines and fuel used in lb. The fuel computer reads the number of engines
 * when the unit is built, so the SimVar goes in through the boot.
 */
async function oth8(engines: number, usedLb: number[], fuelUsedTransmitted = true): Promise<HeadlessUnit> {
    const unit = await bootUnit({panelXml: panelXml(fuelComputer({fuelUsed: fuelUsedTransmitted})), simVars: [{name: 'NUMBER OF ENGINES', unit: 'number', value: engines}]});
    usedLb.forEach((lb, i) => unit.env.sim.set(`GENERAL ENG FUEL USED SINCE START:${i + 1}`, 'pounds', lb));
    await unit.panel.selectPage('L', 'OTH 8');
    await vi.advanceTimersByTimeAsync(1500);
    return unit;
}

/** The number on a row of OTH 8, after its label */
const usedOf = (row: string, label: string): string => {
    const m = new RegExp(`^${label}\\s+(\\S+)$`).exec(row);
    return m === null ? `no match: "${row}"` : m[1];
};

describe('OTH 8 page (characterization)', () => {
    it('characterization: a twin, 17 and 16 GAL used', async () => {
        await oth8(2, [102, 96]);

        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          " FUEL USED 
                     
                  GAL
          ENG 1    17
          ENG 2    16
          TOTAL    33"
        `);
    });

    it('characterization: follows the fuel used while the page is shown', async () => {
        const unit = await oth8(1, [72]);
        expect(Screen.read().rows('L')[5].trim()).toBe('12');

        unit.env.sim.set('GENERAL ENG FUEL USED SINCE START:1', 'pounds', 108);
        await vi.advanceTimersByTimeAsync(1500);

        expect(Screen.read().rows('L')[5].trim()).toBe('18');
    });

    it('characterization: a single, 12 GAL used', async () => {
        await oth8(1, [72]);

        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          " FUEL USED 
                     
                  GAL
                     
                     
                   12"
        `);
    });
});

describe('OTH 8 page, fuel used (5-41)', () => {
    // 5-41: a twin shows the fuel used by each engine and the total. Avgas in US gallons is 6 lb per gallon (the SDK's
    // autogas gallon): 102 and 96 lb are 17 and 16 GAL, 33 in total
    it('shows the fuel used by each engine and the total of a twin (5-41)', async () => {
        await oth8(2, [102, 96]);

        const rows = Screen.read().rows('L');
        expect(rows[2].trim()).toBe('GAL');
        expect([usedOf(rows[3], 'ENG 1'), usedOf(rows[4], 'ENG 2'), usedOf(rows[5], 'TOTAL')]).toEqual(['17', '16', '33']);
    });

    // 5-41: a computer that does not output the fuel used (ARNAV) gets dashes on OTH 8. The SimVars hold fuel used, which
    // the page must not show
    it('shows dashes for each engine of a twin when the fuel used is not transmitted (5-41)', async () => {
        await oth8(2, [102, 96], false);

        const rows = Screen.read().rows('L');
        expect([usedOf(rows[3], 'ENG 1'), usedOf(rows[4], 'ENG 2')]).toEqual(['-----', '-----']);
    });

    // 5-41: the same installation as the passing test above (the sibling): the total is dashes too
    it.fails('shows dashes for the total of a twin when the fuel used is not transmitted (5-41, #250)', async () => {
        await oth8(2, [102, 96], false);

        expect(usedOf(Screen.read().rows('L')[5], 'TOTAL')).toBe('-----');
    });

    // 5-41: the single-engine layout shows the total only. 72 lb of avgas are 12 GAL; this is the sibling of the pin below
    it('shows the fuel used of a single as the total only (5-41)', async () => {
        await oth8(1, [72]);

        const rows = Screen.read().rows('L');
        expect([rows[3].trim(), rows[4].trim(), rows[5].trim()]).toEqual(['', '', '12']);
    });

    // 5-41: the same single, but the computer does not transmit the fuel used
    it.fails('shows dashes for a single when the fuel used is not transmitted (5-41, #250)', async () => {
        await oth8(1, [72], false);

        expect(Screen.read().rows('L')[5].trim()).toBe('-----');
    });
});
