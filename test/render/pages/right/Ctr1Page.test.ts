import {describe, expect, it, vi} from 'vitest';
import {Facility, FacilityType, FixTypeFlags} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {centerWorld} from '../../../harness/fixtures';
import {courseDeg} from '../../../harness/flight/geo';
import {airport, intersection, vor} from '../../../harness/navdata/builders';
import {approach, Leg, withProcedures} from '../../../harness/navdata/procedures';
import {APR_ARM_SWITCH, panelXml} from '../../../harness/panelXml';
import {KLNLegType} from '../../../../kln90b/data/flightplan/Flightplan';
import {CtrState} from '../../../../kln90b/data/VolatileMemory';
import {savedFlightplan} from '../../../harness/storage';
import {Screen} from '../../../harness/render/screen';
import {fplIdents, userWaypoints} from '../../../harness/readers';

type CenterWorld = ReturnType<typeof centerWorld>;

const right = () => Screen.read().rows('R');

/** Boots with `plan` stored as FPL 1 (and `extra` facilities), FPL 1 on the left and CTR 1 on the right */
async function onCtr1(plan: (w: CenterWorld) => Facility[], extra: Facility[] = []) {
    const w = centerWorld();
    const unit = await bootUnit({
        facilities: [w.kaaa, w.kbbb, w.kccc, w.bgd, w.gck, ...extra],
        position: {lat: 39.0, lon: -100.0}, magvar: 0, airspaces: w.centers,
        storage: savedFlightplan(1, plan(w)),
    });
    await settle(unit);
    await unit.panel.selectPage('L', 'FPL 1');
    await unit.panel.selectPage('R', 'CTR 1');
    return unit;
}

/** ENT on CTR 1 and the time the route search needs (the boundary session builds its shapes on animation frames) */
async function ent(unit: HeadlessUnit) {
    await unit.panel.ent();
    await vi.advanceTimersByTimeAsync(3000);
}

describe('CTR 1 page (characterization)', () => {
    // A plan that stays inside one Center, which the guide does not show: KAAA to FA00 (41 N) crosses no boundary. The
    // right half only: the status line's ent keeps the flashing inverse of the msg before it, which is the status
    // line's business
    it('shows 0 NEW WPTS for a plan inside one Center (characterization)', async () => {
        const fa00 = intersection('FA00', 41.0, -100.0);
        const unit = await onCtr1(w => [w.kaaa, fa00], [fa00]);
        await ent(unit);

        const s = Screen.read();
        expect([...s.rows('R'), '', ...s.maskRows('R')].join('\n')).toMatchInlineSnapshot(`
          " 0 NEW WPTS
                     
          PRESS ENT  
          TO INSERT  
          INTO FPL   
                     

          ...........
          ...........
          ...........
          ...........
          ...........
          ..........."
        `);
    });
});

describe('CTR 1 page, the radial of a new waypoint (characterization)', () => {
    // CTR 1 is a 90B page without a counterpart in the KLN 89 trainer: the radial of a new waypoint is measured at its
    // reference VOR like the NAV 2 radial (#339, checked in the KLN 89 trainer, 2026-10-12, on NAV 2). The VOR OFF lies
    // 14 NM from the crossing at 42.75 N on the meridian and is not on it, so the initial bearing at the VOR and the final
    // one at the crossing differ by about 0.2 degrees (BGD is due north of the crossing, where both agree). The radial
    // is stored true
    it('characterization: stores the radial measured at the reference VOR (#339)', async () => {
        const off = vor('OFF', 42.85, -99.7);
        const unit = await onCtr1(w => [w.kaaa, w.kbbb], [off]);
        await ent(unit);

        const created = userWaypoints(unit, FacilityType.USR).filter(f => f.icaoStruct.ident === 'OFF00') as unknown as { lat: number, lon: number, reference1Radial: number }[];
        expect(created).toHaveLength(1);
        expect(created[0].reference1Radial).toBeCloseTo(courseDeg(off, created[0]), 2);
    });
});

describe('CTR 1 page, a plan of one waypoint (characterization)', () => {
    // The guide does not say what CTR 1 does beside a plan with a single waypoint, which has no leg to cross a Center
    // boundary on. The code does not compute: ENT is accepted and nothing changes, the page keeps offering the
    // computation
    it('keeps offering the computation after ENT for a plan of one waypoint (characterization)', async () => {
        const unit = await onCtr1(w => [w.kaaa]);
        await ent(unit);

        expect(right()).toEqual(['           ', '           ', 'PRESS ENT  ', 'TO COMPUTE ', 'CTR WPTS   ', '           ']);
        expect(unit.errors).toEqual([]);
    });
});

