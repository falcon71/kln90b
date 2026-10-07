import {describe, expect, it, vi} from 'vitest';
import {FixTypeFlags, LegTurnDirection} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {approachWorld} from '../../../harness/fixtures';
import {pointFrom} from '../../../harness/flight/geo';
import {airport, intersection, vor} from '../../../harness/navdata/builders';
import {approach, Leg, sid, star, withProcedures} from '../../../harness/navdata/procedures';
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

describe('APT 7 page after a waypoint confirmation page (80631c8)', () => {
    // 3-14: the right side returns to the page that was shown before the waypoint confirmation page. 3-49: the text of an
    // empty database appears only for an airport without procedures; KPRC has a SID.
    it('shows the SID list again, not NO SID/STAR, once the confirmation page is gone', async () => {
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
        await unit.panel.selectPage('R', 'APT 7');
        expect(rows('R').slice(0, 3)).toEqual([' KPRC', 'SELECT SID', ' 1 DEP1']);

        await unit.panel.appendToFpl0(['ABC']); // the confirmation page is pushed on the right side and popped by the second ENT
        await vi.advanceTimersByTimeAsync(1000);

        // The confirmation happened: ABC is in FPL 0
        expect(unit.props.memory.fplPage.flightplans[0].getLegs().map(l => l.wpt.icaoStruct.ident)).toEqual(['KPRC', 'ABC']);
        expect(Screen.read().status().right).toBe('APT 7');
        expect(rows('R').slice(0, 3)).toEqual([' KPRC', 'SELECT SID', ' 1 DEP1']);
        expect(Screen.read().text()).not.toContain('NO SID/STAR');
    });
});

const fpl0Legs = (unit: HeadlessUnit) => unit.props.memory.fplPage.flightplans[0].getLegs().map(l => [l.wpt.icaoStruct.ident, l.type]);

