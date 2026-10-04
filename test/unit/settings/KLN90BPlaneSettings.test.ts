// @vitest-environment happy-dom
import {describe, expect, it} from 'vitest';
import {KLN90BPlaneSettingsParser} from '../../../kln90b/settings/KLN90BPlaneSettings';
import {simEnv} from '../../harness/sim/install';

describe('panel.xml parser', () => {
    // 1676e56: the index was written as the string "2", not the number
    it('writes the ElectricitySimVar index as a number (1676e56)', () => {
        const xml = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input><ElectricitySimVar>CIRCUIT SWITCH ON:2</ElectricitySimVar></Input></Instrument></PlaneHTMLConfig>';
        new KLN90BPlaneSettingsParser().parsePlaneSettings(new DOMParser().parseFromString(xml, 'text/xml'));

        expect(simEnv().sim.lastWrite('L:KLN90B_ElectricitySimVarIndex')!.value).toBe(2);
    });
});
