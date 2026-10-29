import {describe, expect, it} from 'vitest';
import {AirportFacility, EventBus, Facility, GeoPoint} from '@microsoft/msfs-sdk';
import {ActiveWaypoint} from '../../../kln90b/data/flightplan/ActiveWaypoint';
import {Flightplan, KLNFixType, KLNFlightplanLeg, KLNLegType} from '../../../kln90b/data/flightplan/Flightplan';
import {NavPageState} from '../../../kln90b/data/VolatileMemory';
import {KLN90BUserSettings} from '../../../kln90b/settings/KLN90BUserSettings';
import {Sensors} from '../../../kln90b/Sensors';
import {calcDistToDestination, insertLegIntoFpl, mayAddWaypointBefore, roomSteps} from '../../../kln90b/services/FlightplanUtils';
import {airport, intersection, vor} from '../../harness/navdata/builders';
import {pointFrom} from '../../harness/flight/geo';
import {identsOf} from '../../harness/readers';

const user = (wpt: Facility): KLNFlightplanLeg => ({wpt, type: KLNLegType.USER});

/**
 * FPL 0 with a real ActiveWaypoint over it. activateFpl0 and the direct-to methods read only gps.coords of the
 * sensors, so nothing is booted.
 */
function build(legs: KLNFlightplanLeg[], position: { lat: number; lon: number }) {
    const bus = new EventBus();
    const sensors = {in: {gps: {coords: new GeoPoint(position.lat, position.lon)}}} as unknown as Sensors;
    const fpl0 = new Flightplan(0, legs, bus);
    const aw = new ActiveWaypoint(bus, new KLN90BUserSettings(bus), sensors, fpl0, null);
    return {bus, fpl0, aw};
}

/** The part of NavPageState that calcDistToDestination and insertLegIntoFpl read */
const navState = (aw: ActiveWaypoint, distToActive: number | null) => ({activeWaypoint: aw, distToActive}) as unknown as NavPageState;

// An invented route: B is 40 NM east of A, C 25 NM north of B, D 15 NM west of C, E 10 NM north of D
const A = airport('KAAA', 47.0, 8.0);
const bPos = pointFrom(A, 90, 40);
const B = vor('ABC', bPos.lat, bPos.lon);
const cPos = pointFrom(B, 0, 25);
const C = vor('DEF', cPos.lat, cPos.lon);
const dPos = pointFrom(C, 270, 15);
const D = vor('GHI', dPos.lat, dPos.lon);
const ePos = pointFrom(D, 0, 10);
const E = intersection('EEEEE', ePos.lat, ePos.lon);

describe('calcDistToDestination', () => {
    // 4-11 (D/T 1 shows the cumulative distance from the present position along the route) and 6-20 (the destination
    // is the last waypoint, or the MAP of a loaded approach)
    it('adds the legs from the active waypoint to the last waypoint to the distance to the active waypoint', () => {
        const {aw} = build([A, B, C, D].map(user), pointFrom(B, 270, 7));
        aw.activateFpl0(); // The aircraft is on the leg A to B, 7 NM before B
        expect(aw.getActiveFplIdx()).toBe(1);

        // 7 NM to B, then B to C (25 NM) and C to D (15 NM)
        expect(calcDistToDestination(navState(aw, 7), aw.getFutureLegs())).toBeCloseTo(47, 2);
    });

    it('is the distance to the active waypoint on the last leg', () => {
        const {aw} = build([A, B, C].map(user), pointFrom(C, 180, 12));
        aw.activateFpl0();
        expect(aw.getActiveFplIdx()).toBe(2);

        expect(calcDistToDestination(navState(aw, 12), aw.getFutureLegs())).toBeCloseTo(12, 6);
    });

    // 4-11: a Direct To to a waypoint of the plan resumes the plan after it, so the distance runs on to the last waypoint
    it('counts the legs behind a direct-to waypoint of the plan', () => {
        const {aw} = build([A, B, C, D].map(user), pointFrom(A, 0, 3));
        aw.directToFlightplanIndex(A, 2); // Direct to C
        expect(aw.getActiveFplIdx()).toBe(2);

        expect(calcDistToDestination(navState(aw, 30), aw.getFutureLegs())).toBeCloseTo(45, 2); // 30 + 15 (C to D)
    });

    // 4-11: for a Direct To to a waypoint that is not in the plan the distance to the destination is the distance to it
    it('is the distance to the active waypoint for a direct-to outside the plan', () => {
        const {aw} = build([A, B, C].map(user), pointFrom(A, 0, 3));
        aw.directTo(A, E); // E is not in the plan
        expect(aw.getActiveFplIdx()).toBe(-1);

        expect(calcDistToDestination(navState(aw, 55), aw.getFutureLegs())).toBe(55);
    });

    // 6-20: with an approach loaded the destination is the MAP, so the missed approach legs behind it do not count
    it('stops at the MAP and does not count the missed approach behind it', () => {
        const map: KLNFlightplanLeg = {wpt: C, type: KLNLegType.APP, fixType: KLNFixType.MAP};
        const missed: KLNFlightplanLeg = {wpt: D, type: KLNLegType.APP, fixType: KLNFixType.MAHP};
        const {aw} = build([user(A), user(B), map, missed], pointFrom(B, 270, 7));
        aw.activateFpl0();
        expect(aw.getActiveFplIdx()).toBe(1);

        // 7 + 25 (B to the MAP), not + 15 more to the MAHP
        expect(calcDistToDestination(navState(aw, 7), aw.getFutureLegs())).toBeCloseTo(32, 2);
    });
});

