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

    // characterization: VNAV starts only on an angle that shows other than 0.0. Right after the reset at the end of a
    // descent the aircraft is a few feet off SEL; the KLN 89 did nothing with its VS at 0 (trainer 2026-10-06).
    // 30 NM = 182284 ft: 140 ft is 0.044 deg (shown 0.0), 170 ft is 0.053 deg (shown -0.1) (#73)
    it('starts nothing on a computed angle that shows 0.0 (characterization, #73)', () => {
        const {vnav} = dct({distToActive: 30, ind: 2040});
        expect(vnav.getAngle()).toBeCloseTo(-0.044, 3);
        vnav.armVnav();
        expect(vnav.state).toBe(VnavState.Inactive);
    });

    it('starts on a computed angle that shows -0.1 (characterization, #73)', () => {
        const {vnav} = dct({distToActive: 30, ind: 2070});
        expect(vnav.getAngle()).toBeCloseTo(-0.053, 3);
        vnav.armVnav();
        expect(vnav.state).toBe(VnavState.Active);
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

    // 5-8 gives the time to the descent as the distance to its start at GS. The guide does not describe a ground speed
    // of 0; the inference is that the start never comes closer then, so VNAV stays armed while the start is ahead (#229
    // made the start at the target work at 0 kt, this is its counterpart)
    it('stays armed at zero ground speed while the start of the descent is ahead (5-8, inferred) (#229)', () => {
        const {vnav} = dct({distToActive: 64.8, ind: 7500, offset: 2, angle: -1.8, gs: 0});
        vnav.armVnav();
        vnav.tick();
        expect(vnav.state).toBe(VnavState.Armed);
        expect(vnav.timeToVnav).toBe(Infinity);
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

    // KLN 89 trainer (2026-10-06, again 2026-10-24): when the path reaches the selected altitude the 89 goes inactive and
    // resets its inputs: the from altitude becomes the selected one, the offset 0, the vertical speed 0, the waypoint
    // the active one; the selected altitude stays. On the 90B the programmed angle goes, so ANGLE shows the computed
    // angle again, and FR takes SEL (the mapping is a characterization) (#73)
    it('resets the inputs when the descent path reaches SEL (KLN 89 trainer, #73)', () => {
        const {vnav, nav} = dct({distToActive: 31, ind: 7500, offset: 2, angle: -1.8, fromAlt: 7500});
        vnav.armVnav();
        nav.distToActive = 2.1;
        vnav.tick();
        expect(vnav.state).toBe(VnavState.Active);
        expect(nav.nav4VnavWpt).toBe(WPT_B); // Precondition: armVnav stored the waypoint

        nav.distToActive = 1.9;
        vnav.tick();

        expect(vnav.state).toBe(VnavState.Inactive);
        expect(nav.nav4VnavAngle).toBeNull();
        expect(nav.nav4VnavDist).toBe(0);
        expect(nav.nav4VnavWpt).toBeNull();
        expect(nav.nav4FromAlt).toBe(1900);
        expect(nav.nav4SelectedAltitude).toBe(1900);
    });

    // The climb twin: the inputs reset when the climb path reaches SEL (KLN 89 trainer, see above) (#73)
    it('resets the inputs when the climb path reaches SEL (KLN 89 trainer, #73)', () => {
        const {vnav, nav} = dct({distToActive: 20, ind: 3000, sel: 9000, angle: 2, offset: 2, fromAlt: 3000});
        vnav.armVnav();
        nav.distToActive = 2.1;
        vnav.tick();
        expect(vnav.state).toBe(VnavState.Active);

        nav.distToActive = 1.9;
        vnav.tick();

        expect(vnav.state).toBe(VnavState.Inactive);
        expect(nav.nav4VnavAngle).toBeNull();
        expect(nav.nav4VnavDist).toBe(0);
        expect(nav.nav4VnavWpt).toBeNull();
        expect(nav.nav4FromAlt).toBe(9000);
        expect(nav.nav4SelectedAltitude).toBe(9000);
    });

    // 5-9, C-1: a VNAV waypoint the aircraft has passed (behind the active leg) is not valid any more; VNAV goes
    // inactive and NAV 4 falls back to the active waypoint. KLN 89 trainer 2026-10-24: an active and an armed VNAV whose
    // waypoint was sequenced reset the inputs as at the end of the path (#73)
    it.each([
        ['armed', VnavState.Armed],
        ['active', VnavState.Active],
    ])('drops a VNAV waypoint behind the active leg while %s and resets the inputs (5-9, C-1, KLN 89 trainer, #73)', (_name, state) => {
        const {vnav, nav} = vnavFor({fplIdx: 2, active: WPT_C, distToActive: 20, ind: 7500, angle: -1.8, offset: 2, fromAlt: 3000});
        nav.nav4VnavWpt = WPT_B;
        vnav.state = state;
        expect(vnav.isValidVnavWpt(WPT_B)).toBe(false);
        expect(vnav.isValidVnavWpt(WPT_C)).toBe(true);

        vnav.tick();

        expect(vnav.state).toBe(VnavState.Inactive);
        expect(nav.nav4VnavWpt).toBeNull();
        expect(vnav.getVnavWaypoint()).toBe(WPT_C);
        expect(nav.nav4VnavAngle).toBeNull();
        expect(nav.nav4VnavDist).toBe(0);
        expect(nav.nav4FromAlt).toBe(1900);
    });

    // KLN 89 trainer 2026-10-24: VNAV to a waypoint after the active one stayed active, with its inputs, when the active
    // waypoint was sequenced. Active leg to WPT_B, VNAV to WPT_C; then WPT_C becomes the active waypoint (#73)
    it('keeps VNAV to a waypoint further ahead through a sequence (KLN 89 trainer, #73)', () => {
        const options = {fplIdx: 1, active: WPT_B, distToActive: 40, ind: 7500, angle: -1.8, offset: 2};
        const {vnav, nav} = vnavFor(options);
        nav.nav4VnavWpt = WPT_C;
        vnav.armVnav();
        const before = vnav.state;
        expect(before).not.toBe(VnavState.Inactive); // Precondition: programmed

        options.fplIdx = 2;
        options.active = WPT_C;
        nav.distToActive = 30;
        vnav.tick();

        expect(vnav.state).not.toBe(VnavState.Inactive);
        expect(nav.nav4VnavWpt).toBe(WPT_C);
        expect(nav.nav4VnavAngle).toBe(-1.8);
        expect(nav.nav4VnavDist).toBe(2);
    });

    // characterization: a Direct To elsewhere ends the programming like a sequence (the trainer showed only the
    // sequence; one rule covers every way the VNAV waypoint becomes invalid) (#73)
    it('resets the inputs when a Direct To elsewhere ends VNAV (characterization, #73)', () => {
        const {vnav, nav} = vnavFor({fplIdx: -1, active: WPT_A, distToActive: 20, ind: 7500, angle: -1.8, offset: 2, fromAlt: 3000});
        nav.nav4VnavWpt = WPT_B;
        vnav.state = VnavState.Armed;

        vnav.tick();

        expect(vnav.state).toBe(VnavState.Inactive);
        expect(nav.nav4VnavWpt).toBeNull();
        expect(nav.nav4VnavAngle).toBeNull();
        expect(nav.nav4VnavDist).toBe(0);
        expect(nav.nav4FromAlt).toBe(1900);
    });

    // The reset runs whatever the state: a waypoint programmed on NAV 4 while VNAV is inactive, then passed (#73)
    it('resets the inputs when a waypoint programmed while inactive is passed (#73)', () => {
        const {vnav, nav} = vnavFor({fplIdx: 2, active: WPT_C, distToActive: 20, ind: 7500, offset: 2, fromAlt: 3000});
        nav.nav4VnavWpt = WPT_B;
        expect(vnav.state).toBe(VnavState.Inactive); // Precondition: never started

        vnav.tick();

        expect(nav.nav4VnavWpt).toBeNull();
        expect(nav.nav4VnavDist).toBe(0);
        expect(nav.nav4FromAlt).toBe(1900);
    });

    // While no VNAV waypoint is programmed the pilot may be typing SEL, the offset or FR: the reset never runs then (#73)
    it('keeps the inputs while no VNAV waypoint is programmed (#73)', () => {
        const {vnav, nav} = dct({distToActive: 64.8, ind: null, fromAlt: 7500, offset: 2});

        vnav.tick();
        vnav.tick();

        expect(vnav.state).toBe(VnavState.Inactive);
        expect(nav.nav4VnavDist).toBe(2);
        expect(nav.nav4FromAlt).toBe(7500);
        expect(nav.nav4SelectedAltitude).toBe(1900);
    });

    // C-1: a waypoint that is not in FPL 0 is not valid while FPL 0 is active
    it('rejects a waypoint outside FPL 0 while a plan leg is active (C-1)', () => {
        const {vnav} = vnavFor({fplIdx: 1, active: WPT_B, distToActive: 20, ind: 7500});
        expect(vnav.isValidVnavWpt(vor('ABC', 47.2, 8.2))).toBe(false);
    });

    // The maintainer's ruling on #194: Nav4Page calls armVnav on every display tick while the cursor is over ANGLE, and an
    // active VNAV keeps its path. 29 NM before the target the path is at 7437.5 ft; the aircraft at 7000 ft is 437 ft
    // below it, where a new arming would wait 2.29 NM for the path (characterization, #194)
    it('keeps an active descent when armVnav runs again below the path (characterization, #194)', () => {
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

        expect(vnav.state).toBe(VnavState.Active);
        expect(nav.nav4VnavAngle).toBe(-1.8);
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

    // 5-8 step 5 (figures 5-26, 5-27): VNAV started at the displayed angle, then -1.8 entered on ANGLE: armed again,
    // with (62.8 - 29.3271) NM at 160 kt = 753.1 s to the descent (#418)
    it('re-arms an active VNAV at a new angle (5-8, #418)', () => {
        const {vnav, nav} = dct({distToActive: 64.8, ind: 7500, offset: 2});
        vnav.armVnav();
        expect(vnav.state).toBe(VnavState.Active);

        vnav.setAngle(-1.8);

        expect(vnav.state).toBe(VnavState.Armed);
        expect(nav.nav4VnavAngle).toBe(-1.8);
        expect(vnav.timeToVnav).toBeCloseTo(753.1, 0);
        expect(vnav.advisoryAltitude).toBeNull();
    });

    // KLN 89 trainer 2026-10-24: a VS shallower than required, so that the start lies behind the aircraft, gives a new
    // advisory altitude at once. 29 NM to the target at -1.0: 1900 + tan(1 deg) * 29 NM = 4975.7 ft (#418)
    it('starts at once on a shallower angle whose start lies behind (KLN 89 trainer, #418)', () => {
        const {vnav} = dct({distToActive: 31, ind: 7500, offset: 2});
        vnav.armVnav();
        expect(vnav.state).toBe(VnavState.Active);

        vnav.setAngle(-1.0);

        expect(vnav.state).toBe(VnavState.Active);
        expect(vnav.advisoryAltitude).toBeCloseTo(4975.7, 0);
    });

    // An armed VNAV takes a new angle too: -2.5 at 64.8 NM needs 5600 / tan(2.5 deg) = 21.109 NM, so the start is
    // (62.8 - 21.109) NM away, 938.0 s at 160 kt (#418)
    it('re-arms an armed VNAV at a new angle (#418)', () => {
        const {vnav, nav} = dct({distToActive: 64.8, ind: 7500, offset: 2, angle: -1.8});
        vnav.armVnav();
        expect(vnav.state).toBe(VnavState.Armed);

        vnav.setAngle(-2.5);

        expect(vnav.state).toBe(VnavState.Armed);
        expect(nav.nav4VnavAngle).toBe(-2.5);
        expect(vnav.timeToVnav).toBeCloseTo(938.0, 0);
    });

    // characterization: an angle of 0.0 entered while active leaves VNAV inactive (#418)
    it('leaves VNAV inactive on an angle of 0.0 (characterization, #418)', () => {
        const {vnav} = dct({distToActive: 64.8, ind: 7500, offset: 2});
        vnav.armVnav();
        expect(vnav.state).toBe(VnavState.Active);

        vnav.setAngle(0);

        expect(vnav.state).toBe(VnavState.Inactive);
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

    // The time is a fraction of seconds (distance / GS). The seconds were rounded after the minutes were cut, so 539.6 s
    // showed 8:60 and 59.6 s showed :60. 5-8, 5-9: the countdown is minutes and seconds. Whether the real unit rounds or
    // truncates is unknown; either way it never shows 60 seconds.
    it('never shows 60 seconds (#184)', () => {
        const vnav = new Vnav({} as NavPageState, {} as Sensors, {} as Flightplan);
        expect([' 8:59', ' 9:00']).toContain(vnav.formatDuration(539.6));
        expect(['  :59', ' 1:00']).toContain(vnav.formatDuration(59.6));
        // A fraction below a half second is dropped by rounding and by truncation alike, only a ceiling adds a second
        expect(vnav.formatDuration(533.4)).toBe(' 8:53');
    });
});
