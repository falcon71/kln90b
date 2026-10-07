import {describe, expect, it, vi} from 'vitest';
import {FixTypeFlags, LegTurnDirection} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {approachWorld} from '../../../harness/fixtures';
import {pointFrom} from '../../../harness/flight/geo';
import {airport, intersection, vor} from '../../../harness/navdata/builders';
import {approach, Leg, sid, withProcedures} from '../../../harness/navdata/procedures';
import {savedFlightplan} from '../../../harness/storage';
import {KLNLegType} from '../../../../kln90b/data/flightplan/Flightplan';

const rows = (side: 'L' | 'R') => Screen.read().half(side).split('\n').map(r => r.trimEnd());

// Invented fixes, as in test/render/harness/procedures.test.ts
const iafaa = intersection('IAFAA', 47.3, 7.7);
const ifaaa = intersection('IFAAA', 47.2, 7.8);
const fafaa = intersection('FAFAA', 47.1, 7.9);
const mapaa = intersection('MAPAA', 47.0, 8.0);
const mahaa = intersection('MAHAA', 47.0, 8.3);
const depaa = intersection('DEPAA', 47.0, 8.2);
const enraa = intersection('ENRAA', 47.0, 8.4);
const abc = vor('ABC', 47.5, 8.5);

describe('APT 8 page after a waypoint confirmation page (80631c8)', () => {
    // 3-14: the right side returns to the page that was shown before the waypoint confirmation page. 3-49: the text of an
    // empty database appears only for an airport without procedures; KPRC has an approach.
    it('shows the approach list again, not NO APPROACH, once the confirmation page is gone', async () => {
        const kprc = withProcedures(airport('KPRC', 47.0, 8.0), {
            approaches: [approach({
                type: ApproachType.APPROACH_TYPE_RNAV, runway: '27',
                transitions: [{name: 'IAFAA', legs: [Leg.IF(iafaa, FixTypeFlags.IAF), Leg.TF(ifaaa, FixTypeFlags.IF)]}],
                final: [Leg.IF(ifaaa, FixTypeFlags.IF), Leg.TF(fafaa, FixTypeFlags.FAF), Leg.TF(mapaa, FixTypeFlags.MAP)],
                missed: [Leg.CA(270), Leg.DF(mahaa), Leg.HM(mahaa, 90, LegTurnDirection.Right, FixTypeFlags.MAHP)],
            })],
            departures: [sid('DEP1', {runways: [{runway: '27', legs: [Leg.CA(270), Leg.DF(depaa)]}], common: [Leg.TF(enraa)]})],
        });
        const unit = await bootUnit({
            facilities: [kprc, iafaa, ifaaa, fafaa, mapaa, mahaa, depaa, enraa, abc],
            position: {lat: 47, lon: 8},
            storage: savedFlightplan(0, [kprc]),
        });
        await settle(unit);
        await unit.panel.selectPage('R', 'APT 8');
        expect(rows('R').slice(0, 2)).toEqual([' KPRC IAP', ' 1 RNAV 27']);

        await unit.panel.appendToFpl0(['ABC']); // the confirmation page is pushed on the right side and popped by the second ENT
        await vi.advanceTimersByTimeAsync(1000);

        // The confirmation happened: ABC is in FPL 0
        expect(unit.props.memory.fplPage.flightplans[0].getLegs().map(l => l.wpt.icaoStruct.ident)).toEqual(['KPRC', 'ABC']);
        expect(Screen.read().status().right).toBe('APT 8');
        expect(rows('R').slice(0, 2)).toEqual([' KPRC IAP', ' 1 RNAV 27']);
        expect(Screen.read().text()).not.toContain('NO APPROACH');
    });
});

const fpl0Legs = (unit: HeadlessUnit) => unit.props.memory.fplPage.flightplans[0].getLegs().map(l => [l.wpt.icaoStruct.ident, l.type]);
const messageList = (unit: HeadlessUnit) => unit.props.messageHandler.getMessages().map(m => m.message.join(' '));

