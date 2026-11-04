import {afterEach, describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../harness/boot';
import {LEG_OBS_SWITCH, panelXml} from '../harness/panelXml';
import {
    BASE,
    expectNoBypass,
    expectRouting,
    expectRoutingWithin,
    FIXED_INPUTS,
    FIXED_OUTPUTS,
    FLIPPED,
    flyWith,
    record,
    routed,
    SIM_VARS,
} from '../harness/interconnect';

/**
 * #451: every SimVar the unit reads or writes for an input or an output goes through the port of its interface, so that
 * the failure simulation (#366) can fail an interface and take exactly its SimVars with it. The tables are the design's
 * (docs/superpowers/specs/2026-11-02-io-interfaces-design.md), written out in test/harness/interconnect.ts and not computed
 * from the Interconnect: a SimVar routed to the wrong port, or written past the ports, fails the test.
 */

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
