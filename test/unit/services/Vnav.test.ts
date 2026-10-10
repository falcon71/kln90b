import {describe, expect, it} from 'vitest';
import {Facility, ICAO} from '@microsoft/msfs-sdk';
import {Vnav, VnavState} from '../../../kln90b/services/Vnav';
import {NavPageState} from '../../../kln90b/data/VolatileMemory';
import {Sensors} from '../../../kln90b/Sensors';
import {Flightplan} from '../../../kln90b/data/flightplan/Flightplan';
import {airport, vor} from '../../harness/navdata/builders';
import {distanceNm} from '../../harness/flight/geo';

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

// 5-7 to 5-9: advisory VNAV. The service reads the navigation state (active waypoint, DIS, the NAV 4 inputs) and the
// sensors (GS, IND), so a stub nav state is enough. The numbers follow the Pilot's Guide example of figures 5-21 to
// 5-28: 64.8 NM to the waypoint at 7500 ft, SEL 1900 ft, offset 2 NM. Hand-derived (1 NM = 1852 / 0.3048 ft):
// - angle without offset: atan(5600 ft / 64.8 NM) = 0.8149 deg; with the 2 NM offset atan(5600 / 62.8 NM) = 0.8408 deg
// - with -1.8 deg the descent needs 5600 / tan(1.8 deg) = 29.3271 NM before the target
// - advisory altitude d NM before the target: 1900 + tan(1.8 deg) * d NM in ft: 7437.5 at 29 NM, 3809.5 at 10 NM

const WPT_A = airport('KAAA', 47.0, 7.0);
const WPT_B = airport('KBBB', 47.0, 8.0);
const WPT_C = airport('KCCC', 47.5, 8.5);

interface StubOptions {
    fplIdx: number;
    active: Facility;
    distToActive: number;
    ind: number | null;
    gs?: number;
    sel?: number;
    offset?: number;
    angle?: number | null;
    fromAlt?: number;
}

function vnavFor(o: StubOptions) {
    const nav = {
        activeWaypoint: {getActiveFplIdx: () => o.fplIdx, getActiveWpt: () => o.active},
        distToActive: o.distToActive,
        nav4SelectedAltitude: o.sel ?? 1900,
        nav4FromAlt: o.fromAlt ?? 0,
        nav4VnavWpt: null as Facility | null,
        nav4VnavDist: o.offset ?? 0,
        nav4VnavAngle: o.angle ?? null,
    };
    const sensors = {in: {gps: {groundspeed: o.gs ?? 160}, airdata: {getIndicatedAlt: () => o.ind}}} as unknown as Sensors;
    const plan = {getLegs: () => [{wpt: WPT_A}, {wpt: WPT_B}, {wpt: WPT_C}]} as unknown as Flightplan;
    return {vnav: new Vnav(nav as unknown as NavPageState, sensors, plan), nav};
}

/** Direct-to WPT_B, like the example (fplIdx -1) */
const dct = (o: Omit<StubOptions, 'fplIdx' | 'active'>) => vnavFor({fplIdx: -1, active: WPT_B, ...o});

describe('Vnav angle', () => {
    // 5-7, figure 5-24: SEL 1900 ft from 7500 ft over 64.8 NM shows ANGLE -0.8
    it('gives the angle from IND to SEL at the waypoint (5-7)', () => {
        const {vnav} = dct({distToActive: 64.8, ind: 7500});
        expect(vnav.getAngle()).toBeCloseTo(-0.8149, 3);
    });

    // 5-8, figure 5-25: the offset moves the target 2 NM before the waypoint
    it('gives the angle to the offset point before the waypoint (5-8)', () => {
        const {vnav} = dct({distToActive: 64.8, ind: 7500, offset: 2});
        expect(vnav.getAngle()).toBeCloseTo(-0.8408, 3);
    });

    // 5-7 NOTE: without an altitude input the FR altitude entered on NAV 4 replaces IND
    it('takes the FR altitude without an altitude input (5-7)', () => {
        const {vnav} = dct({distToActive: 64.8, ind: null, fromAlt: 7500});
        expect(vnav.getAngle()).toBeCloseTo(-0.8149, 3);
    });

    // 5-7: VNAV programs an ascent too: from 3000 to 9000 ft over 64.8 NM is +0.873 deg (atan(6000 / 64.8 NM))
    it('gives a positive angle for a climb (5-7)', () => {
        const {vnav} = dct({distToActive: 64.8, ind: 3000, sel: 9000});
        expect(vnav.getAngle()).toBeCloseTo(0.8730, 3);
    });

    // 5-9: the VNAV waypoint may be a waypoint ahead in FPL 0. Active leg to WPT_B (index 1), 20 NM to go, VNAV to WPT_C:
    // the distance is 20 NM plus the leg WPT_B-WPT_C, taken from the textbook haversine
    it('measures to a waypoint ahead in FPL 0 along the flight plan (5-9)', () => {
        const {vnav, nav} = vnavFor({fplIdx: 1, active: WPT_B, distToActive: 20, ind: 7500});
        nav.nav4VnavWpt = WPT_C;
        const dist = 20 + distanceNm(WPT_B, WPT_C);
        const expected = -Math.atan(5600 / (dist * 1852 / 0.3048)) * 180 / Math.PI;
        expect(dist).toBeCloseTo(56.3, 1);
        expect(vnav.getAngle()).toBeCloseTo(expected, 3);
    });

    // characterization: an angle of 10 degrees or more is shown as 0.0 (the field has one digit before the point)
    it('gives 0 for an angle of 10 degrees or more (characterization)', () => {
        const {vnav} = dct({distToActive: 5, ind: 7500});
        expect(vnav.getAngle()).toBe(0);
        vnav.armVnav();
        expect(vnav.state).toBe(VnavState.Inactive);
    });

    // characterization: the limit holds for a climb too: from 3000 to 9000 ft over 5 NM is atan(6000 / 30380) = 11.2 deg
    it('gives 0 for a climb of 10 degrees or more (characterization)', () => {
        const {vnav} = dct({distToActive: 5, ind: 3000, sel: 9000});
        expect(vnav.getAngle()).toBe(0);
        vnav.armVnav();
        expect(vnav.state).toBe(VnavState.Inactive);
    });

    // A programmed angle is shown as entered
    it('keeps a programmed angle (5-8)', () => {
        const {vnav} = dct({distToActive: 64.8, ind: 7500, angle: -1.8});
        expect(vnav.getAngle()).toBe(-1.8);
    });
});