describe('CTR 1 page (5-25 to 5-27)', () => {
    // 5-25, figure 5-89: without a flight plan page on the left, CTR 1 asks for one on rows 1 to 4
    it('asks for a flight plan page on the left (5-25, figure 5-89)', async () => {
        const unit = await bootUnit({magvar: 0});
        await unit.panel.selectPage('R', 'CTR 1');

        expect(right()).toEqual(['           ', 'DISPLAY    ', 'DESIRED    ', 'FPL ON     ', 'LEFT PAGE  ', '           ']);
    });

    // 5-25, figure 5-90: with a flight plan page on the left, CTR 1 offers the computation on rows 2 to 4, and the status
    // line shows ent
    it('offers the computation with a flight plan page on the left (5-25, figure 5-90)', async () => {
        await onCtr1(w => [w.kaaa, w.kbbb, w.kccc]);
        await vi.advanceTimersByTimeAsync(250); // the status line ticks before the page has seen the plan page once

        expect(right()).toEqual(['           ', '           ', 'PRESS ENT  ', 'TO COMPUTE ', 'CTR WPTS   ', '           ']);
        expect(Screen.read().status().mode).toBe('enr-leg ent');
    });

    // 5-25, figure 5-91: after ENT the page shows how many Center waypoints were computed in the top row, and offers the
    // insertion on rows 2 to 4. KAAA to KCCC crosses FW to ABQ at 42.75 N and ABQ to DEN at 47.75 N
    it('shows the number of computed Center waypoints (5-25, figure 5-91)', async () => {
        const unit = await onCtr1(w => [w.kaaa, w.kbbb, w.kccc]);
        await ent(unit);

        expect(right()).toEqual([' 2 NEW WPTS', '           ', 'PRESS ENT  ', 'TO INSERT  ', 'INTO FPL   ', '           ']);
    });

    // Figure 5-96 shows one new waypoint as 1 NEW WPT, without the plural S. KAAA to KBBB crosses one boundary. The
    // passing siblings are the test above (the page and its count for two waypoints) and the naming test below (it
    // computes this same plan and holds that it yields exactly one waypoint, BGD01)
    it('shows one computed Center waypoint as 1 NEW WPT (5-27, figure 5-96) (#300)', async () => {
        const unit = await onCtr1(w => [w.kaaa, w.kbbb]);
        await ent(unit);

        expect(right()).toEqual([' 1 NEW WPT ', '           ', 'PRESS ENT  ', 'TO INSERT  ', 'INTO FPL   ', '           ']);
    });

    // 5-26, figure 5-93: a second ENT inserts the Center waypoints into the plan on the left in route order, and CTR 1
    // reports CTR WPT INSERTION COMPLETE on rows 2 to 4
    it('inserts the Center waypoints into the plan in route order (5-26, figure 5-93)', async () => {
        const unit = await onCtr1(w => [w.kaaa, w.kbbb, w.kccc]);
        await ent(unit);
        await ent(unit);

        expect(fplIdents(unit, 1)).toEqual(['KAAA', 'BGD00', 'KBBB', 'GCK00', 'KCCC']);
        expect(Screen.read().rows('L').slice(1, 6)).toEqual(['  1:KAAA   ', '  2:BGD00  ', '  3:KBBB   ', '  4:GCK00  ', '  5:KCCC   ']);
        expect(right()).toEqual(['           ', '           ', 'CTR WPT    ', 'INSERTION  ', 'COMPLETE   ', '           ']);
        expect(unit.errors).toEqual([]);
    });

    // 5-25 step 2: the plan on the left may be the active flight plan, FPL 0
    it('inserts the Center waypoints into the active flight plan FPL 0 (5-25)', async () => {
        const w = centerWorld();
        const unit = await bootUnit({
            facilities: [w.kaaa, w.kbbb, w.kccc, w.bgd, w.gck],
            position: {lat: 39.0, lon: -100.0}, magvar: 0, airspaces: w.centers,
            storage: savedFlightplan(0, [w.kaaa, w.kbbb, w.kccc]),
        });
        await settle(unit);
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.selectPage('R', 'CTR 1');
        await ent(unit);
        await ent(unit);

        expect(fplIdents(unit, 0)).toEqual(['KAAA', 'BGD00', 'KBBB', 'GCK00', 'KCCC']);
        expect(unit.errors).toEqual([]);
    });

    // 5-25: the identifier is the nearest VOR's followed by the first two-digit number that is still free. A database
    // intersection BGD00 far away takes 00, so the crossing near BGD becomes BGD01
    it('names the waypoint after the nearest VOR with the first free two-digit number (5-25)', async () => {
        const unit = await onCtr1(w => [w.kaaa, w.kbbb], [intersection('BGD00', 30.0, -80.0)]);
        await ent(unit);
        await ent(unit);

        expect(fplIdents(unit, 1)).toEqual(['KAAA', 'BGD01', 'KBBB']);
    });

    // 5-26: leaving the flight plan page on the left and returning to it reverts CTR 1 to the format of figure 5-90
    it('reverts to PRESS ENT TO COMPUTE when the plan page is left and selected again (5-26)', async () => {
        const unit = await onCtr1(w => [w.kaaa, w.kbbb, w.kccc]);
        await ent(unit);
        expect(right()[0]).toBe(' 2 NEW WPTS'); // Precondition: computed

        await unit.panel.selectPage('L', 'FPL 2');
        await unit.panel.selectPage('L', 'FPL 1');

        expect(right()).toEqual(['           ', '           ', 'PRESS ENT  ', 'TO COMPUTE ', 'CTR WPTS   ', '           ']);
    });

    // 5-26: the Center waypoints are user waypoints of the supplemental kind, and those in a flight plan are listed on
    // OTH 3, with the type letter S and the plan number (5-20)
    it('lists the inserted Center waypoints on OTH 3 as supplemental waypoints (5-26, 5-20)', async () => {
        const unit = await onCtr1(w => [w.kaaa, w.kbbb, w.kccc]);
        await ent(unit);
        await ent(unit);
        await unit.panel.selectPage('L', 'OTH 3');

        expect(Screen.read().rows('L').slice(1, 3)).toEqual(['BGD00 S   1', 'GCK00 S   1']);
    });
});