describe('ActiveWaypoint.getDestination', () => {
    // 6-20: the default destination is the MAP of a loaded approach, else the last waypoint of the plan
    it('is the last waypoint of the plan (6-20)', () => {
        const {aw} = build([A, B, C].map(user), pointFrom(B, 270, 7));
        aw.activateFpl0();

        expect(aw.getDestination()!.icaoStruct.ident).toBe('DEF');
    });

    it('is the MAP when an approach is loaded, not the missed approach point behind it (6-20)', () => {
        const map: KLNFlightplanLeg = {wpt: C, type: KLNLegType.APP, fixType: KLNFixType.MAP};
        const missed: KLNFlightplanLeg = {wpt: D, type: KLNLegType.APP, fixType: KLNFixType.MAHP};
        const {aw} = build([user(A), user(B), map, missed], pointFrom(B, 270, 7));
        aw.activateFpl0();

        expect(aw.getDestination()!.icaoStruct.ident).toBe('DEF');
    });

    // Not stated by the 6-20 rule above; the behavior of the code
    it('is the direct-to waypoint for a direct-to outside the plan (characterization)', () => {
        const {aw} = build([A, B, C].map(user), pointFrom(A, 0, 3));
        aw.directTo(A, E);

        expect(aw.getDestination()!.icaoStruct.ident).toBe('EEEEE');
    });

    // Not in the manual; the behavior of the code
    it('is null without an active waypoint (characterization)', () => {
        const {aw} = build([], {lat: 47, lon: 8});

        expect(aw.getDestination()).toBeNull();
    });
});

// A full plan of 30 legs along one line north from 47N 8E, FIX00 at the start and 5 NM between the legs
const START = {lat: 47, lon: 8};
function fullPlanLegs(): KLNFlightplanLeg[] {
    return Array.from({length: 30}, (_, i) => {
        const p = pointFrom(START, 0, 5 * i);
        return user(intersection(`FIX${String(i).padStart(2, '0')}`, p.lat, p.lon));
    });
}

const NEW = intersection('NEWWP', 48.0, 9.0);

