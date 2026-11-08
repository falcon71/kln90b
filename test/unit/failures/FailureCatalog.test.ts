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
        ['eeprom', () => undefined, undefined],
        ['superflag', () => undefined, undefined],
        ['msgWiring', s => { s.output.externalAnnunciators.msgInstalled = true; }, s => { s.output.externalAnnunciators.msgInstalled = false; }],
        ['wptBulb', s => { s.output.externalAnnunciators.wptInstalled = true; }, s => { s.output.externalAnnunciators.wptInstalled = false; }],
        ['actvDriver', s => { s.output.externalAnnunciators.actvInstalled = true; }, s => { s.output.externalAnnunciators.actvInstalled = false; }],
    ])('eligibility follows the plane settings: %s', (key, makeEligible, makeIneligible) => {
        if (makeIneligible) {
            expect(def(key).isEligible(plane(makeIneligible))).toBe(false);
        }
        expect(def(key).isEligible(plane(makeEligible))).toBe(true);
    });

    it('eeprom is internal, random and on TEST FAIL, with no ports (#459)', () => {
        const d = def('eeprom');
        expect(d.flrName).toBe('EEPROM');
        expect(d.random).toBe(true);
        expect(d.testFail).toBe(true);
        expect(d.outputs).toEqual([]);
        expect(d.inputs).toEqual([]);
        expect(d.message).toEqual(['EEPROM FAILURE: IC1045', 'EXTERNAL D-BAR INVALID']);
        expect(d.detection).toBe('internal');
    });

    // #459: the unit reads the EEPROM at a power-on only; every other part acts as it is now
    it('only the EEPROM is read at power-on (#459)', () => {
        expect(FAILURE_CATALOG.filter(d => d.readAtPowerOn === true).map(d => d.key)).toEqual(['eeprom']);
    });

    // The detector's tests of a part read at power-on assume a detection without delay: a part with a delayed one would
    // need tests of its own, as a part dropped from `detected` would then not come back in the same tick (#459, the M7
    // mutation of the review)
    it('every part read at power-on is detected internally (#459)', () => {
        const parts = FAILURE_CATALOG.filter(d => d.readAtPowerOn === true);
        expect(parts.length).toBeGreaterThan(0); // Precondition: there is one
        expect(parts.filter(d => d.detection !== 'internal').map(d => d.key)).toEqual([]);
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

describe('the lamp and superflag entries (#459)', () => {
    const lamps = ['msg', 'wpt', 'arm', 'actv'] as const;

    it('FLR names and messages', () => {
        expect(def('msgBulb').flrName).toBe('MSG BULB');
        expect(def('actvWiring').flrName).toBe('ACTV WIRING');
        expect(def('wptDriver').flrName).toBe('WPT DRIVER');
        expect(def('actvWiring').message).toEqual(['CHECK ACTV ANNUNCIATOR']);
        expect(def('msgWiring').message).toEqual(['CHECK MSG ANNUNCIATOR']);
        expect(def('armDriver').message).toEqual(['ARM ANNUNCIATOR FAIL']);
        expect(def('wptDriver').message).toEqual(['WPT ANNUNCIATOR FAIL']);
        expect(def('msgBulb').message).toBeNull();
        expect(def('superflag').flrName).toBe('SUPERFLAG');
        expect(def('superflag').message).toEqual(['NAV SUPER FLAG FAILURE']);
    });

    it('all are random, and only the drivers, the superflag and the EEPROM are on TEST FAIL', () => {
        const keys: FailureKey[] = ['superflag', 'eeprom'];
        for (const l of lamps) {
            keys.push(`${l}Bulb`, `${l}Wiring`, `${l}Driver`);
        }
        for (const k of keys) {
            expect(def(k).random).toBe(true);
            expect(def(k).testFail).toBe(k.endsWith('Driver') || k === 'superflag' || k === 'eeprom');
        }
    });

    it('detection, signal and lamp', () => {
        for (const l of lamps) {
            expect(def(`${l}Bulb`).detection).toBeNull();
            expect(def(`${l}Bulb`).lamp).toEqual({lamp: l, kind: 'bulb'});
            expect(def(`${l}Wiring`).detection).toBe('commandedOn');
            expect(def(`${l}Wiring`).signal).toBe(l);
            expect(def(`${l}Wiring`).lamp).toEqual({lamp: l, kind: 'wiring'});
            expect(def(`${l}Driver`).detection).toBe('commandedOff');
            expect(def(`${l}Driver`).signal).toBe(l);
            expect(def(`${l}Driver`).lamp).toEqual({lamp: l, kind: 'driver'});
        }
        expect(def('superflag').detection).toBe('commandedOn');
        expect(def('superflag').signal).toBe('superflag');
        expect(def('superflag').outputs).toEqual(['superflag']);
        expect(def('eeprom').detection).toBe('internal');
    });

    it('superflag and eeprom are eligible on a plane with everything off', () => {
        const bare = plane(s => {
            s.output.writeGPSSimVars = false;
            s.output.dataInterface = DataInterface.ARINC429;
            s.output.rmiInstalled = false;
            s.input.obsSource = 0;
            s.input.altimeterInterfaced = false;
        });
        expect(def('superflag').isEligible(bare)).toBe(true);
        expect(def('eeprom').isEligible(bare)).toBe(true);
    });

    it('armDriver needs the lamp and WriteGPSSimVars', () => {
        const s = plane(x => { x.output.externalAnnunciators.armInstalled = true; x.output.writeGPSSimVars = false; });
        expect(def('armDriver').isEligible(s)).toBe(false);
        s.output.writeGPSSimVars = true;
        expect(def('armDriver').isEligible(s)).toBe(true);
        expect(def('armDriver').isEligible(plane(x => { x.output.writeGPSSimVars = true; }))).toBe(false);
        expect(def('actvBulb').isEligible(plane(x => { x.output.externalAnnunciators.actvInstalled = true; x.output.writeGPSSimVars = false; }))).toBe(false);
    });

    it('msgWiring and wptDriver follow their lamp even without WriteGPSSimVars', () => {
        const s = plane(x => { x.output.writeGPSSimVars = false; x.output.externalAnnunciators.msgInstalled = true; });
        expect(def('msgWiring').isEligible(s)).toBe(true);
        expect(def('wptDriver').isEligible(s)).toBe(false);
        s.output.externalAnnunciators.wptInstalled = true;
        expect(def('wptDriver').isEligible(s)).toBe(true);
    });
});

describe('the GPS receiver entries (#460)', () => {
    it('the four entries', () => {
        const antenna = def('gpsAntenna');
        expect(antenna.flrName).toBe('GPS ANTENNA');
        expect(antenna.random).toBe(true);
        expect(antenna.testFail).toBe(true);
        expect(antenna.message).toEqual(['RCVR HARDWARE ERROR:', '0010']);
        expect(antenna.detection).toBe('internal');
        const rcvr = def('gpsReceiver');
        expect(rcvr.flrName).toBe('GPS RCVR');
        expect(rcvr.random).toBe(true);
        expect(rcvr.testFail).toBe(true);
        expect(rcvr.message).toEqual(['NO RCVR DATA']);
        expect(rcvr.detection).toBe('internal');
        const jam = def('gpsJamming');
        expect(jam.flrName).toBe('JAMMING');
        expect(jam.random).toBe(false);
        expect(jam.testFail).toBe(false);
        expect(jam.message).toBeNull();
        expect(jam.detection).toBeNull();
        const sat = def('faultySatellite');
        expect(sat.flrName).toBe('SATELLITE');
        expect(sat.random).toBe(false);
        expect(sat.testFail).toBe(false);
        expect(sat.message).toBeNull();
        expect(sat.detection).toBeNull();
        for (const d of [antenna, rcvr, jam, sat]) {
            expect(d.outputs).toEqual([]);
            expect(d.inputs).toEqual([]);
            expect(d.isEligible(plane())).toBe(true);
        }
    });

    it('only the antenna and the receiver are random candidates', () => {
        const keys = FAILURE_CATALOG.filter(d => d.random).map(d => d.key);
        expect(keys).toContain('gpsAntenna');
        expect(keys).toContain('gpsReceiver');
        expect(keys).not.toContain('gpsJamming');
        expect(keys).not.toContain('gpsSpoofing');
        expect(keys).not.toContain('faultySatellite');
    });
});

describe('the battery entry (#461)', () => {
    it('is the only entry the random trigger picks only while the battery is empty', () => {
        expect(FAILURE_CATALOG.filter(d => d.randomWhenEmpty).map(d => d.key)).toEqual(['battery']);
    });

    it('has no ports, no message and is always eligible', () => {
        const b = def('battery');
        expect(b.flrName).toBe('BATTERY');
        expect(b.outputs).toEqual([]);
        expect(b.inputs).toEqual([]);
        expect(b.message).toBeNull();
        expect(b.detection).toBeNull();
        expect(b.testFail).toBe(false);
        expect(b.isEligible(plane())).toBe(true);
    });
});

describe('the spoofing entry (#465)', () => {
    it('gpsSpoofing is in the catalog: SPOOFING, manual, no TEST FAIL', () => {
        const spoof = def('gpsSpoofing');
        expect(spoof.flrName).toBe('SPOOFING');
        expect(spoof.random).toBe(false);
        expect(spoof.testFail).toBe(false);
        expect(spoof.message).toBeNull();
        expect(spoof.detection).toBeNull();
        expect(spoof.outputs).toEqual([]);
        expect(spoof.inputs).toEqual([]);
        expect(spoof.isEligible(plane())).toBe(true);
    });
});