/**
 * KAAA to KBBB, the one crossing computed and inserted as BGD00, then KCCC added at the end of FPL 1 with the knobs, and
 * the plan page left and selected again so that CTR 1 offers a new computation (5-26)
 */
async function extendedAfterInsertion() {
    const unit = await onCtr1(w => [w.kaaa, w.kbbb]);
    await ent(unit);
    await ent(unit);
    await unit.panel.cursor('L');
    await unit.panel.outer('L', 5); // USE?, INVRT?, the three waypoints, then the blank entry after KBBB
    expect(unit.panel.focused('L').text).toBe('     '); // Precondition: the cursor is on the blank entry
    await unit.panel.enterIdent('L', 'KCCC');
    await unit.panel.ent(); // the waypoint page
    await unit.panel.ent();
    await unit.panel.cursor('L');
    await unit.panel.selectPage('L', 'FPL 2');
    await unit.panel.selectPage('L', 'FPL 1');
    return unit;
}

describe('CTR 1 page, a plan modified after the insertion (5-27)', () => {
    // The setup of the pin below: the plan holds the inserted BGD00 and the added KCCC, and CTR 1 offers a new
    // computation (5-26)
    it('offers a new computation for the extended plan (5-26, 5-27)', async () => {
        const unit = await extendedAfterInsertion();

        expect(fplIdents(unit, 1)).toEqual(['KAAA', 'BGD00', 'KBBB', 'KCCC']);
        expect(right().slice(2, 5)).toEqual(['PRESS ENT  ', 'TO COMPUTE ', 'CTR WPTS   ']);
        expect(unit.errors).toEqual([]);
    });

    // 5-27, figures 5-95 to 5-97: the recomputation treats the inserted Center waypoint like any other waypoint of the
    // plan. CTR 2 then lists it without the new label, and the new crossing ABQ to DEN with it. Today the shared search
    // session drops the ABQ Center, which the first computation saw: the old crossing is missing and the new one reads
    // FW-DEN. This is the second computation in one unit, so it meets #102 by design (the sibling is the test above).
    // The pin asserts the whole recomputed state, so that a fixed #102 shows the right result and not just a result:
    // both CTR 2 pages in full (the existing waypoint without new, the new one with it, a page each), CTR 1 offering
    // the insertion (row 0, the count, is left out: the tests above hold it), and ENT inserting only the new
    // waypoint
    it.fails('lists the existing Center waypoint without new and the new one with new (5-27, figure 5-97) (#102)', async () => {
        const unit = await extendedAfterInsertion();
        await ent(unit);
        await unit.panel.inner('R', 1);
        const first = right();
        const status = Screen.read().status().right;
        await unit.panel.inner('R', 1);
        const second = right();
        await unit.panel.inner('R', -1);
        await unit.panel.inner('R', -1); // CTR 1
        const ctr1 = right();
        await ent(unit);

        expect(status).toBe('CTR+2');
        expect(first).toEqual([' BGD00     ', 'FW -ABQ CTR', 'BGD    180°', '     30.1nm', 'N 42°45.00\'', 'W100°00.00\'']);
        expect(second).toEqual([' GCK00  new', 'ABQ-DEN CTR', 'GCK    180°', '     30.1nm', 'N 47°45.00\'', 'W100°00.00\'']);
        expect(ctr1.slice(2, 5)).toEqual(['PRESS ENT  ', 'TO INSERT  ', 'INTO FPL   ']);
        expect(fplIdents(unit, 1)).toEqual(['KAAA', 'BGD00', 'KBBB', 'GCK00', 'KCCC']);
        expect(unit.errors).toEqual([]);
    });
});