describe('insertLegIntoFpl', () => {
    // 4-4: a waypoint may be added to a plan with fewer than 30
    it('inserts into a plan with room', () => {
        const {fpl0, aw} = build([A, B].map(user), START);

        insertLegIntoFpl(fpl0, navState(aw, null), 1, user(C));

        expect(identsOf(fpl0.getLegs())).toEqual(['KAAA', 'DEF', 'ABC']);
    });

    // 4-4: a plan of 29 takes a 30th without losing its first waypoint
    it('inserts the 30th leg into FPL 0 and keeps the first leg (4-4)', () => {
        const {fpl0, aw} = build(fullPlanLegs().slice(0, 29), START);

        insertLegIntoFpl(fpl0, navState(aw, null), 29, user(NEW));

        expect(fpl0.getLegs()).toHaveLength(30);
        expect(identsOf(fpl0.getLegs())[0]).toBe('FIX00');
        expect(identsOf(fpl0.getLegs())[28]).toBe('FIX28');
        expect(identsOf(fpl0.getLegs())[29]).toBe('NEWWP');
    });

    // 4-1: at most 30 waypoints. Only FPL 0 makes room (the status line message FPL FULL, C-1, names the case of the
    // active first leg), so a numbered plan refuses the 31st
    it('refuses the 31st leg of a numbered plan and leaves the plan alone', () => {
        const {bus, aw} = build([], START);
        const fpl5 = new Flightplan(5, fullPlanLegs(), bus);

        expect(() => insertLegIntoFpl(fpl5, navState(aw, null), 30, user(NEW))).toThrow('Cannot have more than 30 legs!');

        expect(identsOf(fpl5.getLegs())).not.toContain('NEWWP');
        expect(fpl5.getLegs()).toHaveLength(30);
    });

    // Checked in the KLN 89 trainer, 2026-10-15: a waypoint inserted in front of a STAR row of a plan whose en-route
    // waypoints are at the limit is a STAR waypoint and goes in without deleting anything
    it('inserts a STAR leg into FPL 0 with 30 en-route waypoints and keeps the first leg (checked in the KLN 89 trainer, 2026-10-15)', () => {
        const star = (ident: string): KLNFlightplanLeg => ({wpt: intersection(ident, 46.9, 8.1), type: KLNLegType.STAR});
        const {fpl0, aw} = build([...fullPlanLegs(), star('STRAA'), star('STRAB')], START);

        insertLegIntoFpl(fpl0, navState(aw, null), 31, star('STRAC'));

        expect(fpl0.getLegs()).toHaveLength(33);
        expect(identsOf(fpl0.getLegs())[0]).toBe('FIX00');
        expect(identsOf(fpl0.getLegs()).slice(30)).toEqual(['STRAA', 'STRAC', 'STRAB']);
    });

    // characterization: the Pilot's Guide names only the refusal (FPL FULL when the first waypoint is part of the active
    // leg). That the first waypoint makes room in every other case is the unit's rule (FlightplanUtils.ts)
    it('drops the first leg of a full FPL 0 to append when no waypoint is active (characterization)', () => {
        const {fpl0, aw} = build(fullPlanLegs(), START);

        insertLegIntoFpl(fpl0, navState(aw, null), 30, user(NEW));

        expect(fpl0.getLegs()).toHaveLength(30);
        expect(identsOf(fpl0.getLegs()).slice(0, 2)).toEqual(['FIX01', 'FIX02']);
        expect(identsOf(fpl0.getLegs())[29]).toBe('NEWWP');
    });

    it('drops the first leg of a full FPL 0 and inserts at the cursor position behind it (characterization)', () => {
        const {fpl0, aw} = build(fullPlanLegs(), START);

        // Typed in front of the second waypoint: the plan would read FIX00, NEWWP, FIX01, and FIX00 goes
        insertLegIntoFpl(fpl0, navState(aw, null), 1, user(NEW));

        expect(identsOf(fpl0.getLegs()).slice(0, 3)).toEqual(['NEWWP', 'FIX01', 'FIX02']);
        expect(fpl0.getLegs()).toHaveLength(30);
    });

    it('refuses when the first leg is part of the active leg (C-1)', () => {
        const {fpl0, aw} = build(fullPlanLegs(), pointFrom(START, 0, 2));
        aw.activateFpl0();
        expect(aw.getActiveFplIdx()).toBe(1); // On the leg FIX00 to FIX01

        expect(() => insertLegIntoFpl(fpl0, navState(aw, 3), 30, user(NEW))).toThrow('First waypoint is part of the active leg');

        expect(identsOf(fpl0.getLegs())).not.toContain('NEWWP');
        expect(identsOf(fpl0.getLegs())[0]).toBe('FIX00');
    });

    it('drops the first leg once the active leg is the second one, and keeps the active waypoint (characterization)', () => {
        const {fpl0, aw} = build(fullPlanLegs(), pointFrom(START, 0, 7));
        aw.activateFpl0();
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('FIX02'); // On the leg FIX01 to FIX02

        insertLegIntoFpl(fpl0, navState(aw, 3), 30, user(NEW));

        expect(identsOf(fpl0.getLegs())[0]).toBe('FIX01');
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('FIX02');
        expect(aw.getActiveFplIdx()).toBe(1);
    });

    // A direct to the second waypoint has no from waypoint, so the first one is free
    it('drops the first leg for a direct-to the second waypoint (characterization)', () => {
        const {fpl0, aw} = build(fullPlanLegs(), START);
        aw.directToFlightplanIndex(fpl0.getLegs()[0].wpt, 1);

        insertLegIntoFpl(fpl0, navState(aw, 5), 30, user(NEW));

        expect(identsOf(fpl0.getLegs())[0]).toBe('FIX01');
        expect(identsOf(fpl0.getLegs())[29]).toBe('NEWWP');
    });

    // The first waypoint itself is the to waypoint of a direct to it, which is part of the active leg
    it('refuses for a direct-to the first waypoint (C-1)', () => {
        const {fpl0, aw} = build(fullPlanLegs(), START);
        aw.directToFlightplanIndex(fpl0.getLegs()[0].wpt, 0);

        expect(() => insertLegIntoFpl(fpl0, navState(aw, 5), 30, user(NEW))).toThrow('First waypoint is part of the active leg');

        expect(identsOf(fpl0.getLegs())[0]).toBe('FIX00');
        expect(identsOf(fpl0.getLegs())).not.toContain('NEWWP');
    });

    // 4-4: a waypoint typed over the first row goes in front of the first waypoint, so it becomes the first one. The
    // first waypoint makes room and the index follows it (#148)
    it('puts a waypoint typed in front of the first leg of a full FPL 0 first (4-4, #148)', () => {
        const {fpl0, aw} = build(fullPlanLegs(), START);

        insertLegIntoFpl(fpl0, navState(aw, null), 0, user(NEW));

        expect(identsOf(fpl0.getLegs()).slice(0, 2)).toEqual(['NEWWP', 'FIX01']);
        expect(identsOf(fpl0.getLegs())[29]).toBe('FIX29');
    });
});

