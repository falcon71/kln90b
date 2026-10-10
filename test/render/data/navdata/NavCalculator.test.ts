import {describe, expect, it, vi} from 'vitest';
import {Facility, FixTypeFlags, LegTurnDirection} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../../harness/boot';
import {airport, intersection, vor} from '../../../harness/navdata/builders';
import {approach, Leg, star, withProcedures} from '../../../harness/navdata/procedures';
import {savedFlightplan} from '../../../harness/storage';
import {activeIdent, fplIdents, messageLines, turnStackLength} from '../../../harness/readers';
import {bootOnStandardRoute} from '../../../harness/worldBoot';
import {angleBetween, courseDeg, distanceNm, finalCourseDeg, pointBefore, pointFrom} from '../../../harness/flight/geo';
import {Screen} from '../../../harness/render/screen';
import {approachWorld, standardRoute} from '../../../harness/fixtures';
import {KLNFixType} from '../../../../kln90b/data/flightplan/Flightplan';

const fpl0 = (unit: HeadlessUnit) => unit.props.memory.fplPage.flightplans[0].getLegs();
const activeWaypoint = (unit: HeadlessUnit) => unit.props.memory.navPage.activeWaypoint;

// 3364def: when FROM and TO are the same fix the path of the leg has no center (NaN) and the guard in NavCalculator.tick
// sequences on. The Pilot's Guide has no page for sequencing through a repeated fix; the KLN 89 trainer does it (as in
// test/flight/flights/duplicateWaypoint.test.ts for #19). #23 is the same situation made by loading a STAR.
describe('a STAR whose first fix is the last enroute waypoint (#23, 3364def)', () => {
    /** KPT 20 NM north of KDST, ENRAA 30 NM north of KPT, STARB 8 NM from KPT on 135; the STAR KPT4H starts at KPT */
    async function loadStarFromKpt() {
        const kdst = airport('KDST', 47.0, 8.0);
        const kptPos = pointFrom(kdst, 0, 20);
        const kpt = vor('KPT', kptPos.lat, kptPos.lon);
        const enrPos = pointFrom(kpt, 0, 30);
        const enraa = intersection('ENRAA', enrPos.lat, enrPos.lon);
        const stbPos = pointFrom(kpt, 135, 8);
        const starb = intersection('STARB', stbPos.lat, stbPos.lon);
        const apt = withProcedures(kdst, {arrivals: [star('KPT4H', {common: [Leg.IF(kpt), Leg.TF(starb)]})]});
        const unit = await bootUnit({
            facilities: [apt, kpt, enraa, starb], position: pointFrom(kpt, 0, 3),
            storage: savedFlightplan(0, [enraa, kpt, apt]),
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 7');
        return {unit, kpt, starb};
    }

    // 6-5 and B-3: loading the STAR leaves the same fix twice in the plan and the unit says so on the MSG page
    it('loads the repeated fix twice and reports it on the MSG page (#23)', async () => {
        const {unit} = await loadStarFromKpt();

        expect(fplIdents(unit)).toEqual(['ENRAA', 'KPT', 'KPT', 'STARB', 'KDST']);
        expect(activeWaypoint(unit).getActiveFplIdx()).toBe(1);
        const messages = messageLines(unit);
        expect(messages).toContainEqual(['REDUNDANT WPTS IN FPL', 'EDIT ENROUTE WPTS', 'AS NECESSARY']);
    });

    // The KLN 89 trainer and 3364def: the zero-length leg KPT to KPT is sequenced through without an error
    it('sequences through the repeated fix to the next fix of the STAR without an error (#23)', async () => {
        const {unit, kpt, starb} = await loadStarFromKpt();
        expect(fplIdents(unit)).toEqual(['ENRAA', 'KPT', 'KPT', 'STARB', 'KDST']); // Precondition
        expect(activeWaypoint(unit).getActiveFplIdx()).toBe(1);

        await moveAircraft(unit, pointFrom(kpt, 180, 0.3), {groundspeedKt: 120});
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.errors).toEqual([]);
        expect(activeWaypoint(unit).getActiveFplIdx()).toBe(3);
        expect(activeIdent(unit)).toBe('STARB');
        expect(Math.abs(unit.props.memory.navPage.desiredTrack! - courseDeg(kpt, starb))).toBeLessThan(0.5);
    });
});

// 6-10: the example approach has a waypoint that is the IAF and the FAF at once; the unit lists it twice, once as the
// IAF and once as the FAF, and sequences through both to the MAP. The same guard as above (3364def) carries it.
describe('an approach whose IAF and FAF are the same fix (6-10)', () => {
    it('sequences through the IAF and FAF copies to the MAP without an error (6-10)', async () => {
        const kprc = airport('KPRC', 47.0, 8.0);
        const mapaa = intersection('MAPAA', 47.0, 8.0);
        const txoPos = pointFrom(kprc, 0, 5);
        const txo = intersection('TXOAA', txoPos.lat, txoPos.lon);
        const enrPos = pointFrom(txo, 0, 30);
        const enraa = intersection('ENRAA', enrPos.lat, enrPos.lon);
        const apt = withProcedures(kprc, {
            approaches: [approach({
                type: ApproachType.APPROACH_TYPE_VOR, runway: '18',
                transitions: [{name: 'TXOAA', legs: [Leg.IF(txo, FixTypeFlags.IAF)]}],
                final: [Leg.IF(txo, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
            })],
        });
        const unit = await bootUnit({
            facilities: [apt, enraa, txo, mapaa], position: pointFrom(txo, 0, 1.6), storage: savedFlightplan(0, [enraa, apt]),
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        expect(fplIdents(unit)).toEqual(['ENRAA', 'TXOAA', 'TXOAA', 'MAPAA', 'KPRC']); // Preconditions
        expect(fpl0(unit)[1].fixType).toBe(KLNFixType.IAF);
        expect(fpl0(unit)[2].fixType).toBe(KLNFixType.FAF);
        expect(activeWaypoint(unit).getActiveFplIdx()).toBe(1);

        await moveAircraft(unit, pointFrom(txo, 180, 0.3), {groundspeedKt: 120, trackTrue: 180});
        await vi.advanceTimersByTimeAsync(2000);

        expect(unit.errors).toEqual([]);
        expect(activeWaypoint(unit).getActiveFplIdx()).toBe(3);
        expect(activeIdent(unit)).toBe('MAPAA');
    });
});

const nav = (unit: HeadlessUnit) => unit.props.memory.navPage;

/** The standard route KAAA, ABC, KBBB as FPL 0, settled on KAAA; ABC is active */
async function onStandardRoute(storage: Record<string, unknown> = {}) {
    const unit = await bootOnStandardRoute({storage});
    expect(activeIdent(unit)).toBe('ABC'); // Precondition
    return {unit, ...standardRoute()};
}

// 3-32: NAV 3 tells the pilot which way to fly back to the course, "FLY L" when the aircraft is right of it. 3-31: the
// NAV 1 bar is the needle of a CDI: right of course it lies left of the center triangle, one dot per NM.
describe('cross track on NAV 3 and NAV 1', () => {
    it('reads FLY L 1.0nm and the bar one dot left, 1 NM right of the leg (3-32, 3-31)', async () => {
        const {unit, kaaa, abc} = await onStandardRoute();
        await unit.panel.selectPage('L', 'NAV 3');
        await unit.panel.selectPage('R', 'NAV 1');
        const onLeg = pointBefore(kaaa, abc, 20);
        const leg = courseDeg(onLeg, abc);

        await moveAircraft(unit, pointFrom(onLeg, leg + 90, 1), {groundspeedKt: 120, trackTrue: leg});
        await vi.advanceTimersByTimeAsync(500);

        const screen = Screen.read();
        expect(screen.rows('L')[3]).toBe('FLY L 1.0nm');
        // Center triangle at index 5 (TO), the bar one cell to its left
        expect(screen.rows('R')[1]).toBe('ηηηηΕθηηηηη');
    });

    it('reads FLY R 2.0nm and the bar two dots right, 2 NM left of the leg (3-32, 3-31)', async () => {
        const {unit, kaaa, abc} = await onStandardRoute();
        await unit.panel.selectPage('L', 'NAV 3');
        await unit.panel.selectPage('R', 'NAV 1');
        const onLeg = pointBefore(kaaa, abc, 20);
        const leg = courseDeg(onLeg, abc);

        await moveAircraft(unit, pointFrom(onLeg, leg - 90, 2), {groundspeedKt: 120, trackTrue: leg});
        await vi.advanceTimersByTimeAsync(500);

        const screen = Screen.read();
        expect(screen.rows('L')[3]).toBe('FLY R 2.0nm');
        expect(screen.rows('R')[1]).toBe('ηηηηηθηΕηηη');
    });
});

// 5-33 to 5-34 and 3-32: the leg is a great circle, so DTK changes along it. On a 900 NM leg along 60° N it turns from
// about 077° to about 103°. The aircraft is on the great circle, so the course from it to the waypoint is the DTK there.
describe('DTK along a great-circle leg (5-33, 5-34)', () => {
    it('is the great-circle course at the present position, near the start and near the end of the leg', async () => {
        const kwww = airport('KWWW', 60.0, 0.0);
        const keee = airport('KEEE', 60.0, 30.0);
        const nearStart = pointFrom(kwww, courseDeg(kwww, keee), 20);
        const nearEnd = pointBefore(kwww, keee, 20);
        const unit = await bootUnit({facilities: [kwww, keee], storage: savedFlightplan(0, [kwww, keee]), position: nearStart});
        await settle(unit);
        await unit.panel.selectPage('L', 'NAV 3');
        expect(activeIdent(unit)).toBe('KEEE');

        expect(nav(unit).desiredTrack!).toBeCloseTo(courseDeg(nearStart, keee), 2); // 77.50
        expect(Screen.read().rows('L')[1]).toBe('DTK    077°');

        await moveAircraft(unit, nearEnd, {groundspeedKt: 0});
        await vi.advanceTimersByTimeAsync(500);

        expect(nav(unit).desiredTrack!).toBeCloseTo(courseDeg(nearEnd, keee), 2); // 102.50
        expect(Screen.read().rows('L')[1]).toBe('DTK    103°');
    });
});

// 6-18: on a DME arc DIS is the straight-line distance to the active waypoint, not the distance along the arc.
describe('DIS on a DME arc (6-18)', () => {
    it('is the chord to the arc end fix, 12.9 NM, not the 14.0 NM along the arc', async () => {
        const abc = vor('ABC', 47.3, 8.3);
        const at = (b: number, nm: number) => pointFrom(abc, b, nm);
        const arcbg = intersection('ARCBG', at(270, 10).lat, at(270, 10).lon);
        const arcen = intersection('ARCEN', at(180, 10).lat, at(180, 10).lon);
        const fafaa = intersection('FAFAA', at(180, 5).lat, at(180, 5).lon);
        const mapaa = intersection('MAPAA', at(180, 1).lat, at(180, 1).lon);
        const kprc = withProcedures(airport('KPRC', at(180, 1).lat, at(180, 1).lon), {
            approaches: [approach({
                type: ApproachType.APPROACH_TYPE_RNAV, runway: '27',
                transitions: [{
                    name: 'ARCBG', legs: [Leg.IF(arcbg, FixTypeFlags.IAF),
                        Leg.AF(arcen, abc, {radiusNm: 10, fromRadial: 270, toRadial: 180, turn: LegTurnDirection.Left}),
                        Leg.TF(fafaa, FixTypeFlags.FAF)],
                }],
                final: [Leg.TF(mapaa, FixTypeFlags.MAP)],
            })],
        });
        // On the arc at the 260 radial, 80° before its end: the arc is 13.96 NM, the chord 2 * 10 * sin(40°) = 12.86 NM
        const p = at(260, 10);
        const unit = await bootUnit({facilities: [kprc, abc, arcbg, arcen, fafaa, mapaa], position: p, storage: savedFlightplan(0, [kprc])});
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        await unit.panel.selectPage('L', 'NAV 1');
        await vi.advanceTimersByTimeAsync(1000);
        expect(activeIdent(unit)).toBe('ARCEN'); // Precondition: the arc leg is active

        expect(nav(unit).distToActive!).toBeCloseTo(distanceNm(p, arcen), 3);
        expect(Screen.read().rows('L')[2]).toBe('DIS  12.9nm');
    });
});

// 4-9: with turn anticipation disabled (SET 6) the waypoint alert starts about 36 s before the waypoint. At 120 kt that
// is 1.2 NM: off at 1.3 NM (39 s), on at 1.1 NM (33 s).
describe('waypoint alert without turn anticipation (4-9)', () => {
    it('starts about 36 s before the waypoint', async () => {
        const {unit, kaaa, abc} = await onStandardRoute({turnAnticipation: false});
        const leg = finalCourseDeg(kaaa, abc);

        await moveAircraft(unit, pointBefore(kaaa, abc, 1.3), {groundspeedKt: 120, trackTrue: leg});
        expect(nav(unit).waypointAlert).toBe(false);
        expect(unit.env.sim.get('L:KLN90B_WptLight', 'bool')).toBe(0);

        await moveAircraft(unit, pointBefore(kaaa, abc, 1.1), {groundspeedKt: 120, trackTrue: leg});
        expect(nav(unit).waypointAlert).toBe(true);
        expect(unit.env.sim.get('L:KLN90B_WptLight', 'bool')).toBe(1);
    });
});

// 3-29: Direct To a waypoint: the alert starts about 36 s before it. Turn anticipation is on (the default), but there is
// no next leg to anticipate a turn onto, so the 36 s apply.
describe('waypoint alert on a Direct To (3-29)', () => {
    it('starts about 36 s before a Direct To waypoint outside the flight plan, with turn anticipation on', async () => {
        const {kaaa, abc} = standardRoute();
        const start = pointBefore(kaaa, abc, 5);
        const unit = await bootUnit({facilities: [kaaa, abc], position: start});
        await settle(unit);
        await unit.panel.directTo('ABC');
        expect(nav(unit).activeWaypoint.isDctNavigation()).toBe(true); // Preconditions
        expect(activeIdent(unit)).toBe('ABC');
        expect(nav(unit).activeWaypoint.getActiveFplIdx()).toBe(-1);
        const leg = courseDeg(start, abc);

        await moveAircraft(unit, pointBefore(start, abc, 1.3), {groundspeedKt: 120, trackTrue: leg});
        expect(nav(unit).waypointAlert).toBe(false);

        await moveAircraft(unit, pointBefore(start, abc, 1.1), {groundspeedKt: 120, trackTrue: leg});
        expect(nav(unit).waypointAlert).toBe(true);
    });
});

// 4-8: with turn anticipation the alert starts about 20 s before the turn begins. The turn at ABC is 34.4° at 120 kt:
// the standard-rate radius is v / (3°/s) = 0.637 NM, so the turn needs R * tan(17.2°) = 0.197 NM of lead, plus up to
// 0.12 NM to roll into the bank (18.3° at 5°/s, 3.7 s): it begins 0.20 to 0.32 NM before ABC. 20 s at 120 kt are
// 0.667 NM, so the alert starts 0.86 to 0.99 NM before ABC: off at 1.05 NM, on at 0.84 NM. That holds the 20 s to about
// +-3 s; firstFlight.test.ts holds 10 to 30 s in flight.
describe('waypoint alert with turn anticipation (4-8)', () => {
    it('starts about 20 s before the turn begins', async () => {
        const {unit, kaaa, abc} = await onStandardRoute();
        const leg = finalCourseDeg(kaaa, abc);

        await moveAircraft(unit, pointBefore(kaaa, abc, 1.05), {groundspeedKt: 120, trackTrue: leg});
        expect(nav(unit).waypointAlert).toBe(false);

        await moveAircraft(unit, pointBefore(kaaa, abc, 0.84), {groundspeedKt: 120, trackTrue: leg});
        expect(nav(unit).waypointAlert).toBe(true);
        expect(turnStackLength(unit)).toBe(0); // the turn itself has not begun
    });
});

// 4-9: with turn anticipation disabled, guidance runs all the way to the waypoint: no early DTK switch, and the next leg
// becomes active once the waypoint is passed.
describe('sequencing without turn anticipation (4-9)', () => {
    it('keeps the leg up to ABC and sequences once ABC is behind', async () => {
        const {unit, kaaa, abc, kbbb} = await onStandardRoute({turnAnticipation: false});
        const leg1 = finalCourseDeg(kaaa, abc);

        // 0.15 NM before ABC, well inside where an anticipated turn would have begun (0.20 to 0.32 NM, see above)
        await moveAircraft(unit, pointBefore(kaaa, abc, 0.15), {groundspeedKt: 120, trackTrue: leg1});
        expect(activeIdent(unit)).toBe('ABC');
        expect(angleBetween(nav(unit).desiredTrack, leg1)).toBeLessThan(0.5);
        expect(turnStackLength(unit)).toBe(0);

        await moveAircraft(unit, pointFrom(abc, leg1, 0.1), {groundspeedKt: 120, trackTrue: leg1});
        expect(activeIdent(unit)).toBe('KBBB');
        expect(angleBetween(nav(unit).desiredTrack, courseDeg(abc, kbbb))).toBeLessThan(0.5);
    });
});

/**
 * STAR FLY1A: STRAA, FLYOV, STRCC into KDST. FLYOV is 20 NM north of KDST, STRAA 15 NM north of FLYOV, STRCC 10 NM from
 * FLYOV on 120°: a 60° left turn at FLYOV. Loaded through APT 7 with the aircraft on the leg STRAA - FLYOV.
 */
async function starWithTurnAt(flyOver: boolean) {
    const kdst = airport('KDST', 47.0, 8.0);
    const fo = pointFrom(kdst, 0, 20);
    const flyov = intersection('FLYOV', fo.lat, fo.lon);
    const sa = pointFrom(flyov, 0, 15);
    const straa = intersection('STRAA', sa.lat, sa.lon);
    const sc = pointFrom(flyov, 120, 10);
    const strcc = intersection('STRCC', sc.lat, sc.lon);
    const ea = pointFrom(straa, 0, 30);
    const enraa = intersection('ENRAA', ea.lat, ea.lon);
    const apt = withProcedures(kdst, {arrivals: [star('FLY1A', {common: [Leg.IF(straa), Leg.TF(flyov, 0, flyOver), Leg.TF(strcc)]})]});
    const unit = await bootUnit({
        facilities: [apt, flyov, straa, strcc, enraa], position: pointBefore(straa, flyov, 5), storage: savedFlightplan(0, [enraa, apt]),
    });
    await settle(unit);
    await unit.panel.loadProcedure('APT 7');
    const legs = nav(unit).activeWaypoint.fpl0.getLegs();
    expect(fplIdents(unit)).toEqual(['ENRAA', 'STRAA', 'FLYOV', 'STRCC', 'KDST']); // Preconditions
    expect(legs[2].flyOver === true).toBe(flyOver);
    expect(activeIdent(unit)).toBe('FLYOV');
    return {unit, straa, flyov, strcc};
}

// 4-2 to 4-3: a fly-over waypoint of a SID or STAR disables turn anticipation for that waypoint. A 60° turn at 120 kt
// needs R * tan(30°) = 0.37 NM of lead plus up to 0.12 NM of roll-in, so 0.45 NM before FLYOV an anticipated turn has
// begun; the control below shows that it does with the same STAR without the fly-over flag.
describe('fly-over waypoint (4-2, 4-3)', () => {
    it('control: without the fly-over flag the turn has begun 0.45 NM before FLYOV', async () => {
        const {unit, straa, flyov, strcc} = await starWithTurnAt(false);

        await moveAircraft(unit, pointBefore(straa, flyov, 0.45), {groundspeedKt: 120, trackTrue: finalCourseDeg(straa, flyov)});

        expect(activeIdent(unit)).toBe('FLYOV');
        expect(turnStackLength(unit)).toBe(2);
        expect(angleBetween(nav(unit).desiredTrack, courseDeg(flyov, strcc))).toBeLessThan(1);
    });

    it('keeps the inbound leg up to FLYOV and sequences once FLYOV is behind (4-3)', async () => {
        const {unit, straa, flyov, strcc} = await starWithTurnAt(true);
        const inbound = finalCourseDeg(straa, flyov);

        await moveAircraft(unit, pointBefore(straa, flyov, 0.45), {groundspeedKt: 120, trackTrue: inbound});
        expect(activeIdent(unit)).toBe('FLYOV');
        expect(turnStackLength(unit)).toBe(0);
        expect(angleBetween(nav(unit).desiredTrack, inbound)).toBeLessThan(0.5);

        await moveAircraft(unit, pointFrom(flyov, inbound, 0.1), {groundspeedKt: 120, trackTrue: inbound});
        expect(activeIdent(unit)).toBe('STRCC');
        expect(angleBetween(nav(unit).desiredTrack, courseDeg(flyov, strcc))).toBeLessThan(1);
    });
});

/**
 * RNAV 18 to KPRC: FAFAA 5 NM north of MAPAA, MAPAA on the airport, the missed approach to MAHAA 5 NM east of MAPAA (a
 * 90° left turn at the MAP). FPL 0 is ENRAA, KPRC with the approach loaded; the aircraft is 2 NM north of the MAP, so
 * MAPAA is active.
 */
async function onFinal(storage: Record<string, unknown>) {
    const kprc = airport('KPRC', 47.0, 8.0);
    const mapaa = intersection('MAPAA', 47.0, 8.0);
    const fafPos = pointFrom(mapaa, 0, 5);
    const fafaa = intersection('FAFAA', fafPos.lat, fafPos.lon);
    const mahPos = pointFrom(mapaa, 90, 5);
    const mahaa = intersection('MAHAA', mahPos.lat, mahPos.lon);
    const enrPos = pointFrom(fafPos, 0, 20);
    const enraa = intersection('ENRAA', enrPos.lat, enrPos.lon);
    const apt = withProcedures(kprc, {
        approaches: [approach({
            type: ApproachType.APPROACH_TYPE_RNAV, runway: '18',
            transitions: [{name: 'FAFAA', legs: [Leg.IF(fafaa, FixTypeFlags.IAF)]}],
            final: [Leg.IF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
            missed: [Leg.TF(mahaa, FixTypeFlags.MAHP)],
        })],
    });
    const unit = await bootUnit({
        facilities: [apt, enraa, fafaa, mapaa, mahaa], position: pointFrom(mapaa, 0, 2),
        storage: {...savedFlightplan(0, [enraa, apt]), ...storage},
    });
    await settle(unit);
    await unit.panel.loadProcedure('APT 8');
    expect(activeIdent(unit)).toBe('MAPAA'); // Precondition
    return {unit, mapaa, fafaa};
}

// 6-7: the unit never sequences past the MAP (the *NO WPT SEQ fence), and so never anticipates the turn into the
// missed approach. The final runs 180°; a 90° turn at 120 kt would begin R * tan(45°) + roll-in = 0.64 to 0.76 NM
// before the MAP.
describe('no sequencing past the MAP (6-7)', () => {
    it('with turn anticipation: no turn before the MAP and MAPAA stays active past it', async () => {
        const {unit, mapaa} = await onFinal({});

        await moveAircraft(unit, pointFrom(mapaa, 0, 0.7), {groundspeedKt: 120, trackTrue: 180});
        expect(activeIdent(unit)).toBe('MAPAA');
        expect(turnStackLength(unit)).toBe(0);
        expect(angleBetween(nav(unit).desiredTrack, 180)).toBeLessThan(0.5);

        await moveAircraft(unit, pointFrom(mapaa, 180, 0.3), {groundspeedKt: 120, trackTrue: 180});
        expect(activeIdent(unit)).toBe('MAPAA');
        expect(nav(unit).toFrom).toBe(false); // FROM
    });

    it('without turn anticipation: MAPAA stays active past the MAP', async () => {
        const {unit, mapaa} = await onFinal({turnAnticipation: false});

        await moveAircraft(unit, pointFrom(mapaa, 180, 0.3), {groundspeedKt: 120, trackTrue: 180});
        expect(activeIdent(unit)).toBe('MAPAA');
        expect(nav(unit).toFrom).toBe(false); // FROM
    });
});

// 3-31, figure 3-101: when the unit is not usable for navigation NAV 1 shows FLAG over the CDI and dashes for DIS, GS,
// ETE and BRG. The GPS loses its solution in flight (gps.reset() in the middle of the test, testing.md).
describe('GPS invalid (3-31)', () => {
    it('flags NAV 1 and the HSI', async () => {
        const {unit, kaaa, abc} = await onStandardRoute();
        await unit.panel.selectPage('L', 'NAV 1');
        await moveAircraft(unit, pointBefore(kaaa, abc, 20), {groundspeedKt: 120, trackTrue: courseDeg(kaaa, abc)});
        await vi.advanceTimersByTimeAsync(500);
        expect(Screen.read().rows('L')[2]).toBe('DIS  20.0nm'); // Precondition: navigating
        expect(unit.env.sim.get('L:KLN90B_HSI_TF_FLAGS', 'enum')).toBe(1);

        unit.props.sensors.in.gps.reset();
        await vi.advanceTimersByTimeAsync(1500);

        expect(unit.props.sensors.in.gps.isValid()).toBe(false); // the fast acquisition takes 10 s
        expect(Screen.read().rows('L').slice(1)).toEqual(['ηηF L A Gηη', 'DIS  --.-nm', 'GS    ---kt', 'ETE   --:--', 'BRG    ---°']);
        expect(unit.env.sim.get('L:KLN90B_HSI_TF_FLAGS', 'enum')).toBe(0);
        expect(activeIdent(unit)).toBe('ABC'); // the flag keeps the active waypoint
    });

    // 3-59: the WPT annunciator is on while waypoint alerting is active; without navigation there is no alert
    it('turns the WPT light off when the GPS is lost during the alert', async () => {
        const {unit, kaaa, abc} = await onStandardRoute();
        await moveAircraft(unit, pointBefore(kaaa, abc, 0.84), {groundspeedKt: 120, trackTrue: finalCourseDeg(kaaa, abc)});
        expect(unit.env.sim.get('L:KLN90B_WptLight', 'bool')).toBe(1); // Precondition: the alert is on (see above)

        unit.props.sensors.in.gps.reset(); // before the next calculation tick, which would sequence the held position
        await vi.advanceTimersByTimeAsync(1500);

        expect(unit.props.sensors.in.gps.isValid()).toBe(false); // the fast acquisition takes 10 s
        expect(activeIdent(unit)).toBe('ABC'); // the held position has not been sequenced, so that is not why the light is off
        expect(nav(unit).waypointAlert).toBe(false);
        expect(unit.env.sim.get('L:KLN90B_WptLight', 'bool')).toBe(0);
    });
});

// Characterization: below 2 kt there is no ETE (NAV 1 shows dashes) and no sequencing. This is what the code does today;
// no page of the Pilot's Guide gives a ground speed threshold for either.
describe('ground speed below 2 kt (characterization)', () => {
    it('shows no ETE and does not sequence past the waypoint', async () => {
        const {unit, kaaa, abc, kbbb} = await onStandardRoute({turnAnticipation: false});
        await unit.panel.selectPage('L', 'NAV 1');
        const leg1 = finalCourseDeg(kaaa, abc);

        const past = pointFrom(abc, leg1, 0.2);
        await moveAircraft(unit, past, {groundspeedKt: 1, trackTrue: leg1});
        await vi.advanceTimersByTimeAsync(500);
        expect(activeIdent(unit)).toBe('ABC');
        expect(nav(unit).toFrom).toBe(false); // FROM: past ABC
        expect(nav(unit).eteToActive).toBeNull();
        expect(Screen.read().rows('L')[4]).toBe('ETE   --:--');

        // Control just above the threshold: at 3 kt the same position sequences and has an ETE, to KBBB by then
        await moveAircraft(unit, past, {groundspeedKt: 3, trackTrue: leg1});
        await vi.advanceTimersByTimeAsync(500);
        expect(activeIdent(unit)).toBe('KBBB');
        expect(nav(unit).eteToActive!).toBeCloseTo(distanceNm(past, kbbb) / 3 * 3600, -1);
        expect(Screen.read().rows('L')[4]).toBe('ETE   14:32');
    });
});

// 3-4: during the self-test DIS is 34.5 NM and the D-bar shows half scale right, which is 2.5 NM left of course on the
// 5 NM scale. GPS WP CROSS TRK is the negated cross track (SensorsOutSimVars.test.ts), so 2.5 NM left is +4630 m. The
// XTK output filter overshoots after its step from zero (#158), so the outputs are read late, 30 s after the power-on
// (well into the self-test page), when it has settled.
describe('self-test outputs (3-4)', () => {
    it('writes DIS 34.5 NM and a half-scale right deviation', async () => {
        const unit = await bootUnit({engineRunning: false, magvar: 0});
        await unit.panel.powerOn();
        await vi.advanceTimersByTimeAsync(30_000); // 30 s after the power-on, well into the self-test page
        expect(Screen.read().rows('L')[0]).toBe('DIS  34.5NM'); // Precondition: still the self-test page, showing its DIS
        expect(Screen.read().rows('R')[5]).toBe('  APPROVE? ');

        const sim = unit.env.sim;
        expect(sim.get('GPS WP DISTANCE', 'nautical miles')).toBeCloseTo(34.5, 3);
        expect(sim.get('GPS WP CROSS TRK', 'meters')).toBeCloseTo(2.5 * 1852, 0);
        expect(sim.get('GPS CDI SCALING', 'meters')).toBeCloseTo(5 * 1852, 0);
    });
});

// 5-38: the pilot selects the CDI scale on MOD 1 or MOD 2 (5, 1 or 0.3 NM); in the approach-arm mode the unit allows
// nothing less sensitive than 1 NM. NavCalculator.setFlag resets the scale to 5 on every calculation tick without a
// navigation solution (no active waypoint, or no GPS).
describe('CDI scale selected on MOD 1 (5-38)', () => {
    /** Selects 1.00 on MOD 1 with the left inner knob, one click down from 5.00 */
    async function selectOneNm(unit: HeadlessUnit) {
        await unit.panel.selectPage('L', 'MOD 1');
        await unit.panel.cursor('L');
        await unit.panel.inner('L', -1);
        await unit.panel.cursor('L');
        await vi.advanceTimersByTimeAsync(2000);
    }

    /** The approach of approachWorld() loaded, 2 NM before the MAP: the unit is in ARM */
    async function armedOnApproach() {
        const w = approachWorld();
        const unit = await bootUnit({facilities: w.facilities, position: w.north(2), storage: savedFlightplan(0, [w.enraa, w.kprc])});
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        expect(activeIdent(unit)).toBe('MAPAA'); // Preconditions
        await vi.advanceTimersByTimeAsync(35_000); // the ARM scale ramps from 5 to 1 NM in 30 s
        return unit;
    }

    it('control: the selected 1.00 NM holds while the unit navigates', async () => {
        const {unit, kaaa, abc} = await onStandardRoute();
        await moveAircraft(unit, pointBefore(kaaa, abc, 20), {groundspeedKt: 120, trackTrue: courseDeg(kaaa, abc)});
        await selectOneNm(unit);

        expect(nav(unit).xtkScale).toBe(1);
        expect(Screen.read().rows('L')[5]).toBe('CDI:±1.00NM');
    });

    // The sibling of the pin below: the GPS is flagged after a reset and valid again 20 s later (fast acquisition: 10 s),
    // so the pin tests the scale and not a fix that never came back
    it('control: the GPS is flagged after a mid-flight reset and valid again 20 s later', async () => {
        const {unit, kaaa, abc} = await onStandardRoute();
        await moveAircraft(unit, pointBefore(kaaa, abc, 20), {groundspeedKt: 120, trackTrue: courseDeg(kaaa, abc)});
        unit.props.sensors.in.gps.reset();
        await vi.advanceTimersByTimeAsync(1500);
        expect(unit.props.sensors.in.gps.isValid()).toBe(false);

        await vi.advanceTimersByTimeAsync(18_500); // 20 s after the reset with the 1.5 s above
        expect(unit.props.sensors.in.gps.isValid()).toBe(true);
    });

    it.fails('keeps the selected 1.00 NM over a GPS loss (#159)', async () => {
        const {unit, kaaa, abc} = await onStandardRoute();
        await moveAircraft(unit, pointBefore(kaaa, abc, 20), {groundspeedKt: 120, trackTrue: courseDeg(kaaa, abc)});
        await selectOneNm(unit);
        unit.props.sensors.in.gps.reset();
        await vi.advanceTimersByTimeAsync(20_000); // flagged, then reacquired (see the control above)

        expect(nav(unit).xtkScale).toBe(1);
        expect(Screen.read().rows('L')[5]).toBe('CDI:±1.00NM');
    });

    // 5-38: in the approach-arm mode the unit allows nothing less sensitive than 1 NM; 2 NM before the MAP the unit is in
    // ARM with the 1 NM scale.
    it('control: the approach-arm mode has the 1 NM scale on MOD 1 while the GPS is valid', async () => {
        const unit = await armedOnApproach();
        await unit.panel.selectPage('L', 'MOD 1');

        expect(Screen.read().status().mode).toBe('arm-leg msg'); // the mode field, followed by the unread msg prompt
        expect(nav(unit).xtkScale).toBe(1);
        expect(Screen.read().rows('L')[5]).toBe('CDI:±1.00NM');
    });

    // After the loss MOD 1 shows no scale at all ("CDI:±NM") today, because the reset 5 is not one of the ARM choices
    it.fails('keeps the 1 NM approach-arm scale while the GPS is lost (#159)', async () => {
        const unit = await armedOnApproach();
        await unit.panel.selectPage('L', 'MOD 1');
        unit.props.sensors.in.gps.reset();
        await vi.advanceTimersByTimeAsync(1500);
        expect(unit.props.sensors.in.gps.isValid()).toBe(false);

        expect(nav(unit).xtkScale).toBe(1);
        expect(Screen.read().rows('L')[5]).toBe('CDI:±1.00NM');
    });

    it.fails('keeps the selected 1.00 NM without an active waypoint (#159)', async () => {
        const unit = await bootUnit();
        await settle(unit);
        expect(activeIdent(unit)).toBeUndefined(); // Precondition: there is no active waypoint
        await selectOneNm(unit);

        expect(nav(unit).xtkScale).toBe(1);
        expect(Screen.read().rows('L')[5]).toBe('CDI:±1.00NM');
    });
});

// 5-33 (item 3): in flight plan operation the next leg becomes active as the aircraft reaches a waypoint; 4-8: with turn
// anticipation it sequences after the midpoint of the transition. Passing ABC 1.5 NM to the right of the leg, the
// aircraft never comes within the 20 s alert range of the turn (about 1 NM at 120 kt), and the sequencing with turn
// anticipation requires the alert. Held positions along a line parallel to the leg, 1.5 NM right of it. Checked in the
// KLN 89 trainer: a waypoint passed 3.5 NM abeam was sequenced.
describe('passing a waypoint off course', () => {
    const abeamPositions = async (unit: HeadlessUnit, kaaa: Facility, abc: Facility) => {
        const leg1 = finalCourseDeg(kaaa, abc);
        for (const along of [-2, -1, 0, 1, 2, 3]) {
            const onLine = pointFrom(abc, leg1, along);
            await moveAircraft(unit, pointFrom(onLine, leg1 + 90, 1.5), {groundspeedKt: 120, trackTrue: leg1});
        }
    };

    it('control: without turn anticipation the unit sequences to KBBB once ABC is behind (4-9)', async () => {
        const {unit, kaaa, abc} = await onStandardRoute({turnAnticipation: false});
        await abeamPositions(unit, kaaa, abc);

        expect(activeIdent(unit)).toBe('KBBB');
    });

    it.fails('with turn anticipation the unit sequences to KBBB once ABC is behind (#157)', async () => {
        const {unit, kaaa, abc} = await onStandardRoute();
        await abeamPositions(unit, kaaa, abc);

        expect(activeIdent(unit)).toBe('KBBB');
    });
});
