// @vitest-environment happy-dom
import {beforeEach, describe, expect, it} from 'vitest';
import {ApproachLampGroup, Interconnect, NULL_OUTPUT, PortFailureSource, SimVarOutput} from '../../kln90b/Interconnect';
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

    // Until #366, the group passes the value through; the self-test value 3 lights both lamps
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
