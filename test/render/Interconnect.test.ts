import {afterEach, describe, expect, it, vi} from 'vitest';
import {ApproachLampGroup, SimVarInput, SimVarOutput} from '../../kln90b/Interconnect';
import {bootOnStandardRoute} from '../harness/worldBoot';
import {bootUnit} from '../harness/boot';
import {AIRDATA, fuelComputer, HEADING_INPUT, LEG_OBS_SWITCH, panelXml, PanelOptions} from '../harness/panelXml';

/**
 * #451: every SimVar the unit reads or writes for an input or an output goes through the port of its interface, so that
 * the failure simulation (#366) can fail an interface and take exactly its SimVars with it. The tables are the design's
 * (docs/superpowers/specs/2026-11-02-io-interfaces-design.md), written out here and not computed from the Interconnect:
 * a SimVar routed to the wrong port, or written past the ports, fails the test.
 */

/** Outputs on the same port whatever the panel.xml says */
const FIXED_OUTPUTS: Record<string, string> = {
    'K:VOR1_SET': 'ARINC 429 TX',
    'L:KLN90B_XTK': 'ARINC 429 TX',
    'L:KLN90B_ROLLCOMMAND': 'ARINC 429 TX',
    'L:KLN90B_INTEGRITYWARN': 'ARINC 429 TX',
    'GPS WP ETE': 'ARINC 429 TX',
    'GPS WP ETA': 'ARINC 429 TX',
    'GPS ETE': 'ARINC 429 TX',
    'GPS ETA': 'ARINC 429 TX',
    'GPS COURSE TO STEER': 'ARINC 429 TX',
    'GPS WP CROSS TRK': 'Analog nav',
    'GPS CDI SCALING': 'Analog nav',
    'GPS IS ACTIVE FLIGHT PLAN': 'Analog nav',
    'GPS IS ACTIVE WAY POINT': 'Analog nav',
    'L:KLN90B_HSI_TF_FLAGS': 'Analog nav',
    'L:KLN90B_MSGLIGHT': 'MSG annunciator',
    'L:KLN90B_WPTLIGHT': 'WPT annunciator',
    'GPS APPROACH MODE': 'Approach lamps',
    'GPS GSI SCALING': 'Sim',
    'GPS VERTICAL ANGLE': 'Sim',
    'GPS VERTICAL ANGLE ERROR': 'Sim',
    'GPS VERTICAL ERROR': 'Sim',
    'GPS HAS GLIDEPATH': 'Sim',
    'GPS OVERRIDDEN': 'Sim',
    'L:KLN90B_ANNUNTEST': 'Sim',
};

/** Inputs on the same port whatever the panel.xml says, with the inputs of BASE switched on */
const FIXED_INPUTS: Record<string, string> = {
    'GPS DRIVES NAV1': 'GPS DISPLAYED',
    'NUMBER OF ENGINES': 'RS-232 IN',
    'FUEL TOTAL QUANTITY WEIGHT EX1': 'RS-232 IN',
    'ENG FUEL FLOW PPH:1': 'RS-232 IN',
    'ENG FUEL FLOW PPH:2': 'RS-232 IN',
    'GENERAL ENG FUEL USED SINCE START:1': 'RS-232 IN',
    'GENERAL ENG FUEL USED SINCE START:2': 'RS-232 IN',
    'KOHLSMAN SETTING HG:1': 'RS-232 IN',
};

/** Output.DataInterface: the navigation data an EFIS, a distance indicator or a moving map shows */
const NAV_DATA = [
    'GPS OBS VALUE', 'GPS WP TRACK ANGLE ERROR', 'GPS WP DESIRED TRACK', 'GPS WP BEARING', 'GPS WP TRUE BEARING',
    'GPS WP DISTANCE', 'GPS MAGVAR', 'GPS POSITION LAT', 'GPS POSITION LON', 'GPS GROUND SPEED', 'GPS GROUND TRUE TRACK',
    'GPS GROUND MAGNETIC TRACK', 'GPS FLIGHT PLAN WP COUNT', 'GPS FLIGHT PLAN WP INDEX', 'GPS WP NEXT ID', 'GPS WP NEXT LAT',
    'GPS WP NEXT LON', 'GPS WP PREV VALID', 'GPS WP PREV ID', 'GPS WP PREV LAT', 'GPS WP PREV LON', 'K:GPS_OBS_OFF',
    'GPS IS APPROACH ACTIVE',
];
/** Input.Airdata.Interface */
const AIR_DATA = ['PRESSURE ALTITUDE', 'AIRSPEED TRUE', 'AIRSPEED MACH', 'AMBIENT TEMPERATURE', 'TOTAL AIR TEMPERATURE'];

