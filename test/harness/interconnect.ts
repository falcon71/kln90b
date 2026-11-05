import {expect, vi} from 'vitest';
import {ApproachLampGroup, SimVarInput, SimVarOutput} from '../../kln90b/Interconnect';
import {bootOnStandardRoute} from './worldBoot';
import {AIRDATA, fuelComputer, HEADING_INPUT, panelXml, PanelOptions} from './panelXml';

/**
 * #451: the SimVar-to-port tables of the design (docs/superpowers/specs/2026-11-02-io-interfaces-design.md), written out
 * here and not computed from the Interconnect, and the recorder of the port uses. test/render/Interconnect.test.ts holds
 * the routing with them; the failure tests (#458) take the SimVars of a failed port from them
 */

/** Outputs on the same port whatever the panel.xml says */
export const FIXED_OUTPUTS: Record<string, string> = {
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
    'GPS IS ACTIVE FLIGHT PLAN': 'NAV superflag',
    'GPS IS ACTIVE WAY POINT': 'NAV superflag',
    'L:KLN90B_HSI_TF_FLAGS': 'NAV superflag',
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
    'L:KLN90B_ARINC429OUTPUTTRANSMITTED': 'Sim',
    'L:KLN90B_RS232OUTPUTTRANSMITTED': 'Sim',
};

/** Inputs on the same port whatever the panel.xml says, with the inputs of BASE switched on */
export const FIXED_INPUTS: Record<string, string> = {
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
export const NAV_DATA = [
    'GPS OBS VALUE', 'GPS WP TRACK ANGLE ERROR', 'GPS WP DESIRED TRACK', 'GPS WP BEARING', 'GPS WP TRUE BEARING',
    'GPS WP DISTANCE', 'GPS MAGVAR', 'GPS POSITION LAT', 'GPS POSITION LON', 'GPS GROUND SPEED', 'GPS GROUND TRUE TRACK',
    'GPS GROUND MAGNETIC TRACK', 'GPS FLIGHT PLAN WP COUNT', 'GPS FLIGHT PLAN WP INDEX', 'GPS WP NEXT ID', 'GPS WP NEXT LAT',
    'GPS WP NEXT LON', 'GPS WP PREV VALID', 'GPS WP PREV ID', 'GPS WP PREV LAT', 'GPS WP PREV LON', 'K:GPS_OBS_OFF',
    'GPS IS APPROACH ACTIVE',
];
/** Input.Airdata.Interface */
export const AIR_DATA = ['PRESSURE ALTITUDE', 'AIRSPEED TRUE', 'AIRSPEED MACH', 'AMBIENT TEMPERATURE', 'TOTAL AIR TEMPERATURE'];

export const routed = (dataPort: string, rmiPort: string, airdataPort: string, obsPort: string, headingPort: string) => ({
    ...Object.fromEntries(NAV_DATA.map(name => [name, dataPort])),
    'L:KLN90B_GPS_WP_BEARING': rmiPort,
    ...Object.fromEntries(AIR_DATA.map(name => [name, airdataPort])),
    'NAV OBS:1': obsPort,
    'PLANE HEADING DEGREES GYRO': headingPort,
});

/** Every input switched on, so that each interface is used */
export const BASE: PanelOptions = {
    ...fuelComputer(), ...AIRDATA, 'Input.Airdata.BaroSource': 1, ...HEADING_INPUT, 'Output.ObsTarget': 1,
};

export const FLIPPED: PanelOptions = {
    'Output.DataInterface': 'RS232', 'Output.RmiInterface': 'ARINC429', 'Input.Airdata.Interface': 'ARINC429',
    'Input.ObsInterface': 'ARINC429', 'Input.HeadingInterface': 'RS232',
};

/**
 * Not interfaces (the design's list): front-panel controls, the runtime overrides of panel.xml keys, the GPS receiver's
 * reads of the sim (the antenna is a coax, not a P901 interface), and what the gauge needs from the sim to boot
 */
export const NOT_INTERFACES = new Set<string>([
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

export interface Uses {
    /** SimVar name in upper case → the names of the ports it went through */
    viaPorts: Map<string, Set<string>>;
    /** Every SimVar read or written, in upper case */
    all: Set<string>;
}

/** Records every port use and every SimVar access from now on */
export function record(): () => Uses {
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

export const SIM_VARS = [{name: 'NUMBER OF ENGINES', unit: 'number', value: 2}, {name: 'GPS DRIVES NAV1', unit: 'bool', value: true}];

/**
 * Boots on the standard route with the given keys and flies it for a few seconds of calculation and filter ticks. With
 * powerOff, the unit is switched off at the end, so the zero state of SensorsOut.setPoweredOff is recorded too
 */
export async function flyWith(o: PanelOptions, simVars: { name: string, unit: string, value: number | boolean }[] = [],
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
export function expectRoutingWithin(uses: Uses, expected: Record<string, string>) {
    const actual = Object.fromEntries([...uses.viaPorts].map(([name, ports]) => [name, [...ports].join(' + ')]));
    const wrong = Object.entries(actual).filter(([name, port]) => expected[name] !== port);
    expect(wrong).toEqual([]);
}

export function expectRouting(uses: Uses, expected: Record<string, string>) {
    const actual = Object.fromEntries([...uses.viaPorts].map(([name, ports]) => [name, [...ports].join(' + ')]));
    // A SimVar on two ports shows as "A + B" and fails here, as does one on the wrong port or one not in the table
    expect(actual).toEqual(expected);
}

export function expectNoBypass(uses: Uses) {
    const bypassed = [...uses.all].filter(name => !uses.viaPorts.has(name) && !NOT_INTERFACES.has(name));
    expect(bypassed).toEqual([]);
}
