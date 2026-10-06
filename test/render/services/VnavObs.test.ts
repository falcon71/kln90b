import {describe, expect, it} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../harness/boot';
import {airport} from '../../harness/navdata/builders';
import {savedFlightplan} from '../../harness/storage';
import {NavMode} from '../../../kln90b/data/VolatileMemory';

// C-1 (INVALID VNV): in the Leg mode the NAV 4 waypoint must be the active waypoint or one ahead in the active flight
// plan; in the OBS mode it must be the active waypoint. FPL 0 KAAA, KBBB, KCCC with the leg to KBBB active, then OBS.

const KAAA = airport('KAAA', 47.0, 7.0);
const KBBB = airport('KBBB', 47.0, 8.0);
const KCCC = airport('KCCC', 47.5, 8.5);

async function bootInObs(): Promise<HeadlessUnit> {
    const unit = await bootUnit({
        facilities: [KAAA, KBBB, KCCC], position: {lat: 47.0, lon: 7.5},
        storage: savedFlightplan(0, [KAAA, KBBB, KCCC]),
    });
    await settle(unit);
    await unit.panel.obsMode();
    return unit;
}

describe('Vnav waypoint in OBS mode', () => {
    // The sibling of the pin: the unit is in ENR-OBS on the leg to KBBB, and the active waypoint is valid
    it('accepts the active waypoint in OBS mode (C-1)', async () => {
        const unit = await bootInObs();
        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_OBS);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()?.icaoStruct.ident).toBe('KBBB');
        expect(unit.props.vnav.isValidVnavWpt(KBBB)).toBe(true);
    });

    // In the Leg mode KCCC (ahead in FPL 0) is valid; in OBS it must not be. The service does not look at the mode:
    // OBS keeps the plan index of the active leg, so a waypoint ahead still passes.
    it.fails('rejects a waypoint ahead in FPL 0 in OBS mode (#NEW-4-8)', async () => {
        const unit = await bootInObs();
        expect(unit.props.vnav.isValidVnavWpt(KCCC)).toBe(false);
    });
});
