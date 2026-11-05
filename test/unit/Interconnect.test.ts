// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, MockInstance, vi} from 'vitest';
import {
    ApproachLampGroup, CommandedSignals, Interconnect, LampOutput, NO_FAILURES, NULL_OUTPUT, NullStatePass, PortFailureSource, SimVarOutput,
} from '../../kln90b/Interconnect';
import {Lamp} from '../../kln90b/failures/FailureCatalog';
import {KLN90BPlaneSettingsParser, KLN90PlaneSettings} from '../../kln90b/settings/KLN90BPlaneSettings';
import {panelXml, PanelOptions} from '../harness/panelXml';
import {simEnv} from '../harness/sim/install';

// The parser writes LVars, and the unit stage has no teardown (test/README.md section 4)
beforeEach(() => simEnv().sim.reset());

const settingsFor = (o: PanelOptions = {}): KLN90PlaneSettings =>
    new KLN90BPlaneSettingsParser().parsePlaneSettings(new DOMParser().parseFromString(panelXml(o), 'text/xml'));

/**
 * The design of #451 (docs/superpowers/specs/2026-11-02-io-interfaces-design.md): each routed device is on the port its
 * panel.xml key names, resolved at every access so that a runtime override of the settings takes effect at the next
 * write
 */
describe('Interconnect routing (#451)', () => {
    it('puts the devices on their default ports', () => {
        const ic = new Interconnect(settingsFor());

        expect(ic.navData).toBe(ic.arinc429Tx);
        expect(ic.rmi).toBe(ic.obiBus);
        expect(ic.airdata).toBe(ic.rs232In);
        expect(ic.obs).toBe(ic.obsResolver);
        expect(ic.heading).toBe(ic.arinc429EfisRx);
    });

    it('puts the devices on the other port when their key says so', () => {
        const ic = new Interconnect(settingsFor({
            'Output.DataInterface': 'RS232', 'Output.RmiInterface': 'ARINC429', 'Input.Airdata.Interface': 'ARINC429',
            'Input.ObsInterface': 'ARINC429', 'Input.HeadingInterface': 'RS232',
        }));

        expect(ic.navData).toBe(ic.rs232Out);
        expect(ic.rmi).toBe(ic.arinc429Tx);
        expect(ic.airdata).toBe(ic.arinc429AirdataRx);
        expect(ic.obs).toBe(ic.arinc429EfisRx);
        expect(ic.heading).toBe(ic.rs232In);
    });

    it('follows a change of the settings between two accesses', () => {
        const settings = settingsFor();
        const ic = new Interconnect(settings);
        expect(ic.navData).toBe(ic.arinc429Tx);

        settings.output.dataInterface = 'RS232' as KLN90PlaneSettings['output']['dataInterface'];

        expect(ic.navData).toBe(ic.rs232Out);
    });

    it('returns the same instance on every access, so a write allocates nothing', () => {
        const ic = new Interconnect(settingsFor());

        expect(ic.navData).toBe(ic.navData);
        expect(ic.gps(ic.navData)).toBe(ic.gps(ic.navData));
    });

    it('names each port as the interconnect drawing does', () => {
        const ic = new Interconnect(settingsFor());

        expect([ic.arinc429Tx, ic.rs232Out, ic.analogNav, ic.obiBus, ic.wptAnnunciator, ic.msgAnnunciator,
            ic.actvAnnunciator, ic.armAnnunciator, ic.approachLamps, ic.sim, ic.arinc429EfisRx, ic.arinc429AirdataRx,
            ic.rs232In, ic.obsResolver, ic.grayCode, ic.gpsDisplayed, ic.legObsControl, ic.power].map(p => p.name)).toEqual([
            'ARINC 429 TX', 'RS-232 OUT', 'Analog nav', 'OBI', 'WPT annunciator', 'MSG annunciator', 'ACTV annunciator',
            'ARM annunciator', 'Approach lamps', 'Sim', 'ARINC 429 EFIS RX', 'ARINC 429 air data RX', 'RS-232 IN',
            'OBS resolver', 'Gray code', 'GPS DISPLAYED', 'LEG/OBS CONTROL', 'Power',
        ]);
    });
});

