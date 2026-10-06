import {describe, expect, it} from 'vitest';
import {EventBus, Facility, GeoPoint} from '@microsoft/msfs-sdk';
import {ActiveWaypoint} from '../../../kln90b/data/flightplan/ActiveWaypoint';
import {Flightplan, KLNFixType, KLNFlightplanLeg, KLNLegType} from '../../../kln90b/data/flightplan/Flightplan';
import {NavPageState} from '../../../kln90b/data/VolatileMemory';
import {KLN90BUserSettings} from '../../../kln90b/settings/KLN90BUserSettings';
import {Sensors} from '../../../kln90b/Sensors';
import {calcDistToDestination, insertLegIntoFpl} from '../../../kln90b/services/FlightplanUtils';
import {airport, intersection, vor} from '../../harness/navdata/builders';
import {pointFrom} from '../../harness/flight/geo';

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
    it('is the last waypoint of the plan', () => {
        const {aw} = build([A, B, C].map(user), pointFrom(B, 270, 7));
        aw.activateFpl0();

        expect(aw.getDestination()!.icaoStruct.ident).toBe('DEF');
    });

    it('is the MAP when an approach is loaded, not the missed approach point behind it', () => {
        const map: KLNFlightplanLeg = {wpt: C, type: KLNLegType.APP, fixType: KLNFixType.MAP};
        const missed: KLNFlightplanLeg = {wpt: D, type: KLNLegType.APP, fixType: KLNFixType.MAHP};
        const {aw} = build([user(A), user(B), map, missed], pointFrom(B, 270, 7));
        aw.activateFpl0();

        expect(aw.getDestination()!.icaoStruct.ident).toBe('DEF');
    });

    it('is the direct-to waypoint for a direct-to outside the plan', () => {
        const {aw} = build([A, B, C].map(user), pointFrom(A, 0, 3));
        aw.directTo(A, E);

        expect(aw.getDestination()!.icaoStruct.ident).toBe('EEEEE');
    });

    it('is null without an active waypoint', () => {
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
const identsOf = (fpl: Flightplan) => fpl.getLegs().map(l => l.wpt.icaoStruct.ident);

describe('insertLegIntoFpl', () => {
    // 4-4: a waypoint may be added to a plan with fewer than 30
    it('inserts into a plan with room', () => {
        const {fpl0, aw} = build([A, B].map(user), START);

        insertLegIntoFpl(fpl0, navState(aw, null), 1, user(C));

        expect(identsOf(fpl0)).toEqual(['KAAA', 'DEF', 'ABC']);
    });

    // 4-4: a plan of 29 takes a 30th without losing its first waypoint
    it('inserts the 30th leg into FPL 0 and keeps the first leg', () => {
        const {fpl0, aw} = build(fullPlanLegs().slice(0, 29), START);

        insertLegIntoFpl(fpl0, navState(aw, null), 29, user(NEW));

        expect(fpl0.getLegs()).toHaveLength(30);
        expect(identsOf(fpl0)[0]).toBe('FIX00');
        expect(identsOf(fpl0)[28]).toBe('FIX28');
        expect(identsOf(fpl0)[29]).toBe('NEWWP');
    });

    // 4-1: at most 30 waypoints. Only FPL 0 makes room (the status line message FPL FULL, C-1, names the case of the
    // active first leg), so a numbered plan refuses the 31st
    it('refuses the 31st leg of a numbered plan and leaves the plan alone', () => {
        const {bus, aw} = build([], START);
        const fpl5 = new Flightplan(5, fullPlanLegs(), bus);

        expect(() => insertLegIntoFpl(fpl5, navState(aw, null), 30, user(NEW))).toThrow('Cannot have more than 30 legs!');

        expect(identsOf(fpl5)).not.toContain('NEWWP');
        expect(fpl5.getLegs()).toHaveLength(30);
    });

    // characterization: the Pilot's Guide names only the refusal (FPL FULL when the first waypoint is part of the active
    // leg). That the first waypoint makes room in every other case is the unit's rule (FlightplanUtils.ts)
    it('drops the first leg of a full FPL 0 to append when no waypoint is active (characterization)', () => {
        const {fpl0, aw} = build(fullPlanLegs(), START);

        insertLegIntoFpl(fpl0, navState(aw, null), 30, user(NEW));

        expect(fpl0.getLegs()).toHaveLength(30);
        expect(identsOf(fpl0).slice(0, 2)).toEqual(['FIX01', 'FIX02']);
        expect(identsOf(fpl0)[29]).toBe('NEWWP');
    });

    it('drops the first leg of a full FPL 0 and inserts at the cursor position behind it (characterization)', () => {
        const {fpl0, aw} = build(fullPlanLegs(), START);

        // Typed in front of the second waypoint: the plan would read FIX00, NEWWP, FIX01, and FIX00 goes
        insertLegIntoFpl(fpl0, navState(aw, null), 1, user(NEW));

        expect(identsOf(fpl0).slice(0, 3)).toEqual(['NEWWP', 'FIX01', 'FIX02']);
        expect(fpl0.getLegs()).toHaveLength(30);
    });

    it('refuses when the first leg is part of the active leg (C-1)', () => {
        const {fpl0, aw} = build(fullPlanLegs(), pointFrom(START, 0, 2));
        aw.activateFpl0();
        expect(aw.getActiveFplIdx()).toBe(1); // On the leg FIX00 to FIX01

        expect(() => insertLegIntoFpl(fpl0, navState(aw, 3), 30, user(NEW))).toThrow('First waypoint is part of the active leg');

        expect(identsOf(fpl0)).not.toContain('NEWWP');
        expect(identsOf(fpl0)[0]).toBe('FIX00');
    });

    it('drops the first leg once the active leg is the second one, and keeps the active waypoint (characterization)', () => {
        const {fpl0, aw} = build(fullPlanLegs(), pointFrom(START, 0, 7));
        aw.activateFpl0();
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('FIX02'); // On the leg FIX01 to FIX02

        insertLegIntoFpl(fpl0, navState(aw, 3), 30, user(NEW));

        expect(identsOf(fpl0)[0]).toBe('FIX01');
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('FIX02');
        expect(aw.getActiveFplIdx()).toBe(1);
    });

    // A direct to the second waypoint has no from waypoint, so the first one is free
    it('drops the first leg for a direct-to the second waypoint (characterization)', () => {
        const {fpl0, aw} = build(fullPlanLegs(), START);
        aw.directToFlightplanIndex(fpl0.getLegs()[0].wpt, 1);

        insertLegIntoFpl(fpl0, navState(aw, 5), 30, user(NEW));

        expect(identsOf(fpl0)[0]).toBe('FIX01');
        expect(identsOf(fpl0)[29]).toBe('NEWWP');
    });

    // The first waypoint itself is the to waypoint of a direct to it, which is part of the active leg
    it('refuses for a direct-to the first waypoint (C-1)', () => {
        const {fpl0, aw} = build(fullPlanLegs(), START);
        aw.directToFlightplanIndex(fpl0.getLegs()[0].wpt, 0);

        expect(() => insertLegIntoFpl(fpl0, navState(aw, 5), 30, user(NEW))).toThrow('First waypoint is part of the active leg');

        expect(identsOf(fpl0)[0]).toBe('FIX00');
        expect(identsOf(fpl0)).not.toContain('NEWWP');
    });

    // 4-4: a waypoint typed over the first row goes in front of the first waypoint, so it becomes the first one. Today
    // the index becomes -1 after the first leg is dropped, and splice(-1) puts the leg in front of the last one.
    it.fails('puts a waypoint typed in front of the first leg of a full FPL 0 first (#NEW-2-1)', () => {
        const {fpl0, aw} = build(fullPlanLegs(), START);

        insertLegIntoFpl(fpl0, navState(aw, null), 0, user(NEW));

        expect(identsOf(fpl0).slice(0, 2)).toEqual(['NEWWP', 'FIX01']);
        expect(identsOf(fpl0)[29]).toBe('FIX29');
    });
});

// 4-10, 4-11: a Direct To to a waypoint of the plan resumes the plan behind it. Adding a waypoint in front of the
// target shifts its index. A leg-mode plan follows the shift (the sibling), the direct-to does not (the pin).
// Checked in the KLN 89 trainer: the direct-to follows its target to the new index.
describe('ActiveWaypoint after a leg is inserted in front of the active waypoint', () => {
    // On the line A to B, 10 NM from A, so the leg-mode aircraft stays on the leg when this waypoint is added
    const f = pointFrom(A, 90, 10);
    const F = intersection('FFFFF', f.lat, f.lon);

    it('follows the shifted index in leg mode', () => {
        const {fpl0, aw} = build([A, B, C, D].map(user), pointFrom(B, 270, 7));
        aw.activateFpl0();
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('ABC');

        fpl0.insertLeg(1, user(F));

        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('ABC');
        expect(aw.getActiveFplIdx()).toBe(2);
        expect(aw.getFutureLegs().map(l => l.wpt.icaoStruct.ident)).toEqual(['ABC', 'DEF', 'GHI']);
    });

    it.fails('keeps a direct-to to a waypoint of the plan in the plan (#NEW-2-2)', () => {
        const {fpl0, aw} = build([A, B, C, D].map(user), pointFrom(A, 0, 3));
        aw.directToFlightplanIndex(A, 2); // Direct to C
        expect(aw.getActiveFplIdx()).toBe(2);

        fpl0.insertLeg(1, user(F));

        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('DEF');
        expect(aw.isDctNavigation()).toBe(true);
        expect(aw.getActiveFplIdx()).toBe(3);
        expect(aw.getFutureLegs().map(l => l.wpt.icaoStruct.ident)).toEqual(['DEF', 'GHI']);
    });
});
