import {describe, expect, it} from 'vitest';
import {EventBus, Facility} from '@microsoft/msfs-sdk';
import {Flightplan, FlightplanEvents, KLNFlightplanLeg, KLNLegType} from '../../../../kln90b/data/flightplan/Flightplan';
import {airport, intersection, vor} from '../../../harness/navdata/builders';
import {identsOf} from '../../../harness/readers';

// Source of the rules: Pilot's Guide 4-1 (at most 30 waypoints per plan, FPL 0 needs two) and 4-4 (a waypoint may be
// added to a plan with fewer than 30), 4-4/4-5 (delete a waypoint, delete a plan), 6-5 and 6-23 (approaches, SIDs and
// STARs enter FPL 0 only, and are deleted from it after more than 5 minutes off)
const user = (wpt: Facility): KLNFlightplanLeg => ({wpt, type: KLNLegType.USER});
const proc = (wpt: Facility, type: KLNLegType): KLNFlightplanLeg => ({wpt, type});
const A = airport('KAAA', 47.0, 8.0);
const B = vor('ABC', 47.2, 8.0);
const C = airport('KBBB', 47.4, 8.0);
const D = vor('DEF', 47.5, 8.0);

function planWithEvents(idx: number, legs: KLNFlightplanLeg[]) {
    const bus = new EventBus();
    const events: Flightplan[] = [];
    bus.getSubscriber<FlightplanEvents>().on('flightplanChanged').handle(p => events.push(p));
    return {fpl: new Flightplan(idx, legs, bus), events};
}

describe('Flightplan insert and delete', () => {
    it('inserts a leg at the index, behind the legs it shifts, and publishes the plan once (4-4)', () => {
        const {fpl, events} = planWithEvents(3, [user(A), user(C)]);

        fpl.insertLeg(1, user(B));

        expect(identsOf(fpl.getLegs())).toEqual(['KAAA', 'ABC', 'KBBB']);
        expect(events).toEqual([fpl]);
    });

    it('refuses the 31st leg and leaves the plan and the subscribers alone (4-1, 4-4)', () => {
        const legs = Array.from({length: 30}, () => user(A));
        const {fpl, events} = planWithEvents(1, legs);

        expect(() => fpl.insertLeg(0, user(B))).toThrow('Cannot have more than 30 legs!');

        expect(fpl.getLegs()).toHaveLength(30);
        expect(identsOf(fpl.getLegs())).not.toContain('ABC');
        expect(events).toEqual([]);
    });

    it('takes the 30th leg (4-4: fewer than 30 may take one more)', () => {
        const {fpl} = planWithEvents(1, Array.from({length: 29}, () => user(A)));

        fpl.insertLeg(29, user(B));

        expect(fpl.getLegs()).toHaveLength(30);
        expect(identsOf(fpl.getLegs())[29]).toBe('ABC');
    });

    it('deletes the leg at the index, closes the gap and publishes the plan once (4-5)', () => {
        const {fpl, events} = planWithEvents(2, [user(A), user(B), user(C)]);

        fpl.deleteLeg(1);

        expect(identsOf(fpl.getLegs())).toEqual(['KAAA', 'KBBB']);
        expect(events).toEqual([fpl]);
    });

    // characterization of the API: the batch exists so the async asobo plan sync sees one change (comment in
    // Flightplan.ts). The Pilot's Guide knows nothing of it
    it('publishes one event for a batch of inserts, and one per insert again afterwards (characterization)', () => {
        const {fpl, events} = planWithEvents(0, []);

        fpl.startBatchInsert();
        fpl.insertLeg(0, user(A));
        fpl.insertLeg(1, user(B));
        fpl.insertLeg(2, user(C));
        expect(events).toEqual([]);
        fpl.finishBatchInsert();
        expect(events).toEqual([fpl]);
        fpl.insertLeg(3, user(D));

        expect(events).toEqual([fpl, fpl]);
        expect(identsOf(fpl.getLegs())).toEqual(['KAAA', 'ABC', 'KBBB', 'DEF']);
    });

    it('does not publish a delete inside a batch either (characterization)', () => {
        const {fpl, events} = planWithEvents(0, [user(A), user(B)]);

        fpl.startBatchInsert();
        fpl.deleteLeg(0);

        expect(events).toEqual([]);
    });

    // #347: the procedure removal of a load (#222) runs inside the batch too, so it is one event with the load
    it('does not publish a procedure removal inside a batch, and publishes once when the batch finishes (characterization, #347)', () => {
        const {fpl, events} = planWithEvents(0, [user(A), proc(B, KLNLegType.APP), user(C)]);

        fpl.startBatchInsert();
        fpl.removeProcedure(KLNLegType.APP);
        expect(events).toEqual([]);
        fpl.finishBatchInsert();

        expect(events).toEqual([fpl]);
        expect(identsOf(fpl.getLegs())).toEqual(['KAAA', 'KBBB']);
    });
});