// The FA cluster lies around 40 N, more than 75 NM from the next Center, so its short legs never return it; the long
// legs FA26 to KBBB and KBBB to KCCC cross the two boundaries as in centerWorld()
const cluster = (n: number) => Array.from({length: n}, (_, i) => intersection(`FA${String(i).padStart(2, '0')}`, 40.0 + i * 0.01, -100.0));

describe('CTR 1 page, the 30 waypoint limit (5-26)', () => {
    // 5-26: the limit is 30 waypoints. 28 plus the two Center waypoints make 30, which still fits: the guard against a
    // limit that is off by one. It is the sibling of the test below
    it('inserts two Center waypoints into a plan of 28 waypoints (5-26)', async () => {
        const fa = cluster(26);
        const unit = await onCtr1(w => [...fa, w.kbbb, w.kccc], fa);
        await ent(unit);
        expect(right()[0]).toBe(' 2 NEW WPTS'); // Precondition: computed
        await ent(unit);

        expect(fplIdents(unit, 1).length).toBe(30);
        expect(fplIdents(unit, 1).slice(25)).toEqual(['FA25', 'BGD00', 'KBBB', 'GCK00', 'KCCC']);
    });

    // 5-26: when the Center waypoints would make the plan exceed 30 waypoints, none are offered and CTR 1 says NOT
    // ENOUGH ROOM IN FPL. 29 plus two make 31. The guide gives the words, not the rows, so the rows are joined. ENT is
    // then not answered, and nothing is stored or inserted
    it('says NOT ENOUGH ROOM IN FPL for a plan of 29 waypoints and two crossings (5-26) (#161)', async () => {
        const fa = cluster(27);
        const unit = await onCtr1(w => [...fa, w.kbbb, w.kccc], fa);
        await ent(unit);

        expect(right().map(r => r.trim()).filter(r => r !== '').join(' ')).toBe('NOT ENOUGH ROOM IN FPL');
        await ent(unit);
        expect(right().map(r => r.trim()).filter(r => r !== '').join(' ')).toBe('NOT ENOUGH ROOM IN FPL');
        expect(fplIdents(unit, 1).length).toBe(29);
        expect(userWaypoints(unit, FacilityType.USR)).toEqual([]);
        expect(unit.errors).toEqual([]);
    });

    // 5-26: a plan with one slot left takes one Center waypoint (KBBB is 300 NM from FA27, so one boundary is crossed),
    // and a plan that is exactly full takes none: the boundary of the limit on both sides
    it('takes one Center waypoint into a plan of 29 waypoints (5-26)', async () => {
        const fa = cluster(28);
        const unit = await onCtr1(w => [...fa, w.kbbb], fa);
        await ent(unit);
        expect(right()[0]).toBe(' 1 NEW WPT '); // Precondition: computed
        await ent(unit);

        expect(fplIdents(unit, 1).length).toBe(30);
        expect(fplIdents(unit, 1).slice(27)).toEqual(['FA27', 'BGD00', 'KBBB']);
        expect(unit.errors).toEqual([]);
    });

    it('says NOT ENOUGH ROOM IN FPL for a full plan and one crossing (5-26, #161)', async () => {
        const fa = cluster(29);
        const unit = await onCtr1(w => [...fa, w.kbbb], fa);
        await ent(unit);

        expect(right().map(r => r.trim()).filter(r => r !== '').join(' ')).toBe('NOT ENOUGH ROOM IN FPL');
        await ent(unit);
        expect(fplIdents(unit, 1).length).toBe(30);
        expect(fplIdents(unit, 1)[0]).toBe('FA00');
        expect(unit.errors).toEqual([]);
    });

    // 5-26: the limit counts the waypoints that would be inserted. A Center waypoint that the plan already holds from an
    // earlier insertion takes no new slot, so a full plan of the two inserted Center waypoints and 28 others is not
    // refused for the crossings it already has, and ENT inserts nothing. (The second computation meets #102 and sees
    // only one of the two crossings; every crossing it does see is an existing one, so the assertions hold either way.)
    it('does not count a Center waypoint that the plan already holds (5-26)', async () => {
        const fa = cluster(26);
        const unit = await onCtr1(w => [...fa, w.kbbb, w.kccc], fa);
        await ent(unit);
        await ent(unit);
        expect(fplIdents(unit, 1).length).toBe(30); // Precondition: the plan is full
        await unit.panel.selectPage('L', 'FPL 2');
        await unit.panel.selectPage('L', 'FPL 1');
        await ent(unit);

        const isNew = unit.props.memory.ctrPage.waypoints.map(w => w.isNew);
        expect(isNew).toContain(false); // Precondition: the plan's own Center waypoint is found again
        expect(isNew).not.toContain(true);
        // The guide shows no count of 0; the form of the first row is the one the characterization above holds
        expect(right()).toEqual([' 0 NEW WPTS', '           ', 'PRESS ENT  ', 'TO INSERT  ', 'INTO FPL   ', '           ']);
        await ent(unit);
        expect(right()).toEqual(['           ', '           ', 'CTR WPT    ', 'INSERTION  ', 'COMPLETE   ', '           ']);
        expect(fplIdents(unit, 1).length).toBe(30);
        expect(unit.errors).toEqual([]);
    });

    // The first waypoint of a full FPL 0 that is part of the active leg: the insertion used to throw (insertLegIntoFpl)
    // when it was offered, on the ENT path
    it('says NOT ENOUGH ROOM IN FPL for a full FPL 0 whose first leg is active (5-26, #161)', async () => {
        const w = centerWorld();
        const fa = cluster(29);
        const unit = await bootUnit({
            facilities: [w.kaaa, w.kbbb, w.kccc, w.bgd, w.gck, ...fa], position: {lat: 39.0, lon: -100.0}, magvar: 0,
            airspaces: w.centers, storage: savedFlightplan(0, [...fa, w.kbbb]),
        });
        await settle(unit);
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.selectPage('R', 'CTR 1');
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(1); // Precondition: the first leg is active
        await ent(unit);

        expect(right().map(r => r.trim()).filter(r => r !== '').join(' ')).toBe('NOT ENOUGH ROOM IN FPL');
        await ent(unit);
        expect(fplIdents(unit, 0).length).toBe(30);
        expect(unit.errors).toEqual([]);
    });
});

