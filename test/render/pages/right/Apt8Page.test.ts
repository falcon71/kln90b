import {describe, expect, it, vi} from 'vitest';
import {FixTypeFlags, LegTurnDirection} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';
import {approachWorld} from '../../../harness/fixtures';
import {pointFrom} from '../../../harness/flight/geo';
import {airport, intersection, vor} from '../../../harness/navdata/builders';
import {approach, Leg, sid, withProcedures} from '../../../harness/navdata/procedures';
import {APR_ARM_SWITCH, panelXml} from '../../../harness/panelXml';
import {savedFlightplan} from '../../../harness/storage';
import {fplIdents, messages} from '../../../harness/readers';
import {KLNLegType} from '../../../../kln90b/data/flightplan/Flightplan';
import {collectStatusMessages} from '../../../harness/statusLine';
import {EVT_CLR} from '../../../../kln90b/HEvents';
import {MainPage} from '../../../../kln90b/pages/MainPage';
import {blinkCycle} from '../../../harness/render/blink';

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
            panelXml: panelXml(APR_ARM_SWITCH),
            storage: savedFlightplan(0, [kprc]),
        });
        await settle(unit);
        await unit.panel.selectPage('R', 'APT 8');
        expect(rows('R').slice(0, 2)).toEqual([' KPRC IAP', ' 1 RNAV 27']);

        await unit.panel.appendToFpl0(['ABC']); // the confirmation page is pushed on the right side and popped by the second ENT
        await vi.advanceTimersByTimeAsync(1000);

        // The confirmation happened: ABC is in FPL 0
        expect(fplIdents(unit)).toEqual(['KPRC', 'ABC']);
        expect(Screen.read().status().right).toBe('APT 8');
        expect(rows('R').slice(0, 2)).toEqual([' KPRC IAP', ' 1 RNAV 27']);
        expect(Screen.read().text()).not.toContain('NO APPROACH');
    });
});

/** The question both units show before a procedure replaces the one in FPL 0: the right cursor stands on APPROVE? (#274) */
const asksApprove = (unit: HeadlessUnit): boolean => {
    try {
        return unit.panel.focused('R').text.trim() === 'APPROVE?';
    } catch (e) {
        // No field under the cursor: no question. Any other state (several focused runs) is no answer and throws
        if (e instanceof Error && e.message.includes('found 0')) {
            return false;
        }
        throw e;
    }
};

