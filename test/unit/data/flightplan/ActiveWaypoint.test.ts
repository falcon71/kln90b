import {describe, expect, it} from 'vitest';
import {EventBus, Facility, GeoCircle, GeoPoint, UnitType} from '@microsoft/msfs-sdk';
import {ActiveWaypoint, ActiveWaypointChangedEvents, TurnPlan, TurnStackEntry} from '../../../../kln90b/data/flightplan/ActiveWaypoint';
import {Flightplan, KLNFixType, KLNFlightplanLeg, KLNLegType} from '../../../../kln90b/data/flightplan/Flightplan';
import {ArcData} from '../../../../kln90b/data/navdata/SidStar';
import {KLN90BUserSettings} from '../../../../kln90b/settings/KLN90BUserSettings';
import {Sensors} from '../../../../kln90b/Sensors';
import {airport, intersection, vor} from '../../../harness/navdata/builders';
import {pointFrom} from '../../../harness/flight/geo';
import {identsOf} from '../../../harness/readers';

const NM = (nm: number) => UnitType.NMILE.convertTo(nm, UnitType.GA_RADIAN);

const user = (wpt: Facility): KLNFlightplanLeg => ({wpt, type: KLNLegType.USER});

/**
 * An ActiveWaypoint over FPL 0 with the aircraft at a given position. activateFpl0 reads only gps.coords of the
 * sensors, so nothing is booted.
 */
function activeWaypointOver(legs: KLNFlightplanLeg[], position: { lat: number; lon: number }) {
    return activeWaypointWith(legs, position).aw;
}

/** The same, with the settings, FPL 0 and the bus the ActiveWaypoint works on, for tests that read or edit them */
function activeWaypointWith(legs: KLNFlightplanLeg[], position: { lat: number; lon: number }) {
    const bus = new EventBus();
    const settings = new KLN90BUserSettings(bus);
    const sensors = {in: {gps: {coords: new GeoPoint(position.lat, position.lon)}}} as unknown as Sensors;
    const fpl = new Flightplan(0, legs, bus);
    return {aw: new ActiveWaypoint(bus, settings, sensors, fpl, null), settings, fpl, bus};
}

// An open box of invented waypoints: B is 40 NM east of A, C 40 NM north of B, D 40 NM west of C
const A = airport('KAAA', 47.0, 8.0);
const bPos = pointFrom(A, 90, 40);
const B = vor('ABC', bPos.lat, bPos.lon);
const cPos = pointFrom(B, 0, 40);
const C = vor('DEF', cPos.lat, cPos.lon);
const dPos = pointFrom(C, 270, 40);
const D = vor('GHI', dPos.lat, dPos.lon);

// characterization: the Pilot's Guide does not say which leg FPL 0 activates in flight, and issue #41 asks what the
// right behavior is. The rule tested is the maintainer's: the leg the aircraft is on, else the closest. The
// missed-approach scenario of the issue needs procedures, which the harness navdata does not have.
describe('ActiveWaypoint.activateFpl0 activates the leg the aircraft is on (#41, characterization)', () => {
    it('activates the first leg when the aircraft is on it, 5 NM before B (#41)', () => {
        // The second leg is at least 5 NM away (B is its nearest point)
        const aw = activeWaypointOver([A, B, C].map(user), pointFrom(B, 270, 5));

        expect(aw.activateFpl0()).not.toBeNull();
        expect(aw.getActiveFplIdx()).toBe(1);
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('ABC');
    });

    it('activates the last leg of a dogleg when the aircraft is 1 NM beside its middle (#41)', () => {
        // 20 NM west of C on the leg C - D, 1 NM north of it. The other legs are 40 NM or more away
        const aw = activeWaypointOver([A, B, C, D].map(user), pointFrom(pointFrom(C, 270, 20), 0, 1));

        expect(aw.activateFpl0()).not.toBeNull();
        expect(aw.getActiveFplIdx()).toBe(3);
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('GHI');
    });

    it('activates the first leg when the aircraft is 10 NM before A, the start of the plan (#41)', () => {
        // Before the start of the plan the closest point of the first leg lies outside the leg, so the distance to its
        // start decides: 10 NM for the first leg against at least 50 NM for the second
        const aw = activeWaypointOver([A, B, C].map(user), pointFrom(A, 270, 10));

        expect(aw.activateFpl0()).not.toBeNull();
        expect(aw.getActiveFplIdx()).toBe(1);
    });

    it('activates the first leg when the aircraft is 2 NM beside its middle (#41)', () => {
        // Predicted survivor of the #41 break: the leg the aircraft is nearest to is also the one the pre-fix check
        // picks, because the second leg is 20 NM away whichever way its closest point is judged
        const aw = activeWaypointOver([A, B, C].map(user), pointFrom(pointFrom(A, 90, 20), 0, 2));

        expect(aw.activateFpl0()).not.toBeNull();
        expect(aw.getActiveFplIdx()).toBe(1);
    });
});

describe('ActiveWaypoint.activateFpl0 with two waypoints always activates (#34)', () => {
    // 4-1: FPL 0 needs at least two waypoints, so two are enough to navigate. That it holds wherever the aircraft is
    // was checked in the KLN 89 trainer (the comment on findClosestLegIdx, fix commit 2b06e54).
    // "Far to the side" does not flag the old code: the foot of the perpendicular is still inside a long leg. A point
    // beyond the end or before the start of the only leg does.
    it('activates the only leg when the aircraft is 100 NM beyond its end (#34)', () => {
        const aw = activeWaypointOver([A, B].map(user), pointFrom(B, 90, 100));

        expect(aw.activateFpl0()).not.toBeNull();
        expect(aw.getActiveFplIdx()).toBe(1);
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('ABC');
    });

    it('activates the only leg when the aircraft is 100 NM before its start (#34)', () => {
        const aw = activeWaypointOver([A, B].map(user), pointFrom(A, 270, 100));

        expect(aw.activateFpl0()).not.toBeNull();
        expect(aw.getActiveFplIdx()).toBe(1);
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('ABC');
    });
});

const ARC_STATION = vor('STN', 47.0, 8.0);

/**
 * The legs `before`, then the arc P to Q that runs 10 NM around the VOR STN from the west radial to the north radial, and
 * R 30 NM east of Q. The arc data is the arc leg P's, so the arc entry is at index `before.length`
 */