describe('APT 7 putting a procedure into FPL 0', () => {
    // 6-23: the STAR goes in front of the airport. That it also goes in front of an approach already loaded is inferred
    // from the flying order (the approach follows the STAR)
    it('puts a STAR in front of an approach that FPL 0 already holds (6-23)', async () => {
        const w = approachWorld();
        const east = (nm: number) => pointFrom(w.mapaa, 90, nm);
        const straa = intersection('STRAA', east(30).lat, east(30).lon);
        const strab = intersection('STRAB', east(12).lat, east(12).lon);
        const kprc = withProcedures(w.kprc, {approaches: [...w.kprc.approaches], arrivals: [star('ARR1', {common: [Leg.IF(straa), Leg.TF(strab)]})]});
        const unit = await bootUnit({
            facilities: [kprc, w.enraa, w.iafaa, w.ifaaa, w.fafaa, w.sdfaa, w.mapaa, straa, strab], position: w.north(40),
            storage: savedFlightplan(0, [w.enraa, kprc]),
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        // Precondition: the approach is in FPL 0
        expect(fpl0Legs(unit)).toEqual([
            ['ENRAA', KLNLegType.USER], ['IAFAA', KLNLegType.APP], ['IFAAA', KLNLegType.APP], ['FAFAA', KLNLegType.APP],
            ['SDFAA', KLNLegType.APP], ['MAPAA', KLNLegType.APP], ['KPRC', KLNLegType.USER],
        ]);

        await unit.panel.loadProcedure('APT 7');

        expect(fpl0Legs(unit)).toEqual([
            ['ENRAA', KLNLegType.USER], ['STRAA', KLNLegType.STAR], ['STRAB', KLNLegType.STAR],
            ['IAFAA', KLNLegType.APP], ['IFAAA', KLNLegType.APP], ['FAFAA', KLNLegType.APP], ['SDFAA', KLNLegType.APP],
            ['MAPAA', KLNLegType.APP], ['KPRC', KLNLegType.USER],
        ]);
    });

    // 6-22: the departure airport comes first, followed by the SID. When FPL 0 does not hold it, the unit asks to add it
    // (PRESS ENT TO ADD KPRC AND SID TO FPL 0) and puts it at the start, not at the end
    it('puts the airport of a SID at the start of FPL 0 when it is not in the plan (6-22)', async () => {
        const w = approachWorld();
        const east = (nm: number) => pointFrom(w.mapaa, 90, nm);
        const sidaa = intersection('SIDAA', east(8).lat, east(8).lon);
        const sidab = intersection('SIDAB', east(20).lat, east(20).lon);
        const kuuu = airport('KUUU', w.north(90).lat, w.north(90).lon);
        const kprc = withProcedures(w.kprc, {
            approaches: [],
            departures: [sid('DEP1', {runways: [{runway: '09', legs: [Leg.CA(90), Leg.DF(sidaa)]}], common: [Leg.TF(sidab)]})],
        });
        const unit = await bootUnit({
            facilities: [kprc, w.enraa, kuuu, sidaa, sidab], position: w.north(10),
            storage: savedFlightplan(0, [w.enraa, kuuu]),
        });
        await settle(unit);
        expect(fpl0Legs(unit)).toEqual([['ENRAA', KLNLegType.USER], ['KUUU', KLNLegType.USER]]); // Precondition: KPRC is not in the plan

        await unit.panel.loadProcedure('APT 7', {ident: 'KPRC'});
        expect(rows('R').slice(0, 4)).toEqual(['DEP1-SID', 'PRESS ENT', 'TO ADD KPRC', 'AND SID TO']); // the question of the unit
        await unit.panel.cursor('R'); // loadProcedure switched the cursor off, which the page switches on by itself
        await unit.panel.ent(); // APPROVE?
        await vi.advanceTimersByTimeAsync(1000);

        expect(fpl0Legs(unit)).toEqual([
            ['KPRC', KLNLegType.USER], ['SIDAA', KLNLegType.SID], ['SIDAB', KLNLegType.SID],
            ['ENRAA', KLNLegType.USER], ['KUUU', KLNLegType.USER],
        ]);
    });
});

// When FPL 0 is full and its first leg is not part of the active leg, the unit makes room by deleting the first leg
// (C-1 implies it). The STAR waypoints must still come in order before the airport.
describe('APT 7 loading a STAR when FPL 0 has to make room', () => {
    /** 26 filler fixes and KPRC in FPL 0, the aircraft on the way to the seventh filler: the active leg has index 6 */
    async function loadStarIntoFullPlan() {
        const w = approachWorld();
        const east = (nm: number) => pointFrom(w.mapaa, 90, nm);
        const stars = ['STRAA', 'STRAB', 'STRAC', 'STRAD', 'STRAE'].map((ident, i) => intersection(ident, east(40 - 5 * i).lat, east(40 - 5 * i).lon));
        const kprc = withProcedures(w.kprc, {arrivals: [star('ARR1', {common: [Leg.IF(stars[0]), ...stars.slice(1).map(s => Leg.TF(s))]})]});
        const fillers = Array.from({length: 26}, (_, i) => intersection(`FIL${String.fromCharCode(65 + i)}`, 46.5, 7.0 + 0.02 * i));
        const unit = await bootUnit({
            facilities: [kprc, ...stars, ...fillers], position: {lat: 46.5, lon: 7.12},
            storage: savedFlightplan(0, [...fillers, kprc]),
        });
        await settle(unit);
        // Preconditions: 27 legs, an active leg that does not need the first leg, five STAR legs for three free places
        expect(unit.props.memory.fplPage.flightplans[0].getLegs()).toHaveLength(27);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(6);
        await unit.panel.loadProcedure('APT 7', {ident: 'KPRC'});
        return unit;
    }

    it('deletes the two first legs and loads all five STAR waypoints (setup of #NEW-6-4)', async () => {
        const unit = await loadStarIntoFullPlan();
        const legs = fpl0Legs(unit);

        expect(legs).toHaveLength(30);
        expect(legs[0]).toEqual(['FILC', KLNLegType.USER]); // FILA and FILB are gone
        expect(legs.filter(l => l[1] === KLNLegType.STAR).map(l => l[0]).sort()).toEqual(['STRAA', 'STRAB', 'STRAC', 'STRAD', 'STRAE']);
        expect(legs.filter(l => l[0] === 'KPRC')).toEqual([['KPRC', KLNLegType.USER]]);
    });

    // 6-23: the STAR waypoints stand in front of the airport, in the order of the STAR
    it.fails('keeps the STAR legs in order before the airport when FPL 0 makes room (6-23, #NEW-6-4)', async () => {
        const unit = await loadStarIntoFullPlan();

        expect(fpl0Legs(unit).slice(24)).toEqual([
            ['STRAA', KLNLegType.STAR], ['STRAB', KLNLegType.STAR], ['STRAC', KLNLegType.STAR], ['STRAD', KLNLegType.STAR],
            ['STRAE', KLNLegType.STAR], ['KPRC', KLNLegType.USER],
        ]);
    });
});

// A full FPL 0 that lacks the airport of the SID: the airport goes in at index 0, where the unit has to make room first.
describe('APT 7 loading a SID into a full FPL 0 that lacks its airport', () => {
    /** 30 filler fixes in FPL 0, no KPRC, the aircraft on the way to the seventh filler: the active leg has index 6 */
    async function loadSidIntoFullPlan() {
        const w = approachWorld();
        const east = (nm: number) => pointFrom(w.mapaa, 90, nm);
        const sidaa = intersection('SIDAA', east(8).lat, east(8).lon);
        const sidab = intersection('SIDAB', east(20).lat, east(20).lon);
        const kprc = withProcedures(w.kprc, {
            approaches: [],
            departures: [sid('DEP1', {runways: [{runway: '09', legs: [Leg.CA(90), Leg.DF(sidaa)]}], common: [Leg.TF(sidab)]})],
        });
        const fillers = Array.from({length: 30}, (_, i) => intersection(`FL${String(i).padStart(2, '0')}`, 46.5, 7.0 + 0.02 * i));
        const unit = await bootUnit({
            facilities: [kprc, sidaa, sidab, ...fillers], position: {lat: 46.5, lon: 7.12},
            storage: savedFlightplan(0, fillers),
        });
        await settle(unit);
        // Preconditions: a full plan without KPRC, an active leg that does not need the first leg
        expect(fpl0Legs(unit)).toHaveLength(30);
        expect(fpl0Legs(unit).map(l => l[0])).not.toContain('KPRC');
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(6);

        await unit.panel.loadProcedure('APT 7', {ident: 'KPRC'});
        expect(rows('R').slice(0, 4)).toEqual(['DEP1-SID', 'PRESS ENT', 'TO ADD KPRC', 'AND SID TO']); // the question of the unit
        await unit.panel.cursor('R');
        await unit.panel.ent(); // APPROVE?
        await vi.advanceTimersByTimeAsync(1000);
        return unit;
    }

    it('asks to add the airport and keeps FPL 0 at 30 legs with the airport in it once (setup of #NEW-6-4)', async () => {
        const unit = await loadSidIntoFullPlan();
        const legs = fpl0Legs(unit);

        expect(legs).toHaveLength(30);
        expect(legs.filter(l => l[0] === 'KPRC')).toEqual([['KPRC', KLNLegType.USER]]);
    });

    // 6-22: the airport comes first, followed by the SID in its order (figure 6-38)
    it.fails('puts the airport first, then every SID leg in order, when FPL 0 makes room (6-22, #NEW-6-4)', async () => {
        const unit = await loadSidIntoFullPlan();

        expect(fpl0Legs(unit).slice(0, 3)).toEqual([['KPRC', KLNLegType.USER], ['SIDAA', KLNLegType.SID], ['SIDAB', KLNLegType.SID]]);
    });
});