const fpl0Legs = (unit: HeadlessUnit) => unit.props.memory.fplPage.flightplans[0].getLegs().map(l => [l.wpt.icaoStruct.ident, l.type]);

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
        const unit = await bootUnit({
            facilities, position: w.north(40), storage: savedFlightplan(0, [w.enraa, kprc]),
            panelXml: panelXml(APR_ARM_SWITCH),
        });
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

    // The 89 asks before it replaces the approach FPL 0 holds (checked in the KLN 89 trainer, 2026-10-07 and 2026-10-15);
    // the 90B guide describes replacing only through FPL 0 (6-7). Until APPROVE? the first approach stays in FPL 0
    it('does not replace the approach that FPL 0 already holds without asking (checked in the KLN 89 trainer, 2026-10-07, #274)', async () => {
        const unit = await bootWithFirstApproachLoaded();
        await unit.panel.ent(); // VOR 09: the waypoints
        await unit.panel.ent(); // LOAD IN FPL
        await vi.advanceTimersByTimeAsync(1000);

        expect(fpl0Legs(unit)).toEqual(RNAV_18_IN_FPL_0);
    });

    // The 90B wording follows the AVsoftech trainer; that the unit asks, with APPROVE? flashing, is the KLN 89's
    // (checked in the KLN 89 trainer, 2026-10-15)
    it('asks to replace the existing approach with APPROVE? flashing (characterization, #274)', async () => {
        const unit = await bootWithFirstApproachLoaded();
        await unit.panel.ent(); // VOR 09: the waypoints
        await unit.panel.ent(); // LOAD IN FPL

        expect(rows('R')).toEqual(['V09-KPRC', 'PRESS ENT', 'TO REPLACE', 'EXISTING', 'APPROACH', '  APPROVE?']);
        expect(unit.panel.focused('R').text.trim()).toBe('APPROVE?');
        const col = Screen.read().row(5).indexOf('APPROVE?', 12);
        const cycle = await blinkCycle(() => Screen.read().cell(5, col).attr);
        expect(cycle.sort()).toEqual(['F', 'I', 'I', 'I']);
    });

    it('replaces the approach on APPROVE? (checked in the KLN 89 trainer, 2026-10-15, #274)', async () => {
        const unit = await bootWithFirstApproachLoaded();
        await unit.panel.ent();
        await unit.panel.ent();
        expect(fpl0Legs(unit)).toEqual(RNAV_18_IN_FPL_0); // Precondition: nothing is replaced before APPROVE?
        await unit.panel.ent(); // APPROVE?
        await vi.advanceTimersByTimeAsync(1000);

        expect(fpl0Legs(unit)).toEqual([
            ['ENRAA', KLNLegType.USER], ['IAFBB', KLNLegType.APP], ['FAFBB', KLNLegType.APP], ['MAPAA', KLNLegType.APP],
            ['KPRC', KLNLegType.USER],
        ]);
    });

    // The 90B has a second side: where the load leaves the two halves follows the other loads of APT 8
    it('shows FPL 0 on the left and the approach list on the right after APPROVE? (characterization, #274)', async () => {
        const unit = await bootWithFirstApproachLoaded();
        await unit.panel.ent();
        await unit.panel.ent();
        await unit.panel.ent(); // APPROVE?
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().status().left).toBe('FPL 0');
        expect(rows('R').slice(0, 2)).toEqual([' KPRC IAP', ' 1 RNAV 18']);
    });

    // CLR goes back to the preview and leaves the question: FPL 0 stays as it was (checked in the KLN 89 trainer)
    it('goes back from the question on CLR and leaves FPL 0 unchanged (checked in the KLN 89 trainer, 2026-10-15, #274)', async () => {
        const unit = await bootWithFirstApproachLoaded();
        await unit.panel.selectPage('L', 'NAV 1'); // FPL 0 on the left would take CLR for its DELETE FPL? question first (4-5)
        await unit.panel.ent();
        await unit.panel.ent();
        expect(asksApprove(unit)).toBe(true); // Precondition: the question shows
        await unit.panel.clr();

        expect(asksApprove(unit)).toBe(false);
        expect(fpl0Legs(unit)).toEqual(RNAV_18_IN_FPL_0);
    });

    it('shows the waypoints with the cursor on LOAD IN FPL after CLR from the question (characterization, #274)', async () => {
        const unit = await bootWithFirstApproachLoaded();
        await unit.panel.selectPage('L', 'NAV 1');
        await unit.panel.ent();
        await unit.panel.ent();
        await unit.panel.clr();

        expect(rows('R')).toEqual(['V09-KPRC', ' 1 IAFBBà', ' 2 FAFBBá', ' 3 MAPAAã', '', 'LOAD IN FPL']);
        expect(unit.panel.focused('R')).toEqual({row: 5, col: 12, text: 'LOAD IN FPL'});
    });

    // #273: the IAF list after CLR keeps the cursor on the IAF chosen before. The question carries the IAF through CLR
    it('keeps the cursor on the chosen IAF when CLR goes from the replace question back to the IAF list (characterization, #273, #274)', async () => {
        const unit = await bootUnit({...iapWorld(), panelXml: panelXml(APR_ARM_SWITCH)});
        await settle(unit);
        await unit.panel.selectPage('R', 'APT 8');
        await unit.panel.cursor('R');
        await unit.panel.ent(); // RNAV 18: the IAFs
        await unit.panel.ent(); // IAFAA: the waypoints
        await unit.panel.ent(); // LOAD IN FPL: the question to add KPRC
        await unit.panel.ent(); // APPROVE?
        await vi.advanceTimersByTimeAsync(1000);
        expect(fpl0Legs(unit).filter(l => l[1] === KLNLegType.APP).length).toBeGreaterThan(0); // Precondition: an approach is in FPL 0
        await unit.panel.selectPage('L', 'NAV 1'); // FPL 0 on the left would take CLR for its DELETE FPL? question first (4-5)

        await unit.panel.cursor('R');
        await unit.panel.ent(); // RNAV 18 again: the IAFs
        await unit.panel.outer('R', 1);
        await unit.panel.ent(); // IAFAB: the waypoints
        await unit.panel.ent(); // LOAD IN FPL: the question to replace
        expect(asksApprove(unit)).toBe(true); // Precondition
        await unit.panel.clr(); // the waypoints
        await unit.panel.clr(); // the IAFs

        expect(rows('R').slice(0, 3)).toEqual(['R18-KPRC', 'IAF 1 IAFAA', '    2 IAFAB']);
        expect(unit.panel.focused('R')).toEqual({row: 2, col: 16, text: '2 IAFAB'});
    });

    /** FPL 0 holds RNAV 18; RNAV 18 is chosen again and LOAD IN FPL pressed */
    async function loadSameApproachAgain() {
        const unit = await bootWithFirstApproachLoaded();
        await unit.panel.outer('R', -1); // back to RNAV 18
        await unit.panel.ent(); // RNAV 18: its waypoints (one transition)
        await unit.panel.ent(); // LOAD IN FPL
        return unit;
    }

    it('asks before it loads the same approach again (checked in the KLN 89 trainer, 2026-10-15, #274)', async () => {
        const unit = await loadSameApproachAgain();

        expect(asksApprove(unit)).toBe(true);
        expect(fpl0Legs(unit)).toEqual(RNAV_18_IN_FPL_0);
    });

    it('shows the replace question for the same approach again (characterization, #274)', async () => {
        const unit = await loadSameApproachAgain();

        expect(rows('R').slice(1, 5)).toEqual(['PRESS ENT', 'TO REPLACE', 'EXISTING', 'APPROACH']);
    });

    /** FPL 0 holds RNAV 18 of KPRC and no KQQQ; the approach of KQQQ is chosen and LOAD IN FPL pressed */
    async function loadApproachOfAirportNotInFpl0() {
        const w = approachWorld();
        const qa = intersection('QIAAA', 47.0, 9.4);
        const qb = intersection('QFAAA', 47.0, 9.5);
        const qc = intersection('QMAAA', 47.0, 9.6);
        const kqqq = withProcedures(airport('KQQQ', 47.0, 9.6), {
            approaches: [approach({
                type: ApproachType.APPROACH_TYPE_RNAV, runway: '09',
                final: [Leg.IF(qa, FixTypeFlags.IAF), Leg.TF(qb, FixTypeFlags.FAF), Leg.TF(qc, FixTypeFlags.MAP)],
            })],
        });
        const unit = await bootUnit({
            facilities: [...w.facilities, kqqq, qa, qb, qc], position: w.north(40),
            storage: savedFlightplan(0, [w.enraa, w.kprc]), panelXml: panelXml(APR_ARM_SWITCH),
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8'); // RNAV 18 of KPRC, the nearest airport
        expect(fpl0Legs(unit)).toEqual(RNAV_18_IN_FPL_0); // Precondition

        await unit.panel.selectPage('R', 'APT 1'); // the airport is chosen on APT 1 (3-42)
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'KQQQ');
        await unit.panel.cursor('R');
        await unit.panel.selectPage('R', 'APT 8');
        await unit.panel.cursor('R');
        await unit.panel.ent(); // its approach: the waypoints
        await unit.panel.ent(); // LOAD IN FPL
        return unit;
    }

    // An approach to an airport that FPL 0 lacks asks only to replace, not to add the airport (checked in the KLN 89
    // trainer, 2026-10-15); the trainer shows no more than that the replace question is the only one
    it('asks only to replace for an approach to an airport that FPL 0 lacks (checked in the KLN 89 trainer, 2026-10-15, #274)', async () => {
        const unit = await loadApproachOfAirportNotInFpl0();

        expect(asksApprove(unit)).toBe(true);
        expect(Screen.read().text()).not.toContain('TO ADD');
        expect(fpl0Legs(unit)).toEqual(RNAV_18_IN_FPL_0);
    });

    // After ENT the old approach is gone and the airport is appended behind its approach (the load of Task 3)
    it('replaces the approach and appends the airport that FPL 0 lacks on APPROVE? (characterization, #274)', async () => {
        const unit = await loadApproachOfAirportNotInFpl0();
        await unit.panel.ent(); // APPROVE?
        await vi.advanceTimersByTimeAsync(1000);

        expect(fpl0Legs(unit)).toEqual([
            ['ENRAA', KLNLegType.USER], ['KPRC', KLNLegType.USER],
            ['QIAAA', KLNLegType.APP], ['QFAAA', KLNLegType.APP], ['QMAAA', KLNLegType.APP], ['KQQQ', KLNLegType.USER],
        ]);
    });

    it('shows the replace question for an approach to an airport that FPL 0 lacks (characterization, #274)', async () => {
        const unit = await loadApproachOfAirportNotInFpl0();

        expect(rows('R').slice(0, 5)).toEqual(['R09-KQQQ', 'PRESS ENT', 'TO REPLACE', 'EXISTING', 'APPROACH']);
    });

    // 6-7: an approach is changed through the FPL 0 header: with the left cursor on it reads CHANGE APR?, ENT opens APT 8,
    // and the approach loaded there takes the place of the one in FPL 0. The route the guide describes; the unit asks
    // before it replaces here too, as on the KLN 89 (checked in the KLN 89 trainer, 2026-10-15, #274)
    it('replaces the approach in FPL 0 when it is changed through CHANGE APR? (6-7)', async () => {
        const {w, kprc, facilities} = twoApproaches();
        const unit = await bootUnit({
            facilities, position: w.north(40), storage: savedFlightplan(0, [w.enraa, kprc]),
            panelXml: panelXml(APR_ARM_SWITCH),
        });
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
        expect(fpl0Legs(unit)).toEqual(RNAV_18_IN_FPL_0); // Precondition: nothing is replaced before APPROVE?
        await unit.panel.ent(); // APPROVE? of the replace question: the route through FPL 0 asks too (#274)
        await vi.advanceTimersByTimeAsync(1000);

        expect(fpl0Legs(unit)).toEqual([
            ['ENRAA', KLNLegType.USER], ['IAFBB', KLNLegType.APP], ['FAFBB', KLNLegType.APP], ['MAPAA', KLNLegType.APP],
            ['KPRC', KLNLegType.USER],
        ]);
    });

    // A load is one batch: FPL 0 publishes one change, so the planner sync and the persistence see one (#222).
    // A new bus subscriber is called at once with the last cached event, which is not a change made by the load
    it('publishes one flightplanChanged for a load (characterization, #222)', async () => {
        const w = approachWorld();
        const unit = await bootUnit({
            facilities: w.facilities, position: w.north(40), storage: savedFlightplan(0, [w.enraa, w.kprc]),
            panelXml: panelXml(APR_ARM_SWITCH),
        });
        await settle(unit);
        const changes: unknown[] = [];
        let subscribed = false;
        unit.props.bus.getSubscriber<any>().on('flightplanChanged').handle((fpl: unknown) => subscribed && changes.push(fpl));
        subscribed = true;

        await unit.panel.loadProcedure('APT 8');

        expect(fpl0Legs(unit)).toEqual(RNAV_18_IN_FPL_0); // Precondition: the load happened
        expect(changes).toHaveLength(1);
        expect(changes[0]).toBe(unit.props.memory.fplPage.flightplans[0]);
    });

    // 6-5, B-3: the message after loading an approach whose waypoint is also an enroute waypoint of FPL 0
    describe('the REDUNDANT WPTS message (6-5)', () => {
        const REDUNDANT = 'REDUNDANT WPTS IN FPL EDIT ENROUTE WPTS AS NECESSARY';

        it('is posted when an enroute waypoint is also in the approach', async () => {
            const w = approachWorld();
            const unit = await bootUnit({
                facilities: w.facilities, position: w.north(40), storage: savedFlightplan(0, [w.ifaaa, w.kprc]),
                panelXml: panelXml(APR_ARM_SWITCH),
            });
            await settle(unit);
            const before = messages(unit);
            expect(before).not.toContain(REDUNDANT);

            await unit.panel.loadProcedure('APT 8');

            expect(fpl0Legs(unit).map(l => l[0])).toEqual(['IFAAA', 'IAFAA', 'IFAAA', 'FAFAA', 'SDFAA', 'MAPAA', 'KPRC']);
            expect(messages(unit)).toEqual([...before, REDUNDANT]);
        });

        it('is not posted when the enroute waypoints are not in the approach', async () => {
            const w = approachWorld();
            const unit = await bootUnit({
                facilities: w.facilities, position: w.north(40), storage: savedFlightplan(0, [w.enraa, w.kprc]),
                panelXml: panelXml(APR_ARM_SWITCH),
            });
            await settle(unit);
            const before = messages(unit);

            await unit.panel.loadProcedure('APT 8');

            expect(fpl0Legs(unit).map(l => l[0])).toEqual(['ENRAA', 'IAFAA', 'IFAAA', 'FAFAA', 'SDFAA', 'MAPAA', 'KPRC']);
            expect(messages(unit)).toEqual(before);
        });
    });
});