function arcRoute(before: Facility[] = []) {
    const station = ARC_STATION;
    const p = pointFrom(station, 270, 10);
    const q = pointFrom(station, 0, 10);
    const r = pointFrom(q, 90, 30);
    const P = vor('PPP', p.lat, p.lon);
    const Q = vor('QQQ', q.lat, q.lon);
    const R = vor('RRR', r.lat, r.lon);
    // Only circle is read by findClosestLegIdx; the other fields are filled in as far as they are known
    const arcData = {
        beginRadial: 270, beginPoint: p, entryFacility: P, endRadial: 0, endFacility: Q, endPoint: q,
        vor: station,
        // A right arc (270 to 000 clockwise): SidStar reverses the circle of every arc that is not a left arc
        circle: GeoCircle.createFromPoint(station, NM(10)).reverse(),
    } as unknown as ArcData;
    return {station, legs: [...before.map(user), {...user(P), arcData}, user(Q), user(R)] as KLNFlightplanLeg[]};
}

/**
 * The arc data of `arc` with its entry moved to `radial` at 10 NM, keeping the same circle object, as
 * SidStar.recalculateArcEntryData does for MOVE ? (6-17)
 */
function movedArcData(arc: ArcData, radial: number): ArcData {
    const point = pointFrom(ARC_STATION, radial, 10);
    return {...arc, beginRadial: radial, beginPoint: point, entryFacility: intersection(`D${radial}J`, point.lat, point.lon)} as unknown as ArcData;
}

/** A point `nm` out on `radial` of the arc's VOR */
const onRadial = (radial: number, nm: number) => pointFrom(ARC_STATION, radial, nm);

describe('ActiveWaypoint.activateFpl0 on a DME arc', () => {
    // #41 continued (closed): the expected leg is the leg the aircraft is on, the rule of the #41 describe above.
    // On a DME arc the closest point lies on the small circle, and it is between FROM and TO when its angle along the
    // arc, in the circle's own direction, is no larger than TO's (#121).
    // The arc P to Q runs 10 NM around a VOR from the west radial to the north radial; R is 30 NM east of Q
    const arcPlan = () => arcRoute();

    it('activates the arc leg P to Q for an aircraft at the start of the arc, so the setup holds (#121)', () => {
        // The next test stands on this: the plan and the hand-built arc work when the aircraft is at P
        const {station, legs} = arcPlan();
        const atStart = activeWaypointOver(legs, pointFrom(station, 270, 10));
        // The position of the next test lies on the arc as well, so it is a point of the leg and not a stray one
        const onArc = pointFrom(station, 330, 10);
        expect(legs[0].arcData!.circle.distance(onArc)).toBeCloseTo(0, 6);
        atStart.activateFpl0();
        expect(atStart.getActiveFplIdx()).toBe(1);
    });

    it('activates the arc leg P to Q when the aircraft is on the arc at the 330° radial (#121)', () => {
        const {station, legs} = arcPlan();
        const aw = activeWaypointOver(legs, pointFrom(station, 330, 10));

        expect(aw.activateFpl0()).not.toBeNull();
        expect(aw.getActiveFplIdx()).toBe(1);
    });

    // The other side of the rule: on the same DME circle but outside the arc's span, beside the leg Q to R, the aircraft
    // is on that leg. Deciding "always between" for an arc leg would activate the arc here (#121)
    it('activates the leg Q to R when the aircraft is on the DME circle outside the arc, at the 090° radial (#121)', () => {
        const {station, legs} = arcPlan();
        const aw = activeWaypointOver(legs, pointFrom(station, 90, 10));

        expect(aw.activateFpl0()).not.toBeNull();
        expect(aw.getActiveFplIdx()).toBe(2);
    });

    // The arc must reach the leg search as an arc. Treated as the great circle P to Q (the chord), this position inside
    // the circle, 3 NM out on the 040 radial, is about 6.8 NM from the chord with its foot inside the chord, against
    // about 7.7 NM from the leg Q to R, so the chord would win. On the arc it lies on the radial beyond the arc's end
    // at Q, so its foot is outside the arc and the distance to P, about 12 NM, loses against Q to R (#121)
    it('activates the leg Q to R for an aircraft inside the DME circle beyond the end of the arc, at the 040 radial (#121)', () => {
        const {station, legs} = arcPlan();
        const aw = activeWaypointOver(legs, pointFrom(station, 40, 3));

        expect(aw.activateFpl0()).not.toBeNull();
        expect(aw.getActiveFplIdx()).toBe(2);
    });
});

const fromHere = (p: { lat: number; lon: number }) => intersection('PPOS', p.lat, p.lon);

