import {describe, expect, it} from 'vitest';
import {EventBus, Facility, GeoCircle, GeoPoint, UnitType} from '@microsoft/msfs-sdk';
import {ActiveWaypoint} from '../../../../kln90b/data/flightplan/ActiveWaypoint';
import {Flightplan, KLNFlightplanLeg, KLNLegType} from '../../../../kln90b/data/flightplan/Flightplan';
import {ArcData} from '../../../../kln90b/data/navdata/SidStar';
import {KLN90BUserSettings} from '../../../../kln90b/settings/KLN90BUserSettings';
import {Sensors} from '../../../../kln90b/Sensors';
import {airport, vor} from '../../../harness/navdata/builders';

const NM = (nm: number) => UnitType.NMILE.convertTo(nm, UnitType.GA_RADIAN);

/** A point at a bearing and a distance from another one. Setup only: the expectations below are literals. */
function at(from: { lat: number; lon: number }, bearingDeg: number, nm: number): GeoPoint {
    return new GeoPoint(from.lat, from.lon).offset(bearingDeg, NM(nm));
}

const user = (wpt: Facility): KLNFlightplanLeg => ({wpt, type: KLNLegType.USER});

/**
 * An ActiveWaypoint over FPL 0 with the aircraft at a given position. activateFpl0 reads only gps.coords of the
 * sensors, so nothing is booted.
 */
function activeWaypointOver(legs: KLNFlightplanLeg[], position: { lat: number; lon: number }) {
    const bus = new EventBus();
    const sensors = {in: {gps: {coords: new GeoPoint(position.lat, position.lon)}}} as unknown as Sensors;
    return new ActiveWaypoint(bus, new KLN90BUserSettings(bus), sensors, new Flightplan(0, legs, bus), null);
}

// An open box of invented waypoints: B is 40 NM east of A, C 40 NM north of B, D 40 NM west of C
const A = airport('KAAA', 47.0, 8.0);
const bPos = at(A, 90, 40);
const B = vor('ABC', bPos.lat, bPos.lon);
const cPos = at(B, 0, 40);
const C = vor('DEF', cPos.lat, cPos.lon);
const dPos = at(C, 270, 40);
const D = vor('GHI', dPos.lat, dPos.lon);

// characterization: the Pilot's Guide does not say which leg FPL 0 activates in flight, and issue #41 asks what the
// right behavior is. The rule tested is the maintainer's: the leg the aircraft is on, else the closest. The
// missed-approach scenario of the issue needs procedures, which the harness navdata does not have.
describe('ActiveWaypoint.activateFpl0 activates the leg the aircraft is on (#41, characterization)', () => {
    it('activates the first leg when the aircraft is on it, 5 NM before B (#41)', () => {
        // The second leg is at least 5 NM away (B is its nearest point)
        const aw = activeWaypointOver([A, B, C].map(user), at(B, 270, 5));

        expect(aw.activateFpl0()).not.toBeNull();
        expect(aw.getActiveFplIdx()).toBe(1);
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('ABC');
    });

    it('activates the last leg of a dogleg when the aircraft is 1 NM beside its middle (#41)', () => {
        // 20 NM west of C on the leg C - D, 1 NM north of it. The other legs are 40 NM or more away
        const aw = activeWaypointOver([A, B, C, D].map(user), at(at(C, 270, 20), 0, 1));

        expect(aw.activateFpl0()).not.toBeNull();
        expect(aw.getActiveFplIdx()).toBe(3);
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('GHI');
    });

    it('activates the first leg when the aircraft is 2 NM beside its middle (#41)', () => {
        // Predicted survivor of the #41 break: the leg the aircraft is nearest to is also the one the pre-fix check
        // picks, because the second leg is 20 NM away whichever way its closest point is judged
        const aw = activeWaypointOver([A, B, C].map(user), at(at(A, 90, 20), 0, 2));

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
        const aw = activeWaypointOver([A, B].map(user), at(B, 90, 100));

        expect(aw.activateFpl0()).not.toBeNull();
        expect(aw.getActiveFplIdx()).toBe(1);
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('ABC');
    });

    it('activates the only leg when the aircraft is 100 NM before its start (#34)', () => {
        const aw = activeWaypointOver([A, B].map(user), at(A, 270, 100));

        expect(aw.activateFpl0()).not.toBeNull();
        expect(aw.getActiveFplIdx()).toBe(1);
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('ABC');
    });
});

describe('ActiveWaypoint.activateFpl0 on a DME arc', () => {
    // #41 continued (closed): isPointOnCircleBetween compares distances along one great circle, so a point on a DME
    // arc, a small circle, is never between the ends and the perpendicular distance is never used for an arc leg.
    // The arc P to Q runs 10 NM around a VOR from the west radial to the north radial; R is 30 NM east of Q.
    function arcPlan() {
        const station = vor('STN', 47.0, 8.0);
        const p = at(station, 270, 10);
        const q = at(station, 0, 10);
        const r = at(q, 90, 30);
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

    it('activates the arc leg P to Q for an aircraft at the start of the arc, so the setup holds (#NEW-2-2)', () => {
        // The pin below stands on this: the plan and the hand-built arc work when the aircraft is at P
        const {station, legs} = arcPlan();
        const atStart = activeWaypointOver(legs, at(station, 270, 10));
        atStart.activateFpl0();
        expect(atStart.getActiveFplIdx()).toBe(1);
    });

    it.fails('activates the arc leg P to Q when the aircraft is on the arc at the 330° radial (#NEW-2-2)', () => {
        const {station, legs} = arcPlan();
        const aw = activeWaypointOver(legs, at(station, 330, 10));

        expect(aw.activateFpl0()).not.toBeNull();
        expect(aw.getActiveFplIdx()).toBe(1);
    });
});