// Procedure legs come on top of the en-route waypoints: FPL 0 holds 30 en-route waypoints and 45 legs, so an approach
// loads whole while the first leg is active and nothing is deleted. The order of the approach legs is 6-5, 6-7.
describe('APT 8 loading an approach on top of the en-route waypoints', () => {
    it('loads the whole approach in front of the airport while the first leg is active (6-5, 6-7; checked in the KLN 89 trainer, 2026-10-15, #221)', async () => {
        const w = approachWorld();
        const fillers = Array.from({length: 26}, (_, i) => intersection(`FIL${String.fromCharCode(65 + i)}`, 46.5, 7.0 + 0.02 * i));
        const unit = await bootUnit({
            facilities: [...w.facilities, ...fillers], position: {lat: 46.5, lon: 6.9}, // before the first filler: it is the active leg
            panelXml: panelXml(APR_ARM_SWITCH),
            storage: savedFlightplan(0, [...fillers, w.kprc]),
        });
        await settle(unit);
        // Preconditions: 27 legs, the first leg is part of the active leg (index 1)
        expect(unit.props.memory.fplPage.flightplans[0].getLegs()).toHaveLength(27);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(1);
        const before = messages(unit);

        await unit.panel.loadProcedure('APT 8');

        expect(fpl0Legs(unit)).toEqual([
            ...fillers.map(f => [f.icaoStruct.ident, KLNLegType.USER]),
            ['IAFAA', KLNLegType.APP], ['IFAAA', KLNLegType.APP], ['FAFAA', KLNLegType.APP], ['SDFAA', KLNLegType.APP],
            ['MAPAA', KLNLegType.APP], ['KPRC', KLNLegType.USER],
        ]);
        expect(Screen.read().status().mode).not.toBe('FPL FULL');
        expect(messages(unit)).toEqual(before);
    });

    // 4-1: 30 en-route waypoints; the approach comes on top of them (checked in the KLN 89 trainer, 2026-10-15)
    it('loads an approach onto 30 en-route waypoints without deleting one (4-1; checked in the KLN 89 trainer, 2026-10-15, #221)', async () => {
        const w = approachWorld();
        const fillers = Array.from({length: 29}, (_, i) => intersection(`FI${String(i).padStart(3, '0')}`, 46.5, 7.0 + 0.02 * i));
        const unit = await bootUnit({
            facilities: [...w.facilities, ...fillers], position: {lat: 46.5, lon: 6.9},
            panelXml: panelXml(APR_ARM_SWITCH),
            storage: savedFlightplan(0, [...fillers, w.kprc]),
        });
        await settle(unit);
        expect(unit.props.memory.fplPage.flightplans[0].getLegs()).toHaveLength(30); // Precondition: 30 en-route

        await unit.panel.loadProcedure('APT 8');

        const legs = fpl0Legs(unit);
        expect(legs).toHaveLength(35);
        expect(legs[0][0]).toBe('FI000');
        expect(legs.slice(-6).map(l => l[0])).toEqual(['IAFAA', 'IFAAA', 'FAFAA', 'SDFAA', 'MAPAA', 'KPRC']);
        expect(Screen.read().status().mode).not.toBe('FPL FULL');
    });
});