describe('ActiveWaypoint direct-to flows', () => {
    // characterization: the Pilot's Guide does not say which leg a cancelled direct-to returns to; the unit takes the
    // rule of the #41 tests (the comment in ActiveWaypoint.cancelDirectTo says it never keeps the old leg)
    it('characterization: cancelDirectTo activates the leg closest to the aircraft, not the leg before the direct-to', () => {
        const position = pointFrom(pointFrom(C, 270, 20), 0, 1); // beside the middle of C-D
        const aw = activeWaypointOver([A, B, C, D].map(user), position);
        aw.directToFlightplanIndex(fromHere(position), 1); // direct to B
        // Precondition: the direct-to to B is active and is not the closest leg
        expect(aw.getActiveFplIdx()).toBe(1);
        expect(aw.isDctNavigation()).toBe(true);

        aw.cancelDirectTo();

        expect(aw.isDctNavigation()).toBe(false);
        expect(aw.getActiveFplIdx()).toBe(3);
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('GHI');
        expect(aw.getFromWpt()!.icaoStruct.ident).toBe('DEF');
    });

    // 4-10: a direct-to to a waypoint of FPL 0 flies to it and then resumes the plan after it
    it('a direct-to to a waypoint of FPL 0 skips the earlier waypoints and resumes the plan after it (4-10)', () => {
        const position = pointFrom(A, 90, 10); // on the first leg
        const aw = activeWaypointOver([A, B, C, D].map(user), position);
        aw.directTo(fromHere(position), C);

        expect(aw.getActiveFplIdx()).toBe(2);
        expect(identsOf(aw.getFutureLegs())).toEqual(['DEF', 'GHI']);
        expect(aw.getFollowingLeg()!.wpt.icaoStruct.ident).toBe('GHI');

        aw.sequenceToNextWaypoint();

        expect(aw.isDctNavigation()).toBe(false);
        expect(aw.getActiveFplIdx()).toBe(3);
        expect(aw.getFromWpt()!.icaoStruct.ident).toBe('DEF'); // the plan leg C-D, not the direct-to start
        // The path of the new leg is the great circle C-D: its midpoint lies on it
        expect(aw.getFromLeg()!.path.distance(pointFrom(C, 270, 20))).toBeLessThan(NM(0.01));
    });

    // 4-10: the plan is only resumed when the direct-to target is a waypoint of FPL 0
    it('a direct-to to a waypoint outside FPL 0 never resumes the plan (4-10)', () => {
        const position = pointFrom(A, 90, 10);
        const off = vor('OFF', 46.5, 8.5);
        const aw = activeWaypointOver([A, B, C, D].map(user), position);
        aw.directTo(fromHere(position), off);

        expect(aw.getActiveFplIdx()).toBe(-1);
        expect(aw.getFollowingLeg()).toBeNull();
        expect(identsOf(aw.getFutureLegs())).toEqual(['OFF']);
        expect(aw.getDestination()!.icaoStruct.ident).toBe('OFF');

        aw.sequenceToNextWaypoint();

        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('OFF');
        expect(aw.isDctNavigation()).toBe(true);
    });

    // characterization: nothing follows the last waypoint, so the unit keeps it active (no page states it)
    it('characterization: stays on the last leg when sequencing at the end of FPL 0', () => {
        const aw = activeWaypointOver([A, B, C, D].map(user), pointFrom(C, 270, 30));
        aw.activateFpl0();
        expect(aw.getActiveFplIdx()).toBe(3); // Precondition: the last leg is active

        aw.sequenceToNextWaypoint();

        expect(aw.getActiveFplIdx()).toBe(3);
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('GHI');
        expect(aw.getFollowingLeg()).toBeNull();
    });

    // 6-20: the destination defaults to the MAP of a loaded approach, else the last waypoint
    it('the destination is the MAP of an approach, not the last waypoint (6-20)', () => {
        const legs: KLNFlightplanLeg[] = [
            user(A), user(B),
            {wpt: C, type: KLNLegType.APP, fixType: KLNFixType.FAF},
            {wpt: D, type: KLNLegType.APP, fixType: KLNFixType.MAP},
            {wpt: B, type: KLNLegType.APP, fixType: KLNFixType.MAHP},
        ];
        const aw = activeWaypointOver(legs, pointFrom(A, 90, 10));
        aw.activateFpl0();

        // The future legs stop at the MAP, so the missed approach waypoint B at the end is not among them
        expect(identsOf(aw.getFutureLegs())).toEqual(['ABC', 'DEF', 'GHI']);
        expect(aw.getDestination()!.icaoStruct.ident).toBe('GHI');
    });

    // characterization: the turn of the old leg no longer applies after a direct-to
    it('characterization: a direct-to clears the turn stack', () => {
        const aw = activeWaypointOver([A, B, C, D].map(user), pointFrom(A, 90, 10));
        aw.activateFpl0();
        const circle = GeoCircle.createGreatCircle(A, B);
        aw.turnStack.push(new TurnStackEntry(circle, new GeoPoint(B.lat, B.lon), circle));
        expect(aw.turnStack.length).toBe(1); // Precondition: the stack holds an entry

        aw.directTo(fromHere(pointFrom(A, 90, 10)), C);

        expect(aw.turnStack).toEqual([]);
    });

    // characterization: the saved waypoint is the one the unit restores at the next power-up. The ICAO V2 literal
    // is region K1, eight blanks for the airport, the ident padded to eight
    it('characterization: a direct-to saves the active waypoint', () => {
        const position = pointFrom(A, 90, 10);
        const {aw, settings} = activeWaypointWith([A, B, C, D].map(user), position);
        aw.activateFpl0();
        expect(settings.getSetting('activeWaypoint').get()).toBe('VK1        ABC     '); // Precondition: the leg before the direct-to is saved

        aw.directTo(fromHere(position), C);

        expect(settings.getSetting('activeWaypoint').get()).toBe('VK1        DEF     ');
        expect(aw.lastactiveWaypoint!.icaoStruct.ident).toBe('DEF');
    });
});

// 6-3: the FAF is the active waypoint of the switch. That the IAF copy of a fix that is IAF and FAF counts as the FAF
// follows the maintainer's ruling of #153 (an IAF copy directly followed by the FAF copy of the same fix), so those
// cases are characterizations (#129)
describe('ActiveWaypoint.getActiveFafLeg', () => {
    const app = (wpt: Facility, fixType: KLNFixType): KLNFlightplanLeg => ({wpt, type: KLNLegType.APP, fixType});
    /** The aircraft 5 NM before B on the leg A - B, so that B (index 1) is the active waypoint */
    const activeAtB = (legs: KLNFlightplanLeg[]) => {
        const aw = activeWaypointOver(legs, pointFrom(B, 270, 5));
        aw.activateFpl0();
        expect(aw.getActiveFplIdx()).toBe(1); // Precondition: the leg at index 1 is active
        return aw;
    };

    it('returns the FAF leg itself while it is active (6-3)', () => {
        const faf = app(B, KLNFixType.FAF);
        const aw = activeAtB([user(A), faf, app(C, KLNFixType.MAP)]);

        expect(aw.getActiveFafLeg()).toBe(faf);
    });

    it('returns the FAF copy while the IAF copy of the same fix is active (characterization, #129)', () => {
        const fafCopy = app(B, KLNFixType.FAF);
        const aw = activeAtB([user(A), app(B, KLNFixType.IAF), fafCopy, app(C, KLNFixType.MAP)]);

        expect(aw.getActiveFafLeg()).toBe(fafCopy);
    });

    it('returns null while an IAF is active and the next leg is the FAF of another fix (characterization, #129)', () => {
        const aw = activeAtB([user(A), app(B, KLNFixType.IAF), app(C, KLNFixType.FAF), app(D, KLNFixType.MAP)]);

        expect(aw.getActiveFafLeg()).toBeNull();
    });

    it('returns null while an IAF is active and the next leg is not a FAF (characterization, #129)', () => {
        const aw = activeAtB([user(A), app(B, KLNFixType.IAF), app(C, KLNFixType.MAP)]);

        expect(aw.getActiveFafLeg()).toBeNull();
    });

    it('returns null while an IAF is active and the FAF of the same fix is not the next leg (characterization, #129)', () => {
        const aw = activeAtB([user(A), app(B, KLNFixType.IAF), app(C, KLNFixType.IAF), app(B, KLNFixType.FAF), app(D, KLNFixType.MAP)]);

        expect(aw.getActiveFafLeg()).toBeNull();
    });

    it('returns null while the IAF is the last leg of the plan (characterization, #129)', () => {
        const aw = activeAtB([user(A), app(B, KLNFixType.IAF)]);

        expect(aw.getActiveFafLeg()).toBeNull();
    });

    it('returns null while a leg that is neither IAF nor FAF is active (characterization, #129)', () => {
        const aw = activeAtB([user(A), app(B, KLNFixType.MAP)]);

        expect(aw.getActiveFafLeg()).toBeNull();
    });
});

