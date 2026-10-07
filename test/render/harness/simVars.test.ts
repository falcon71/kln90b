import {describe, expect, it} from 'vitest';
import {bootUnit} from '../../harness/boot';

const FUEL_COMPUTER_XML = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input><FuelComputer><IsInterfaced>true</IsInterfaced>'
    + '</FuelComputer></Input></Instrument></PlaneHTMLConfig>';

describe('bootUnit simVars (harness)', () => {
    // The fuel computer reads NUMBER OF ENGINES once, in its constructor (Sensors.ts), so only a value set before
    // KLN90BCore.init reaches it
    it('sets a SimVar before the unit is built: the fuel computer counts two engines', async () => {
        const unit = await bootUnit({panelXml: FUEL_COMPUTER_XML, simVars: [{name: 'NUMBER OF ENGINES', unit: 'number', value: 2}]});

        expect(unit.props.sensors.in.fuelComputer.numberOfEngines).toBe(2);
    });

    it('leaves the fuel computer at one engine without the option', async () => {
        const unit = await bootUnit({panelXml: FUEL_COMPUTER_XML});

        expect(unit.props.sensors.in.fuelComputer.numberOfEngines).toBe(1);
    });

    it('sets its values after the ones bootUnit sets, so a test can override one', async () => {
        const unit = await bootUnit({simVars: [{name: 'GPS DRIVES NAV1', unit: 'bool', value: false}]});

        expect(unit.env.sim.get('GPS DRIVES NAV1', 'bool')).toBe(0);
    });
});
