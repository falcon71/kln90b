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
import {collectStatusMessages} from '../../../harness/statusLine';
import {EVT_CLR} from '../../../../kln90b/HEvents';
import {MainPage} from '../../../../kln90b/pages/MainPage';

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

    it('deletes the two first legs and loads all five STAR waypoints (setup of #222)', async () => {
        const unit = await loadStarIntoFullPlan();
        const legs = fpl0Legs(unit);

        expect(legs).toHaveLength(30);
        expect(legs[0]).toEqual(['FILC', KLNLegType.USER]); // FILA and FILB are gone
        expect(legs.filter(l => l[1] === KLNLegType.STAR).map(l => l[0]).sort()).toEqual(['STRAA', 'STRAB', 'STRAC', 'STRAD', 'STRAE']);
        expect(legs.filter(l => l[0] === 'KPRC')).toEqual([['KPRC', KLNLegType.USER]]);
    });

    // 6-23: the STAR waypoints stand in front of the airport, in the order of the STAR
    it.fails('keeps the STAR legs in order before the airport when FPL 0 makes room (6-23, #222)', async () => {
        const unit = await loadStarIntoFullPlan();

        expect(fpl0Legs(unit).slice(24)).toEqual([
            ['STRAA', KLNLegType.STAR], ['STRAB', KLNLegType.STAR], ['STRAC', KLNLegType.STAR], ['STRAD', KLNLegType.STAR],
            ['STRAE', KLNLegType.STAR], ['KPRC', KLNLegType.USER],
        ]);
    });
});

// A full FPL 0 that lacks the airport of the SID: the airport goes in at index 0, where the unit has to make room first.
// 6-22 step 7 (the unit asks to add the airport) and C-1 (room is made when the first leg is not part of the
// active leg) imply the setup test below. Under the fix of #148 alone it turns red, because the next SID leg then
// deletes the airport; that is a guard, intended.
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

    it('asks to add the airport and keeps FPL 0 at 30 legs with the airport in it once (setup of #222)', async () => {
        const unit = await loadSidIntoFullPlan();
        const legs = fpl0Legs(unit);

        expect(legs).toHaveLength(30);
        expect(legs.filter(l => l[0] === 'KPRC')).toEqual([['KPRC', KLNLegType.USER]]);
    });

    // 6-22: the airport comes first, followed by the SID in its order (figure 6-38)
    it.fails('puts the airport first, then every SID leg in order, when FPL 0 makes room (6-22, #148, #222)', async () => {
        const unit = await loadSidIntoFullPlan();

        expect(fpl0Legs(unit).slice(0, 3)).toEqual([['KPRC', KLNLegType.USER], ['SIDAA', KLNLegType.SID], ['SIDAB', KLNLegType.SID]]);
    });
});

/**
 * KPRC of approachWorld() with invented SIDs and STARs to the east of it, and every fix the procedures use. FPL 0 stays
 * empty and the aircraft is 40 NM north of KPRC, so the APT pages open on KPRC (the nearest airport) and the unit asks to
 * add KPRC on LOAD IN FPL.
 * - a SID has the runway transitions 09 and 27L, the common leg to SIDAB and the enroute transitions TRNAA and TRNAB;
 * - ARR1 has no transition and no runway transition; ARR2 has the transitions TRNAA and TRNAB and the runways 09 and 27L.
 */
