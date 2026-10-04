import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

const FUEL_PANEL_XML = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name>'
    + '<Input><FuelComputer><IsInterfaced>true</IsInterfaced></FuelComputer></Input>'
    + '</Instrument></PlaneHTMLConfig>';

describe('OTH 5 page', () => {
    // 5-39 for the page; the SimVar is the contract with the aircraft: the fuel computer's fuel on board is EX1 (#53)
    it('shows the fuel on board from the EX1 SimVar, in the configured unit (#53)', async () => {
        const unit = await bootUnit({panelXml: FUEL_PANEL_XML});
        // The decoy is the plain SimVar, which must not be read
        unit.env.sim.set('FUEL TOTAL QUANTITY WEIGHT EX1', 'pounds', 300);
        unit.env.sim.set('FUEL TOTAL QUANTITY WEIGHT', 'pounds', 600);

        await unit.panel.selectPage('L', 'OTH 5');
        await vi.advanceTimersByTimeAsync(1500);

        const rows = Screen.read().rows('L');
        // 300 lb of avgas at 6 lb per US gallon
        expect(rows[1]).toBe('FOB      50');
        expect(rows[0].endsWith('GAL')).toBe(true);
    });
});
