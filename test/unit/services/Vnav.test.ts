import {describe, expect, it} from 'vitest';
import {Facility, ICAO} from '@microsoft/msfs-sdk';
import {Vnav, VnavState} from '../../../kln90b/services/Vnav';
import {NavPageState} from '../../../kln90b/data/VolatileMemory';
import {Sensors} from '../../../kln90b/Sensors';
import {Flightplan} from '../../../kln90b/data/flightplan/Flightplan';
import {airport, vor} from '../../harness/navdata/builders';

const KAAA = airport('KAAA', 46, 7);
const KBBB = airport('KBBB', 48, 9);

/** A navigation state with only what Vnav reads. fplIdx is -1 for a direct-to outside FPL 0. */
function navState(fplIdx: number, active: Facility, extra: Partial<NavPageState> = {}): NavPageState {
    return {
        activeWaypoint: {getActiveFplIdx: () => fplIdx, getActiveWpt: () => active},
        ...extra,
    } as unknown as NavPageState;
}

const fpl0 = {getLegs: () => [{wpt: KAAA}, {wpt: KBBB}]} as unknown as Flightplan;

const sensors = {in: {gps: {groundspeed: 120}, airdata: {getIndicatedAlt: () => 3000}}} as unknown as Sensors;

describe('Vnav.isValidVnavWpt (9adbf97)', () => {
    // C-1: with a direct-to, the VNAV waypoint has to be the active waypoint, and that waypoint does not have to be in FPL 0
    const vnav = new Vnav(navState(-1, vor('ABC', 47, 8)), sensors, fpl0);

    it('accepts the active waypoint of a direct-to that is not in FPL 0, given as a structural copy', () => {
        const copy = {...vor('ABC', 47, 8), icaoStruct: ICAO.value('V', 'K1', '', 'ABC')};
        expect(vnav.isValidVnavWpt(copy)).toBe(true);
    });

    it('rejects another waypoint that is not in FPL 0', () => {
        expect(vnav.isValidVnavWpt(vor('ABD', 47.1, 8.1))).toBe(false);
    });

    it('rejects a waypoint of FPL 0 that is not the direct-to target', () => {
        expect(vnav.isValidVnavWpt(KAAA)).toBe(false);
    });
});

describe('Vnav.tick with the VNAV waypoint cleared (#4 f6f62ec)', () => {
    // A reset clears nav4VnavWpt while VNAV is armed or active. Active leg 1 of FPL 0, 5 NM to go, a 3 degree descent
    // to 1000 ft from 3000 ft.
    it.each([
        ['active', VnavState.Active],
        ['armed', VnavState.Armed],
    ])('goes inactive when VNAV is %s', (_name, state) => {
        const nav = navState(1, KBBB, {
            nav4VnavWpt: null, distToActive: 5, nav4VnavAngle: -3, nav4SelectedAltitude: 1000, nav4FromAlt: 3000, nav4VnavDist: 0,
        });
        const vnav = new Vnav(nav, sensors, fpl0);
        vnav.state = state;
        // Left over from an earlier tick, so that the null assertions below see the reset and not the initial value
        vnav.advisoryAltitude = 2000;
        vnav.timeToVnav = 60;

        vnav.tick();

        expect(vnav.state).toBe(VnavState.Inactive);
        expect(nav.nav4VnavWpt).toBeNull();
        expect(vnav.advisoryAltitude).toBeNull();
        expect(vnav.timeToVnav).toBeNull();
    });
});