describe('Flightplan procedures', () => {
    const mixed = () => [user(A), proc(B, KLNLegType.SID), user(C), proc(D, KLNLegType.STAR), proc(A, KLNLegType.APP)];

    it('removeProcedures keeps the user legs only (6-5, 6-23)', () => {
        const {fpl} = planWithEvents(0, mixed());

        fpl.removeProcedures();

        expect(fpl.getLegs().map(l => l.type)).toEqual([KLNLegType.USER, KLNLegType.USER]);
        expect(identsOf(fpl.getLegs())).toEqual(['KAAA', 'KBBB']);
    });

    // characterization: the callers (APT 7/8, the procedure rows of FPL 0) rely on it, the Pilot's Guide describes no API
    it('removeProcedure removes one kind and keeps the others (characterization)', () => {
        const {fpl} = planWithEvents(0, mixed());

        fpl.removeProcedure(KLNLegType.STAR);

        expect(fpl.getLegs().map(l => l.type)).toEqual([KLNLegType.USER, KLNLegType.SID, KLNLegType.USER, KLNLegType.APP]);
    });

    // #347: the planner mirror follows FPL 0, so the removal publishes once, and a removal that removes nothing does not
    // publish (characterization: the Pilot's Guide says nothing of events)
    it('removeProcedures publishes once when it removes procedures, and not again when none are left (characterization, #347)', () => {
        const {fpl, events} = planWithEvents(0, mixed());

        fpl.removeProcedures();
        expect(events).toEqual([fpl]);
        expect(identsOf(fpl.getLegs())).toEqual(['KAAA', 'KBBB']);

        fpl.removeProcedures();
        expect(events).toEqual([fpl]);
    });
});

describe('Flightplan copies', () => {
    it('load copies the legs of another plan without its procedures, and the two plans stay independent (4-1, 4-4)', () => {
        const {fpl: source} = planWithEvents(4, [user(A), proc(B, KLNLegType.SID), user(C)]);
        const {fpl: target, events} = planWithEvents(0, [user(D)]);

        target.load(source);
        target.deleteLeg(0);

        expect(identsOf(target.getLegs())).toEqual(['KBBB']);
        // 4-1: changes to FPL 0 do not change the numbered plan it came from. The SID is not copied (6-23)
        expect(identsOf(source.getLegs())).toEqual(['KAAA', 'ABC', 'KBBB']);
        expect(events).toHaveLength(2);
    });

    it('loadInverted reverses the copy, leaves the source in order and publishes the plan (4-4, USE? INVRT?)', () => {
        const {fpl: source} = planWithEvents(4, [user(A), user(B), user(C)]);
        const {fpl: target, events} = planWithEvents(0, []);

        target.loadInverted(source);

        expect(identsOf(target.getLegs())).toEqual(['KBBB', 'ABC', 'KAAA']);
        expect(identsOf(source.getLegs())).toEqual(['KAAA', 'ABC', 'KBBB']);
        expect(events).toEqual([target]);
    });

    // characterization: unlike load, loadInverted keeps the procedure legs. Only FPL 0 holds procedures (6-5), and
    // USE? INVRT? copies a numbered plan into FPL 0, so no page reaches this case
    it('loadInverted keeps the procedure legs of the source (characterization)', () => {
        const {fpl: source} = planWithEvents(4, [user(A), proc(B, KLNLegType.SID), user(C)]);
        const {fpl: target} = planWithEvents(0, []);

        target.loadInverted(source);

        expect(target.getLegs().map(l => l.type)).toEqual([KLNLegType.USER, KLNLegType.SID, KLNLegType.USER]);
        expect(identsOf(target.getLegs())).toEqual(['KBBB', 'ABC', 'KAAA']);
    });

    // #378 (design §6): the EFB route import loads FPL 0 with its SID, STAR and approach, which load drops
    it('loadLegs keeps procedure legs and publishes once', () => {
        const {fpl, events} = planWithEvents(0, [user(D)]);
        const legs = [user(A), proc(B, KLNLegType.SID), user(C), proc(D, KLNLegType.STAR), proc(A, KLNLegType.APP), user(C)];

        fpl.loadLegs(legs);
        legs.pop(); // The plan holds its own array

        expect(identsOf(fpl.getLegs())).toEqual(['KAAA', 'ABC', 'KBBB', 'DEF', 'KAAA', 'KBBB']);
        expect(fpl.getLegs().map(l => l.type)).toEqual([
            KLNLegType.USER, KLNLegType.SID, KLNLegType.USER, KLNLegType.STAR, KLNLegType.APP, KLNLegType.USER,
        ]);
        expect(events).toEqual([fpl]);
    });

    it('delete empties the plan (4-5)', () => {
        const {fpl} = planWithEvents(4, [user(A), user(B)]);

        fpl.delete();

        expect(fpl.getLegs()).toEqual([]);
    });
});

