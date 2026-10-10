import {describe, expect, it} from 'vitest';
import {bootUnit} from '../../harness/boot';
import {fuelComputer, panelXml} from '../../harness/panelXml';

const FUEL_COMPUTER_XML = panelXml(fuelComputer());

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

    // Both entries are applied, each in its own unit: 1000 feet read back in meters is the SDK's conversion of the unit
    // the value was set in (0.3048 m per foot), not the number as given
    it('sets every entry in the unit it names', async () => {
        const unit = await bootUnit({simVars: [
            {name: 'NUMBER OF ENGINES', unit: 'number', value: 2},
            {name: 'PLANE ALT ABOVE GROUND', unit: 'feet', value: 1000},
        ]});

        expect(unit.env.sim.get('NUMBER OF ENGINES', 'number')).toBe(2);
        expect(unit.env.sim.get('PLANE ALT ABOVE GROUND', 'meters')).toBeCloseTo(304.8, 6);
    });

    it('sets its values after the ones bootUnit sets, so a test can override one', async () => {
        const unit = await bootUnit({simVars: [{name: 'GPS DRIVES NAV1', unit: 'bool', value: false}]});

        expect(unit.env.sim.get('GPS DRIVES NAV1', 'bool')).toBe(0);
    });
});