// 6-17: MOVE ? moves a DME arc entry in place (Flightplan.setArcEntry), so FlightplanUtils.moveArcEntry tells the active
// waypoint which leg moved (the design, docs/superpowers/specs/2026-10-28-arc-entry-move-design.md)
describe('ActiveWaypoint.onArcEntryMoved (6-17)', () => {
    /** A turn entry of no particular geometry: the tests only follow the objects */
    const anyTurn = () => {
        const circle = GeoCircle.createGreatCircle(A, B);
        return new TurnStackEntry(circle, new GeoPoint(B.lat, B.lon), circle);
    };

    /** KAAA 40 NM and ABC 20 NM out on the 270 radial, then the arc entry: ABC is active, the entry is the next leg */
    function entryAfterActive() {
        const kaaa = onRadial(270, 40);
        const abc = onRadial(270, 20);
        const {legs} = arcRoute([airport('KAAA', kaaa.lat, kaaa.lon), vor('ABC', abc.lat, abc.lon)]);
        const position = onRadial(270, 30);
        const {aw, fpl} = activeWaypointWith(legs, position);
        aw.activateFpl0();
        expect(aw.getActiveFplIdx()).toBe(1); // Precondition: ABC, the arc entry is the next leg
        return {aw, fpl, legs, position};
    }

    // #441: the same handling as an edit of the next leg (#408, rule (c)): the own started turn goes, a lead plan is
    // decided again
    it('drops the own started turn and a lead plan when the entry after the active waypoint moves (#441)', () => {
        const {aw, fpl, legs} = entryAfterActive();
        aw.startOwnTurn(anyTurn());
        aw.turnPlan = TurnPlan.AT_LEAD;

        fpl.setArcEntry(2, movedArcData(legs[2].arcData!, 280));
        aw.onArcEntryMoved(2);

        expect(aw.ownTurnStarted).toBe(false);
        expect(aw.turnStack).toEqual([]);
        expect(aw.turnPlan).toBeNull();
    });

    it('keeps an abeam plan and a leftover of the previous turn when the entry after the active waypoint moves (#441)', () => {
        const {aw, fpl, legs} = entryAfterActive();
        const leftover = anyTurn();
        aw.turnStack.push(leftover);
        aw.turnPlan = TurnPlan.AT_ABEAM;

        fpl.setArcEntry(2, movedArcData(legs[2].arcData!, 280));
        aw.onArcEntryMoved(2);

        expect(aw.turnPlan).toBe(TurnPlan.AT_ABEAM);
        expect(aw.turnStack).toHaveLength(1);
        expect(aw.turnStack[0]).toBe(leftover);
    });

    it('changes nothing when an entry two legs after the active waypoint moves', () => {
        const kaaa = onRadial(270, 40);
        const abc = onRadial(270, 25);
        const def = onRadial(270, 15);
        const {legs} = arcRoute([airport('KAAA', kaaa.lat, kaaa.lon), vor('ABC', abc.lat, abc.lon), vor('DEF', def.lat, def.lon)]);
        const {aw, fpl} = activeWaypointWith(legs, onRadial(270, 32));
        aw.activateFpl0();
        expect(aw.getActiveFplIdx()).toBe(1); // Precondition: ABC, the arc entry two legs after it
        const turn = anyTurn();
        aw.startOwnTurn(turn);
        aw.turnPlan = TurnPlan.AT_LEAD;
        const from = aw.getFromLeg();

        fpl.setArcEntry(3, movedArcData(legs[3].arcData!, 280));
        aw.onArcEntryMoved(3);

        expect(aw.ownTurnStarted).toBe(true);
        expect(aw.turnStack).toHaveLength(1);
        expect(aw.turnStack[0]).toBe(turn);
        expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);
        expect(aw.getFromLeg()).toBe(from);
    });

    it('changes nothing during a Direct To outside FPL 0', () => {
        const {aw, fpl, legs, position} = entryAfterActive();
        aw.directTo(fromHere(position), vor('OFF', 46.5, 8.5));
        expect(aw.getActiveFplIdx()).toBe(-1); // Precondition: a Direct To outside FPL 0
        const turn = anyTurn();
        aw.startOwnTurn(turn);
        aw.turnPlan = TurnPlan.AT_LEAD;
        const from = aw.getFromLeg();

        fpl.setArcEntry(2, movedArcData(legs[2].arcData!, 280));
        aw.onArcEntryMoved(2);

        expect(aw.ownTurnStarted).toBe(true);
        expect(aw.turnStack).toHaveLength(1);
        expect(aw.turnStack[0]).toBe(turn);
        expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);
        expect(aw.getFromLeg()).toBe(from);
    });
});

// #442: a move of the entry that is the active waypoint calculates the path again, and the turn by the rule of #441
describe('ActiveWaypoint.onArcEntryMoved on the active entry (6-17, #442)', () => {
    const anyTurn = () => {
        const circle = GeoCircle.createGreatCircle(A, B);
        return new TurnStackEntry(circle, new GeoPoint(B.lat, B.lon), circle);
    };

    /** KAAA 40 NM out on the 270 radial, then the arc entry, which is active with the aircraft 20 NM out */
    function entryActive() {
        const kaaa = onRadial(270, 40);
        const {legs} = arcRoute([airport('KAAA', kaaa.lat, kaaa.lon)]);
        const position = onRadial(270, 20);
        const {aw, fpl} = activeWaypointWith(legs, position);
        aw.activateFpl0();
        expect(aw.getActiveFplIdx()).toBe(1); // Precondition: the arc entry PPP is active
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('PPP');
        return {aw, fpl, legs, position};
    }

    it('drops the own started turn and a lead plan when the active entry moves, and calculates the path again (#442)', () => {
        const {aw, fpl, legs} = entryActive();
        aw.startOwnTurn(anyTurn());
        aw.turnPlan = TurnPlan.AT_LEAD;
        const oldEntry = legs[1].wpt;

        fpl.setArcEntry(1, movedArcData(legs[1].arcData!, 280));
        aw.onArcEntryMoved(1);

        expect(aw.ownTurnStarted).toBe(false);
        expect(aw.turnStack).toEqual([]);
        expect(aw.turnPlan).toBeNull();
        expect(aw.getFromWpt()!.icaoStruct.ident).toBe('KAAA');
        // GeoCircle.distance is signed, so both sides are measured as absolute values: the moved entry on the path, the
        // old one, about 1.7 NM away, off it
        expect(Math.abs(aw.getFromLeg()!.path.distance(legs[1].wpt))).toBeLessThan(NM(0.01));
        expect(Math.abs(aw.getFromLeg()!.path.distance(oldEntry))).toBeGreaterThan(NM(1));
    });

    it('keeps an abeam plan when the active entry moves (#442)', () => {
        const {aw, fpl, legs} = entryActive();
        aw.turnPlan = TurnPlan.AT_ABEAM;

        fpl.setArcEntry(1, movedArcData(legs[1].arcData!, 280));
        aw.onArcEntryMoved(1);

        expect(aw.turnPlan).toBe(TurnPlan.AT_ABEAM);
    });

    // Unlike an edit of the next leg (#408, #441), the move changes the active leg itself, and a turn left over from the
    // previous waypoint, such as the run-out of its abeam turn, was made onto the old one: it goes too (the maintainer,
    // 2026-10-28)
    it('drops a turn left over from the previous waypoint when the active entry moves (#442)', () => {
        const {aw, fpl, legs} = entryActive();
        aw.turnStack.push(anyTurn());
        expect(aw.ownTurnStarted).toBe(false); // Precondition: the turn on the stack is not PPP's own

        fpl.setArcEntry(1, movedArcData(legs[1].arcData!, 280));
        aw.onArcEntryMoved(1);

        expect(aw.turnStack).toEqual([]);
    });

    it('applies the same rule to a Direct To to the entry (#442)', () => {
        const {aw, fpl, legs, position} = entryActive();
        const origin = fromHere(position);
        aw.directToFlightplanIndex(origin, 1);
        aw.startOwnTurn(anyTurn());
        aw.turnPlan = TurnPlan.AT_LEAD;
        const oldEntry = legs[1].wpt;

        fpl.setArcEntry(1, movedArcData(legs[1].arcData!, 280));
        aw.onArcEntryMoved(1);

        expect(aw.ownTurnStarted).toBe(false);
        expect(aw.turnStack).toEqual([]);
        expect(aw.turnPlan).toBeNull();
        expect(aw.isDctNavigation()).toBe(true);
        expect(aw.getFromWpt()).toBe(origin);
        // GeoCircle.distance is signed, so both sides are measured as absolute values: the moved entry on the path, the
        // old one, about 1.7 NM away, off it
        expect(Math.abs(aw.getFromLeg()!.path.distance(legs[1].wpt))).toBeLessThan(NM(0.01));
        expect(Math.abs(aw.getFromLeg()!.path.distance(oldEntry))).toBeGreaterThan(NM(1));
    });
});