describe('the limits of a flight plan (#221)', () => {
    const fixes = (n: number, prefix = 'FX') => Array.from({length: n}, (_, i) => intersection(`${prefix}${String(i).padStart(2, '0')}`, 47, 8 + 0.01 * i));
    const legs = (n: number, type: KLNLegType, prefix?: string): KLNFlightplanLeg[] => fixes(n, prefix).map(wpt => ({wpt, type}));

    // Checked in the KLN 89 trainer, 2026-10-15: an approach and a STAR load on top of a plan whose en-route
    // waypoints are at the limit
    it('takes a procedure leg on top of 30 en-route waypoints in FPL 0 (4-1; checked in the KLN 89 trainer, 2026-10-15)', () => {
        const fpl0 = new Flightplan(0, legs(30, KLNLegType.USER), new EventBus());

        fpl0.insertLeg(30, legs(1, KLNLegType.APP, 'AP')[0]);

        expect(fpl0.getLegs()).toHaveLength(31);
    });

    // 4-1: a flight plan holds 30 waypoints
    it('refuses a 31st en-route waypoint in FPL 0 that also holds procedure legs (4-1)', () => {
        const fpl0 = new Flightplan(0, [...legs(30, KLNLegType.USER), ...legs(3, KLNLegType.APP, 'AP')], new EventBus());

        expect(() => fpl0.insertLeg(0, legs(1, KLNLegType.USER, 'NW')[0])).toThrow();
        expect(fpl0.getLegs()).toHaveLength(33);
    });

    // The 90B gives no total; 45 keeps the KLN 89's room of 15 for procedures above its en-route limit (maintainer)
    it('refuses a 46th leg of FPL 0 of any type (characterization)', () => {
        const fpl0 = new Flightplan(0, [...legs(30, KLNLegType.USER), ...legs(15, KLNLegType.STAR, 'ST')], new EventBus());

        expect(() => fpl0.insertLeg(31, legs(1, KLNLegType.STAR, 'SX')[0])).toThrow();
        expect(fpl0.getLegs()).toHaveLength(45);
    });

    it('takes a 45th leg of FPL 0 (characterization)', () => {
        const fpl0 = new Flightplan(0, [...legs(30, KLNLegType.USER), ...legs(14, KLNLegType.STAR, 'ST')], new EventBus());

        fpl0.insertLeg(31, legs(1, KLNLegType.STAR, 'SX')[0]);

        expect(fpl0.getLegs()).toHaveLength(45);
    });

    // 4-1: a numbered plan holds 30 waypoints
    it('keeps the limit of 30 legs for a numbered plan (4-1)', () => {
        const fpl5 = new Flightplan(5, legs(30, KLNLegType.USER), new EventBus());

        expect(() => fpl5.insertLeg(30, legs(1, KLNLegType.APP, 'AP')[0])).toThrow('Cannot have more than 30 legs!');
        expect(() => fpl5.insertLeg(0, legs(1, KLNLegType.USER, 'NW')[0])).toThrow('Cannot have more than 30 legs!');
        expect(fpl5.getLegs()).toHaveLength(30);
    });
});