function sidStarWorld(o: { sids: string[], stars: boolean, rf?: boolean }) {
    const w = approachWorld();
    const east = (nm: number) => pointFrom(w.mapaa, 90, nm);
    const sidaa = intersection('SIDAA', east(8).lat, east(8).lon);
    const sidab = intersection('SIDAB', east(20).lat, east(20).lon);
    const trnaa = intersection('TRNAA', east(30).lat, east(30).lon);
    const trnab = intersection('TRNAB', east(35).lat, east(35).lon);
    const departures = o.sids.map(name => sid(name, {
        runways: [{runway: '09', legs: [Leg.CA(90), Leg.DF(sidaa)]}, {runway: '27L', legs: [Leg.CA(270), Leg.DF(sidaa)]}],
        common: [Leg.TF(sidab)],
        transitions: [{name: 'TRNAA', legs: [Leg.TF(trnaa)]}, {name: 'TRNAB', legs: [Leg.TF(trnab)]}],
    }));
    const arrivals = o.stars ? [
        star('ARR1', {common: [Leg.IF(trnaa), Leg.TF(sidab)]}),
        star('ARR2', {
            transitions: [{name: 'TRNAA', legs: [Leg.IF(trnaa)]}, {name: 'TRNAB', legs: [Leg.IF(trnab)]}],
            common: [Leg.TF(sidab)],
            runways: [{runway: '09', legs: [Leg.TF(sidaa)]}, {runway: '27L', legs: [Leg.TF(sidaa)]}],
        }),
    ] : [];
    if (o.rf) {
        // A procedure with an RF leg is one the unit leaves out (SidStar.isProcedureRecognized); it stands first in the data
        departures.unshift(sid('DEPRF', {runways: [{runway: '09', legs: [Leg.CA(90), Leg.RF(sidaa)]}], common: [Leg.TF(sidab)]}));
        arrivals.unshift(star('ARRRF', {common: [Leg.IF(trnaa), Leg.RF(sidab)]}));
    }
    const kprc = withProcedures(w.kprc, {approaches: [...w.kprc.approaches], departures, arrivals});
    return {facilities: [kprc, w.enraa, w.iafaa, w.ifaaa, w.fafaa, w.sdfaa, w.mapaa, sidaa, sidab, trnaa, trnab], position: w.north(40)};
}

/** Boots in sidStarWorld and turns the right inner knob from APT 6 the given number of clicks */
async function bootOnApt7(o: { sids: string[], stars: boolean, rf?: boolean }, clicksFromApt6 = 1, opts: { start?: Date } = {}): Promise<HeadlessUnit> {
    const unit = await bootUnit({...sidStarWorld(o), ...opts});
    await settle(unit);
    await unit.panel.selectPage('R', 'APT 6');
    await unit.panel.inner('R', clicksFromApt6);
    return unit;
}

describe('APT 7 procedure list (3-49, 6-21)', () => {
    // 3-49 (figure 3-147), 6-22 (figure 6-33): the procedures are numbered in two cells, right-aligned; with more than four
    // the last one stays on the bottom line. 6-21: an airport with SIDs only has one APT 7 page
    it('lists the SIDs numbered from 1 and keeps the last on the bottom line, on one APT 7 page (3-49, 6-21)', async () => {
        await bootOnApt7({sids: ['DEPA', 'DEPB', 'DEPC', 'DEPD', 'DEPE', 'DEPF', 'DEPG', 'DEPH', 'DEPI', 'DEPJ'], stars: false});

        expect(rows('R')).toEqual([' KPRC', 'SELECT SID', ' 1 DEPA', ' 2 DEPB', ' 3 DEPC', '10 DEPJ']);
        expect(Screen.read().status().right).toBe('APT 7');
    });

    // 3-49, figure 3-148: the text for an airport without SIDs and STARs
    it('shows NO SID/STAR FOR THIS AIRPORT IN DATABASE for an airport without procedures (3-49)', async () => {
        const unit = await bootUnit({facilities: [airport('KAAA', 47, 8)], position: {lat: 47, lon: 8}});
        await unit.panel.selectPage('R', 'APT 7');

        expect(rows('R')).toEqual([' KAAA', 'NO SID/STAR', 'FOR THIS', 'AIRPORT', 'IN DATABASE', '']);
        expect(Screen.read().status().right).toBe('APT 7');
    });

    // 3-49, 6-21: with SIDs and STARs there are two APT 7 pages, shown as APT+7, one to select a SID and one to select a
    // STAR. 3-49: APT 8 has just one page, so the next click leaves APT 7
    it('has two APT 7 pages, APT+7, for an airport with SIDs and STARs (3-49, 6-21)', async () => {
        const unit = await bootOnApt7({sids: ['DEP1'], stars: true});
        const first = [Screen.read().status().right, rows('R')[1]];
        await unit.panel.inner('R', 1);
        const second = [Screen.read().status().right, rows('R')[1]];
        await unit.panel.inner('R', 1);

        expect([first, second].sort()).toEqual([['APT+7', 'SELECT SID'], ['APT+7', 'SELECT STAR']]);
        expect(Screen.read().status().right).toBe('APT 8');
    });
});