describe('roomSteps, the legs that go to make room in FPL 0 (#148)', () => {
    const sidOf = (apt: Facility, ident: string): KLNFlightplanLeg =>
        ({wpt: intersection(ident, 47.0, 8.2), type: KLNLegType.SID, parentFacility: apt as AirportFacility});

    it('is empty when the legs fit (characterization)', () => {
        const {fpl0, aw} = build(fullPlanLegs().slice(0, 29), START);
        expect(roomSteps(fpl0.getLegs(), navState(aw, null), 1, 0)).toEqual([]);
    });

    it('deletes one waypoint for one en-route waypoint in a full plan (characterization)', () => {
        const {fpl0, aw} = build(fullPlanLegs(), START);
        expect(roomSteps(fpl0.getLegs(), navState(aw, null), 1, 0)).toEqual([1]);
        expect(fpl0.getLegs()).toHaveLength(30); // nothing changed
    });

    // An airport deleted from the front takes its SID: the SID would otherwise start the plan without its airport
    it('deletes the airport at the front together with the SID legs that follow it (characterization)', () => {
        const kdep = airport('KDEP', 46.9, 8.0);
        const legs = [{wpt: kdep, type: KLNLegType.USER}, sidOf(kdep, 'SIDAA'), sidOf(kdep, 'SIDAB'), ...fullPlanLegs().slice(0, 29)];
        const {aw} = build(legs, START);
        expect(roomSteps(legs, navState(aw, null), 1, 0)).toEqual([3]);
    });

    // C-1: FPL FULL while the first waypoint is part of the active leg
    it('is null while the first leg is part of the active leg (C-1)', () => {
        const {fpl0, aw} = build(fullPlanLegs(), pointFrom(START, 0, 2));
        aw.activateFpl0();
        expect(aw.getActiveFplIdx()).toBe(1);
        expect(roomSteps(fpl0.getLegs(), navState(aw, 3), 1, 0)).toBeNull();
    });

    it('is null when the protected airport would have to go (characterization)', () => {
        const legs = fullPlanLegs();
        const {aw} = build(legs, START);
        expect(roomSteps(legs, navState(aw, null), 1, 0, legs[0].wpt)).toBeNull();
    });

    it('deletes only the airport at the front when the SID legs behind it belong to another airport (characterization)', () => {
        const kdep = airport('KDEP', 46.9, 8.0);
        const koth = airport('KOTH', 46.8, 8.0);
        const legs = [{wpt: kdep, type: KLNLegType.USER}, sidOf(koth, 'SIDAA'), sidOf(koth, 'SIDAB'), ...fullPlanLegs().slice(0, 29)];
        const {aw} = build(legs, START);
        expect(roomSteps(legs, navState(aw, null), 1, 0)).toEqual([1]);
    });

    // Task 3 replaces a procedure that holds the active leg: the list it offers lacks that leg, and none may go
    it('is null when the active leg is not in the legs (characterization)', () => {
        const {fpl0, aw} = build(fullPlanLegs(), pointFrom(START, 0, 7));
        aw.activateFpl0();
        expect(aw.getActiveFplIdx()).toBe(2); // Precondition: an active leg exists, FIX02
        const active = aw.getActiveLeg();
        const without = fpl0.getLegs().filter(leg => leg !== active);
        expect(without).toHaveLength(29);
        expect(roomSteps(without, navState(aw, 3), 2, 0)).toBeNull(); // 31 en-route would need FIX00 to go
    });

    it('is null when `keep` is a later leg that would have to go (characterization)', () => {
        const legs = fullPlanLegs();
        const {aw} = build(legs, START);
        expect(roomSteps(legs, navState(aw, null), 2, 0, legs[1].wpt)).toBeNull();
    });

    it('is null when no number of deleted legs makes room (characterization)', () => {
        const legs = fullPlanLegs();
        const {aw} = build(legs, START);
        expect(roomSteps(legs, navState(aw, null), 31, 0)).toBeNull();
    });

    // The total of 45 (#221): 30 en-route and 15 STAR legs, one more STAR leg deletes the first waypoint
    it('deletes the first waypoint for a procedure leg past 45 legs (characterization)', () => {
        const star = Array.from({length: 15}, (_, i): KLNFlightplanLeg => ({wpt: intersection(`ST${String(i).padStart(3, '0')}`, 46.8, 8 + 0.01 * i), type: KLNLegType.STAR}));
        const legs = [...fullPlanLegs(), ...star];
        const {aw} = build(legs, START);
        expect(roomSteps(legs, navState(aw, null), 0, 1)).toEqual([1]);
    });
});