// The world of approachWorld() (KPRC at 47.0 8.0, the RNAV 18 approach, ENRAA 60 NM north)
describe('APT 8 putting an approach into FPL 0', () => {
    /** approachWorld() with a second approach to KPRC, VOR 09 from the west, listed after RNAV 18 */
    function twoApproaches() {
        const w = approachWorld();
        const west = (nm: number) => pointFrom(w.mapaa, 270, nm);
        const iafbb = intersection('IAFBB', west(12).lat, west(12).lon);
        const fafbb = intersection('FAFBB', west(5).lat, west(5).lon);
        const vor09 = approach({
            type: ApproachType.APPROACH_TYPE_VOR, runway: '09',
            transitions: [{name: 'IAFBB', legs: [Leg.IF(iafbb, FixTypeFlags.IAF), Leg.TF(fafbb)]}],
            final: [Leg.IF(fafbb), Leg.TF(fafbb, FixTypeFlags.FAF), Leg.TF(w.mapaa, FixTypeFlags.MAP)],
        });
        const kprc = withProcedures(w.kprc, {approaches: [...w.kprc.approaches, vor09]});
        return {w, kprc, facilities: [kprc, w.enraa, w.iafaa, w.ifaaa, w.fafaa, w.sdfaa, w.mapaa, iafbb, fafbb]};
    }

    // 6-7: choosing another approach replaces the one that is in the flight plan (the unit holds one approach at a time).
    it('replaces the approach that FPL 0 already holds (6-7)', async () => {
        const {w, kprc, facilities} = twoApproaches();
        const unit = await bootUnit({facilities, position: w.north(40), storage: savedFlightplan(0, [w.enraa, kprc])});
        await settle(unit);

        await unit.panel.loadProcedure('APT 8'); // the first entry, RNAV 18
        expect(fpl0Legs(unit)).toEqual([
            ['ENRAA', KLNLegType.USER], ['IAFAA', KLNLegType.APP], ['IFAAA', KLNLegType.APP], ['FAFAA', KLNLegType.APP],
            ['SDFAA', KLNLegType.APP], ['MAPAA', KLNLegType.APP], ['KPRC', KLNLegType.USER],
        ]);

        await unit.panel.cursor('R');
        await unit.panel.outer('R', 1); // the second entry, VOR 09
        await unit.panel.ent();
        await unit.panel.ent();
        expect(Screen.read().status().right).toBe('APT 8'); // the load switched the cursor off
        await vi.advanceTimersByTimeAsync(1000);

        expect(fpl0Legs(unit)).toEqual([
            ['ENRAA', KLNLegType.USER], ['IAFBB', KLNLegType.APP], ['FAFBB', KLNLegType.APP], ['MAPAA', KLNLegType.APP],
            ['KPRC', KLNLegType.USER],
        ]);
    });

    // 6-5, B-3: the message after loading an approach whose waypoint is also an enroute waypoint of FPL 0
    describe('the REDUNDANT WPTS message (6-5)', () => {
        const REDUNDANT = 'REDUNDANT WPTS IN FPL EDIT ENROUTE WPTS AS NECESSARY';

        it('is posted when an enroute waypoint is also in the approach', async () => {
            const w = approachWorld();
            const unit = await bootUnit({facilities: w.facilities, position: w.north(40), storage: savedFlightplan(0, [w.ifaaa, w.kprc])});
            await settle(unit);
            const before = messageList(unit);
            expect(before).not.toContain(REDUNDANT);

            await unit.panel.loadProcedure('APT 8');

            expect(fpl0Legs(unit).map(l => l[0])).toEqual(['IFAAA', 'IAFAA', 'IFAAA', 'FAFAA', 'SDFAA', 'MAPAA', 'KPRC']);
            expect(messageList(unit)).toEqual([...before, REDUNDANT]);
        });

        it('is not posted when the enroute waypoints are not in the approach', async () => {
            const w = approachWorld();
            const unit = await bootUnit({facilities: w.facilities, position: w.north(40), storage: savedFlightplan(0, [w.enraa, w.kprc])});
            await settle(unit);
            const before = messageList(unit);

            await unit.panel.loadProcedure('APT 8');

            expect(fpl0Legs(unit).map(l => l[0])).toEqual(['ENRAA', 'IAFAA', 'IFAAA', 'FAFAA', 'SDFAA', 'MAPAA', 'KPRC']);
            expect(messageList(unit)).toEqual(before);
        });
    });
});

