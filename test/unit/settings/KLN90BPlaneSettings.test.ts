// @vitest-environment happy-dom
/// <reference types="node" />
import {readFileSync} from 'node:fs';
import {beforeEach, describe, expect, it} from 'vitest';
import {KLN90BPlaneSettingsParser, KLN90PlaneSettings} from '../../../kln90b/settings/KLN90BPlaneSettings';
import {simEnv} from '../../harness/sim/install';

/**
 * Contract with aircraft: the panel.xml keys, their defaults and the LVars the parser writes (CLAUDE.md "Public
 * contract with aircraft", the wiki page panel.xml customization, cfg/panel.xml, the doc comments of LVars.ts).
 * FuelUnit and FuelType are const enums, so their values are written as literals.
 */

const sample = readFileSync('cfg/panel.xml', 'utf8');

const DEFAULTS = {
    takeHomeMode: false, basePath: 'html_ui/Pages/VCockpit/Instruments/NavSystems/GPS/KLN90B', debugMode: false, vfrOnly: false,
    input: {
        altimeterInterfaced: true, obsSource: 1, headingInput: false, electricitySimVar: '',
        airdata: {isInterfaced: false, baroSource: 0},
        fuelComputer: {isInterfaced: false, unit: 'GAL', type: 'Avgas', fobTransmitted: true, fuelUsedTransmitted: true},
        externalSwitches: {legObsSwitchInstalled: false, appArmSwitchInstalled: false},
    },
    output: {obsTarget: 0, writeGPSSimVars: true},
};

/** The parsed settings without altitudeAlertEnabled, whose default is the pinned bug (#NEW-4-1) */
const withoutAltAlert = (s: KLN90PlaneSettings) => {
    const {altitudeAlertEnabled, ...output} = s.output;
    return {...s, output};
};

/** A deep copy of DEFAULTS with the field at the dotted path changed */
function withField(path: string, value: unknown) {
    const copy = JSON.parse(JSON.stringify(DEFAULTS));
    const keys = path.split('.');
    let target = copy;
    for (const key of keys.slice(0, -1)) {
        target = target[key];
    }
    target[keys[keys.length - 1]] = value;
    return copy;
}

function parse(xml: string): KLN90PlaneSettings {
    return new KLN90BPlaneSettingsParser().parsePlaneSettings(new DOMParser().parseFromString(xml, 'text/xml'));
}

/** A document with a KLN90B instrument holding only the given elements */
const kln = (inner: string) => `<PlaneHTMLConfig><Instrument><Name>KLN90B</Name>${inner}</Instrument></PlaneHTMLConfig>`;

/** The LVar writes of a parse that read no key: the defaults of the three synced LVars */
function expectDefaultLVars(): void {
    const sim = simEnv().sim;
    expect(sim.lastWrite('L:KLN90B_ObsSource')!.value).toBe(1);
    expect(sim.lastWrite('L:KLN90B_ObsTarget')!.value).toBe(0);
    expect(sim.lastWrite('L:KLN90B_WriteGpsSimvars')!.value).toBe(1);
    expect(sim.lastWrite('L:KLN90B_ElectricitySimVarIndex')).toBeUndefined();
}