// The approach legs come on top of the en-route waypoints, so nothing is deleted when the plan holds 27 en-route
// waypoints. The approach waypoints must stand in order before the airport.
describe('APT 8 loading an approach onto 27 en-route waypoints', () => {
    /** 26 filler fixes and KPRC in FPL 0, the aircraft on the way to the seventh filler: the active leg has index 6 */
    async function loadIntoFullPlan() {
        const w = approachWorld();
        const fillers = Array.from({length: 26}, (_, i) => intersection(`FIL${String.fromCharCode(65 + i)}`, 46.5, 7.0 + 0.02 * i));
        const unit = await bootUnit({
            facilities: [...w.facilities, ...fillers], position: {lat: 46.5, lon: 7.12},
            panelXml: panelXml(APR_ARM_SWITCH),
            storage: savedFlightplan(0, [...fillers, w.kprc]),
        });
        await settle(unit);
        // Preconditions: 27 legs and an active leg that does not need the first leg
        expect(unit.props.memory.fplPage.flightplans[0].getLegs()).toHaveLength(27);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(6);
        await unit.panel.loadProcedure('APT 8');
        return unit;
    }

    it('loads all five approach waypoints without deleting a waypoint (checked in the KLN 89 trainer, 2026-10-15, #221)', async () => {
        const unit = await loadIntoFullPlan();
        const legs = fpl0Legs(unit);

        expect(legs).toHaveLength(32);
        expect(legs[0]).toEqual(['FILA', KLNLegType.USER]); // Nothing is deleted
        expect(legs.filter(l => l[1] === KLNLegType.APP).map(l => l[0]).sort()).toEqual(['FAFAA', 'IAFAA', 'IFAAA', 'MAPAA', 'SDFAA']);
        expect(legs.filter(l => l[0] === 'KPRC')).toEqual([['KPRC', KLNLegType.USER]]);
    });

    // 6-5, 6-7 (figure 6-9): the approach waypoints, the MAP included, stand in front of the airport. References #222
    it('keeps the approach legs in order before the airport on top of the en-route waypoints (6-5, 6-7, #221)', async () => {
        const unit = await loadIntoFullPlan();

        expect(fpl0Legs(unit).slice(-6)).toEqual([
            ['IAFAA', KLNLegType.APP], ['IFAAA', KLNLegType.APP], ['FAFAA', KLNLegType.APP], ['SDFAA', KLNLegType.APP],
            ['MAPAA', KLNLegType.APP], ['KPRC', KLNLegType.USER],
        ]);
    });
});

