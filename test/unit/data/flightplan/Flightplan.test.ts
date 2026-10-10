import {describe, expect, it} from 'vitest';
import {EventBus, Facility} from '@microsoft/msfs-sdk';
import {Flightplan, FlightplanEvents, KLNFlightplanLeg, KLNLegType} from '../../../../kln90b/data/flightplan/Flightplan';
import {airport, vor} from '../../../harness/navdata/builders';
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

    it('delete empties the plan (4-5)', () => {
        const {fpl} = planWithEvents(4, [user(A), user(B)]);

        fpl.delete();

        expect(fpl.getLegs()).toEqual([]);
    });
});