// FPL 0 holds 30 legs. While the first leg is part of the active leg, the unit cannot make room by deleting it, so the
// insertion stops and leaves a partial approach. Whether the approach should be refused as a whole is open.
// a question: #221
describe('APT 8 loading an approach into a full FPL 0 (characterization)', () => {
    it('inserts the legs that fit, leaves out the rest and shows FPL FULL', async () => {
        const w = approachWorld();
        const fillers = Array.from({length: 26}, (_, i) => intersection(`FIL${String.fromCharCode(65 + i)}`, 46.5, 7.0 + 0.02 * i));
        const unit = await bootUnit({
            facilities: [...w.facilities, ...fillers], position: {lat: 46.5, lon: 6.9}, // before the first filler: it is the active leg
            storage: savedFlightplan(0, [...fillers, w.kprc]),
        });
        await settle(unit);
        // Preconditions: 27 legs, the first leg is part of the active leg (index 1), three places free for five approach legs
        expect(unit.props.memory.fplPage.flightplans[0].getLegs()).toHaveLength(27);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(1);
        const before = messageList(unit);

        await unit.panel.loadProcedure('APT 8');

        expect(fpl0Legs(unit)).toEqual([
            ...fillers.map(f => [f.icaoStruct.ident, KLNLegType.USER]),
            ['IAFAA', KLNLegType.APP], ['IFAAA', KLNLegType.APP], ['FAFAA', KLNLegType.APP], ['KPRC', KLNLegType.USER],
        ]);
        expect(Screen.read().status().mode).toBe('FPL FULL');
        expect(messageList(unit)).toEqual(before);
    });
});

// When FPL 0 is full and its first leg is not part of the active leg, the unit makes room by deleting the first leg
// (C-1 implies it). The approach waypoints must still come in order before the airport.
describe('APT 8 loading an approach when FPL 0 has to make room', () => {
    /** 26 filler fixes and KPRC in FPL 0, the aircraft on the way to the seventh filler: the active leg has index 6 */
    async function loadIntoFullPlan() {
        const w = approachWorld();
        const fillers = Array.from({length: 26}, (_, i) => intersection(`FIL${String.fromCharCode(65 + i)}`, 46.5, 7.0 + 0.02 * i));
        const unit = await bootUnit({
            facilities: [...w.facilities, ...fillers], position: {lat: 46.5, lon: 7.12},
            storage: savedFlightplan(0, [...fillers, w.kprc]),
        });
        await settle(unit);
        // Preconditions: 27 legs, an active leg that does not need the first leg, five approach legs for three free places
        expect(unit.props.memory.fplPage.flightplans[0].getLegs()).toHaveLength(27);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(6);
        await unit.panel.loadProcedure('APT 8');
        return unit;
    }

    it('deletes the two first legs and loads all five approach waypoints (setup of #222)', async () => {
        const unit = await loadIntoFullPlan();
        const legs = fpl0Legs(unit);

        expect(legs).toHaveLength(30);
        expect(legs[0]).toEqual(['FILC', KLNLegType.USER]); // FILA and FILB are gone
        expect(legs.filter(l => l[1] === KLNLegType.APP).map(l => l[0]).sort()).toEqual(['FAFAA', 'IAFAA', 'IFAAA', 'MAPAA', 'SDFAA']);
        expect(legs.filter(l => l[0] === 'KPRC')).toEqual([['KPRC', KLNLegType.USER]]);
    });

    // 6-5, 6-7 (figure 6-9): the approach waypoints, the MAP included, stand in front of the airport. The order is the one of the
    // load that needs no room (the tests above).
    it.fails('keeps the approach legs in order before the airport when FPL 0 makes room (6-5, 6-7, #222)', async () => {
        const unit = await loadIntoFullPlan();

        expect(fpl0Legs(unit).slice(24)).toEqual([
            ['IAFAA', KLNLegType.APP], ['IFAAA', KLNLegType.APP], ['FAFAA', KLNLegType.APP], ['SDFAA', KLNLegType.APP],
            ['MAPAA', KLNLegType.APP], ['KPRC', KLNLegType.USER],
        ]);
    });
});
