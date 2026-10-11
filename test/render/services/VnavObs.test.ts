import {describe, expect, it, vi} from 'vitest';
import {FixTypeFlags} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle} from '../../harness/boot';
import {airport, intersection} from '../../harness/navdata/builders';
import {approach, Leg, withProcedures} from '../../harness/navdata/procedures';
import {pointFrom} from '../../harness/flight/geo';
import {APR_ARM_SWITCH, panelXml} from '../../harness/panelXml';
import {savedFlightplan} from '../../harness/storage';
import {activeIdent} from '../../harness/readers';
import {NavMode} from '../../../kln90b/data/VolatileMemory';

// C-1 (INVALID VNV): in the Leg mode the NAV 4 waypoint must be the active waypoint or one ahead in the active flight
// plan; in the OBS mode it must be the active waypoint. FPL 0 KAAA, KBBB, KCCC with the leg to KBBB active, then OBS.

const KAAA = airport('KAAA', 47.0, 7.0);
const KBBB = airport('KBBB', 47.0, 8.0);
const KCCC = airport('KCCC', 47.5, 8.5);

async function bootOnLeg(): Promise<HeadlessUnit> {
    const unit = await bootUnit({
        facilities: [KAAA, KBBB, KCCC], position: {lat: 47.0, lon: 7.5},
        storage: savedFlightplan(0, [KAAA, KBBB, KCCC]),
    });
    await settle(unit);
    return unit;
}

async function bootInObs(): Promise<HeadlessUnit> {
    const unit = await bootOnLeg();
    await unit.panel.obsMode();
    return unit;
}

describe('Vnav waypoint by navigation mode on a plan leg (C-1)', () => {
    // The other half of the rule, and the sibling of the OBS tests below: in the Leg mode a waypoint ahead is valid
    it('accepts a waypoint ahead in FPL 0 in the Leg mode (C-1)', async () => {
        const unit = await bootOnLeg();
        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_LEG);
        expect(activeIdent(unit)).toBe('KBBB');
        expect(unit.props.vnav.isValidVnavWpt(KCCC)).toBe(true);
    });

    // The unit is in ENR-OBS on the leg to KBBB, and the active waypoint is valid
    it('accepts the active waypoint in OBS mode (C-1)', async () => {
        const unit = await bootInObs();
        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_OBS);
        expect(activeIdent(unit)).toBe('KBBB');
        expect(unit.props.vnav.isValidVnavWpt(KBBB)).toBe(true);
    });

    // In the Leg mode KCCC (ahead in FPL 0) is valid; in OBS it must not be. OBS keeps the plan index of the active leg,
    // so the service has to look at the mode.
    it('rejects a waypoint ahead in FPL 0 in OBS mode (#185)', async () => {
        const unit = await bootInObs();
        expect(unit.props.vnav.isValidVnavWpt(KCCC)).toBe(false);
    });
});

// The approach modes: the same rule with ARM (the approach is armed within 30 NM of the airport) instead of ENR.
// FPL 0 is ENRAA, KPRC with an approach loaded: ENRAA, TXOAA (IAF), TXOAA (FAF), MAPAA, KPRC, the aircraft 6 NM before
// TXOAA, which is the active waypoint.
describe('Vnav waypoint in the armed approach modes (C-1)', () => {
    const kprc = airport('KPRC', 47.0, 8.0);
    const mapaa = intersection('MAPAA', 47.0, 8.0);
    const txoPos = pointFrom(kprc, 0, 5);
    const txo = intersection('TXOAA', txoPos.lat, txoPos.lon);
    const enrPos = pointFrom(txo, 0, 30);
    const enraa = intersection('ENRAA', enrPos.lat, enrPos.lon);

    async function armedOnApproach(): Promise<HeadlessUnit> {
        const apt = withProcedures(kprc, {
            approaches: [approach({
                type: ApproachType.APPROACH_TYPE_VOR, runway: '18',
                transitions: [{name: 'TXOAA', legs: [Leg.IF(txo, FixTypeFlags.IAF)]}],
                final: [Leg.IF(txo, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
            })],
        });
        const unit = await bootUnit({
            facilities: [apt, enraa, txo, mapaa], position: pointFrom(txo, 0, 6),
            panelXml: panelXml(APR_ARM_SWITCH),
            storage: {...savedFlightplan(0, [enraa, apt]), turnAnticipation: false},
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        await vi.advanceTimersByTimeAsync(2000);
        expect(activeIdent(unit)).toBe('TXOAA'); // Preconditions: TXOAA active, MAPAA ahead of it
        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ARM_LEG);
        return unit;
    }

    it('accepts a waypoint ahead in FPL 0 in ARM-LEG (C-1)', async () => {
        const unit = await armedOnApproach();
        expect(unit.props.vnav.isValidVnavWpt(mapaa)).toBe(true);
    });

    // The sibling of the test below: the active waypoint stays valid in ARM-OBS
    it('accepts the active waypoint in ARM-OBS (C-1)', async () => {
        const unit = await armedOnApproach();
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ARM_OBS);
        expect(unit.props.vnav.isValidVnavWpt(txo)).toBe(true);
    });

    // The OBS rule of #185 holds in ARM-OBS as well as in ENR-OBS
    it('rejects a waypoint ahead in FPL 0 in ARM-OBS (C-1, #185)', async () => {
        const unit = await armedOnApproach();
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ARM_OBS);
        expect(unit.props.vnav.isValidVnavWpt(mapaa)).toBe(false);
    });
});
