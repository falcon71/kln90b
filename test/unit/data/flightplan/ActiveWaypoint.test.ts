import {describe, expect, it} from 'vitest';
import {EventBus, Facility, GeoCircle, GeoPoint, UnitType} from '@microsoft/msfs-sdk';
import {ActiveWaypoint, TurnStackEntry} from '../../../../kln90b/data/flightplan/ActiveWaypoint';
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

/** The same, with the settings and FPL 0 the ActiveWaypoint works on, for tests that read or edit them */
function activeWaypointWith(legs: KLNFlightplanLeg[], position: { lat: number; lon: number }) {
    const bus = new EventBus();
    const settings = new KLN90BUserSettings(bus);
    const sensors = {in: {gps: {coords: new GeoPoint(position.lat, position.lon)}}} as unknown as Sensors;
    const fpl = new Flightplan(0, legs, bus);
    return {aw: new ActiveWaypoint(bus, settings, sensors, fpl, null), settings, fpl};
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

describe('ActiveWaypoint.activateFpl0 on a DME arc', () => {
    // #41 continued (closed): the expected leg is the leg the aircraft is on, the rule of the #41 describe above.
    // isPointOnCircleBetween compares distances along one great circle, so a point on a DME
    // arc, a small circle, is never between the ends and the perpendicular distance is never used for an arc leg.
    // The arc P to Q runs 10 NM around a VOR from the west radial to the north radial; R is 30 NM east of Q.
    function arcPlan() {
        const station = vor('STN', 47.0, 8.0);
        const p = pointFrom(station, 270, 10);
        const q = pointFrom(station, 0, 10);
        const r = pointFrom(q, 90, 30);
        const P = vor('PPP', p.lat, p.lon);
        const Q = vor('QQQ', q.lat, q.lon);
        const R = vor('RRR', r.lat, r.lon);
        // Only circle is read by findClosestLegIdx; the other fields are filled in as far as they are known
        const arcData = {
            beginRadial: 270, beginPoint: p, entryFacility: P, endRadial: 0, endFacility: Q, endPoint: q,
            vor: station, circle: GeoCircle.createFromPoint(station, NM(10)),
        } as unknown as ArcData;
        return {station, legs: [{...user(P), arcData}, user(Q), user(R)] as KLNFlightplanLeg[]};
    }

    it('activates the arc leg P to Q for an aircraft at the start of the arc, so the setup holds (#121)', () => {
        // The pin below stands on this: the plan and the hand-built arc work when the aircraft is at P
        const {station, legs} = arcPlan();
        const atStart = activeWaypointOver(legs, pointFrom(station, 270, 10));
        // The position of the pin below lies on the arc as well, so it is a point of the leg and not a stray one
        const onArc = pointFrom(station, 330, 10);
        expect(legs[0].arcData!.circle.distance(onArc)).toBeCloseTo(0, 6);
        atStart.activateFpl0();
        expect(atStart.getActiveFplIdx()).toBe(1);
    });

    it.fails('activates the arc leg P to Q when the aircraft is on the arc at the 330° radial (#121)', () => {
        const {station, legs} = arcPlan();
        const aw = activeWaypointOver(legs, pointFrom(station, 330, 10));

        expect(aw.activateFpl0()).not.toBeNull();
        expect(aw.getActiveFplIdx()).toBe(1);
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

    // characterization: the saved waypoint is the one the unit restores at the next power-up. The V1 ICAO literal is
    // region K1, four blanks, the ident padded to five
    it('characterization: a direct-to saves the active waypoint', () => {
        const position = pointFrom(A, 90, 10);
        const {aw, settings} = activeWaypointWith([A, B, C, D].map(user), position);
        aw.activateFpl0();
        expect(settings.getSetting('activeWaypoint').get()).toBe('VK1    ABC  '); // Precondition: the leg before the direct-to is saved

        aw.directTo(fromHere(position), C);

        expect(settings.getSetting('activeWaypoint').get()).toBe('VK1    DEF  ');
        expect(aw.lastactiveWaypoint!.icaoStruct.ident).toBe('DEF');
    });

    // characterization (#41 rule): after an edit the active leg is found again by position, not kept as the same leg.
    // XXX goes into the active leg B-C, 30 NM past B on the line and beyond the aircraft (20 NM past B), so the aircraft is
    // now on B-XXX: by position the leg is B-XXX (index 2); keeping the old leg would keep C at its shifted index 3
    it('characterization: an edit inside the active leg re-activates the leg the aircraft is on', () => {
        const position = pointFrom(B, 0, 20); // on the leg B-C
        const {aw, fpl} = activeWaypointWith([A, B, C, D].map(user), position);
        aw.activateFpl0();
        expect(aw.getActiveFplIdx()).toBe(2); // Precondition: DEF is active
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('DEF');
        const xPos = pointFrom(B, 0, 30);
        fpl.insertLeg(2, user(vor('XXX', xPos.lat, xPos.lon)));

        expect(aw.getActiveFplIdx()).toBe(2);
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('XXX');
        expect(aw.getFromWpt()!.icaoStruct.ident).toBe('ABC');
    });
});