describe('APT 7 selecting a SID (6-22)', () => {
    // 6-22 steps 3 to 6, figures 6-35 to 6-37: the SID, then the runway, then the transition, then the list of its
    // waypoints with LOAD IN FPL under the cursor. The title is the SID's name with -SID
    it('asks for the runway, then the transition, then shows the waypoints with the cursor on LOAD IN FPL (6-22)', async () => {
        const unit = await bootOnApt7({sids: ['DEP1'], stars: false});
        await unit.panel.cursor('R');
        await unit.panel.ent(); // DEP1

        expect(rows('R').slice(0, 2)).toEqual(['DEP1-SID', 'RUNWAY']);
        expect(unit.panel.focused('R').row).toBe(2);
        await unit.panel.outer('R', 1);
        await unit.panel.ent(); // the second runway, 27L

        expect(rows('R')).toEqual(['DEP1-SID', 'TRANSITION', ' 1 TRNAA', ' 2 TRNAB', '', '']);
        await unit.panel.ent(); // TRNAA

        // The CA leg of the runway transition is dropped (Session H, procedures.test.ts)
        expect(rows('R')).toEqual(['DEP1-SID', ' 1 SIDAA', ' 2 SIDAB', ' 3 TRNAA', '', 'LOAD IN FPL']);
        expect(unit.panel.focused('R')).toEqual({row: 5, col: 12, text: 'LOAD IN FPL'});
    });

    // 6-5: CLR goes back one step; 6-22 has the same steps for a SID as 6-5 has for an approach. The SID side of the CLR
    // handling: waypoints, transition, runway, SID list
    it('returns one step with each CLR on a SID: waypoints, transition, runway, SID list (6-5)', async () => {
        const unit = await bootOnApt7({sids: ['DEP1'], stars: false});
        await unit.panel.cursor('R');
        await unit.panel.ent(); // DEP1: the runways
        await unit.panel.outer('R', 1);
        await unit.panel.ent(); // 27L: the transitions
        await unit.panel.ent(); // TRNAA: the waypoints
        expect(rows('R')[5]).toBe('LOAD IN FPL');

        await unit.panel.clr();
        expect(rows('R')).toEqual(['DEP1-SID', 'TRANSITION', ' 1 TRNAA', ' 2 TRNAB', '', '']);
        await unit.panel.clr();
        expect(rows('R').slice(0, 2)).toEqual(['DEP1-SID', 'RUNWAY']);
        await unit.panel.clr();
        expect(rows('R').slice(0, 3)).toEqual([' KPRC', 'SELECT SID', ' 1 DEP1']);
    });

    // 6-22 step 7: LOAD IN FPL for an airport that FPL 0 lacks asks to add the SID and the airport, with the cursor on
    // APPROVE?
    it('asks to add the airport and the SID to FPL 0 when FPL 0 lacks the airport (6-22)', async () => {
        const unit = await bootOnApt7({sids: ['DEP1'], stars: false});
        await unit.panel.cursor('R');
        await unit.panel.ent(); // DEP1: the runways
        await unit.panel.ent(); // 09: the transitions
        await unit.panel.ent(); // TRNAA: the waypoints
        await unit.panel.ent(); // LOAD IN FPL

        expect(rows('R').slice(0, 5)).toEqual(['DEP1-SID', 'PRESS ENT', 'TO ADD KPRC', 'AND SID TO', 'FPL 0']);
        expect(unit.panel.focused('R').row).toBe(5);
        expect(unit.panel.focused('R').text.trim()).toBe('APPROVE?');
    });

    // 6-22 step 4, figure 6-35: the runways of a SID are listed with the RW prefix. The sibling is the test above, which
    // asserts the runway question and its cursor
    it.fails('lists the runways of a SID with the RW prefix (6-22, #NEW-2-2)', async () => {
        const unit = await bootOnApt7({sids: ['DEP1'], stars: false});
        await unit.panel.cursor('R');
        await unit.panel.ent(); // DEP1

        expect(rows('R').slice(2, 4)).toEqual([' 1 RW09', ' 2 RW27L']);
    });
});

