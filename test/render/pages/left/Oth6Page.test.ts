import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

const FUEL_PANEL_XML = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name>'
    + '<Input><FuelComputer><IsInterfaced>true</IsInterfaced></FuelComputer></Input>'
    + '</Instrument></PlaneHTMLConfig>';

/**
 * A single with a fuel computer, OTH 6 shown. Avgas in US gallons is 6 lb per gallon (the SDK's autogas gallon, as the
 * #53 test of Oth5Page.test.ts uses), so 60 pph are 10 GAL/HR. The fuel computer reads the number of engines when the
 * unit is built, so the SimVar goes in through the boot. With groundspeedKt the aircraft moves north at that speed.
 */
async function single(o: { fobLb: number; reserve: number; groundspeedKt?: number; flowPph?: number }): Promise<HeadlessUnit> {
    const unit = await bootUnit({panelXml: FUEL_PANEL_XML, simVars: [{name: 'NUMBER OF ENGINES', unit: 'number', value: 1}]});
    unit.env.sim.set('FUEL TOTAL QUANTITY WEIGHT EX1', 'pounds', o.fobLb);
    unit.env.sim.set('ENG FUEL FLOW PPH:1', 'pounds per hour', o.flowPph ?? 60);
    await settle(unit);
    if (o.groundspeedKt !== undefined) {
        await moveAircraft(unit, {lat: 47.01, lon: 8.0}, {groundspeedKt: o.groundspeedKt, trackTrue: 0});
    }
    unit.props.memory.othPage.reserve = o.reserve;
    await unit.panel.selectPage('L', 'OTH 6');
    await vi.advanceTimersByTimeAsync(1500);
    return unit;
}

describe('OTH 6 page (characterization)', () => {
    it('characterization: 126 GAL on board, 15 GAL/HR, no reserve, 120 kt', async () => {
        await single({fobLb: 756, reserve: 0, groundspeedKt: 120, flowPph: 90});

        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          " FUEL DATA 
                     
           ENDUR 8:24
           RANGE 1008
           NM/GAL 8.0
           RES: 00000"
        `);
    });

    // The efficiency is formatted as three digits without a decimal point from 10 on, so 12.0 NM per gallon reads 012
    it('characterization: shows NM/GAL of 10 or more with leading zeros', async () => {
        await single({fobLb: 756, reserve: 0, groundspeedKt: 120, flowPph: 60});

        expect(Screen.read().rows('L').slice(2, 5)).toEqual([' ENDUR12:36', ' RANGE 1512', ' NM/GAL 012']);
    });

    // The efficiency is clamped at 999: 120 kt on 0.1 GAL/HR is 1200 NM per gallon
    it('characterization: clamps NM/GAL at 999', async () => {
        await single({fobLb: 30, reserve: 0, groundspeedKt: 120, flowPph: 0.6});

        expect(Screen.read().rows('L')[4]).toBe(' NM/GAL 999');
    });

    // A reserve above the fuel on board leaves no endurance, and the page shows dashes for the endurance and the range
    it('characterization: dashes for the endurance and the range when the reserve exceeds the fuel on board', async () => {
        await single({fobLb: 120, reserve: 30, groundspeedKt: 120});

        expect(Screen.read().rows('L').slice(2, 4)).toEqual([' ENDUR--:--', ' RANGE --.-']);
    });

    it('characterization: dashes without fuel flow', async () => {
        const unit = await bootUnit({panelXml: FUEL_PANEL_XML, simVars: [{name: 'NUMBER OF ENGINES', unit: 'number', value: 1}]});
        await unit.panel.selectPage('L', 'OTH 6');
        await vi.advanceTimersByTimeAsync(1500);

        expect(Screen.read().half('L')).toMatchInlineSnapshot(`
          " FUEL DATA 
                     
           ENDUR--:--
           RANGE --.-
           NM/GAL ---
           RES: 00000"
        `);
    });
});

describe('OTH 6 page, endurance, range and efficiency (5-41)', () => {
    // 5-41: the endurance is the fuel on board less the reserve, at the present fuel flow; the range is the endurance at
    // the present groundspeed; the efficiency is the groundspeed divided by the fuel flow.
    // 50 GAL on board, 20 GAL reserve, 10 GAL/HR: 3 h 00 min; at 75 kt: 225 NM and 7.5 NM/GAL
    it('shows ENDUR, RANGE and NM/GAL from the fuel on board, the reserve, the fuel flow and the groundspeed (5-41)', async () => {
        await single({fobLb: 300, reserve: 20, groundspeedKt: 75});

        expect(Screen.read().rows('L').slice(2, 6)).toEqual([' ENDUR 3:00', ' RANGE  225', ' NM/GAL 7.5', ' RES: 00020']);
    });

    // 5-41: the endurance is shown in hours and minutes, so a minute never reads 60. 49.95 GAL on board at 10 GAL/HR are
    // 4 h 59.7 min; the page may round or truncate, but not show 4:60
    it.fails('never shows 60 minutes of endurance (5-41, #NEW-1-1)', async () => {
        await single({fobLb: 299.7, reserve: 0});

        expect([' 4:59', ' 5:00']).toContain(Screen.read().rows('L')[2].slice(6));
    });

    // The sibling of the pin above: the same boot and page with 49 GAL on board, 4 h 54 min
    it('shows the endurance in hours and minutes (5-41)', async () => {
        await single({fobLb: 294, reserve: 0});

        expect(Screen.read().rows('L')[2]).toBe(' ENDUR 4:54');
    });
});