// Output.WriteGPSSimVars is a property of the sim's GPS SimVars, not of an interface; L:KLN90B_WriteGpsSimvars switches it
// in flight (LVars.ts), which SimVarSync writes into the settings object
describe('Interconnect.gps (#451)', () => {
    it('is the port while the GPS SimVars are written', () => {
        const ic = new Interconnect(settingsFor());

        expect(ic.gps(ic.navData)).toBe(ic.arinc429Tx);
    });

    it('is the null port without the GPS SimVars, and the port again once they are switched back on', () => {
        const settings = settingsFor({'Output.WriteGPSSimVars': false});
        const ic = new Interconnect(settings);
        expect(ic.gps(ic.navData)).toBe(NULL_OUTPUT);

        settings.output.writeGPSSimVars = true;
        expect(ic.gps(ic.navData)).toBe(ic.arinc429Tx);

        settings.output.writeGPSSimVars = false;
        expect(ic.gps(ic.navData)).toBe(NULL_OUTPUT);
    });
});

describe('ports (#451)', () => {
    it('writes a SimVar through a working port', () => {
        new SimVarOutput('Test').write('GPS WP DISTANCE', 'meters', 5);

        const write = simEnv().sim.lastWrite('GPS WP DISTANCE');
        expect(write?.value).toBe(5);
        expect(NULL_OUTPUT.isTransmitting).toBe(false);
    });

    it('writes nothing through the null port', () => {
        NULL_OUTPUT.write('GPS WP DISTANCE', 'meters', 5);

        expect(simEnv().sim.writes).toEqual([]);
    });

    it('reads a SimVar through an input port', () => {
        const ic = new Interconnect(settingsFor());
        simEnv().sim.set('PRESSURE ALTITUDE', 'feet', 4500);

        expect(ic.grayCode.read('PRESSURE ALTITUDE', 'feet')).toBe(4500);
        expect(ic.grayCode.isReceiving).toBe(true);
    });

    // With nothing failed the group passes the value through (#459 changes it for a failed lamp); the self-test value 3
    // lights both lamps
    it('passes GPS APPROACH MODE through the approach lamp group', () => {
        const ic = new Interconnect(settingsFor());
        expect(ic.approachLamps).toBeInstanceOf(ApproachLampGroup);

        ic.approachLamps.write('GPS APPROACH MODE', 'enum', 3);

        expect(simEnv().sim.lastWrite('GPS APPROACH MODE')?.value).toBe(3);
        expect(ic.approachLamps.isTransmitting).toBe(true);
    });
});