describe('APT 7 selecting a STAR (6-23)', () => {
    // 6-23 steps 3 to 6, figures 6-40 to 6-42: the STAR, then the transition, then the runway when the STAR needs one,
    // then the list of its waypoints with LOAD IN FPL under the cursor
    it('asks for the transition, then the runway, then shows the waypoints (6-23)', async () => {
        const unit = await bootOnApt7({sids: [], stars: true});
        await unit.panel.cursor('R');
        await unit.panel.outer('R', 1);
        await unit.panel.ent(); // ARR2

        expect(rows('R').slice(1)).toEqual(['TRANSITION', ' 1 TRNAA', ' 2 TRNAB', '', '']);
        await unit.panel.outer('R', 1);
        await unit.panel.ent(); // TRNAB

        expect(rows('R')[1]).toBe('RUNWAY');
        await unit.panel.ent(); // the first runway, 09

        expect(rows('R').slice(1)).toEqual([' 1 TRNAB', ' 2 SIDAB', ' 3 SIDAA', '', 'LOAD IN FPL']);
        expect(unit.panel.focused('R')).toEqual({row: 5, col: 12, text: 'LOAD IN FPL'});
    });

    // 6-23 step 5: a STAR that needs no runway skips that step; a STAR without transitions has nothing to ask
    it('goes straight to the waypoints of a STAR without transitions and runways (6-23)', async () => {
        const unit = await bootOnApt7({sids: [], stars: true});
        await unit.panel.cursor('R');
        await unit.panel.ent(); // ARR1

        expect(rows('R').slice(1)).toEqual([' 1 TRNAA', ' 2 SIDAB', '', '', 'LOAD IN FPL']);
    });

    // 6-5: CLR returns to the previous step while a procedure is selected. 6-5 says it of approaches; the SID and STAR
    // selection on APT 7 is the same sequence of steps (6-22, 6-23). Checked in the KLN 89 trainer, 2026-10-07: CLR on the
    // waypoint list went to the runway list and CLR on the runway list to the STAR list
    it('returns one step with each CLR: waypoints, runway, transition, STAR list (6-5, KLN 89 trainer)', async () => {
        const unit = await bootOnApt7({sids: [], stars: true});
        await unit.panel.cursor('R');
        await unit.panel.outer('R', 1);
        await unit.panel.ent(); // ARR2
        await unit.panel.ent(); // TRNAA
        await unit.panel.ent(); // 09: the waypoints
        expect(rows('R')[5]).toBe('LOAD IN FPL');

        await unit.panel.clr();
        expect(rows('R')[1]).toBe('RUNWAY');
        await unit.panel.clr();
        expect(rows('R')[1]).toBe('TRANSITION');
        await unit.panel.clr();
        expect(rows('R').slice(0, 4)).toEqual([' KPRC', 'SELECT STAR', ' 1 ARR1', ' 2 ARR2']);
    });

    // 6-23 step 7: LOAD IN FPL for an airport that FPL 0 lacks asks to add the STAR and the airport, with the cursor on
    // APPROVE?. The sibling of the pin below, which asserts this question before CLR
    it('asks to add the airport and the STAR to FPL 0 when FPL 0 lacks the airport (6-23)', async () => {
        const unit = await bootOnApt7({sids: [], stars: true});
        await unit.panel.cursor('R');
        await unit.panel.ent(); // ARR1: the waypoints
        await unit.panel.ent(); // LOAD IN FPL

        expect(rows('R').slice(0, 5)).toEqual(['ARR1-Æ', 'PRESS ENT', 'TO ADD KPRC', 'AND STAR TO', 'FPL 0']);
        expect(unit.panel.focused('R').row).toBe(5);
        expect(unit.panel.focused('R').text.trim()).toBe('APPROVE?');
    });

    // 6-5: CLR returns to the previous step. On the question to add the airport (6-23 step 7) the previous step is the
    // list of waypoints; APT 8 does so (Apt8Page.test.ts). Checked in the KLN 89 trainer, 2026-10-07: CLR on that
    // question returns to the waypoint list
    it.fails('returns from the question to add the airport to the waypoints with CLR (6-5, KLN 89 trainer, #NEW-2-1)', async () => {
        const unit = await bootOnApt7({sids: [], stars: true});
        await unit.panel.cursor('R');
        await unit.panel.ent(); // ARR1: the waypoints
        await unit.panel.ent(); // LOAD IN FPL: KPRC is not in FPL 0, so the unit asks

        await unit.panel.clr();

        expect(rows('R').slice(1)).toEqual([' 1 TRNAA', ' 2 SIDAB', '', '', 'LOAD IN FPL']);
    });
});

