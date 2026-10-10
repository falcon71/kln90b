// @vitest-environment happy-dom
import {beforeEach, describe, expect, it} from 'vitest';
import {FuelComputer} from '../../kln90b/Sensors';
import {KLN90BPlaneSettingsParser} from '../../kln90b/settings/KLN90BPlaneSettings';
import {fuelComputer, panelXml} from '../harness/panelXml';
import {simEnv} from '../harness/sim/install';

/**
 * The fuel computer's unit and fuel type come from panel.xml (Input.FuelComputer.Unit and Input.FuelComputer.Type, the
 * contract of cfg/panel.xml and the wiki page panel.xml customization): the type selects the weight of a volume of
 * fuel, so the same pounds on board read as a different volume for each type. The expectations use the definitions of
 * the units, not the SDK's fuel units: a US gallon is 3.785411784 liters, an imperial gallon is 1.20095042 US gallons.
 */

const POUNDS_ON_BOARD = 1000;
const LITERS_PER_US_GALLON = 3.785411784;
const US_GALLONS_PER_IMP_GALLON = 1.20095042;
const TYPES = ['Avgas', 'JetA1', 'JetB'] as const;

/** The fob the fuel computer reads for one panel.xml fuel unit and type, built through the parser as the unit does */
function fobFor(unit: string, type: string): number {
    const settings = new KLN90BPlaneSettingsParser().parsePlaneSettings(
        new DOMParser().parseFromString(panelXml(fuelComputer({unit, type})), 'text/xml'));
    // The fuel computer reads the number of engines in its constructor, so the sim has them before it is built
    simEnv().sim.set('NUMBER OF ENGINES', 'number', 1);
    simEnv().sim.set('FUEL TOTAL QUANTITY WEIGHT EX1', 'pounds', POUNDS_ON_BOARD);
    const computer = new FuelComputer(settings);
    computer.tick();
    return computer.fob;
}

// Source: the panel.xml contract, cfg/panel.xml (Unit: GAL, IMP, L, KG or LB; Type: Avgas, JetA1 or JetB)
describe('FuelComputer fob in the fuel unit of panel.xml', () => {
    // The parser writes LVars, and the fake sim keeps what a test of the file wrote
    beforeEach(() => simEnv().sim.reset());

    it.each(TYPES)('reads %s in liters as the gallons times the liters of a US gallon', type => {
        const gallons = fobFor('GAL', type);
        expect(gallons).toBeGreaterThan(0);

        // Avgas and Jet A are exact; the JetB gallon and liter are 4-digit densities, 2e-5 off the definition
        expect(fobFor('L', type)).toBeCloseTo(gallons * LITERS_PER_US_GALLON, 1);
    });

    const imperialGallonsMatchUsGallons = (type: string) => {
        const usGallons = fobFor('GAL', type);
        expect(usGallons).toBeGreaterThan(0);

        expect(fobFor('IMP', type) * US_GALLONS_PER_IMP_GALLON).toBeCloseTo(usGallons, 1);
    };

    // The IMP case overwrites the unit it chose for the fuel type with the generic imperial gallon (Sensors.ts, the
    // line after the inner switch), so the type has no effect with IMP. The generic fuel weighs as Jet A, so JetA1 is
    // right today by coincidence and holds this test in place; the pins below are the types it weighs wrong
    it('reads JetA1 in imperial gallons as the US gallons divided by 1.20095042', () => {
        imperialGallonsMatchUsGallons('JetA1');
    });

    it.fails.each(['Avgas', 'JetB'])('reads %s in imperial gallons as the US gallons divided by 1.20095042 (#93)', type => {
        imperialGallonsMatchUsGallons(type);
    });
});