describe('mayAddWaypointBefore, the approach legs (6-7)', () => {
    // 6-7: no waypoint is added between two waypoints of an approach. The plan is the airport A, the approach B, C, D and
    // the airport E after them
    const app = (wpt: Facility): KLNFlightplanLeg => ({wpt, type: KLNLegType.APP});
    const approachLegs: KLNFlightplanLeg[] = [user(A), app(B), app(C), app(D), user(E)];

    it('refuses a waypoint between two waypoints of an approach (6-7, #349)', () => {
        expect(mayAddWaypointBefore(approachLegs, 2)).toBe(false);
        expect(mayAddWaypointBefore(approachLegs, 3)).toBe(false);
    });
});

describe('mayAddWaypointBefore, the legs at the ends of an approach (characterization)', () => {
    const app = (wpt: Facility): KLNFlightplanLeg => ({wpt, type: KLNLegType.APP});
    const approachLegs: KLNFlightplanLeg[] = [user(A), app(B), app(C), app(D), user(E)];

    // The leg into the IAF and the leg from the approach to the airport stay open for a waypoint (#349)
    it('characterization: allows a waypoint on the leg into the IAF (#349)', () => {
        expect(mayAddWaypointBefore(approachLegs, 1)).toBe(true);
    });

    it('characterization: allows a waypoint on the leg from the approach to the airport (#349)', () => {
        expect(mayAddWaypointBefore(approachLegs, 4)).toBe(true);
    });
});

describe('mayAddWaypointBefore, the en-route legs (characterization)', () => {
    it('characterization: allows a waypoint on every en-route leg', () => {
        const legs = [A, B, C].map(user);
        expect(mayAddWaypointBefore(legs, 1)).toBe(true);
        expect(mayAddWaypointBefore(legs, 2)).toBe(true);
    });
});