const routed = (dataPort: string, rmiPort: string, airdataPort: string, obsPort: string, headingPort: string) => ({
    ...Object.fromEntries(NAV_DATA.map(name => [name, dataPort])),
    'L:KLN90B_GPS_WP_BEARING': rmiPort,
    ...Object.fromEntries(AIR_DATA.map(name => [name, airdataPort])),
    'NAV OBS:1': obsPort,
    'PLANE HEADING DEGREES GYRO': headingPort,
});

/** Every input switched on, so that each interface is used */
const BASE: PanelOptions = {
    ...fuelComputer(), ...AIRDATA, 'Input.Airdata.BaroSource': 1, ...HEADING_INPUT, 'Output.ObsTarget': 1,
};

const FLIPPED: PanelOptions = {
    'Output.DataInterface': 'RS232', 'Output.RmiInterface': 'ARINC429', 'Input.Airdata.Interface': 'ARINC429',
    'Input.ObsInterface': 'ARINC429', 'Input.HeadingInterface': 'RS232',
};

/**
 * Not interfaces (the design's list): front-panel controls, the runtime overrides of panel.xml keys, the GPS receiver's
 * reads of the sim (the antenna is a coax, not a P901 interface), and what the gauge needs from the sim to boot
 */
const NOT_INTERFACES = new Set<string>([
    // Front-panel controls and the hot-swap switch (LVars.ts)
    'L:KLN90B_POWER', 'L:KLN90B_RIGHTSCAN', 'L:KLN90B_BRIGHTNESS', 'L:KLN90B_ALERTVOLUME', 'L:KLN90B_DISABLED',
    // Runtime overrides of panel.xml keys (SimVarSync)
    'L:KLN90B_OBSSOURCE', 'L:KLN90B_OBSTARGET', 'L:KLN90B_HEADINGINPUT', 'L:KLN90B_WRITEGPSSIMVARS',
    'L:KLN90B_ELECTRICITYSIMVARINDEX',
    // The GPS receiver (Gps.ts, GpsMeasurement.ts); VELOCITY WORLD and PLANE ALTITUDE only with the simulated receiver
    'PLANE LATITUDE', 'PLANE LONGITUDE', 'GROUND VELOCITY', 'E:ABSOLUTE TIME', 'VELOCITY WORLD X', 'VELOCITY WORLD Z',
    'PLANE ALTITUDE',
    // The boot (KLN90BCore): the key of the saved settings and the forced ready state
    'ATC MODEL', 'ENG COMBUSTION:1',
]);

interface Uses {
    /** SimVar name in upper case → the names of the ports it went through */
    viaPorts: Map<string, Set<string>>;
    /** Every SimVar read or written, in upper case */
    all: Set<string>;
}

/** Records every port use and every SimVar access from now on */
function record(): () => Uses {
    const writes = vi.spyOn(SimVarOutput.prototype, 'write');
    const lampWrites = vi.spyOn(ApproachLampGroup.prototype, 'write');
    const reads = vi.spyOn(SimVarInput.prototype, 'read');
    const globalGets = vi.spyOn(SimVar, 'GetSimVarValue');
    const globalSets = vi.spyOn(SimVar, 'SetSimVarValue');

    return () => {
        const viaPorts = new Map<string, Set<string>>();
        for (const spy of [writes, lampWrites, reads] as const) {
            spy.mock.calls.forEach((args, i) => {
                const name = String(args[0]).toUpperCase();
                const port = (spy.mock.contexts[i] as { name: string }).name;
                viaPorts.set(name, (viaPorts.get(name) ?? new Set()).add(port));
            });
        }
        const all = new Set<string>([...globalGets.mock.calls, ...globalSets.mock.calls].map(args => String(args[0]).toUpperCase()));
        return {viaPorts, all};
    };
}

const SIM_VARS = [{name: 'NUMBER OF ENGINES', unit: 'number', value: 2}, {name: 'GPS DRIVES NAV1', unit: 'bool', value: true}];

/**
 * Boots on the standard route with the given keys and flies it for a few seconds of calculation and filter ticks. With
 * powerOff, the unit is switched off at the end, so the zero state of SensorsOut.setPoweredOff is recorded too
 */