// 5-27 describes a recomputation after the plan changed. That the offer goes back to the computation, and that the
// insertion never works on a plan other than the computed one, is a characterization that follows the AVsoftech trainer
describe('CTR 1 page, a plan edited after the computation (characterization)', () => {
    // The plan grows between the computation and the insertion (on the left page, or on APT 7). The computed indices
    // belong to the old plan, so ENT must not insert at them (#348); it offers the computation again. Nothing is
    // inserted, and there is no insert-time room check any more (#161): the plan is the computed one, which passed it
    it('characterization: offers the computation again when the plan has grown since the computation (#348)', async () => {
        const fa = cluster(26);
        const unit = await onCtr1(w => [...fa, w.kbbb, w.kccc], fa);
        await ent(unit);
        expect(right()[0]).toBe(' 2 NEW WPTS'); // Precondition: computed, 28 plus 2 fits
        unit.props.memory.fplPage.flightplans[1].insertLeg(0, {wpt: intersection('FB00', 41.0, -99.0), type: KLNLegType.USER});
        await ent(unit);

        expect(right()).toEqual(['           ', '           ', 'PRESS ENT  ', 'TO COMPUTE ', 'CTR WPTS   ', '           ']);
        expect(fplIdents(unit, 1).length).toBe(29);
        expect(unit.errors).toEqual([]);
    });

    // The edit comes before the next display tick, so ENT is the first to see it: the insertion used to take the
    // computed index 1 of the old plan and put BGD00 between FB00 and KAAA (#348)
    it('characterization: offers the computation again when the plan is edited between the two ENTs (#348)', async () => {
        const fb00 = intersection('FB00', 41.0, -99.0);
        const unit = await onCtr1(w => [w.kaaa, w.kbbb], [fb00]);
        await ent(unit);
        expect(right()[0]).toBe(' 1 NEW WPT '); // Precondition: one Center waypoint computed
        unit.props.memory.fplPage.flightplans[1].insertLeg(0, {wpt: fb00, type: KLNLegType.USER});
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(3000);

        expect(fplIdents(unit, 1)).toEqual(['FB00', 'KAAA', 'KBBB']);
        expect(right()).toEqual(['           ', '           ', 'PRESS ENT  ', 'TO COMPUTE ', 'CTR WPTS   ', '           ']);
        expect(unit.errors).toEqual([]);
    });

    // The same edit followed by a display tick: CTR 1 is back at the computation before any ENT
    it('characterization: goes back to the computation in the display tick after the plan was edited (#348)', async () => {
        const fb00 = intersection('FB00', 41.0, -99.0);
        const unit = await onCtr1(w => [w.kaaa, w.kbbb], [fb00]);
        await ent(unit);
        expect(right()[0]).toBe(' 1 NEW WPT '); // Precondition: one Center waypoint computed
        unit.props.memory.fplPage.flightplans[1].insertLeg(0, {wpt: fb00, type: KLNLegType.USER});
        await vi.advanceTimersByTimeAsync(250);

        expect(right()).toEqual(['           ', '           ', 'PRESS ENT  ', 'TO COMPUTE ', 'CTR WPTS   ', '           ']);
        expect(fplIdents(unit, 1)).toEqual(['FB00', 'KAAA', 'KBBB']);
        expect(unit.errors).toEqual([]);
    });

    // The count alone does not tell an edit: a waypoint replaced by another leaves the same number of legs, and the
    // computed indices still belong to the old plan
    it('characterization: goes back to the computation when a waypoint of the plan was replaced (#348)', async () => {
        const fb00 = intersection('FB00', 41.0, -99.0);
        const unit = await onCtr1(w => [w.kaaa, w.kbbb], [fb00]);
        await ent(unit);
        expect(right()[0]).toBe(' 1 NEW WPT '); // Precondition: one Center waypoint computed
        const fpl1 = unit.props.memory.fplPage.flightplans[1];
        fpl1.deleteLeg(0);
        fpl1.insertLeg(0, {wpt: fb00, type: KLNLegType.USER});
        await vi.advanceTimersByTimeAsync(250);

        expect(fplIdents(unit, 1)).toEqual(['FB00', 'KBBB']); // the same number of legs as before
        expect(right()).toEqual(['           ', '           ', 'PRESS ENT  ', 'TO COMPUTE ', 'CTR WPTS   ', '           ']);
        expect(unit.errors).toEqual([]);
    });

    // NOT ENOUGH ROOM IN FPL belongs to the plan as it was as well: when the plan is edited, the computation is offered
    // again and may fit now
    it('characterization: goes back to the computation when the plan was edited after NOT ENOUGH ROOM (#348)', async () => {
        const fa = cluster(27);
        const unit = await onCtr1(w => [...fa, w.kbbb, w.kccc], fa);
        await ent(unit);
        expect(right().map(r => r.trim()).filter(r => r !== '').join(' ')).toBe('NOT ENOUGH ROOM IN FPL'); // Precondition
        unit.props.memory.fplPage.flightplans[1].deleteLeg(0);
        await vi.advanceTimersByTimeAsync(250);

        expect(right()).toEqual(['           ', '           ', 'PRESS ENT  ', 'TO COMPUTE ', 'CTR WPTS   ', '           ']);
        expect(unit.errors).toEqual([]);
    });
});