describe('panel.xml parser', () => {
    beforeEach(() => {
        simEnv().sim.reset();
    });

    // 1676e56: the index was written as the string "2", not the number
    it('writes the ElectricitySimVar index as a number (1676e56)', () => {
        const xml = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input><ElectricitySimVar>CIRCUIT SWITCH ON:2</ElectricitySimVar></Input></Instrument></PlaneHTMLConfig>';
        new KLN90BPlaneSettingsParser().parsePlaneSettings(new DOMParser().parseFromString(xml, 'text/xml'));

        expect(simEnv().sim.lastWrite('L:KLN90B_ElectricitySimVarIndex')!.value).toBe(2);
    });

    // Contract: cfg/panel.xml is the documented sample. It sets nearly every key to its default, so this test alone
    // cannot tell a key that was read from a default that was returned; the per-key table below does.
    describe('the sample cfg/panel.xml', () => {
        it('parses to the defaults, except the electricity SimVar', () => {
            const settings = parse(sample);

            expect(withoutAltAlert(settings)).toEqual(withField('input.electricitySimVar', 'CIRCUIT ON:1'));
            expect(typeof settings.input.obsSource).toBe('number');
        });

        it('disables the altitude alert, as the sample says', () => {
            expect(parse(sample).output.altitudeAlertEnabled).toBe(false);
        });

        it('writes the electricity index of the sample as 1', () => {
            parse(sample);

            expect(simEnv().sim.lastWrite('L:KLN90B_ElectricitySimVarIndex')!.value).toBe(1);
        });
    });

    // Contract: what an aircraft gets for every key it omits (wiki: panel.xml customization)
    describe('defaults', () => {
        it('are all defaults for an empty PlaneHTMLConfig', () => {
            expect(withoutAltAlert(parse('<PlaneHTMLConfig></PlaneHTMLConfig>'))).toEqual(DEFAULTS);
            expectDefaultLVars();
        });

        it('are all defaults when only another instrument is configured', () => {
            const xml = '<PlaneHTMLConfig><Instrument><Name>AS530</Name><VFROnly>true</VFROnly>'
                + '<Input><ObsSource>2</ObsSource></Input><Output><WriteGPSSimVars>false</WriteGPSSimVars></Output></Instrument></PlaneHTMLConfig>';

            expect(withoutAltAlert(parse(xml))).toEqual(DEFAULTS);
            expectDefaultLVars();
        });

        it('are all defaults for a KLN90B instrument without keys', () => {
            expect(withoutAltAlert(parse(kln('')))).toEqual(DEFAULTS);
            expectDefaultLVars();
        });

        it('read the keys of the KLN90B instrument when another instrument comes first', () => {
            const xml = '<PlaneHTMLConfig><Instrument><Name>AS530</Name><VFROnly>true</VFROnly></Instrument>'
                + '<Instrument><Name>KLN90B</Name><Input><ObsSource>2</ObsSource></Input></Instrument></PlaneHTMLConfig>';

            expect(withoutAltAlert(parse(xml))).toEqual(withField('input.obsSource', 2));
            expect(simEnv().sim.lastWrite('L:KLN90B_ObsSource')!.value).toBe(2);
        });
    });

    // Contract: the wiki page lists every key. One document per key, only that key, at a non-default value. The whole
    // parsed object must equal DEFAULTS with exactly that field changed: a wrong lookup path, swapped keys or a value
    // of the wrong type fails here although the sample test stays green.
    describe('each key alone', () => {
        // TakeHomeMode is not a supported key and is deliberately absent
        it.each([
            ['BasePath', '<BasePath>html_ui/Pages/VCockpit/Instruments/Foo/KLN</BasePath>', 'basePath', 'html_ui/Pages/VCockpit/Instruments/Foo/KLN'],
            ['VFROnly', '<VFROnly>true</VFROnly>', 'vfrOnly', true],
            ['Input.AltimeterInterfaced', '<Input><AltimeterInterfaced>false</AltimeterInterfaced></Input>', 'input.altimeterInterfaced', false],
            ['Input.ObsSource', '<Input><ObsSource>2</ObsSource></Input>', 'input.obsSource', 2],
            ['Input.HeadingInput', '<Input><HeadingInput>true</HeadingInput></Input>', 'input.headingInput', true],
            ['Input.ElectricitySimVar', '<Input><ElectricitySimVar>CIRCUIT SWITCH ON:3</ElectricitySimVar></Input>', 'input.electricitySimVar', 'CIRCUIT SWITCH ON:3'],
            ['Input.Airdata.IsInterfaced', '<Input><Airdata><IsInterfaced>true</IsInterfaced></Airdata></Input>', 'input.airdata.isInterfaced', true],
            ['Input.Airdata.BaroSource', '<Input><Airdata><BaroSource>2</BaroSource></Airdata></Input>', 'input.airdata.baroSource', 2],
            ['Input.FuelComputer.IsInterfaced', '<Input><FuelComputer><IsInterfaced>true</IsInterfaced></FuelComputer></Input>', 'input.fuelComputer.isInterfaced', true],
            ['Input.FuelComputer.Unit', '<Input><FuelComputer><Unit>KG</Unit></FuelComputer></Input>', 'input.fuelComputer.unit', 'KG'],
            ['Input.FuelComputer.Type', '<Input><FuelComputer><Type>JetA1</Type></FuelComputer></Input>', 'input.fuelComputer.type', 'JetA1'],
            ['Input.FuelComputer.FOBTransmitted', '<Input><FuelComputer><FOBTransmitted>false</FOBTransmitted></FuelComputer></Input>', 'input.fuelComputer.fobTransmitted', false],
            ['Input.FuelComputer.FuelUsedTransmitted', '<Input><FuelComputer><FuelUsedTransmitted>false</FuelUsedTransmitted></FuelComputer></Input>', 'input.fuelComputer.fuelUsedTransmitted', false],
            ['Input.ExternalSwitches.LegObsSwitchInstalled', '<Input><ExternalSwitches><LegObsSwitchInstalled>true</LegObsSwitchInstalled></ExternalSwitches></Input>', 'input.externalSwitches.legObsSwitchInstalled', true],
            ['Input.ExternalSwitches.AppArmSwitchInstalled', '<Input><ExternalSwitches><AppArmSwitchInstalled>true</AppArmSwitchInstalled></ExternalSwitches></Input>', 'input.externalSwitches.appArmSwitchInstalled', true],
            ['Output.ObsTarget', '<Output><ObsTarget>2</ObsTarget></Output>', 'output.obsTarget', 2],
            ['Output.WriteGPSSimVars', '<Output><WriteGPSSimVars>false</WriteGPSSimVars></Output>', 'output.writeGPSSimVars', false],
        ])('%s is read and nothing else changes', (_key, inner, path, value) => {
            expect(withoutAltAlert(parse(kln(inner)))).toEqual(withField(path, value));
        });

        // The default of this key is pinned separately (#NEW-4-1), so both values are compared on that field alone.
        // The `true` row equals the code default, so it cannot fail while that is true; it bites once the default is fixed.
        it.each([
            ['false', false],
            ['true', true],
        ])('Output.AltitudeAlertEnabled %s is read and nothing else changes', (text, value) => {
            const settings = parse(kln(`<Output><AltitudeAlertEnabled>${text}</AltitudeAlertEnabled></Output>`));

            expect(settings.output.altitudeAlertEnabled).toBe(value);
            expect(withoutAltAlert(settings)).toEqual(DEFAULTS);
        });
    });

    // Contract: LVars.ts doc comments ("Changes ... from the panel.xml on the fly") and the wiki's "synced with" notes.
    // The parser seeds these LVars, which aircraft may then override at runtime.
    describe('LVar writes', () => {
        it('seeds the synced LVars from the keys', () => {
            parse(kln('<Input><ObsSource>2</ObsSource><ElectricitySimVar>CIRCUIT ON:3</ElectricitySimVar></Input>'
                + '<Output><ObsTarget>1</ObsTarget><WriteGPSSimVars>false</WriteGPSSimVars></Output>'));

            const sim = simEnv().sim;
            expect(sim.lastWrite('L:KLN90B_ObsSource')!.value).toBe(2);
            expect(sim.lastWrite('L:KLN90B_ObsTarget')!.value).toBe(1);
            expect(sim.lastWrite('L:KLN90B_WriteGpsSimvars')!.value).toBe(0);
            expect(sim.lastWrite('L:KLN90B_ElectricitySimVarIndex')!.value).toBe(3);
        });

        it('writes no electricity index for a SimVar without one', () => {
            parse(kln('<Input><ElectricitySimVar>ELECTRICAL MAIN BUS VOLTAGE</ElectricitySimVar></Input>'));

            expect(simEnv().sim.lastWrite('L:KLN90B_ElectricitySimVarIndex')).toBeUndefined();
        });
    });

    // The maintainer's ruling: false is intended, and the sample, the wiki sample and cfg/panel.xml all show false.
    // The code defaults to true today, so every aircraft that omits the key gets an enabled alert.
    it.fails('defaults AltitudeAlertEnabled to false (#NEW-4-1)', () => {
        expect(parse('<PlaneHTMLConfig></PlaneHTMLConfig>').output.altitudeAlertEnabled).toBe(false);
    });
});