describe('APT 7 cursor after CLR', () => {
    // Checked in the KLN 89 trainer, 2026-10-07: CLR from the runway list returned to the STAR list with the cursor on,
    // on the STAR that had been chosen. The tests below do CLR from the transition list, which is by analogy (medium
    // confidence). The sibling of the pin below: CLR from the transition list returns to the STAR list
    it('returns from the transition list of the second STAR to the STAR list (6-5)', async () => {
        const unit = await bootOnApt7({sids: [], stars: true});
        await unit.panel.cursor('R');
        await unit.panel.outer('R', 1);
        await unit.panel.ent(); // ARR2: the transitions
        expect(rows('R').slice(0, 2)).toEqual(['ARR2-Æ', 'TRANSITION']);

        await unit.panel.clr();

        expect(rows('R').slice(0, 4)).toEqual([' KPRC', 'SELECT STAR', ' 1 ARR1', ' 2 ARR2']);
    });

    it.fails('keeps the cursor on the chosen STAR when CLR returns to the STAR list (KLN 89 trainer, #NEW-2-3)', async () => {
        const unit = await bootOnApt7({sids: [], stars: true});
        await unit.panel.cursor('R');
        await unit.panel.outer('R', 1);
        await unit.panel.ent(); // ARR2: the transitions

        await unit.panel.clr();

        expect(unit.panel.focused('R')).toEqual({row: 3, col: 12, text: ' 2 ARR2   '});
    });

    // The cursor of the SID list starts on the first SID. The trainer shows it for APT 7 as 6-4 does for APT 8
    it('puts the cursor on the first procedure when it comes on (6-4, KLN 89 trainer)', async () => {
        const unit = await bootOnApt7({sids: ['DEP1', 'DEP2'], stars: false});

        await unit.panel.cursor('R');

        expect(unit.panel.focused('R')).toEqual({row: 2, col: 12, text: ' 1 DEP1   '});
    });
});