// #458: a failed output port sends nothing. A null-state pass lets the ports it lists write once more, and drops the
// writes of every other port (docs/superpowers/specs/2026-11-04-failures-framework-design.md, "The ports")
describe('failed ports and the null-state pass (#458)', () => {
    const failing429: PortFailureSource = {
        isOutputFailed: port => port === 'arinc429Tx',
        isInputFailed: () => false,
        lampFault: () => null,
    };
    // The parser writes LVars, so the writes count from the Interconnect on
    let mark = 0;
    const interconnect = (failures?: PortFailureSource) => {
        const ic = new Interconnect(settingsFor(), failures);
        mark = simEnv().sim.writes.length;
        return ic;
    };
    const writtenNames = () => simEnv().sim.writes.slice(mark).map(w => w.name);

    it('a failed port drops writes and a pass lets it through', () => {
        const ic = interconnect(failing429);
        expect(ic.arinc429Tx.isTransmitting).toBe(false);
        expect(ic.rs232Out.isTransmitting).toBe(true);

        ic.arinc429Tx.write('GPS WP DISTANCE', 'meters', 5);
        expect(writtenNames()).toEqual([]);

        ic.writeNullState([ic.arinc429Tx], () => {
            ic.arinc429Tx.write('GPS WP DISTANCE', 'meters', 0);
            ic.analogNav.write('GPS WP CROSS TRK', 'meters', 0);
        });
        expect(writtenNames()).toEqual(['GPS WP DISTANCE']);
        expect(simEnv().sim.lastWrite('GPS WP DISTANCE')?.value).toBe(0);

        // After the pass, the failed port drops again and the working one writes
        ic.arinc429Tx.write('GPS WP DISTANCE', 'meters', 7);
        ic.analogNav.write('GPS WP CROSS TRK', 'meters', 3);
        expect(writtenNames()).toEqual(['GPS WP DISTANCE', 'GPS WP CROSS TRK']);
    });

    it('a pass over all ports writes through failed ports', () => {
        const ic = interconnect(failing429);

        ic.writeNullState('all', () => {
            ic.arinc429Tx.write('GPS WP DISTANCE', 'meters', 0);
            ic.analogNav.write('GPS WP CROSS TRK', 'meters', 0);
        });

        expect(writtenNames()).toEqual(['GPS WP DISTANCE', 'GPS WP CROSS TRK']);
    });

    it('NULL_OUTPUT drops inside a pass', () => {
        const ic = interconnect(failing429);

        ic.writeNullState('all', () => NULL_OUTPUT.write('GPS WP DISTANCE', 'meters', 0));
        ic.writeNullState([NULL_OUTPUT], () => NULL_OUTPUT.write('GPS WP DISTANCE', 'meters', 0));

        expect(writtenNames()).toEqual([]);
    });

    it('the approach lamp group writes in a pass that lists one of its lamps, and drops in a pass that lists neither', () => {
        const ic = interconnect();

        ic.writeNullState([ic.arinc429Tx], () => ic.approachLamps.write('GPS APPROACH MODE', 'enum', 0));
        expect(writtenNames()).toEqual([]);

        ic.writeNullState([ic.armAnnunciator], () => ic.approachLamps.write('GPS APPROACH MODE', 'enum', 0));
        expect(writtenNames()).toEqual(['GPS APPROACH MODE']);
    });

    it('a port of a failed component is looked up by its property name', () => {
        const ic = interconnect();

        expect(ic.output('arinc429Tx')).toBe(ic.arinc429Tx);
        expect(ic.output('rs232Out')).toBe(ic.rs232Out);
        expect(ic.output('obiBus')).toBe(ic.obiBus);
        expect(ic.output('superflag')).toBe(ic.superflag);
    });

    it('a failed superflag port drops its writes and leaves the other ports alone (#459)', () => {
        const ic = interconnect({...failing429, isOutputFailed: port => port === 'superflag'});
        expect(ic.superflag.isTransmitting).toBe(false);
        expect(ic.obiBus.isTransmitting).toBe(true);

        ic.superflag.write('GPS WP DISTANCE', 'meters', 5);
        expect(writtenNames()).toEqual([]);
        ic.obiBus.write('GPS WP DISTANCE', 'meters', 6);
        expect(writtenNames()).toEqual(['GPS WP DISTANCE']);
    });

    it('a failed obiBus leaves the superflag port transmitting (#459)', () => {
        const ic = interconnect({...failing429, isOutputFailed: port => port === 'obiBus'});
        expect(ic.superflag.isTransmitting).toBe(true);
        expect(ic.obiBus.isTransmitting).toBe(false);
    });

    it('NO_FAILURES has no lamp fault (#459)', () => {
        for (const lamp of ['msg', 'wpt', 'arm', 'actv'] as const) {
            expect(NO_FAILURES.lampFault(lamp)).toBeNull();
        }
    });

    it('ends the pass when the write throws', () => {
        const ic = interconnect(failing429);

        expect(() => ic.writeNullState('all', () => {
            throw new Error('boom');
        })).toThrow('boom');
        ic.arinc429Tx.write('GPS WP DISTANCE', 'meters', 5);

        expect(writtenNames()).toEqual([]);
    });
});

