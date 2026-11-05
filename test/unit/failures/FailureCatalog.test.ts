import {describe, expect, it} from 'vitest';
import {FAILURE_CATALOG, FailureKey, failureSettingName} from '../../../kln90b/failures/FailureCatalog';
import {DataInterface, KLN90PlaneSettings, ObsInterface, RmiInterface} from '../../../kln90b/settings/KLN90BPlaneSettings';

/** The parser's defaults: ARINC 429 data, OBI RMI not installed, analog OBS from device 1, no air data, no fuel computer */
function plane(change: (s: KLN90PlaneSettings) => void = () => undefined): KLN90PlaneSettings {
    const s: KLN90PlaneSettings = {
        takeHomeMode: false, basePath: '', debugMode: false, vfrOnly: false,
        input: {
            altimeterInterfaced: true, obsSource: 1, headingInput: false, headingSimVar: '', electricitySimVar: '',
            airdata: {isInterfaced: false, baroSource: 0, interface: DataInterface.RS232},
            obsInterface: ObsInterface.ANALOG, headingInterface: DataInterface.ARINC429,
            fuelComputer: {isInterfaced: false} as KLN90PlaneSettings['input']['fuelComputer'],
            externalSwitches: {legObsSwitchInstalled: false, appArmSwitchInstalled: false},
        },
        output: {
            obsTarget: 0, altitudeAlertEnabled: false, writeGPSSimVars: true, rmiInterface: RmiInterface.OBI, rmiInstalled: false,
            dataInterface: DataInterface.ARINC429,
            externalAnnunciators: {msgInstalled: false, wptInstalled: false, armInstalled: false, actvInstalled: false},
        },
    };
    change(s);
    return s;
}

const def = (key: FailureKey) => FAILURE_CATALOG.find(d => d.key === key)!;

describe('FAILURE_CATALOG', () => {
    it('every flrName fits FLR 2 and 3', () => {
        for (const d of FAILURE_CATALOG) {
            expect(d.flrName.length).toBeLessThanOrEqual(11);
            expect(d.flrName).toBe(d.flrName.toUpperCase());
        }
        expect(new Set(FAILURE_CATALOG.map(d => d.flrName)).size).toBe(FAILURE_CATALOG.length);
    });

    it('every message line fits the MSG page', () => {
        for (const d of FAILURE_CATALOG) {
            for (const line of d.message ?? []) {
                expect(line.length).toBeLessThanOrEqual(23);
            }
        }
    });

    it('keys are unique and match the setting names', () => {
        expect(new Set(FAILURE_CATALOG.map(d => d.key)).size).toBe(FAILURE_CATALOG.length);
        expect(failureSettingName('rs232In')).toBe('failure_rs232In');
    });

    // The eligible and the ineligible case of each key; undefined: the key has no ineligible case
    it.each<[FailureKey, (s: KLN90PlaneSettings) => void, ((s: KLN90PlaneSettings) => void) | undefined]>([
        ['arinc429Out', () => undefined, undefined],
        ['rs232Out', s => { s.output.dataInterface = DataInterface.RS232; }, s => { s.output.dataInterface = DataInterface.ARINC429; }],
        ['rmiOutput', s => { s.output.rmiInstalled = true; }, s => { s.output.rmiInstalled = false; }],
        ['obsResolver', s => { s.input.obsSource = 1; }, s => { s.input.obsSource = 0; }],
        ['rs232In', s => { s.input.airdata.isInterfaced = true; s.input.airdata.interface = DataInterface.ARINC429; s.input.airdata.baroSource = 1; },
            s => { s.input.airdata.isInterfaced = false; s.input.airdata.baroSource = 1; }],
        ['rs232Data', s => { s.input.fuelComputer.isInterfaced = true; }, () => undefined],
        ['airdata429', s => { s.input.airdata.isInterfaced = true; s.input.airdata.interface = DataInterface.ARINC429; },
            s => { s.input.airdata.isInterfaced = true; s.input.airdata.interface = DataInterface.RS232; }],
        ['altitude', () => undefined, s => { s.input.airdata.isInterfaced = true; }],
    ])('eligibility follows the plane settings: %s', (key, makeEligible, makeIneligible) => {
        if (makeIneligible) {
            expect(def(key).isEligible(plane(makeIneligible))).toBe(false);
        }
        expect(def(key).isEligible(plane(makeEligible))).toBe(true);
    });

    it('rs232In needs a device on RS-232, and the heading input counts', () => {
        expect(def('rs232In').isEligible(plane())).toBe(false);
        expect(def('rs232In').isEligible(plane(s => { s.input.headingInput = true; s.input.headingInterface = DataInterface.RS232; }))).toBe(true);
        expect(def('rs232In').isEligible(plane(s => { s.input.headingInput = false; s.input.headingInterface = DataInterface.RS232; }))).toBe(false);
        expect(def('rs232In').isEligible(plane(s => { s.input.airdata.isInterfaced = true; s.input.airdata.interface = DataInterface.RS232; }))).toBe(true);
    });

    it('an ARINC 429 RMI and an ARINC 429 OBS interface are not eligible', () => {
        expect(def('rmiOutput').isEligible(plane(s => { s.output.rmiInstalled = true; s.output.rmiInterface = RmiInterface.ARINC429; }))).toBe(false);
        expect(def('obsResolver').isEligible(plane(s => { s.input.obsInterface = ObsInterface.ARINC429; }))).toBe(false);
    });

    it('eligibility reads the settings at every call', () => {
        const s = plane();
        expect(def('obsResolver').isEligible(s)).toBe(true);
        s.input.obsSource = 0;
        expect(def('obsResolver').isEligible(s)).toBe(false);

        expect(def('rs232In').isEligible(s)).toBe(false);
        s.input.headingInput = true;
        s.input.headingInterface = DataInterface.RS232;
        expect(def('rs232In').isEligible(s)).toBe(true);
        s.input.headingInput = false;
        expect(def('rs232In').isEligible(s)).toBe(false);
    });
});