describe('APT 7 page (characterization)', () => {
    it('shows the STAR page with the cursor on the first STAR', async () => {
        const unit = await bootOnApt7({sids: ['DEP1'], stars: true}, 2);
        await unit.panel.cursor('R');

        expect(Screen.read().half('R')).toMatchInlineSnapshot(`
          " KPRC      
          SELECT STAR
           1 ARR1    
           2 ARR2    
                     
                     "
        `);
        expect(unit.panel.focused('R')).toEqual({row: 2, col: 12, text: ' 1 ARR1   '});
    });

    it('turns from APT 6 to the SID page first', async () => {
        await bootOnApt7({sids: ['DEP1'], stars: true}, 1);

        expect(rows('R')[1]).toBe('SELECT SID');
    });

    it('titles the steps of a STAR with its name and the STAR glyph', async () => {
        const unit = await bootOnApt7({sids: [], stars: true});
        await unit.panel.cursor('R');
        await unit.panel.ent(); // ARR1

        expect(rows('R')[0]).toBe('ARR1-Æ');
    });

    it('shows OUTDATED DB once when the cursor comes on with an expired database', async () => {
        // The fake clock's default start lies in the navdata cycle; 2026-07-01 is after it (sim/clock.ts)
        const unit = await bootOnApt7({sids: ['DEP1'], stars: false}, 1, {start: new Date('2026-07-01T12:00:00Z')});
        const seen = collectStatusMessages(unit);
        await unit.panel.cursor('R');

        expect(Screen.read().status().mode).toBe('OUTDATED DB');
        expect(seen).toEqual(['OUTDATED DB']);

        await unit.panel.cursor('R'); // turning the cursor off posts nothing

        expect(seen).toEqual(['OUTDATED DB']);
    });

    it('shows no status line message when the cursor comes on or goes off with a current database', async () => {
        const unit = await bootOnApt7({sids: ['DEP1'], stars: false});
        const seen = collectStatusMessages(unit);

        await unit.panel.cursor('R');
        await unit.panel.cursor('R');

        expect(seen).toEqual([]);
    });

    it('leaves out SIDs and STARs with an RF leg and numbers the others from 1', async () => {
        const unit = await bootOnApt7({sids: ['DEP1'], stars: true, rf: true}, 1);
        expect(rows('R')).toEqual([' KPRC', 'SELECT SID', ' 1 DEP1', '', '', '']);

        await unit.panel.inner('R', 1);

        expect(rows('R').slice(0, 4)).toEqual([' KPRC', 'SELECT STAR', ' 1 ARR1', ' 2 ARR2']);
    });

    it('has one APT 7 page when the only SID has an RF leg', async () => {
        await bootOnApt7({sids: [], stars: true, rf: true}, 1);

        expect(rows('R').slice(0, 4)).toEqual([' KPRC', 'SELECT STAR', ' 1 ARR1', ' 2 ARR2']);
        expect(Screen.read().status().right).toBe('APT 7');
    });

    it('does not handle CLR on the procedure list, but handles it one step further', async () => {
        const unit = await bootOnApt7({sids: [], stars: true});
        await unit.panel.cursor('R');
        expect((unit.props.pageManager.getCurrentPage() as MainPage).onInteractionEvent(EVT_CLR)).toBe(false);
        expect(rows('R').slice(0, 3)).toEqual([' KPRC', 'SELECT STAR', ' 1 ARR1']);

        await unit.panel.ent(); // ARR1: the waypoints
        expect((unit.props.pageManager.getCurrentPage() as MainPage).onInteractionEvent(EVT_CLR)).toBe(true);
    });
});

describe('APT 7 loading a second SID (characterization)', () => {
    it('replaces the SID that FPL 0 holds and shows FPL 0 on the left', async () => {
        const unit = await bootUnit(sidStarWorld({sids: ['DEPA', 'DEPB'], stars: false}));
        await settle(unit);
        await unit.panel.selectPage('L', 'NAV 1');
        await unit.panel.selectPage('R', 'APT 6');
        await unit.panel.inner('R', 1);

        // DEPA with the runway 09 and TRNAA. KPRC is not in FPL 0, so the unit asks to add it
        await unit.panel.cursor('R');
        await unit.panel.ent(); // DEPA: the runways
        await unit.panel.ent(); // 09: the transitions
        await unit.panel.ent(); // TRNAA: the waypoints
        await unit.panel.ent(); // LOAD IN FPL: the question
        await unit.panel.ent(); // APPROVE?
        if (Screen.read().status().right === 'CRSR') await unit.panel.cursor('R');
        await vi.advanceTimersByTimeAsync(1000);

        expect(fpl0Legs(unit)).toEqual([
            ['KPRC', KLNLegType.USER], ['SIDAA', KLNLegType.SID], ['SIDAB', KLNLegType.SID], ['TRNAA', KLNLegType.SID],
        ]);
        expect(Screen.read().status().left).toBe('FPL 0');

        // DEPB with the runway 27L and TRNAB. KPRC is in FPL 0 now, so the unit loads at once
        await unit.panel.cursor('R');
        await unit.panel.outer('R', 1);
        await unit.panel.ent(); // DEPB: the runways
        await unit.panel.outer('R', 1);
        await unit.panel.ent(); // 27L: the transitions
        await unit.panel.outer('R', 1);
        await unit.panel.ent(); // TRNAB: the waypoints
        await unit.panel.ent(); // LOAD IN FPL
        await vi.advanceTimersByTimeAsync(1000);

        expect(fpl0Legs(unit)).toEqual([
            ['KPRC', KLNLegType.USER], ['SIDAA', KLNLegType.SID], ['SIDAB', KLNLegType.SID], ['TRNAB', KLNLegType.SID],
        ]);
    });
});