/**
 * Replaces `method` of `target` by a version that waits for the returned release before it does its work, so that a
 * test can act while the computation of CTR 1 waits at that call
 */
function hold<T extends object>(target: T, method: keyof T & string) {
    const original = (target[method] as unknown as (...args: unknown[]) => unknown).bind(target);
    let release: () => void = () => undefined;
    const gate = new Promise<void>(resolve => release = resolve);
    const spy = vi.spyOn(target, method as never).mockImplementation((async (...args: unknown[]) => {
        await gate;
        return original(...args);
    }) as never);
    return {spy, release};
}

// A computation is asynchronous. When the plan page is left and selected again while it runs, CTR 1 is reset, and the
// finished computation must not bring back its Center waypoints (#301, #348). Each test holds one of the awaits of the
// computation until the page was left. The state itself is read after 1 ms, before the next display tick, because a
// display tick would also clear a state that was wrongly written
describe('CTR 1 page, a computation that finishes after the plan page was left (characterization)', () => {
    async function leaveAndReturn(unit: HeadlessUnit, release: () => void) {
        await unit.panel.selectPage('L', 'FPL 2');
        await unit.panel.selectPage('L', 'FPL 1');
        release();
        await vi.advanceTimersByTimeAsync(1);
    }

    function expectReset(unit: HeadlessUnit) {
        expect(unit.props.memory.ctrPage.state).toBe(CtrState.FPL);
        expect(unit.props.memory.ctrPage.waypoints).toEqual([]);
    }

    it('characterization: discards a computation that finishes after the plan page was left, at the nearest VOR search (#348)', async () => {
        const unit = await onCtr1(w => [w.kaaa, w.kbbb]);
        const {spy, release} = hold(unit.props.nearestUtils, 'getNearestVor');
        await ent(unit);
        expect(spy).toHaveBeenCalled(); // Precondition: the computation waits for the search
        await leaveAndReturn(unit, release);

        expectReset(unit);
        await vi.advanceTimersByTimeAsync(3000);
        expect(right()).toEqual(['           ', '           ', 'PRESS ENT  ', 'TO COMPUTE ', 'CTR WPTS   ', '           ']);
        expect(unit.errors).toEqual([]);
    });

    // The route search is the first await. A computation that notices the reset there creates no user waypoint at all
    it('characterization: discards a computation that finishes after the plan page was left, at the route search (#348)', async () => {
        const unit = await onCtr1(w => [w.kaaa, w.kbbb]);
        const {spy, release} = hold(unit.props.nearestUtils, 'getAirspaces');
        await ent(unit);
        expect(spy).toHaveBeenCalled(); // Precondition: the computation waits for the route search
        await leaveAndReturn(unit, release);

        expectReset(unit);
        expect(userWaypoints(unit, FacilityType.USR)).toEqual([]);
        expect(unit.errors).toEqual([]);
    });

    // The plan is edited while the computation waits, with no page left and no display tick in between: the
    // computation compares the plan with its own snapshot and writes nothing
    it('characterization: discards a computation of a plan that was edited while it ran (#348)', async () => {
        const fb00 = intersection('FB00', 41.0, -99.0);
        const unit = await onCtr1(w => [w.kaaa, w.kbbb], [fb00]);
        const {spy, release} = hold(unit.props.nearestUtils, 'getAirspaces');
        await unit.panel.ent();
        expect(spy).toHaveBeenCalled(); // Precondition: the computation waits for the route search
        unit.props.memory.fplPage.flightplans[1].insertLeg(0, {wpt: fb00, type: KLNLegType.USER});
        release();
        await vi.advanceTimersByTimeAsync(1);

        expectReset(unit);
        expect(userWaypoints(unit, FacilityType.USR)).toEqual([]);
        expect(unit.errors).toEqual([]);
    });

    // The reference VOR of a waypoint the plan already holds is loaded at the end of the computation (the setup of 'does
    // not count a Center waypoint that the plan already holds': a second computation that sees an existing crossing)
    it('characterization: discards a computation that finishes after the plan page was left, at the reference VOR (#348)', async () => {
        const fa = cluster(26);
        const unit = await onCtr1(w => [...fa, w.kbbb, w.kccc], fa);
        await ent(unit);
        await ent(unit); // the two Center waypoints are inserted
        await unit.panel.selectPage('L', 'FPL 2');
        await unit.panel.selectPage('L', 'FPL 1');
        const {spy, release} = hold(unit.props.facilityLoader, 'tryGetFacility');
        await ent(unit);
        expect(spy).toHaveBeenCalled(); // Precondition: the computation waits for the reference VOR of the existing waypoint
        await leaveAndReturn(unit, release);

        expectReset(unit);
        expect(unit.errors).toEqual([]);
    });
});