async function flyWith(o: PanelOptions, simVars: { name: string, unit: string, value: number | boolean }[] = [],
                       powerOff = false): Promise<Uses> {
    const result = record();
    const unit = await bootOnStandardRoute({panelXml: panelXml(o), simVars: [...SIM_VARS, ...simVars]});
    await vi.advanceTimersByTimeAsync(5000);
    if (powerOff) {
        await unit.panel.powerOff();
        await vi.advanceTimersByTimeAsync(2000);
    }
    expect(unit.errors).toEqual([]);
    return result();
}

/** Every SimVar recorded is on the port of the table; for a run that does not reach every SimVar of the table */
function expectRoutingWithin(uses: Uses, expected: Record<string, string>) {
    const actual = Object.fromEntries([...uses.viaPorts].map(([name, ports]) => [name, [...ports].join(' + ')]));
    const wrong = Object.entries(actual).filter(([name, port]) => expected[name] !== port);
    expect(wrong).toEqual([]);
}

function expectRouting(uses: Uses, expected: Record<string, string>) {
    const actual = Object.fromEntries([...uses.viaPorts].map(([name, ports]) => [name, [...ports].join(' + ')]));
    // A SimVar on two ports shows as "A + B" and fails here, as does one on the wrong port or one not in the table
    expect(actual).toEqual(expected);
}

function expectNoBypass(uses: Uses) {
    const bypassed = [...uses.all].filter(name => !uses.viaPorts.has(name) && !NOT_INTERFACES.has(name));
    expect(bypassed).toEqual([]);
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('the interface of each SimVar (#451)', () => {
    it('puts each SimVar on its port with the default interfaces', async () => {
        const uses = await flyWith(BASE);

        expectRouting(uses, {
            ...FIXED_OUTPUTS, ...FIXED_INPUTS,
            ...routed('ARINC 429 TX', 'OBI', 'RS-232 IN', 'OBS resolver', 'ARINC 429 EFIS RX'),
        });
        expectNoBypass(uses);
    });

    // The power-off writes the zero state of the L:KLN90B_* outputs; each goes through the port of its setter, which a
    // flipped RmiInterface tells apart from the default
    it('moves the routed SimVars to the other port when the keys say so, and keeps the baro on RS-232, also at the power-off', async () => {
        const uses = await flyWith({...BASE, ...FLIPPED}, [], true);

        expectRouting(uses, {
            ...FIXED_OUTPUTS, ...FIXED_INPUTS,
            ...routed('RS-232 OUT', 'ARINC 429 TX', 'ARINC 429 air data RX', 'ARINC 429 EFIS RX', 'RS-232 IN'),
        });
        expectNoBypass(uses);
    });

    // Without an active waypoint the setters take their null branches, which a flight on the route never reaches
    it('keeps the routed SimVars on their port without an active waypoint', async () => {
        const result = record();
        const unit = await bootUnit({panelXml: panelXml({...BASE, ...FLIPPED}), simVars: SIM_VARS});
        await vi.advanceTimersByTimeAsync(5000);
        expect(unit.errors).toEqual([]);
        const uses = result();

        expect(uses.viaPorts.get('L:KLN90B_GPS_WP_BEARING')).toBeDefined(); // the null branch ran
        expectRoutingWithin(uses, {
            ...FIXED_OUTPUTS, ...FIXED_INPUTS,
            ...routed('RS-232 OUT', 'ARINC 429 TX', 'ARINC 429 air data RX', 'ARINC 429 EFIS RX', 'RS-232 IN'),
        });
        expectNoBypass(uses);
    });

    // Without an air data computer the altitude is the gray code; with the GPS CRS switch the unit reads its position and
    // writes no K:GPS_OBS_* (Sensors.setMode); the electricity SimVar is the power input
    it('reads the gray code, the LEG/OBS switch and the power on their own ports', async () => {
        const uses = await flyWith({...LEG_OBS_SWITCH, 'Input.ElectricitySimVar': 'CIRCUIT ON:1'},
            [{name: 'CIRCUIT ON:1', unit: 'bool', value: true}]);

        expect(uses.viaPorts.get('PRESSURE ALTITUDE')).toEqual(new Set(['Gray code']));
        expect(uses.viaPorts.get('GPS OBS ACTIVE')).toEqual(new Set(['LEG/OBS CONTROL']));
        expect(uses.viaPorts.get('CIRCUIT ON:1')).toEqual(new Set(['Power']));
        expect(uses.viaPorts.has('K:GPS_OBS_OFF')).toBe(false);
        expectNoBypass(uses);
    });
});