describe('Vnav states', () => {
    // 5-8: starting VNAV at the displayed angle starts the descent at once; the advisory altitude is IND
    it('is active at once with the displayed angle, advisory altitude IND (5-8)', () => {
        const {vnav} = dct({distToActive: 64.8, ind: 7500, offset: 2});
        vnav.armVnav();
        expect(vnav.state).toBe(VnavState.Active);
        expect(vnav.advisoryAltitude).toBeCloseTo(7500, 0);
    });

    // 5-8: a programmed angle arms VNAV; the time to the descent is the distance to its start at GS:
    // (62.8 - 29.3271) NM at 160 kt = 753.1 s, more than ten minutes
    it('arms with a programmed angle and counts the time to the descent (5-8)', () => {
        const {vnav} = dct({distToActive: 64.8, ind: 7500, offset: 2, angle: -1.8});
        vnav.armVnav();
        expect(vnav.state).toBe(VnavState.Armed);
        expect(vnav.timeToVnav).toBeCloseTo(753.1, 0);
        expect(vnav.advisoryAltitude).toBeNull();
    });

    // 5-8 step 7: when the countdown reaches zero the advisory altitude replaces it. 31 NM to go, 29 NM to the target
    it('goes active at the start of the descent with the advisory altitude (5-8)', () => {
        const {vnav, nav} = dct({distToActive: 40, ind: 7500, offset: 2, angle: -1.8});
        vnav.armVnav();
        expect(vnav.state).toBe(VnavState.Armed);
        nav.distToActive = 31;
        vnav.tick();
        expect(vnav.state).toBe(VnavState.Active);
        expect(vnav.advisoryAltitude).toBeCloseTo(7437.5, 0);
    });

    // 5-8: the advisory altitude follows the path down: 10 NM before the target it is 3809.5 ft
    it('lowers the advisory altitude along the path (5-8)', () => {
        const {vnav, nav} = dct({distToActive: 31, ind: 7500, offset: 2, angle: -1.8});
        vnav.armVnav();
        nav.distToActive = 12;
        vnav.tick();
        expect(vnav.advisoryAltitude).toBeCloseTo(3809.5, 0);
    });

    // characterization: at the target the path has reached SEL and VNAV goes inactive
    it('goes inactive when the path reaches SEL at the target (characterization)', () => {
        const {vnav, nav} = dct({distToActive: 31, ind: 7500, offset: 2, angle: -1.8});
        vnav.armVnav();
        nav.distToActive = 2.1;
        vnav.tick();
        expect(vnav.state).toBe(VnavState.Active);
        nav.distToActive = 1.9;
        vnav.tick();
        expect(vnav.state).toBe(VnavState.Inactive);
    });

    // 5-7: an ascent: from 3000 to 9000 ft at +2.0 deg the climb needs 28.28 NM; 20 NM before the target it is
    // active with 9000 - tan(2 deg) * 20 NM = 4756.3 ft
    it('guides a climb with an advisory altitude below SEL (5-7)', () => {
        const {vnav} = dct({distToActive: 20, ind: 3000, sel: 9000, angle: 2});
        vnav.armVnav();
        expect(vnav.state).toBe(VnavState.Active);
        expect(vnav.advisoryAltitude).toBeCloseTo(4756.3, 0);
    });

    // characterization: the climb ends like the descent, when the path reaches SEL at the target (2 NM offset)
    it('goes inactive when the climb path reaches SEL at the target (characterization)', () => {
        const {vnav, nav} = dct({distToActive: 20, ind: 3000, sel: 9000, angle: 2, offset: 2});
        vnav.armVnav();
        nav.distToActive = 2.1;
        vnav.tick();
        expect(vnav.state).toBe(VnavState.Active);
        nav.distToActive = 1.9;
        vnav.tick();
        expect(vnav.state).toBe(VnavState.Inactive);
    });

    // 5-9, C-1: a VNAV waypoint the aircraft has passed (behind the active leg) is not valid any more; VNAV goes
    // inactive and NAV 4 falls back to the active waypoint
    it('drops a VNAV waypoint behind the active leg (5-9, C-1)', () => {
        const {vnav, nav} = vnavFor({fplIdx: 2, active: WPT_C, distToActive: 20, ind: 7500, angle: -1.8});
        nav.nav4VnavWpt = WPT_B;
        vnav.state = VnavState.Armed;
        expect(vnav.isValidVnavWpt(WPT_B)).toBe(false);
        expect(vnav.isValidVnavWpt(WPT_C)).toBe(true);
        vnav.tick();
        expect(vnav.state).toBe(VnavState.Inactive);
        expect(nav.nav4VnavWpt).toBeNull();
        expect(vnav.getVnavWaypoint()).toBe(WPT_C);
    });

    // C-1: a waypoint that is not in FPL 0 is not valid while FPL 0 is active
    it('rejects a waypoint outside FPL 0 while a plan leg is active (C-1)', () => {
        const {vnav} = vnavFor({fplIdx: 1, active: WPT_B, distToActive: 20, ind: 7500});
        expect(vnav.isValidVnavWpt(vor('ABC', 47.2, 8.2))).toBe(false);
    });

    // characterization: Nav4Page calls armVnav on every display tick while the cursor is over ANGLE, and armVnav
    // re-arms an active VNAV from the present altitude. 29 NM before the target the path is at 7437.5 ft; an aircraft
    // 437 ft below it, at 7000 ft, needs 5100 / tan(1.8 deg) = 26.71 NM, so VNAV goes back to armed with 2.29 NM to go.
    // The KLN 89 trainer kept an active VNAV when the cursor came onto its VS field, so the 90B may differ from the real
    // unit here; the question is filed, and this test pins only what the code does today.
    it('re-arms an active descent from the present altitude when armVnav runs again (characterization)', () => {
        let ind = 7500;
        const {vnav, nav} = dct({distToActive: 31, ind: 7500, offset: 2, angle: -1.8});
        // Reaches the private sensors of Vnav: vnavFor builds the sensors from a fixed altitude and the test changes it
        // between the two calls, with no public seam to hand Vnav a new altitude; a rename there breaks this test
        (vnav as any).sensors.in.airdata.getIndicatedAlt = () => ind;
        vnav.armVnav();
        expect(vnav.state).toBe(VnavState.Active);
        ind = 7000;
        nav.distToActive = 31;
        vnav.armVnav();
        expect(vnav.state).toBe(VnavState.Armed);
        expect(vnav.timeToVnav).toBeCloseTo(51.5, 0);
    });

    // characterization: a change of SEL, FR, the waypoint or the offset on NAV 4 disarms (Nav4Page calls disarmVnav),
    // which also forgets the programmed angle
    it('forgets the programmed angle when disarmed (characterization)', () => {
        const {vnav, nav} = dct({distToActive: 64.8, ind: 7500, offset: 2, angle: -1.8});
        vnav.armVnav();
        vnav.disarmVnav();
        expect(vnav.state).toBe(VnavState.Inactive);
        expect(nav.nav4VnavAngle).toBeNull();
    });
});

