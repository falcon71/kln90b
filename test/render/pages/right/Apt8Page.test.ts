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

    /** FPL 0 holds RNAV 18 (loaded from APT 8); then the cursor is on and the second entry, VOR 09, is chosen */
    async function bootWithFirstApproachLoaded() {
        const {w, kprc, facilities} = twoApproaches();
        const unit = await bootUnit({facilities, position: w.north(40), storage: savedFlightplan(0, [w.enraa, kprc])});
        await settle(unit);
        await unit.panel.loadProcedure('APT 8'); // the first entry, RNAV 18
        await unit.panel.cursor('R');
        await unit.panel.outer('R', 1); // the second entry, VOR 09
        return unit;
    }

    const RNAV_18_IN_FPL_0 = [
        ['ENRAA', KLNLegType.USER], ['IAFAA', KLNLegType.APP], ['IFAAA', KLNLegType.APP], ['FAFAA', KLNLegType.APP],
        ['SDFAA', KLNLegType.APP], ['MAPAA', KLNLegType.APP], ['KPRC', KLNLegType.USER],
    ];

    // 6-4 steps 5 to 7: the approach is chosen from the list, its waypoints are shown and LOAD IN FPL puts them into FPL 0.
    // The sibling of the pin below: RNAV 18 is in FPL 0, the second approach is selected and shows its waypoints with the
    // cursor on LOAD IN FPL (the airport is in FPL 0, so there is no question to add it)
    it('shows the waypoints of a second approach while FPL 0 holds the first (6-4)', async () => {
        const unit = await bootWithFirstApproachLoaded();
        expect(fpl0Legs(unit)).toEqual(RNAV_18_IN_FPL_0);

        await unit.panel.ent(); // VOR 09: its only transition is taken without a question

        expect(rows('R')).toEqual(['V09-KPRC', ' 1 IAFBBà', ' 2 FAFBBá', ' 3 MAPAAã', '', 'LOAD IN FPL']);
        expect(unit.panel.focused('R')).toEqual({row: 5, col: 12, text: 'LOAD IN FPL'});
        expect(fpl0Legs(unit)).toEqual(RNAV_18_IN_FPL_0);
    });

    // Checked in the KLN 89 trainer, 2026-10-07: loading an approach from APT 8 while FPL 0 holds another one makes the
    // unit ask before it replaces the first. The 90B guide describes replacing only through FPL 0 (6-7), so the wording of
    // the question is unknown and is not asserted; the first approach must still be in FPL 0 after LOAD IN FPL
    it.fails('does not replace the approach that FPL 0 already holds without asking (KLN 89 trainer, #NEW-2-4)', async () => {
        const unit = await bootWithFirstApproachLoaded();
        await unit.panel.ent(); // VOR 09: the waypoints
        await unit.panel.ent(); // LOAD IN FPL
        await vi.advanceTimersByTimeAsync(1000);

        expect(fpl0Legs(unit)).toEqual(RNAV_18_IN_FPL_0);
    });

    // 6-7: an approach is changed through the FPL 0 header: with the left cursor on it reads CHANGE APR?, ENT opens APT 8,
    // and the approach loaded there takes the place of the one in FPL 0. The route the guide describes, which does not depend
    // on the question of #NEW-2-4
    it('replaces the approach in FPL 0 when it is changed through CHANGE APR? (6-7)', async () => {
        const {w, kprc, facilities} = twoApproaches();
        const unit = await bootUnit({facilities, position: w.north(40), storage: savedFlightplan(0, [w.enraa, kprc])});
        await settle(unit);
        await unit.panel.loadProcedure('APT 8'); // RNAV 18
        expect(fpl0Legs(unit)).toEqual(RNAV_18_IN_FPL_0);

        await unit.panel.cursor('L');
        await unit.panel.cursorTo('L', 'CHANGE APR?');
        await unit.panel.ent();
        expect(rows('R').slice(0, 2)).toEqual([' KPRC IAP', ' 1 RNAV 18']); // APT 8 is open on the approach list

        await unit.panel.cursor('R');
        await unit.panel.outer('R', 1); // VOR 09
        await unit.panel.ent();
        await unit.panel.ent(); // LOAD IN FPL
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

/**
 * KPRC of approachWorld() with its RNAV 18 approach given a second IAF, IAFAB, west of IAFAA, and a circling VOR-A
 * approach. FPL 0 stays empty and the aircraft is 40 NM north of KPRC, so APT 8 opens on KPRC (the nearest airport) and
 * the unit asks to add KPRC on LOAD IN FPL.
 */
function iapWorld(o: { extraApproaches?: number, circlingFirst?: boolean, singleIaf?: boolean, rfSecond?: boolean } = {}) {
    const w = approachWorld();
    const iafab = intersection('IAFAB', pointFrom(w.iafaa, 270, 5).lat, pointFrom(w.iafaa, 270, 5).lon);
    const rnav18 = approach({
        type: ApproachType.APPROACH_TYPE_RNAV, runway: '18',
        transitions: [
            {name: 'IAFAA', legs: [Leg.IF(w.iafaa, FixTypeFlags.IAF), Leg.TF(w.ifaaa)]},
            {name: 'IAFAB', legs: [Leg.IF(iafab, FixTypeFlags.IAF), Leg.TF(w.ifaaa)]},
        ],
        final: [Leg.IF(w.ifaaa), Leg.TF(w.fafaa, FixTypeFlags.FAF), Leg.TF(w.mapaa, FixTypeFlags.MAP)],
    });
    const circling = (suffix: string) => approach({
        type: ApproachType.APPROACH_TYPE_VOR, runway: '', suffix,
        final: [Leg.IF(w.fafaa, FixTypeFlags.FAF), Leg.TF(w.mapaa, FixTypeFlags.MAP)],
    });
    const extra = ['B', 'C', 'D', 'E', 'F'].slice(0, o.extraApproaches ?? 0).map(circling);
    // VOR 09 with the one IAF IAFAA, listed last
    const vor09 = approach({
        type: ApproachType.APPROACH_TYPE_VOR, runway: '09',
        transitions: [{name: 'IAFAA', legs: [Leg.IF(w.iafaa, FixTypeFlags.IAF), Leg.TF(w.ifaaa)]}],
        final: [Leg.IF(w.ifaaa), Leg.TF(w.fafaa, FixTypeFlags.FAF), Leg.TF(w.mapaa, FixTypeFlags.MAP)],
    });
    // An approach with an RF leg is one the unit leaves out (SidStar.isApproachRecognized)
    const withRf = approach({
        type: ApproachType.APPROACH_TYPE_VOR, runway: '27',
        final: [Leg.IF(w.fafaa, FixTypeFlags.FAF), Leg.RF(w.mapaa)],
    });
    const list = [
        ...(o.circlingFirst ? [circling('A'), rnav18] : [rnav18]),
        ...(o.rfSecond ? [withRf] : []),
        ...(o.circlingFirst ? [] : [circling('A')]),
        ...extra,
        ...(o.singleIaf ? [vor09] : []),
    ];
    const kprc = withProcedures(w.kprc, {approaches: list});
    return {facilities: [kprc, w.enraa, w.iafaa, iafab, w.ifaaa, w.fafaa, w.mapaa], position: w.north(40)};
}

async function bootOnApt8(o: { extraApproaches?: number, circlingFirst?: boolean, singleIaf?: boolean, rfSecond?: boolean, start?: Date } = {}): Promise<HeadlessUnit> {
    const unit = await bootUnit({...iapWorld(o), start: o.start});
    await settle(unit);
    await unit.panel.selectPage('R', 'APT 8');
    return unit;
}

describe('APT 8 approach list (3-49, 6-4)', () => {
    // 3-49, figure 3-149: the airport with IAP, then the approaches numbered from 1, a circling approach as VOR-A. A
    // photo of a real unit (KMBT-appch-select.jpg in the reference photos) shows RNAV 18 the same way. 3-49 also says that
    // APT 8 never has a second page
    it('lists the approaches numbered from 1 under the airport and IAP, on one APT 8 page (3-49)', async () => {
        await bootOnApt8();

        expect(rows('R')).toEqual([' KPRC IAP', ' 1 RNAV 18', ' 2 VOR-A', '', '', '']);
        expect(Screen.read().status().right).toBe('APT 8');
    });

    // 3-49, figure 3-150: the text for an airport without approaches (the figure misspells APPROACH)
    it('shows NO APPROACH FOR THIS AIRPORT IN DATABASE for an airport without approaches (3-49)', async () => {
        const unit = await bootUnit({facilities: [airport('KAAA', 47, 8)], position: {lat: 47, lon: 8}});
        await unit.panel.selectPage('R', 'APT 8');

        expect(rows('R')).toEqual([' KAAA IAP', 'NO APPROACH', 'FOR THIS', 'AIRPORT', 'IN DATABASE', '']);
    });

    // 6-4 step 3: the cursor starts on the first entry of the approach list
    it('puts the cursor on the first approach when it comes on (6-4)', async () => {
        const unit = await bootOnApt8();

        await unit.panel.cursor('R');

        expect(unit.panel.focused('R')).toEqual({row: 1, col: 12, text: ' 1 RNAV 18 '});
    });

    // 6-1 (the caution) and C-2 (the message list): an expired database shows OUTDATED DB when the pilot tries to select
    // an approach. That the message already appears when the cursor comes on, and only then, is the behavior of the KLN 89
    // trainer, which the code follows (Apt8Page.warnIfDBOutdated). The sibling below holds that the message needs the
    // expired database. The default start of the fake clock lies in the navdata cycle; 2026-07-01 is after it (sim/clock.ts)
    it('shows OUTDATED DB once when the cursor comes on with an expired database (6-1, C-2, KLN 89 trainer)', async () => {
        const unit = await bootOnApt8({start: new Date('2026-07-01T12:00:00Z')});
        const seen = collectStatusMessages(unit);

        await unit.panel.cursor('R');

        expect(seen).toEqual(['OUTDATED DB']);
        expect(Screen.read().status().mode).toBe('OUTDATED DB');

        await unit.panel.cursor('R'); // turning the cursor off posts nothing

        expect(seen).toEqual(['OUTDATED DB']);
    });

    it('shows no status line message when the cursor comes on or goes off with a current database (6-1, C-2, KLN 89 trainer)', async () => {
        const unit = await bootOnApt8();
        const seen = collectStatusMessages(unit);

        await unit.panel.cursor('R');
        await unit.panel.cursor('R');

        expect(seen).toEqual([]);
    });
});

describe('APT 8 selecting an approach (6-4, 6-5)', () => {
    // 6-4 step 5, figure 6-4: the title is the approach (R for RNAV, the runway, the airport; 6-5), then IAF and the IAFs
    // numbered from 1 under the first one, with the cursor on the first
    it('asks for the IAF with the cursor on the first one (6-4)', async () => {
        const unit = await bootOnApt8();
        await unit.panel.cursor('R');

        await unit.panel.ent(); // RNAV 18

        expect(rows('R')).toEqual(['R18-KPRC', 'IAF 1 IAFAA', '    2 IAFAB', '', '', '']);
        expect(unit.panel.focused('R')).toEqual({row: 1, col: 16, text: '1 IAFAA'});
    });

    // 6-4 step 7, figure 6-7: LOAD IN FPL for an airport that FPL 0 lacks asks to add the approach and the airport, with
    // the cursor on APPROVE?
    it('asks to add the airport and the approach to FPL 0 when FPL 0 lacks the airport (6-4)', async () => {
        const unit = await bootOnApt8();
        await unit.panel.cursor('R');
        await unit.panel.ent(); // RNAV 18
        await unit.panel.ent(); // IAFAA
        await unit.panel.ent(); // LOAD IN FPL

        expect(rows('R').slice(0, 5)).toEqual(['R18-KPRC', 'PRESS ENT', 'TO ADD KPRC', 'AND APPR TO', 'FPL 0']);
        expect(unit.panel.focused('R').row).toBe(5);
        expect(unit.panel.focused('R').text.trim()).toBe('APPROVE?');
    });

    // 6-5: at any step of the selection CLR returns to the previous one: from the question to the waypoints, to the IAFs,
    // to the approaches
    it('returns one step with each CLR: question, waypoints, IAFs, approaches (6-5)', async () => {
        const unit = await bootOnApt8();
        await unit.panel.cursor('R');
        await unit.panel.ent(); // RNAV 18
        await unit.panel.outer('R', 1);
        await unit.panel.ent(); // IAFAB
        await unit.panel.ent(); // LOAD IN FPL: the question

        await unit.panel.clr();
        expect(rows('R')).toEqual(['R18-KPRC', ' 1 IAFABà', ' 2 IFAAA', ' 3 FAFAAá', ' 4 MAPAAã', 'LOAD IN FPL']);
        await unit.panel.clr();
        expect(rows('R')).toEqual(['R18-KPRC', 'IAF 1 IAFAA', '    2 IAFAB', '', '', '']);
        await unit.panel.clr();
        expect(rows('R').slice(0, 3)).toEqual([' KPRC IAP', ' 1 RNAV 18', ' 2 VOR-A']);
    });
});

describe('APT 8 selecting an approach with one IAF (6-5)', () => {
    // 6-5: CLR goes back one step. An approach with a single IAF has no IAF step, so its waypoints go straight back to the
    // approach list
    it('returns from the waypoints of an approach with one IAF straight to the approach list (6-5)', async () => {
        const unit = await bootOnApt8({singleIaf: true});
        await unit.panel.cursor('R');
        await unit.panel.outer('R', 2);
        await unit.panel.ent(); // VOR 09: the IAF is taken without a question
        expect(rows('R')[5]).toBe('LOAD IN FPL');

        await unit.panel.clr();

        expect(rows('R').slice(0, 3)).toEqual([' KPRC IAP', ' 1 RNAV 18', ' 2 VOR-A']);
    });
});

describe('APT 8 cursor after CLR', () => {
    // Checked in the KLN 89 trainer, 2026-10-07: CLR from the waypoint list of an approach returned to the approach list with
    // the cursor on, on the approach that had been chosen. The trainer's database has no approach with several IAFs, so the
    // same for CLR from the IAF list is by analogy (medium confidence). The sibling of the pin below: RNAV 18, the second
    // entry, is chosen, and CLR from its IAF list returns to the approach list
    it('returns from the IAF list of the second approach to the approach list (6-5)', async () => {
        const unit = await bootOnApt8({circlingFirst: true});
        await unit.panel.cursor('R');
        await unit.panel.outer('R', 1);
        await unit.panel.ent(); // RNAV 18: the IAFs
        expect(rows('R').slice(0, 2)).toEqual(['R18-KPRC', 'IAF 1 IAFAA']);

        await unit.panel.clr();

        expect(rows('R').slice(0, 3)).toEqual([' KPRC IAP', ' 1 VOR-A', ' 2 RNAV 18']);
    });

    it.fails('keeps the cursor on the chosen approach when CLR returns to the approach list (KLN 89 trainer, #NEW-2-3)', async () => {
        const unit = await bootOnApt8({circlingFirst: true});
        await unit.panel.cursor('R');
        await unit.panel.outer('R', 1);
        await unit.panel.ent(); // RNAV 18: the IAFs

        await unit.panel.clr();

        expect(unit.panel.focused('R')).toEqual({row: 2, col: 12, text: ' 2 RNAV 18 '});
    });
});

/** CLR through the main page, as the unit sees it: whether the pages handled it (CLAUDE.md, Input) */
const clrHandled = (unit: HeadlessUnit): boolean => (unit.props.pageManager.getCurrentPage() as MainPage).onInteractionEvent(EVT_CLR);

describe('APT 8 page (characterization)', () => {
    it('leaves out an approach with an RF leg and numbers the others from 1', async () => {
        await bootOnApt8({rfSecond: true});

        expect(rows('R').slice(0, 3)).toEqual([' KPRC IAP', ' 1 RNAV 18', ' 2 VOR-A']);
    });

    it('does not handle CLR on the approach list, but handles it one step further', async () => {
        const unit = await bootOnApt8();
        await unit.panel.cursor('R');
        expect(clrHandled(unit)).toBe(false);
        expect(rows('R').slice(0, 3)).toEqual([' KPRC IAP', ' 1 RNAV 18', ' 2 VOR-A']);

        await unit.panel.ent(); // RNAV 18: the IAF list
        expect(clrHandled(unit)).toBe(true);
    });

    it('scrolls a list of more than five approaches and keeps the last on the bottom line', async () => {
        const unit = await bootOnApt8({extraApproaches: 5});
        await unit.panel.cursor('R');

        // Not scrolled yet: the last approach stands on the bottom line, the others follow the first
        expect(Screen.read().half('R')).toMatchInlineSnapshot(`
          " KPRC IAP  
           1 RNAV 18 
           2 VOR-A   
           3 VOR-B   
           4 VOR-C   
           7 VOR-F   "
        `);

        await unit.panel.outer('R', 5);

        expect(Screen.read().half('R')).toMatchInlineSnapshot(`
          " KPRC IAP  
           3 VOR-B   
           4 VOR-C   
           5 VOR-D   
           6 VOR-E   
           7 VOR-F   "
        `);
        expect(unit.panel.focused('R').row).toBe(4);
    });

    it('titles a circling approach with the type letter, a dash and its suffix', async () => {
        const unit = await bootOnApt8();
        await unit.panel.cursor('R');
        await unit.panel.outer('R', 1);

        await unit.panel.ent(); // VOR-A: its only transition is taken without a question

        expect(rows('R')[0]).toBe('V-A-KPRC');
    });
});
