// @vitest-environment happy-dom
import {beforeEach, describe, expect, it} from 'vitest';
import {KLN90BPlaneSettingsParser, KLN90PlaneSettings} from '../../../kln90b/settings/KLN90BPlaneSettings';
import {
    AIRDATA, ALTITUDE_ALERT, fuelComputer, HEADING_INPUT, LEG_OBS_SWITCH, NO_ALTIMETER, NO_GPS_SIMVARS, NO_OBS,
    PANEL_KEYS, PanelKey, panelXml, PanelOptions, VFR_ONLY,
} from '../../harness/panelXml';
import {simEnv} from '../../harness/sim/install';

// The parser writes LVars, and the unit stage has no teardown (testing.md section 4)
beforeEach(() => simEnv().sim.reset());

const parse = (xml: string) =>
    new KLN90BPlaneSettingsParser().parsePlaneSettings(new DOMParser().parseFromString(xml, 'text/xml'));

// A value the parser does not default to, and where the parser puts the key
const CASES: Record<PanelKey, [string | number | boolean, (s: KLN90PlaneSettings) => unknown]> = {
    'TakeHomeMode': [true, s => s.takeHomeMode],
    'BasePath': ['custom/path', s => s.basePath],
    'VFROnly': [true, s => s.vfrOnly],
    'Input.AltimeterInterfaced': [false, s => s.input.altimeterInterfaced],
    'Input.ObsSource': [0, s => s.input.obsSource],
    'Input.HeadingInput': [true, s => s.input.headingInput],
    'Input.ElectricitySimVar': ['CIRCUIT ON:1', s => s.input.electricitySimVar],
    'Input.Airdata.IsInterfaced': [true, s => s.input.airdata.isInterfaced],
    'Input.Airdata.BaroSource': [1, s => s.input.airdata.baroSource],
    'Input.FuelComputer.IsInterfaced': [true, s => s.input.fuelComputer.isInterfaced],
    'Input.FuelComputer.Unit': ['LB', s => s.input.fuelComputer.unit],
    'Input.FuelComputer.Type': ['JetA1', s => s.input.fuelComputer.type],
    'Input.FuelComputer.FOBTransmitted': [false, s => s.input.fuelComputer.fobTransmitted],
    'Input.FuelComputer.FuelUsedTransmitted': [false, s => s.input.fuelComputer.fuelUsedTransmitted],
    'Input.ExternalSwitches.LegObsSwitchInstalled': [true, s => s.input.externalSwitches.legObsSwitchInstalled],
    'Input.ExternalSwitches.AppArmSwitchInstalled': [true, s => s.input.externalSwitches.appArmSwitchInstalled],
    'Output.ObsTarget': [1, s => s.output.obsTarget],
    'Output.AltitudeAlertEnabled': [false, s => s.output.altitudeAlertEnabled],
    'Output.WriteGPSSimVars': [false, s => s.output.writeGPSSimVars],
};

describe('panelXml (harness)', () => {
    it.each(PANEL_KEYS)('reaches the parser with %s', key => {
        const [value, read] = CASES[key];
        expect(read(parse(panelXml()))).not.toEqual(value);
        expect(read(parse(panelXml({[key]: value})))).toEqual(value);
    });

    it('refuses a key the parser does not read', () => {
        expect(() => panelXml({'Input.ObsSorce': 0} as PanelOptions)).toThrow(/Input.ObsSorce/);
    });

    it('nests several keys under one parent', () => {
        const s = parse(panelXml({...NO_OBS, ...HEADING_INPUT, ...NO_ALTIMETER}));
        expect([s.input.obsSource, s.input.headingInput, s.input.altimeterInterfaced]).toEqual([0, true, false]);
    });

    it('sets what each preset names', () => {
        expect(parse(panelXml(NO_GPS_SIMVARS)).output.writeGPSSimVars).toBe(false);
        expect(parse(panelXml(LEG_OBS_SWITCH)).input.externalSwitches.legObsSwitchInstalled).toBe(true);
        expect(parse(panelXml(VFR_ONLY)).vfrOnly).toBe(true);
        expect(parse(panelXml(AIRDATA)).input.airdata.isInterfaced).toBe(true);
        expect(parse(panelXml(ALTITUDE_ALERT(false))).output.altitudeAlertEnabled).toBe(false);
        const fuel = parse(panelXml(fuelComputer({unit: 'IMP', type: 'JetB', fob: false, fuelUsed: false}))).input.fuelComputer;
        expect(fuel).toEqual({isInterfaced: true, unit: 'IMP', type: 'JetB', fobTransmitted: false, fuelUsedTransmitted: false});
    });

    it('places extra XML under the instrument', () => {
        expect(parse(panelXml({extra: '<VFROnly>true</VFROnly>'})).vfrOnly).toBe(true);
    });
});