// #459: a lamp port writes what the lamp does, not what the unit commands: false for a dark lamp (bulb or wiring), true
// for a stuck one (driver). It records what the unit commanded, for the failure detector. A null-state pass passes the
// value through, so a power change leaves every lamp dark (docs/failures.md, "Annunciators"; CMM 25-26)
describe('the lamp ports (#459)', () => {
    let faults: Partial<Record<Lamp, 'dark' | 'stuck' | null>>;
    const failures: PortFailureSource = {
        isOutputFailed: () => false,
        isInputFailed: () => false,
        lampFault: lamp => faults[lamp] ?? null,
    };
    let commanded: CommandedSignals;
    let pass: NullStatePass;
    let set: MockInstance<typeof SimVar.SetSimVarValue>;
    /** The values written, in order */
    const written = () => set.mock.calls.map(args => args[2]);

    beforeEach(() => {
        faults = {};
        commanded = new CommandedSignals();
        pass = new NullStatePass();
        set = vi.spyOn(SimVar, 'SetSimVarValue');
    });
    afterEach(() => set.mockRestore());

    const msgLamp = () => new LampOutput('MSG annunciator', 'msg', failures, commanded, pass);

    it('a working lamp writes the commanded value', () => {
        const lamp = msgLamp();

        lamp.write('L:KLN90B_MsgLight', 'bool', true);
        lamp.write('L:KLN90B_MsgLight', 'bool', false);

        expect(written()).toEqual([true, false]);
        expect(set.mock.calls[0][0]).toBe('L:KLN90B_MsgLight');
        expect(set.mock.calls[0][1]).toBe('bool');
    });

    it('a dark lamp writes false for true', () => {
        faults.msg = 'dark';
        const lamp = msgLamp();

        lamp.write('L:KLN90B_MsgLight', 'bool', true);
        lamp.write('L:KLN90B_MsgLight', 'bool', false);

        expect(written()).toEqual([false, false]);
    });

    it('a stuck lamp writes true for false', () => {
        faults.msg = 'stuck';
        const lamp = msgLamp();

        lamp.write('L:KLN90B_MsgLight', 'bool', false);
        lamp.write('L:KLN90B_MsgLight', 'bool', true);

        expect(written()).toEqual([true, true]);
    });

    it('asks about its own lamp', () => {
        faults.wpt = 'dark';
        const lamp = msgLamp();

        lamp.write('L:KLN90B_MsgLight', 'bool', true);

        expect(written()).toEqual([true]);
    });

    it('records the commanded value, not the written one', () => {
        faults.msg = 'dark';
        const lamp = msgLamp();

        lamp.write('L:KLN90B_MsgLight', 'bool', true);

        expect(commanded.take('msg', true)).toBe(true);
        expect(commanded.take('msg', false)).toBe(false);

        faults.msg = 'stuck';
        lamp.write('L:KLN90B_MsgLight', 'bool', false);

        expect(commanded.take('msg', false)).toBe(true);
        expect(commanded.take('msg', true)).toBe(false);
        expect(commanded.take('wpt', false)).toBe(false);
    });

    it('a null-state pass writes the value as given and records nothing', () => {
        faults.msg = 'stuck';
        const lamp = msgLamp();

        pass.run('all', () => lamp.write('L:KLN90B_MsgLight', 'bool', false));

        expect(written()).toEqual([false]);
        expect(commanded.take('msg', false)).toBe(false);
        expect(commanded.take('msg', true)).toBe(false);
    });

    it('a null-state pass that does not list the lamp drops the write', () => {
        faults.msg = 'stuck';
        const lamp = msgLamp();

        pass.run([NULL_OUTPUT], () => lamp.write('L:KLN90B_MsgLight', 'bool', false));

        expect(written()).toEqual([]);
        expect(commanded.take('msg', false)).toBe(false);
    });

    it('reports whether a pass runs', () => {
        expect(pass.isRunning()).toBe(false);
        pass.run([], () => expect(pass.isRunning()).toBe(true));
        pass.run('all', () => expect(pass.isRunning()).toBe(true));
        expect(pass.isRunning()).toBe(false);
    });

    describe('the approach lamp group', () => {
        const group = () => new ApproachLampGroup(new SimVarOutput('ARM annunciator', undefined, pass),
            new SimVarOutput('ACTV annunciator', undefined, pass), failures, commanded, pass);
        const writeAll = (g: ApproachLampGroup, values: number[]) => values.forEach(v => g.write('GPS APPROACH MODE', 'enum', v));

        it('passes the value through with nothing failed', () => {
            writeAll(group(), [0, 1, 2, 3]);

            expect(written()).toEqual([0, 1, 2, 3]);
            expect(set.mock.calls[0][0]).toBe('GPS APPROACH MODE');
        });

        it('a dark ARM clears bit 1', () => {
            faults.arm = 'dark';
            writeAll(group(), [0, 1, 2, 3]);

            expect(written()).toEqual([0, 0, 2, 2]);
        });

        it('a dark ACTV clears bit 2', () => {
            faults.actv = 'dark';
            writeAll(group(), [0, 1, 2, 3]);

            expect(written()).toEqual([0, 1, 0, 1]);
        });

        it('a stuck ARM sets bit 1', () => {
            faults.arm = 'stuck';
            writeAll(group(), [0, 1, 2, 3]);

            expect(written()).toEqual([1, 1, 3, 3]);
        });

        it('a stuck ACTV sets bit 2', () => {
            faults.actv = 'stuck';
            writeAll(group(), [0, 1, 2, 3]);

            expect(written()).toEqual([2, 3, 2, 3]);
        });

        it('a dark ARM and a stuck ACTV', () => {
            faults.arm = 'dark';
            faults.actv = 'stuck';
            writeAll(group(), [0, 1, 2, 3]);

            expect(written()).toEqual([2, 2, 2, 2]);
        });

        it('records the commanded bits', () => {
            faults.arm = 'dark';
            faults.actv = 'stuck';
            const g = group();
            const taken = () => ({
                armOn: commanded.take('arm', true), armOff: commanded.take('arm', false),
                actvOn: commanded.take('actv', true), actvOff: commanded.take('actv', false),
            });

            g.write('GPS APPROACH MODE', 'enum', 0);
            expect(taken()).toEqual({armOn: false, armOff: true, actvOn: false, actvOff: true});
            g.write('GPS APPROACH MODE', 'enum', 1);
            expect(taken()).toEqual({armOn: true, armOff: false, actvOn: false, actvOff: true});
            g.write('GPS APPROACH MODE', 'enum', 2);
            expect(taken()).toEqual({armOn: false, armOff: true, actvOn: true, actvOff: false});
            g.write('GPS APPROACH MODE', 'enum', 3);
            expect(taken()).toEqual({armOn: true, armOff: false, actvOn: true, actvOff: false});
        });

        it('a null-state pass writes the value as given and records nothing', () => {
            faults.arm = 'stuck';
            const g = group();

            pass.run('all', () => g.write('GPS APPROACH MODE', 'enum', 0));

            expect(written()).toEqual([0]);
            expect([commanded.take('arm', true), commanded.take('arm', false), commanded.take('actv', true),
                commanded.take('actv', false)]).toEqual([false, false, false, false]);
        });
    });

    it('the Interconnect wires the lamp ports to its failures and its command flags', () => {
        faults = {msg: 'dark', wpt: 'stuck', arm: 'stuck'};
        const ic = new Interconnect(settingsFor(), failures);
        set.mockClear();

        ic.msgAnnunciator.write('L:KLN90B_MsgLight', 'bool', true);
        ic.wptAnnunciator.write('L:KLN90B_WptLight', 'bool', false);
        ic.approachLamps.write('GPS APPROACH MODE', 'enum', 0);
        expect(written()).toEqual([false, true, 1]);
        expect(ic.commanded.take('msg', true)).toBe(true);
        expect(ic.commanded.take('wpt', false)).toBe(true);
        expect(ic.commanded.take('arm', false)).toBe(true);
        expect(ic.msgAnnunciator).toBeInstanceOf(LampOutput);
        expect(ic.wptAnnunciator).toBeInstanceOf(LampOutput);

        ic.writeNullState('all', () => {
            ic.wptAnnunciator.write('L:KLN90B_WptLight', 'bool', false);
            ic.approachLamps.write('GPS APPROACH MODE', 'enum', 0);
        });
        expect(written()).toEqual([false, true, 1, false, 0]);
        expect(ic.commanded.take('wpt', false)).toBe(false);
    });
});