// #420: the from waypoint is a copy made at the activation, so a move of the entry of the active arc renews it
describe('ActiveWaypoint.onArcEntryMoved on the entry of the active arc (6-17, #420)', () => {
    const anyTurn = () => {
        const circle = GeoCircle.createGreatCircle(A, B);
        return new TurnStackEntry(circle, new GeoPoint(B.lat, B.lon), circle);
    };

    /** KAAA 40 NM out on the 270 radial, then the arc, which is active with the aircraft on it at the 330 radial */
    function arcActive() {
        const kaaa = onRadial(270, 40);
        const {legs} = arcRoute([airport('KAAA', kaaa.lat, kaaa.lon)]);
        const position = onRadial(330, 10);
        const {aw, fpl} = activeWaypointWith(legs, position);
        aw.activateFpl0();
        expect(aw.getActiveFplIdx()).toBe(2); // Precondition: the arc PPP to QQQ is the active leg
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('QQQ');
        expect(aw.getFromWpt()!.icaoStruct.ident).toBe('PPP');
        return {aw, fpl, legs, position};
    }

    it('makes the moved entry the from waypoint of the active arc, with the arc as its path (#420)', () => {
        const {aw, fpl, legs} = arcActive();
        const turn = anyTurn();
        aw.startOwnTurn(turn);
        aw.turnPlan = TurnPlan.AT_LEAD;

        fpl.setArcEntry(1, movedArcData(legs[1].arcData!, 300));
        aw.onArcEntryMoved(1);

        expect(aw.getFromWpt()).toBe(legs[1].wpt);
        expect(aw.getFromWpt()!.icaoStruct.ident).toBe('D300J');
        expect(aw.getFromLeg()!.path).toBe(legs[1].arcData!.circle);
        // Only the from waypoint changes: the turn state of the active waypoint QQQ stays
        expect(aw.ownTurnStarted).toBe(true);
        expect(aw.turnStack).toHaveLength(1);
        expect(aw.turnStack[0]).toBe(turn);
        expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);
    });

    // The turn onto the arc, left over from the entry's sequencing, is the previous waypoint's and on the arc's circle,
    // which the move keeps: it stays
    it('keeps the turn onto the arc left over from the entry when the entry of the active arc moves (#420)', () => {
        const {aw, fpl, legs} = arcActive();
        const leftover = anyTurn();
        aw.turnStack.push(leftover);
        expect(aw.ownTurnStarted).toBe(false); // Precondition: the turn on the stack is not QQQ's own

        fpl.setArcEntry(1, movedArcData(legs[1].arcData!, 300));
        aw.onArcEntryMoved(1);

        expect(aw.turnStack).toHaveLength(1);
        expect(aw.turnStack[0]).toBe(leftover);
        expect(aw.turnPlan).toBeNull();
    });

    // After the arc and its end QQQ are flown, MOVE ? is still offered on its entry (6-17); the entry is two legs before the
    // active waypoint RRR, whose from waypoint is QQQ
    it('changes nothing when an entry two legs before the active waypoint moves (#420)', () => {
        const kaaa = onRadial(270, 40);
        const {legs} = arcRoute([airport('KAAA', kaaa.lat, kaaa.lon)]);
        const {aw, fpl} = activeWaypointWith(legs, pointFrom(onRadial(0, 10), 90, 15));
        aw.activateFpl0();
        expect(aw.getActiveFplIdx()).toBe(3); // Precondition: RRR, from QQQ
        expect(aw.getFromWpt()!.icaoStruct.ident).toBe('QQQ');
        const from = aw.getFromLeg();

        fpl.setArcEntry(1, movedArcData(legs[1].arcData!, 300));
        aw.onArcEntryMoved(1);

        expect(aw.getFromLeg()).toBe(from);
        expect(aw.getFromWpt()!.icaoStruct.ident).toBe('QQQ');
    });

    it('keeps the Direct To origin as from when the entry before the Direct To waypoint moves (#420)', () => {
        const {aw, fpl, legs, position} = arcActive();
        const origin = fromHere(position);
        aw.directToFlightplanIndex(origin, 2);
        const from = aw.getFromLeg();

        fpl.setArcEntry(1, movedArcData(legs[1].arcData!, 300));
        aw.onArcEntryMoved(1);

        expect(aw.getFromWpt()).toBe(origin);
        expect(aw.getFromLeg()).toBe(from);
    });
});