// A full FPL 0: the load decides the room before it changes anything (#222). Room is needed for the airport the load
// adds and for the total of 45; the approach legs never delete a waypoint of their own (#221). When room must be made
// the left page asks once per waypoint to delete; nothing goes before the last ENT
describe('APT 8 loading an approach into a full FPL 0 that lacks its airport', () => {
    const leftRows = () => Screen.read().half('L').split('\n').map(r => r.trimEnd());

    /** 30 filler fixes in FPL 0, no KPRC; loads RNAV 18 of KPRC and approves adding the airport */
    async function bootFullWithoutKprc(position: { lat: number, lon: number }) {
        const w = approachWorld();
        const fillers = Array.from({length: 30}, (_, i) => intersection(`FL${String(i).padStart(2, '0')}`, 46.5, 7.0 + 0.02 * i));
        const unit = await bootUnit({
            facilities: [...w.facilities, ...fillers], position, panelXml: panelXml(APR_ARM_SWITCH),
            storage: savedFlightplan(0, fillers),
        });
        await settle(unit);
        await unit.panel.selectPage('R', 'APT 1');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'KPRC');
        await unit.panel.cursor('R');
        await unit.panel.selectPage('R', 'APT 8');
        await unit.panel.cursor('R');
        await unit.panel.ent(); // RNAV 18 (one transition)
        await unit.panel.ent(); // LOAD IN FPL: the add question
        await unit.panel.ent(); // APPROVE?
        return unit;
    }

    // C-1: FPL FULL while the first waypoint is part of the active leg; nothing of the load is done
    it('answers FPL FULL and leaves FPL 0 unchanged while the first leg is active (C-1, #222)', async () => {
        const unit = await bootFullWithoutKprc({lat: 46.5, lon: 6.9});
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(1); // Precondition
        await vi.advanceTimersByTimeAsync(500);

        expect(Screen.read().status().mode).toBe('FPL FULL');
        expect(fpl0Legs(unit)).toHaveLength(30);
    });

    // 6-5, 6-7: the approach goes in front of its airport, also when the airport is added at the end. C-1: the first
    // waypoint makes room for the airport, since it is not part of the active leg
    it('puts the approach in front of the airport it adds to a full FPL 0 (6-5, 6-7, C-1, #222)', async () => {
        const unit = await bootFullWithoutKprc({lat: 46.5, lon: 7.12});
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(6); // Precondition
        await unit.panel.ent(); // CONTINUE?
        await vi.advanceTimersByTimeAsync(1000);

        const legs = fpl0Legs(unit);
        expect(legs).toHaveLength(35);
        expect(legs[0][0]).toBe('FL01');
        expect(legs.slice(-6).map(l => l[0])).toEqual(['IAFAA', 'IFAAA', 'FAFAA', 'SDFAA', 'MAPAA', 'KPRC']);
    });

    // The maintainer's ruling: one question per waypoint. The waypoint number names the waypoint that will go, since
    // nothing is deleted before the last ENT
    it('asks once per waypoint it has to delete and deletes nothing before the last ENT (characterization, #222)', async () => {
        const w = approachWorld();
        // An approach of 17 waypoints onto 29 fillers and KPRC: 47 legs, two over the 45
        const fixes = Array.from({length: 17}, (_, i) => intersection(`AP${String(i).padStart(3, '0')}`, 46.8, 7.5 + 0.02 * i));
        const longApp = approach({
            type: ApproachType.APPROACH_TYPE_RNAV, runway: '18',
            final: [Leg.IF(fixes[0], FixTypeFlags.IAF), ...fixes.slice(1, 16).map(f => Leg.TF(f)), Leg.TF(fixes[16], FixTypeFlags.MAP)],
        });
        const kprc = withProcedures(w.kprc, {approaches: [longApp]});
        const fillers = Array.from({length: 29}, (_, i) => intersection(`FL${String(i).padStart(2, '0')}`, 46.5, 7.0 + 0.02 * i));
        const unit = await bootUnit({
            facilities: [kprc, ...fixes, ...fillers], position: {lat: 46.5, lon: 7.12}, panelXml: panelXml(APR_ARM_SWITCH),
            storage: savedFlightplan(0, [...fillers, kprc]),
        });
        await settle(unit);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(6); // Precondition
        await unit.panel.selectPage('R', 'APT 8');
        await unit.panel.cursor('R');
        await unit.panel.ent(); // the approach (no transition)
        await unit.panel.ent(); // LOAD IN FPL

        expect(leftRows()[1]).toBe('WPT   1');
        await unit.panel.ent();
        expect(leftRows()[1]).toBe('WPT   2');
        expect(fpl0Legs(unit)).toHaveLength(30); // nothing deleted yet
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        const legs = fpl0Legs(unit);
        expect(legs).toHaveLength(45);
        expect(legs[0][0]).toBe('FL02');
        expect(legs[44][0]).toBe('KPRC');
    });

    // A waypoint deleted to make room is no longer in FPL 0, so it does not make the approach redundant (6-5, B-3 name
    // the message; that the deletion comes first is a characterization)
    it('does not count a waypoint deleted to make room as redundant (characterization, #222)', async () => {
        const w = approachWorld();
        const fillers = Array.from({length: 29}, (_, i) => intersection(`FL${String(i).padStart(2, '0')}`, 46.5, 7.0 + 0.02 * i));
        // 17 approach waypoints, one of them FL00, the first filler, which goes to make room
        const fixes = Array.from({length: 16}, (_, i) => intersection(`AP${String(i).padStart(3, '0')}`, 46.8, 7.5 + 0.02 * i));
        const longApp = approach({
            type: ApproachType.APPROACH_TYPE_RNAV, runway: '18',
            final: [Leg.IF(fixes[0], FixTypeFlags.IAF), ...fixes.slice(1, 15).map(f => Leg.TF(f)), Leg.TF(fillers[0]), Leg.TF(fixes[15], FixTypeFlags.MAP)],
        });
        const kprc = withProcedures(w.kprc, {approaches: [longApp]});
        const unit = await bootUnit({
            facilities: [kprc, ...fixes, ...fillers], position: {lat: 46.5, lon: 7.12}, panelXml: panelXml(APR_ARM_SWITCH),
            storage: savedFlightplan(0, [...fillers, kprc]),
        });
        await settle(unit);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(6); // Precondition
        const before = messages(unit);
        await unit.panel.selectPage('R', 'APT 8');
        await unit.panel.cursor('R');
        await unit.panel.ent(); // the approach (no transition)
        await unit.panel.ent(); // LOAD IN FPL
        await unit.panel.ent(); // WPT 1
        await unit.panel.ent(); // WPT 2
        await vi.advanceTimersByTimeAsync(1000);

        // Preconditions: the load deleted FL00 and FL01, and FL00 is in FPL 0 only as an approach waypoint
        const legs = fpl0Legs(unit);
        expect(legs).toHaveLength(45);
        expect(legs[0][0]).toBe('FL02');
        expect(legs.filter(l => l[0] === 'FL00')).toEqual([['FL00', KLNLegType.APP]]);
        expect(messages(unit)).toEqual(before);
    });
});