describe('CTR 1 page, the 30 waypoint limit and the approach legs of FPL 0 (characterization)', () => {
    // 5-26 counts the waypoints of a plan; how it counts procedure legs is not said. FPL 0 holds procedure legs on top of
    // its 30 en-route waypoints (#221), so the Center waypoint goes in while the legs of the plan pass 30
    it('counts only the en-route waypoints of FPL 0 against 30 (characterization, #221)', async () => {
        const w = centerWorld();
        // The approach lies north of the Center boundary at 42.75 N, so the only crossing is the leg to its IAF
        const iafdd = intersection('IAFDD', 44.0, -100.0);
        const fafdd = intersection('FAFDD', 44.5, -100.0);
        const mapdd = intersection('MAPDD', 44.7, -100.0);
        const kddd = withProcedures(airport('KDDD', 44.8, -100.0), {
            approaches: [approach({
                type: ApproachType.APPROACH_TYPE_RNAV, runway: '36',
                transitions: [{name: 'IAFDD', legs: [Leg.IF(iafdd, FixTypeFlags.IAF)]}],
                final: [Leg.IF(iafdd), Leg.TF(fafdd, FixTypeFlags.FAF), Leg.TF(mapdd, FixTypeFlags.MAP)],
            })],
        });
        const fa = cluster(28);
        const unit = await bootUnit({
            facilities: [kddd, iafdd, fafdd, mapdd, w.bgd, w.gck, ...fa],
            position: {lat: 39.0, lon: -100.0}, magvar: 0, airspaces: w.centers,
            storage: savedFlightplan(0, [...fa, kddd]), panelXml: panelXml(APR_ARM_SWITCH),
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8', {ident: 'KDDD'});
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.selectPage('R', 'CTR 1');
        // Preconditions: 28 fixes and KDDD are 29 en-route waypoints, the approach adds three legs, so the legs pass 30
        // with the Center waypoint while the en-route waypoints do not
        const fpl0 = unit.props.memory.fplPage.flightplans[0];
        expect(fpl0.getLegs().filter(l => l.type === KLNLegType.USER)).toHaveLength(29);
        expect(fpl0.getLegs()).toHaveLength(32);
        await ent(unit);
        expect(right()[0]).toBe(' 1 NEW WPT '); // Precondition: one crossing, the leg of FA27 to IAFDD

        await ent(unit);

        expect(right()).toEqual(['           ', '           ', 'CTR WPT    ', 'INSERTION  ', 'COMPLETE   ', '           ']);
        expect(fplIdents(unit, 0)).toHaveLength(33);
        expect(fplIdents(unit, 0).slice(27)).toEqual(['FA27', 'BGD00', 'IAFDD', 'FAFDD', 'MAPDD', 'KDDD']);
        expect(unit.errors).toEqual([]);
    });
});

describe('CTR 1 page, Center waypoints at the power-off (5-26)', () => {
    /** The user waypoints in the facility repository, as "ident region", sorted */
    const centerWaypoints = (unit: HeadlessUnit): string[] =>
        userWaypoints(unit, FacilityType.USR).map(f => `${f.icaoStruct.ident} ${f.icaoStruct.region}`).sort();

    // 5-26: switching the unit off purges every Center waypoint that no plan holds from the user waypoint list. CTR 1
    // stores a waypoint at the computation (first ENT), and without the second ENT no plan ever receives it
    it('deletes computed Center waypoints that were never inserted when the unit is turned off (5-26)', async () => {
        const unit = await onCtr1(w => [w.kaaa, w.kbbb, w.kccc]);
        await ent(unit);
        expect(right()[0]).toBe(' 2 NEW WPTS'); // Precondition: computed, not inserted
        expect(fplIdents(unit, 1)).toEqual(['KAAA', 'KBBB', 'KCCC']);
        expect(centerWaypoints(unit).map(w => w.split(' ')[0])).toEqual(['BGD00', 'GCK00']); // Precondition: stored

        await unit.panel.powerOff();

        expect(centerWaypoints(unit)).toEqual([]);
    });
});