// 4-10, 4-11: a Direct To to a waypoint of the plan resumes the plan behind it. Adding a waypoint in front of the
// target shifts its index, and the direct-to follows the shift. Checked in the KLN 89 trainer: the direct-to follows its
// target to the new index. In leg mode a waypoint added between the from waypoint and the active one becomes the active
// one instead (checked in the KLN 89 trainer, 2026-10-28, 3f; #440)
describe('ActiveWaypoint after a leg is inserted in front of the active waypoint', () => {
    // On the line A to B, 10 NM from A
    const f = pointFrom(A, 90, 10);
    const F = intersection('FFFFF', f.lat, f.lon);

    // #440: by the rule of 3f (its new waypoint lay 138 NM off to the side) also behind the aircraft, which is 7 NM before
    // B and so past F; by position the leg F to B would be active
    it('makes the waypoint inserted between the from waypoint and the active one active in leg mode (by the rule of the KLN 89 trainer\'s 3f; #440)', () => {
        const {fpl0, aw} = build([A, B, C, D].map(user), pointFrom(B, 270, 7));
        aw.activateFpl0();
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('ABC');

        fpl0.insertLeg(1, user(F));

        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('FFFFF');
        expect(aw.getActiveFplIdx()).toBe(1);
        expect(aw.getFromWpt()!.icaoStruct.ident).toBe('KAAA');
        expect(identsOf(aw.getFutureLegs())).toEqual(['FFFFF', 'ABC', 'DEF', 'GHI']);
    });

    it('keeps a direct-to to a waypoint of the plan in the plan (#149)', () => {
        const {fpl0, aw} = build([A, B, C, D].map(user), pointFrom(A, 0, 3));
        aw.directToFlightplanIndex(A, 2); // Direct to C
        expect(aw.getActiveFplIdx()).toBe(2);

        fpl0.insertLeg(1, user(F));

        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('DEF');
        expect(aw.isDctNavigation()).toBe(true);
        expect(aw.getActiveFplIdx()).toBe(3);
        expect(identsOf(aw.getFutureLegs())).toEqual(['DEF', 'GHI']);
    });

    // The shifts are the plain bookkeeping of the same rule: the direct-to stays on its target, wherever the edit is.
    // KAAA, ABC, DEF, GHI; the direct-to is to DEF (index 2) or, where named, to another leg
    describe('and the direct-to is to a waypoint of the plan (4-10, 4-11)', () => {
        const directTo = (idx: number) => {
            const built = build([A, B, C, D].map(user), pointFrom(A, 0, 3));
            built.aw.directToFlightplanIndex(A, idx);
            expect(built.aw.getActiveFplIdx()).toBe(idx); // Precondition
            return built;
        };

        it('moves to the new index when a leg is inserted in front of the first waypoint', () => {
            const {fpl0, aw} = directTo(2);

            fpl0.insertLeg(0, user(F));

            expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('DEF');
            expect(aw.getActiveFplIdx()).toBe(3);
            expect(identsOf(aw.getFutureLegs())).toEqual(['DEF', 'GHI']);
        });

        it('moves to the new index when a leg is inserted directly in front of it', () => {
            const {fpl0, aw} = directTo(2);

            fpl0.insertLeg(2, user(F));

            expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('DEF');
            expect(aw.getActiveFplIdx()).toBe(3);
            expect(identsOf(aw.getFutureLegs())).toEqual(['DEF', 'GHI']);
        });

        it('stays at its index when a leg is inserted behind it, and when one is appended', () => {
            const {fpl0, aw} = directTo(2);

            fpl0.insertLeg(3, user(F));
            fpl0.insertLeg(fpl0.getLegs().length, user(E));

            expect(aw.getActiveFplIdx()).toBe(2);
            expect(identsOf(aw.getFutureLegs())).toEqual(['DEF', 'FFFFF', 'GHI', 'EEEEE']);
        });

        it('moves up when a leg in front of it is deleted', () => {
            const {fpl0, aw} = directTo(2);

            fpl0.deleteLeg(1);

            expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('DEF');
            expect(aw.isDctNavigation()).toBe(true);
            expect(aw.getActiveFplIdx()).toBe(1);
            expect(identsOf(aw.getFutureLegs())).toEqual(['DEF', 'GHI']);
        });

        it('moves up when the first leg is deleted', () => {
            const {fpl0, aw} = directTo(2);

            fpl0.deleteLeg(0);

            expect(aw.getActiveFplIdx()).toBe(1);
            expect(identsOf(aw.getFutureLegs())).toEqual(['DEF', 'GHI']);
        });

        it('stays at its index when a leg behind it is deleted', () => {
            const {fpl0, aw} = directTo(2);

            fpl0.deleteLeg(3);

            expect(aw.getActiveFplIdx()).toBe(2);
            expect(identsOf(aw.getFutureLegs())).toEqual(['DEF']);
        });

        // #67: a direct-to whose target is deleted from the plan goes on as a direct-to outside the plan
        it('becomes a direct-to outside the plan when the target itself is deleted', () => {
            const {fpl0, aw} = directTo(2);

            fpl0.deleteLeg(2);

            expect(aw.isDctNavigation()).toBe(true);
            expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('DEF');
            expect(aw.getActiveFplIdx()).toBe(-1);
            expect(identsOf(aw.getFutureLegs())).toEqual(['DEF']);
        });

        // A direct-to to the first waypoint has no leg in front of it: an insert in front of it moves it, and a delete
        // behind it does not
        it('follows a direct-to the first waypoint when a leg is inserted in front of it', () => {
            const {fpl0, aw} = directTo(0);

            fpl0.insertLeg(0, user(F));

            expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('KAAA');
            expect(aw.getActiveFplIdx()).toBe(1);
            expect(identsOf(aw.getFutureLegs())).toEqual(['KAAA', 'ABC', 'DEF', 'GHI']);
        });

        it('stays on a direct-to the first waypoint when a later leg is deleted', () => {
            const {fpl0, aw} = directTo(0);

            fpl0.deleteLeg(2);

            expect(aw.getActiveFplIdx()).toBe(0);
            expect(identsOf(aw.getFutureLegs())).toEqual(['KAAA', 'ABC', 'GHI']);
        });

        // A direct-to the last waypoint
        it('follows a direct-to the last waypoint when a leg is inserted or deleted in front of it', () => {
            const {fpl0, aw} = directTo(3);

            fpl0.insertLeg(1, user(F));
            expect(aw.getActiveFplIdx()).toBe(4);
            expect(identsOf(aw.getFutureLegs())).toEqual(['GHI']);

            fpl0.deleteLeg(0);
            fpl0.deleteLeg(0);
            expect(aw.getActiveFplIdx()).toBe(2);
            expect(identsOf(aw.getFutureLegs())).toEqual(['GHI']);
        });

        // The same waypoint twice in the plan: the target is the leg that was chosen, not the first one with its ident
        it('follows the chosen leg of a waypoint that the plan holds twice', () => {
            const {fpl0, aw} = build([A, B, C, B, D].map(user), pointFrom(A, 0, 3));
            aw.directToFlightplanIndex(A, 3); // Direct to the second ABC
            expect(aw.getActiveFplIdx()).toBe(3); // Precondition

            fpl0.insertLeg(0, user(F));

            expect(aw.getActiveFplIdx()).toBe(4);
            expect(identsOf(aw.getFutureLegs())).toEqual(['ABC', 'GHI']);
        });

        // A full FPL 0 drops its first waypoint to make room (the unit's rule, FlightplanUtils.ts): every index behind it
        // moves up, the direct-to target with it
        it('characterization: moves up when a full plan drops its first waypoint to make room for an appended one', () => {
            const {fpl0, aw} = build(fullPlanLegs(), START);
            aw.directToFlightplanIndex(fpl0.getLegs()[0].wpt, 6);
            expect(aw.getActiveFplIdx()).toBe(6); // Precondition

            insertLegIntoFpl(fpl0, navState(aw, 5), 30, user(NEW));

            expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('FIX06');
            expect(aw.getActiveFplIdx()).toBe(5);
            expect(aw.getFutureLegs()).toHaveLength(25);
        });
    });
});