// A long approach into a full FPL 0, also in place of another. The world: KPRC with RNAV 18 (five waypoints) and an
// RNAV 36 of 17 waypoints; FPL 0 holds 29 fillers and KPRC (KPRC last, or first where a test says so). 30 en-route
// waypoints and 17 approach legs pass the total of 45 by two (#221)
describe('APT 8 loading a long approach into a full FPL 0', () => {
    const leftRows = () => Screen.read().half('L').split('\n').map(r => r.trimEnd());

    /** lon 7.12: the active leg has index 6 (KPRC last); lon 6.9: the first leg is part of the active leg */
    async function bootReplaceWorld(lon: number, kprcFirst = false) {
        const w = approachWorld();
        const fixes = Array.from({length: 17}, (_, i) => intersection(`AP${String(i).padStart(3, '0')}`, 46.8, 7.5 + 0.02 * i));
        const rnav36 = approach({
            type: ApproachType.APPROACH_TYPE_RNAV, runway: '36',
            final: [Leg.IF(fixes[0], FixTypeFlags.IAF), ...fixes.slice(1, 16).map(f => Leg.TF(f)), Leg.TF(fixes[16], FixTypeFlags.MAP)],
        });
        const kprc = withProcedures(w.kprc, {approaches: [...w.kprc.approaches, rnav36]});
        const fillers = Array.from({length: 29}, (_, i) => intersection(`FL${String(i).padStart(2, '0')}`, 46.5, 7.0 + 0.02 * i));
        const unit = await bootUnit({
            facilities: [kprc, w.enraa, w.iafaa, w.ifaaa, w.fafaa, w.sdfaa, w.mapaa, ...fixes, ...fillers],
            position: {lat: 46.5, lon}, panelXml: panelXml(APR_ARM_SWITCH),
            storage: savedFlightplan(0, kprcFirst ? [kprc, ...fillers] : [...fillers, kprc]),
        });
        await settle(unit);
        return unit;
    }

    /**
     * On APT 8 with the cursor off: the second entry, RNAV 36 (no transition), and LOAD IN FPL. With an approach in
     * FPL 0 the replace question of #274 comes after LOAD IN FPL, before the room question: `replacing` answers it
     */
    async function loadRnav36(unit: HeadlessUnit, replacing = false) {
        await unit.panel.selectPage('R', 'APT 8');
        await unit.panel.cursor('R');
        await unit.panel.outer('R', 1); // RNAV 36
        await unit.panel.ent(); // its waypoints
        await unit.panel.ent(); // LOAD IN FPL
        if (replacing) await unit.panel.ent(); // APPROVE? of the replace question (#274)
    }

    // The old approach goes in the same step, so its legs free room: 30 en-route waypoints and 17 approach legs need two
    // deletions, not seven (the total of 45 of #221 and the ruling of one question per waypoint)
    it('frees the legs of the approach it replaces and asks twice (characterization, #222)', async () => {
        const unit = await bootReplaceWorld(7.12);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(6); // Precondition
        await unit.panel.loadProcedure('APT 8'); // RNAV 18
        expect(fpl0Legs(unit)).toHaveLength(35); // Precondition
        await loadRnav36(unit, true);

        expect(leftRows()[1]).toBe('WPT   1');
        await unit.panel.ent();
        expect(leftRows()[1]).toBe('WPT   2');
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        const legs = fpl0Legs(unit);
        expect(legs).toHaveLength(45);
        expect(legs[0][0]).toBe('FL02');
        expect(legs.map(l => l[0])).not.toContain('IAFAA');
    });

    // C-1: FPL FULL while the first waypoint is part of the active leg; the approach that would be replaced stays
    it('answers FPL FULL and keeps the old approach while the first leg is active (C-1, #222)', async () => {
        const unit = await bootReplaceWorld(6.9);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(1); // Precondition
        await unit.panel.loadProcedure('APT 8'); // RNAV 18
        expect(fpl0Legs(unit)).toHaveLength(35); // Precondition
        await loadRnav36(unit, true);
        await vi.advanceTimersByTimeAsync(500);

        expect(Screen.read().status().mode).toBe('FPL FULL');
        const legs = fpl0Legs(unit);
        expect(legs).toHaveLength(35);
        expect(legs.slice(-6).map(l => l[0])).toEqual(['IAFAA', 'IFAAA', 'FAFAA', 'SDFAA', 'MAPAA', 'KPRC']);
    });

    // The ruling: the airport of the approach is never deleted to make room for it. Here the active leg would let the
    // two first waypoints go, so the refusal is the airport's
    it('answers FPL FULL rather than delete the airport of the approach (characterization, #222)', async () => {
        const unit = await bootReplaceWorld(7.12, true);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBeGreaterThan(3); // Precondition
        await loadRnav36(unit);
        await vi.advanceTimersByTimeAsync(500);

        expect(Screen.read().status().mode).toBe('FPL FULL');
        const legs = fpl0Legs(unit);
        expect(legs).toHaveLength(30);
        expect(legs[0][0]).toBe('KPRC');
    });

    // The deletions are part of the load's one batch: one change after the last ENT
    it('publishes one flightplanChanged for a load that deletes waypoints (characterization, #222)', async () => {
        const unit = await bootReplaceWorld(7.12);
        await loadRnav36(unit);
        await unit.panel.ent(); // WPT 1
        const changes: unknown[] = [];
        let subscribed = false;
        unit.props.bus.getSubscriber<any>().on('flightplanChanged').handle((fpl: unknown) => subscribed && changes.push(fpl));
        subscribed = true;

        await unit.panel.ent(); // WPT 2
        await vi.advanceTimersByTimeAsync(1000);

        expect(fpl0Legs(unit)).toHaveLength(45); // Precondition: the load happened
        expect(changes).toHaveLength(1);
        expect(changes[0]).toBe(unit.props.memory.fplPage.flightplans[0]);
    });

    // The room is decided again on the last ENT: a waypoint that went while the question showed is not asked for again,
    // so only the deletion still needed happens
    it('deletes only what is still needed on the last ENT (characterization, #222)', async () => {
        const unit = await bootReplaceWorld(7.12);
        await loadRnav36(unit);
        await unit.panel.ent(); // WPT 1
        unit.props.memory.fplPage.flightplans[0].deleteLeg(0); // FL00 goes meanwhile: one deletion is left

        await unit.panel.ent(); // WPT 2
        await vi.advanceTimersByTimeAsync(1000);

        const legs = fpl0Legs(unit);
        expect(legs).toHaveLength(45);
        expect(legs[0][0]).toBe('FL02');
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
        // The suffix must show neither in the list nor in the header of an approach with a runway (#60)
        type: ApproachType.APPROACH_TYPE_RNAV, runway: '18', suffix: 'Y',
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
    const unit = await bootUnit({...iapWorld(o), start: o.start, panelXml: panelXml(APR_ARM_SWITCH)});
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
        const unit = await bootUnit({
            facilities: [airport('KAAA', 47, 8)], position: {lat: 47, lon: 8},
            panelXml: panelXml(APR_ARM_SWITCH),
        });
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
    it('shows OUTDATED DB when the cursor comes on with an expired database (6-1, C-2, KLN 89 trainer)', async () => {
        const unit = await bootOnApt8({start: new Date('2026-07-01T12:00:00Z')});
        const seen = collectStatusMessages(unit);

        await unit.panel.cursor('R');

        expect(seen).toEqual(['OUTDATED DB']);
        expect(Screen.read().status().mode).toBe('OUTDATED DB');
    });

    it('shows no status line message when the cursor comes on with a current database (6-1, C-2, KLN 89 trainer)', async () => {
        const unit = await bootOnApt8();
        const seen = collectStatusMessages(unit);

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

    // Checked in the KLN 89 trainer, 2026-10-07 (medium): CLR from the waypoint list returned to the approach list with
    // the cursor on the approach chosen there; the same for the IAF list is by analogy
    it('keeps the cursor on the chosen approach when CLR returns to the approach list (KLN 89 trainer, #273)', async () => {
        const unit = await bootOnApt8({circlingFirst: true});
        await unit.panel.cursor('R');
        await unit.panel.outer('R', 1);
        await unit.panel.ent(); // RNAV 18: the IAFs

        await unit.panel.clr();

        expect(unit.panel.focused('R')).toEqual({row: 2, col: 12, text: ' 2 RNAV 18 '});
    });

    // Checked in the KLN 89 trainer, 2026-10-07 (medium): CLR from the waypoint list of an approach returned to the
    // approach list with the cursor on that approach. VOR-A has no IAF, so its waypoint list comes straight after the
    // approach list
    it('keeps the cursor on the chosen approach when CLR returns from the waypoint list of an approach without an IAF choice (KLN 89 trainer, 2026-10-07, #273)', async () => {
        const unit = await bootOnApt8();
        await unit.panel.cursor('R');
        await unit.panel.outer('R', 1);
        await unit.panel.ent(); // VOR-A: no IAF question
        expect(rows('R')[5]).toBe('LOAD IN FPL'); // Precondition: the waypoint list shows

        await unit.panel.clr();

        expect(rows('R').slice(0, 3)).toEqual([' KPRC IAP', ' 1 RNAV 18', ' 2 VOR-A']);
        expect(unit.panel.focused('R')).toEqual({row: 2, col: 12, text: ' 2 VOR-A   '});
    });

    // 6-5: CLR goes back one step. That the cursor then stands on the IAF chosen there is by analogy with the approach
    // list (KLN 89 trainer, 2026-10-07): the trainer's database has no approach with several IAFs, so it was not observed
    it('keeps the cursor on the chosen IAF when CLR returns to the IAF list (6-5, by analogy with the KLN 89 trainer, #273)', async () => {
        const unit = await bootOnApt8({circlingFirst: true});
        await unit.panel.cursor('R');
        await unit.panel.outer('R', 1);
        await unit.panel.ent(); // RNAV 18: the IAFs
        await unit.panel.outer('R', 1);
        await unit.panel.ent(); // IAFAB: the waypoints
        expect(rows('R')[1]).toBe(' 1 IAFABà'); // Precondition: the waypoint list shows

        await unit.panel.clr();

        expect(rows('R').slice(0, 3)).toEqual(['R18-KPRC', 'IAF 1 IAFAA', '    2 IAFAB']);
        expect(unit.panel.focused('R')).toEqual({row: 2, col: 16, text: '2 IAFAB'});
    });
});

/** CLR through the main page, as the unit sees it: whether the pages handled it (CLAUDE.md, Input) */
const clrHandled = (unit: HeadlessUnit): boolean => (unit.props.pageManager.getCurrentPage() as MainPage).onInteractionEvent(EVT_CLR);

describe('APT 8 page (characterization)', () => {
    // The code posts the message only when the cursor comes on by CRSR. A CLR that returns to the approach list puts the
    // cursor on again, but it was on before, so a step back is not a new CRSR press (#273)
    it('posts no further OUTDATED DB when CLR returns to the approach list with an expired database', async () => {
        const unit = await bootOnApt8({circlingFirst: true, start: new Date('2026-07-01T12:00:00Z')});
        await unit.panel.cursor('R');
        await unit.panel.outer('R', 1);
        await unit.panel.ent(); // RNAV 18: the IAFs
        const seen = collectStatusMessages(unit);

        await unit.panel.clr();

        expect(unit.panel.focused('R')).toEqual({row: 2, col: 12, text: ' 2 RNAV 18 '}); // Precondition: the list is back with the cursor
        expect(seen).toEqual([]);
    });

    // The code posts the message only when the cursor comes on (Apt8Page.warnIfDBOutdated)
    it('posts no further message when the cursor goes off with an expired database', async () => {
        const unit = await bootOnApt8({start: new Date('2026-07-01T12:00:00Z')});
        await unit.panel.cursor('R');
        const seen = collectStatusMessages(unit);

        await unit.panel.cursor('R');

        expect(seen).toEqual([]);
    });

    it('posts no message when the cursor goes off with a current database', async () => {
        const unit = await bootOnApt8();
        await unit.panel.cursor('R');
        const seen = collectStatusMessages(unit);

        await unit.panel.cursor('R');

        expect(seen).toEqual([]);
    });

    it('leaves out an approach with an RF leg and numbers the others from 1', async () => {
        await bootOnApt8({rfSecond: true});

        expect(rows('R').slice(0, 3)).toEqual([' KPRC IAP', ' 1 RNAV 18', ' 2 VOR-A']);
    });

    // The return value of clear() is not visible on the screen (the main page discards it): this holds the contract of
    // CLAUDE.md, Input, that a CLR handler reports whether it handled the key
    it('characterizes clear(): not handled on the approach list, handled one step further', async () => {
        const unit = await bootOnApt8();
        await unit.panel.cursor('R');
        expect(clrHandled(unit)).toBe(false);
        expect(rows('R').slice(0, 3)).toEqual([' KPRC IAP', ' 1 RNAV 18', ' 2 VOR-A']);

        await unit.panel.ent(); // RNAV 18: the IAF list
        expect(clrHandled(unit)).toBe(true);
    });

    // 6-4: the cursor comes up on the first approach of the list, also after it was left on another one and turned off
    // and on (the unit does not remember the field, checked in the KLN 89 trainer, 2026-10-11, #355)
    it('puts the cursor on the first approach again when it is turned off and on (6-4, #355)', async () => {
        const unit = await bootOnApt8({extraApproaches: 5});
        await unit.panel.cursor('R');
        await unit.panel.outer('R', 2);
        expect(unit.panel.focused('R').text).toContain('VOR-B'); // Precondition: the list is not scrolled
        expect(Screen.read().rows('R')[1]).toContain('RNAV 18');

        await unit.panel.cursor('R');
        await unit.panel.cursor('R');

        expect(unit.panel.focused('R').row).toBe(1);
        expect(unit.panel.focused('R').text).toContain('RNAV 18');
    });

    // A scrolled list stays scrolled while the cursor is off, and the cursor comes back on its top visible entry
    // (checked in the KLN 89 trainer, 2026-10-08, T23, #355)
    it('puts the cursor on the top visible approach of the scrolled list when it is turned off and on (#355)', async () => {
        const unit = await bootOnApt8({extraApproaches: 5});
        await unit.panel.cursor('R');
        await unit.panel.outer('R', 5);
        await unit.panel.cursor('R');
        expect(Screen.read().rows('R')[1]).toContain('VOR-B'); // Precondition: still scrolled, RNAV 18 off the page

        await unit.panel.cursor('R');

        expect(unit.panel.focused('R').row).toBe(1);
        expect(unit.panel.focused('R').text).toContain('VOR-B');
    });

    // The waypoint list of an approach scrolls as well: turned off and on, the cursor comes back on its top visible
    // waypoint (checked in the KLN 89 trainer, 2026-10-08, T23, #355). RNAV 18 of approachWorld has five waypoints, one
    // more than the four rows above LOAD IN FPL
    it('puts the cursor on the top visible waypoint of a scrolled approach when it is turned off and on (#355)', async () => {
        const w = approachWorld();
        const unit = await bootUnit({
            facilities: w.facilities, position: w.north(40),
            panelXml: panelXml(APR_ARM_SWITCH),
        });
        await settle(unit);
        await unit.panel.selectPage('R', 'APT 8');
        await unit.panel.cursor('R');
        await unit.panel.ent(); // RNAV 18, its only IAF is taken without a question
        expect(unit.panel.focused('R').text).toBe('LOAD IN FPL'); // Precondition: the waypoint list
        await unit.panel.outer('R', -2); // the last waypoint, then the one before it, which scrolls the list
        await unit.panel.cursor('R');
        const top = Screen.read().rows('R')[1];
        expect(top).not.toContain('IAFAA'); // Precondition: still scrolled, the first waypoint off the page

        await unit.panel.cursor('R');

        expect(unit.errors).toEqual([]);
        expect(unit.panel.focused('R').row).toBe(1);
        expect(unit.panel.focused('R').text.trim()).toMatch(/^[2-4] (IFAAA|FAFAA|SDFAA)/); // a waypoint after the first
        expect(top).toContain(unit.panel.focused('R').text.trim());
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

    // AVsoftech KLN 90B trainer, 2026-10-22 (third-party, so no evidence): KAAS showed
    // VOR-A-KAAS for a VOR/DME-A; the header of a plain VOR follows it
    it('titles a circling approach with its name, a dash and the airport', async () => {
        const unit = await bootOnApt8();
        await unit.panel.cursor('R');
        await unit.panel.outer('R', 1);

        await unit.panel.ent(); // VOR-A: its only transition is taken without a question

        expect(rows('R')[0]).toBe('VOR-A-KPRC');
    });
});