// #440: an edit in front of the active waypoint moves the active leg to another index (the design,
// docs/superpowers/specs/2026-10-29-turn-plan-decision-design.md, section 3.3; checked in the KLN 89 trainer, 2026-10-28)
describe('ActiveWaypoint through an edit in front of the active waypoint (#440)', () => {
    /** A turn entry of no particular geometry: the tests only follow the objects */
    const anyTurn = () => {
        const circle = GeoCircle.createGreatCircle(A, B);
        return new TurnStackEntry(circle, new GeoPoint(B.lat, B.lon), circle);
    };

    /** The run-out of an abeam turn at ABC onto the leg to DEF (#406) */
    const runOut = () => TurnStackEntry.runOut(TurnStackEntry.abeamTurn(B, GeoCircle.createGreatCircle(B, C), 'left'));

    /**
     * The open box A B C D with the aircraft 20 NM along the leg B - C: DEF is active from ABC. Records the indexes the
     * activeWaypointChanged event publishes
     */
    function activeOnBC() {
        const position = pointFrom(B, 0, 20);
        const {aw, fpl, bus, settings} = activeWaypointWith([A, B, C, D].map(user), position);
        aw.activateFpl0();
        expect(aw.getActiveFplIdx()).toBe(2); // Precondition: DEF is active, from ABC
        expect(aw.getFromWpt()!.icaoStruct.ident).toBe('ABC');
        const published: number[] = [];
        bus.getSubscriber<ActiveWaypointChangedEvents>().on('activeWaypointChanged').handle(idx => published.push(idx));
        published.length = 0; // a subscription may replay the last value
        return {aw, fpl, settings, published, position};
    }

    // 3a'': the own started turn and the plan stay, and the FROM is the same object
    it("keeps the own started turn, the plan and the FROM when a waypoint in front of the FROM is deleted (KLN 89 trainer, 3a'')", () => {
        const {aw, fpl, published} = activeOnBC();
        const rollIn = anyTurn();
        const circle = anyTurn();
        aw.startOwnTurn(rollIn, circle);
        aw.turnPlan = TurnPlan.AT_LEAD;
        const from = aw.getFromLeg();

        fpl.deleteLeg(0);

        expect(aw.getActiveFplIdx()).toBe(1);
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('DEF');
        expect(aw.getFromLeg()).toBe(from);
        expect(aw.isDctNavigation()).toBe(false);
        expect(aw.ownTurnStarted).toBe(true);
        expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);
        expect(aw.turnStack).toHaveLength(2);
        expect(aw.turnStack[0]).toBe(rollIn);
        expect(aw.turnStack[1]).toBe(circle);
        expect(published).toEqual([1]);
    });

    // 3b, 3b': a turn circle left over from the waypoint just sequenced goes; 3c: the plan stays
    it("drops a turn circle left over from the previous waypoint and keeps the plan (KLN 89 trainer, 3b, 3b', 3c)", () => {
        const {aw, fpl} = activeOnBC();
        aw.turnStack.push(anyTurn(), anyTurn());
        aw.turnPlan = TurnPlan.AT_ABEAM;

        fpl.deleteLeg(0);

        expect(aw.getActiveFplIdx()).toBe(1);
        expect(aw.turnStack).toEqual([]);
        expect(aw.ownTurnStarted).toBe(false);
        expect(aw.turnPlan).toBe(TurnPlan.AT_ABEAM);
    });

    // 3d: the run-out of a zero-size abeam turn stays (one pass, medium)
    it('keeps the run-out of an abeam turn of the previous waypoint (KLN 89 trainer, 3d)', () => {
        const {aw, fpl} = activeOnBC();
        const kept = runOut();
        aw.turnStack.push(kept);

        fpl.deleteLeg(0);

        expect(aw.getActiveFplIdx()).toBe(1);
        expect(aw.turnStack).toHaveLength(1);
        expect(aw.turnStack[0]).toBe(kept);
    });

    // 3f: an insert in front of the FROM changed nothing of the active leg
    it('follows the active leg when a waypoint is inserted in front of the FROM (KLN 89 trainer, 3f)', () => {
        const {aw, fpl, published} = activeOnBC();
        aw.turnPlan = TurnPlan.AT_LEAD;
        const from = aw.getFromLeg();

        fpl.insertLeg(1, user(vor('XXX', 46.5, 8.5)));

        expect(aw.getActiveFplIdx()).toBe(3);
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('DEF');
        expect(aw.getFromLeg()).toBe(from);
        expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);
        expect(published).toEqual([3]);
    });

    // #408: the leg after the active waypoint is checked once the index has followed, as for a Direct To. Here one batch
    // deletes a waypoint in front and the waypoint after the active one: the own turn and a lead plan go
    it('checks the leg after the active waypoint once the index has followed (#408)', () => {
        const {aw, fpl} = activeOnBC();
        aw.startOwnTurn(anyTurn());
        aw.turnPlan = TurnPlan.AT_LEAD;

        fpl.deleteLeg(0);
        fpl.deleteLeg(2); // GHI, now after DEF at index 1

        expect(aw.getActiveFplIdx()).toBe(1);
        expect(aw.ownTurnStarted).toBe(false);
        expect(aw.turnStack).toEqual([]);
        expect(aw.turnPlan).toBeNull();
    });

    // 3f: the inserted waypoint became the active one from the FROM, although it was 138 NM away. XXX goes 100 NM east of
    // B, between ABC and DEF: by position the closest leg is XXX - DEF (about 18 NM from the aircraft, against 20 NM for
    // the legs through B and C), which would make DEF active from XXX. The old leg's index is the new leg's, so the turn
    // state must be cleared although the index stays
    it('makes a waypoint inserted between the FROM and the TO active, from the FROM, and clears the turn state (KLN 89 trainer, 3f)', () => {
        const {aw, fpl, settings, published} = activeOnBC();
        aw.turnStack.push(anyTurn());
        aw.startOwnTurn(anyTurn());
        aw.turnPlan = TurnPlan.AT_ABEAM;
        const xPos = pointFrom(B, 90, 100);

        fpl.insertLeg(2, user(vor('XXX', xPos.lat, xPos.lon)));

        expect(aw.getActiveFplIdx()).toBe(2);
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('XXX');
        expect(aw.getFromWpt()!.icaoStruct.ident).toBe('ABC');
        expect(aw.isDctNavigation()).toBe(false);
        // The path is the great circle ABC - XXX: a point 50 NM east of B lies on it
        expect(Math.abs(aw.getFromLeg()!.path.distance(pointFrom(B, 90, 50)))).toBeLessThan(NM(0.01));
        expect(aw.turnStack).toEqual([]);
        expect(aw.ownTurnStarted).toBe(false);
        expect(aw.turnPlan).toBeNull();
        expect(aw.getFollowingLeg()!.wpt.icaoStruct.ident).toBe('DEF');
        expect(settings.getSetting('activeWaypoint').get()).toBe('VK1        XXX     ');
        expect(published).toEqual([2]);
    });

    // 3e: deleting the FROM activates the closest leg. Without ABC the legs are KAAA - DEF, about 14 NM from the
    // aircraft, and DEF - GHI, 20 NM: DEF active from KAAA
    it('activates the closest leg when the FROM is deleted (KLN 89 trainer, 3e)', () => {
        const {aw, fpl} = activeOnBC();
        aw.turnStack.push(runOut());
        aw.turnPlan = TurnPlan.AT_ABEAM;

        fpl.deleteLeg(1);

        expect(aw.getActiveFplIdx()).toBe(1);
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('DEF');
        expect(aw.getFromWpt()!.icaoStruct.ident).toBe('KAAA');
        expect(aw.turnStack).toEqual([]);
        expect(aw.turnPlan).toBeNull();
    });

    // 3e with the FROM further down the plan: GHI is active from DEF at index 2, and DEF goes, so GHI comes to index 2.
    // The leg two in front of it (ABC) is not the FROM's, so no insert is assumed between them: without DEF the legs are
    // KAAA - ABC, 40 NM from the aircraft, and ABC - GHI, about 14 NM: GHI active from ABC
    it('activates the closest leg when a FROM further down the plan is deleted (KLN 89 trainer, 3e)', () => {
        const {aw, fpl} = activeWaypointWith([A, B, C, D].map(user), pointFrom(C, 270, 20));
        aw.activateFpl0();
        expect(aw.getActiveFplIdx()).toBe(3); // Precondition: GHI is active, from DEF
        expect(aw.getFromWpt()!.icaoStruct.ident).toBe('DEF');
        aw.turnStack.push(anyTurn());
        aw.turnPlan = TurnPlan.AT_LEAD;

        fpl.deleteLeg(2);

        expect(aw.getActiveFplIdx()).toBe(2);
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('GHI');
        expect(aw.getFromWpt()!.icaoStruct.ident).toBe('ABC');
        expect(aw.turnStack).toEqual([]);
        expect(aw.turnPlan).toBeNull();
    });

    // Two waypoints inserted between the FROM and the TO in one batch are not the 3f case (one waypoint), and the closest
    // leg is activated (the design, section 3.3). XXX and YYY go 10 and 30 NM north of B, on the active leg B - C: the
    // aircraft, 20 NM north of B, is on XXX - YYY
    it('activates the closest leg when two waypoints are inserted between the FROM and the TO in one batch', () => {
        const {aw, fpl} = activeOnBC();
        const xPos = pointFrom(B, 0, 10);
        const yPos = pointFrom(B, 0, 30);

        fpl.insertLeg(2, user(vor('XXX', xPos.lat, xPos.lon)));
        fpl.insertLeg(3, user(vor('YYY', yPos.lat, yPos.lon)));

        expect(aw.getActiveFplIdx()).toBe(3);
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('YYY');
        expect(aw.getFromWpt()!.icaoStruct.ident).toBe('XXX');
    });

    // A Direct To follows its target and keeps its origin; the FPL 0 rule does not apply to it (the design, Review
    // Focus 5)
    it('keeps a Direct To to an FPL 0 waypoint when the plan leg before it is deleted', () => {
        const {aw, fpl, position} = activeOnBC();
        const origin = fromHere(position);
        aw.directToFlightplanIndex(origin, 2);
        const leftover = runOut();
        aw.turnStack.push(anyTurn(), leftover);
        aw.turnPlan = TurnPlan.AT_LEAD;

        fpl.deleteLeg(0); // KAAA: ABC, the plan leg the FROM was made from before the Direct To, is now before DEF

        expect(aw.getActiveFplIdx()).toBe(1);
        expect(aw.isDctNavigation()).toBe(true);
        expect(aw.getFromWpt()).toBe(origin);
        expect(aw.turnStack).toHaveLength(2);
        expect(aw.turnStack[1]).toBe(leftover);
        expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);
    });
});