describe('Vnav.formatDuration', () => {
    // 5-8 (figure 5-27), 5-9: the countdown is minutes and seconds, "VNV IN 8:53" and "V 4:53"
    it('formats minutes and seconds (5-8, 5-9)', () => {
        expect(new Vnav({} as NavPageState, {} as Sensors, {} as Flightplan).formatDuration(533)).toBe(' 8:53');
        expect(new Vnav({} as NavPageState, {} as Sensors, {} as Flightplan).formatDuration(293)).toBe(' 4:53');
    });

    // characterization: under a minute the minutes are blank; no time is dashes
    it('blanks the minutes under a minute and dashes no time (characterization)', () => {
        const vnav = new Vnav({} as NavPageState, {} as Sensors, {} as Flightplan);
        expect(vnav.formatDuration(45)).toBe('  :45');
        expect(vnav.formatDuration(null)).toBe('--:--');
    });

    // The time is a fraction of seconds (distance / GS). The seconds are rounded after the minutes were cut, so 539.6 s
    // shows 8:60. 5-8, 5-9: the countdown is minutes and seconds. Whether the real unit rounds or truncates is unknown;
    // either way it never shows 60 seconds.
    it.fails('never shows 60 seconds (#184)', () => {
        const vnav = new Vnav({} as NavPageState, {} as Sensors, {} as Flightplan);
        expect([' 8:59', ' 9:00']).toContain(vnav.formatDuration(539.6));
    });
});