// #445: a SID replaced by one of the same length, in one batch as Apt7Page.loadNow does it, leaves the active waypoint
// at its index, and only the leg in front of it shows the edit. assertToMatchesFplIdx compares that leg by instance too,
// so the FROM gone is noticed as for a replacement of a different length, and the closest leg is activated, by analogy
// with deleting the FROM (KLN 89 trainer, 3e); a batch that deletes the FROM and inserts procedure legs at once was not
// flown in the trainer (the design's call).
// FPL 0 is KAAA SIDA1 SIDA2 ABC DEF; the aircraft is 10 NM along the leg SIDA2 - ABC, so ABC (index 3) is active from
// SIDA2. The new SID is SIDB1 SIDB2. SIDB2 lies 15° off SIDA2 as seen from ABC, so that the leg SIDB2 - ABC is the
// closest leg after the batch, and keeping the old FROM is told apart from activating the closest leg
describe('ActiveWaypoint when the active SID or STAR is replaced by one of the same length (#445)', () => {
    const sid = (ident: string, p: { lat: number; lon: number }): KLNFlightplanLeg => ({wpt: intersection(ident, p.lat, p.lon), type: KLNLegType.SID});
    const star = (ident: string, p: { lat: number; lon: number }): KLNFlightplanLeg => ({wpt: intersection(ident, p.lat, p.lon), type: KLNLegType.STAR});
    const app = (wpt: Facility, fixType: KLNFixType): KLNFlightplanLeg => ({wpt, type: KLNLegType.APP, fixType});
    const sidA2 = pointFrom(B, 315, 20);

    /** A turn entry of no particular geometry: the tests only follow the objects */
    const anyTurn = () => {
        const circle = GeoCircle.createGreatCircle(A, B);
        return new TurnStackEntry(circle, new GeoPoint(B.lat, B.lon), circle);
    };

    /** The run-out of an abeam turn at ABC onto the leg to DEF (#406) */
    const runOut = () => TurnStackEntry.runOut(TurnStackEntry.abeamTurn(B, GeoCircle.createGreatCircle(B, C), 'left'));

    /** Replaces SIDA1 SIDA2 by SIDB1 SIDB2 in one batch, as Apt7Page.loadNow does it */
    function swapSid(fpl: Flightplan, sidB1 = pointFrom(A, 180, 10), sidB2 = pointFrom(B, 300, 20)) {
        fpl.startBatchInsert();
        fpl.removeProcedure(KLNLegType.SID);
        fpl.insertLeg(1, sid('SIDB1', sidB1));
        fpl.insertLeg(2, sid('SIDB2', sidB2));
        fpl.finishBatchInsert();
    }

    /** The aircraft, 10 NM along the leg SIDA2 - ABC */
    const aircraft = pointFrom(B, 315, 10);

    /** ABC active from SIDA2, then `beforeBatch`, then the SID swapped */
    function replaceSid(beforeBatch: (aw: ActiveWaypoint) => void = () => {}, sidB1?: { lat: number; lon: number }, sidB2?: { lat: number; lon: number }) {
        const legs = [user(A), sid('SIDA1', pointFrom(A, 0, 10)), sid('SIDA2', sidA2), user(B), user(C)];
        const {aw, fpl} = activeWaypointWith(legs, aircraft);
        aw.activateFpl0();
        const before = {idx: aw.getActiveFplIdx(), from: aw.getFromWpt()!.icaoStruct.ident};
        beforeBatch(aw);
        swapSid(fpl, sidB1, sidB2);
        return {aw, fpl, before};
    }

    // The sibling that holds the preconditions of the tests below: ABC was active from SIDA2, and after the batch it is
    // still at index 3, with SIDB2 in front of it
    it('leaves the active waypoint at its index with the new SID in front of it (control of the #445 tests)', () => {
        const {aw, fpl, before} = replaceSid();
        expect(before).toEqual({idx: 3, from: 'SIDA2'});
        expect(identsOf(fpl.getLegs())).toEqual(['KAAA', 'SIDB1', 'SIDB2', 'ABC', 'DEF']);
        expect(aw.getActiveFplIdx()).toBe(3);
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('ABC');
    });

    it('makes the new SID\'s last fix the FROM when the active SID is replaced by one of the same length (#445)', () => {
        const {aw} = replaceSid();
        // As NavCalculator.updateActiveLeg reads it: the active leg first, which runs assertToMatchesFplIdx, then the FROM
        expect(aw.getActiveLeg()!.wpt.icaoStruct.ident).toBe('ABC');
        expect(aw.getFromWpt()!.icaoStruct.ident).toBe('SIDB2');
        expect(aw.getActiveFplIdx()).toBe(3);
        // The path is the great circle SIDB2 - ABC: a point 10 NM from B toward SIDB2 lies on it
        expect(Math.abs(aw.getFromLeg()!.path.distance(pointFrom(B, 300, 10)))).toBeLessThan(NM(0.01));
    });

    // The closest leg is taken also when it is not the leg into the active waypoint: the new SID's leg SIDB1 - SIDB2
    // runs through the aircraft, 10 NM to either side of it, while the leg SIDB2 - ABC is about 7 NM away. The active
    // waypoint does not stay at its index, as it would if only the FROM were made again
    it('activates the closest leg also when it is a leg of the new SID (#445)', () => {
        const {aw} = replaceSid(undefined, pointFrom(aircraft, 45, 10), pointFrom(aircraft, 225, 10));

        expect(aw.getActiveFplIdx()).toBe(2);
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('SIDB2');
        expect(aw.getFromWpt()!.icaoStruct.ident).toBe('SIDB1');
    });

    it('clears the turn state, the run-out included, as a replacement of a different length does (#445)', () => {
        const {aw} = replaceSid(aw => {
            aw.turnStack.push(runOut());
            aw.turnPlan = TurnPlan.AT_ABEAM;
        });

        expect(aw.getActiveFplIdx()).toBe(3);
        expect(aw.turnStack).toEqual([]);
        expect(aw.turnPlan).toBeNull();
    });

    // KAAA ABC STA1 STA2 DEF GHI, with DEF the IAF and GHI the FAF of the approach; the aircraft is 10 NM along STA2 - DEF,
    // so DEF (index 4) is active from STA2. Apt7Page.loadNow inserts the new STAR in front of the approach, which keeps its
    // legs. STB2 lies 15° off STA2 as seen from DEF, so that the leg STB2 - DEF is the closest leg after the batch
    it('makes the new STAR\'s last fix the FROM when the STAR in front of the first approach fix is replaced by one of the same length (#445)', () => {
        const legs = [user(A), user(B), star('STA1', pointFrom(C, 225, 30)), star('STA2', pointFrom(C, 180, 20)),
            app(C, KLNFixType.IAF), app(D, KLNFixType.FAF)];
        const {aw, fpl} = activeWaypointWith(legs, pointFrom(C, 180, 10));
        aw.activateFpl0();
        expect(aw.getActiveFplIdx()).toBe(4); // Precondition: DEF is active, from STA2
        expect(aw.getFromWpt()!.icaoStruct.ident).toBe('STA2');
        const iaf = fpl.getLegs()[4];

        fpl.startBatchInsert();
        fpl.removeProcedure(KLNLegType.STAR);
        fpl.insertLeg(2, star('STB1', pointFrom(B, 270, 20)));
        fpl.insertLeg(3, star('STB2', pointFrom(C, 195, 20)));
        fpl.finishBatchInsert();

        expect(identsOf(fpl.getLegs())).toEqual(['KAAA', 'ABC', 'STB1', 'STB2', 'DEF', 'GHI']);
        expect(aw.getActiveLeg()).toBe(iaf);
        expect(aw.getFromWpt()!.icaoStruct.ident).toBe('STB2');
    });

    // A Direct To flies from its own origin, so the leg in front of its target is not its FROM, and it follows its target
    // as before
    it('keeps a Direct To to the first en-route waypoint when the SID in front of it is replaced by one of the same length', () => {
        const origin = fromHere(pointFrom(B, 315, 10));
        const leftover = anyTurn();
        const {aw} = replaceSid(aw => {
            aw.directToFlightplanIndex(origin, 3);
            aw.turnStack.push(leftover);
            aw.turnPlan = TurnPlan.AT_LEAD;
        });

        expect(aw.getActiveFplIdx()).toBe(3);
        expect(aw.isDctNavigation()).toBe(true);
        expect(aw.getFromWpt()).toBe(origin);
        expect(aw.turnStack).toEqual([leftover]);
        expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);
    });

    // KAAA SIDA1 SIDA2 ABC DEF GHI with the aircraft 20 NM along ABC - DEF: DEF (index 4) is active from ABC, and the
    // same SID swap leaves the FROM's leg as it was
    it('changes nothing when the SID is replaced while an en-route leg further down is active', () => {
        const legs = [user(A), sid('SIDA1', pointFrom(A, 0, 10)), sid('SIDA2', sidA2), user(B), user(C), user(D)];
        const {aw, fpl} = activeWaypointWith(legs, pointFrom(B, 0, 20));
        aw.activateFpl0();
        expect(aw.getActiveFplIdx()).toBe(4); // Precondition: DEF is active, from ABC
        expect(aw.getFromWpt()!.icaoStruct.ident).toBe('ABC');
        const leftover = anyTurn();
        aw.turnStack.push(leftover);
        aw.turnPlan = TurnPlan.AT_LEAD;
        const from = aw.getFromLeg();

        swapSid(fpl);

        expect(aw.getActiveFplIdx()).toBe(4);
        expect(aw.getFromLeg()).toBe(from);
        expect(aw.turnStack).toEqual([leftover]);
        expect(aw.turnPlan).toBe(TurnPlan.AT_LEAD);
    });
});
