import {describe, expect, it, vi} from 'vitest';
import {Facility} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {centerWorld} from '../../../harness/fixtures';
import {intersection} from '../../../harness/navdata/builders';
import {savedFlightplan} from '../../../harness/storage';
import {Screen} from '../../../harness/render/screen';

type CenterWorld = ReturnType<typeof centerWorld>;

const right = () => Screen.read().rows('R');
const idents = (unit: HeadlessUnit, fpl: number) => unit.props.memory.fplPage.flightplans[fpl].getLegs().map(l => l.wpt.icaoStruct.ident);

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
    // passing sibling is the test above (two waypoints)
    it.fails('shows one computed Center waypoint as 1 NEW WPT (5-27, figure 5-96) (#NEW-6-1)', async () => {
        const unit = await onCtr1(w => [w.kaaa, w.kbbb]);
        await ent(unit);

        expect(right()[0]).toBe(' 1 NEW WPT ');
    });

    // 5-26, figure 5-93: a second ENT inserts the Center waypoints into the plan on the left in route order, and CTR 1
    // reports CTR WPT INSERTION COMPLETE on rows 2 to 4
    it('inserts the Center waypoints into the plan in route order (5-26, figure 5-93)', async () => {
        const unit = await onCtr1(w => [w.kaaa, w.kbbb, w.kccc]);
        await ent(unit);
        await ent(unit);

        expect(idents(unit, 1)).toEqual(['KAAA', 'BGD00', 'KBBB', 'GCK00', 'KCCC']);
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

        expect(idents(unit, 0)).toEqual(['KAAA', 'BGD00', 'KBBB', 'GCK00', 'KCCC']);
        expect(unit.errors).toEqual([]);
    });

    // 5-25: the identifier is the nearest VOR's followed by the first two-digit number that is still free. A database
    // intersection BGD00 far away takes 00, so the crossing near BGD becomes BGD01
    it('names the waypoint after the nearest VOR with the first free two-digit number (5-25)', async () => {
        const unit = await onCtr1(w => [w.kaaa, w.kbbb], [intersection('BGD00', 30.0, -80.0)]);
        await ent(unit);
        await ent(unit);

        expect(idents(unit, 1)).toEqual(['KAAA', 'BGD01', 'KBBB']);
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

        expect(idents(unit, 1)).toEqual(['KAAA', 'BGD00', 'KBBB', 'KCCC']);
        expect(right().slice(2, 5)).toEqual(['PRESS ENT  ', 'TO COMPUTE ', 'CTR WPTS   ']);
        expect(unit.errors).toEqual([]);
    });

    // 5-27, figures 5-95 to 5-97: the recomputation treats the inserted Center waypoint like any other waypoint of the
    // plan. CTR 2 then lists it without the new label, and the new crossing ABQ to DEN with it. Today the shared search
    // session drops the ABQ Center, which the first computation saw: the old crossing is missing and the new one reads
    // FW-DEN. This is the second computation in one unit, so it meets #102 by design (the sibling is the test above)
    it.fails('lists the existing Center waypoint without new and the new one with new (5-27, figure 5-97) (#102)', async () => {
        const unit = await extendedAfterInsertion();
        await ent(unit);
        await unit.panel.inner('R', 1);
        const first = right();
        const status = Screen.read().status().right;
        await unit.panel.inner('R', 1);

        expect(status).toBe('CTR+2');
        expect(first.slice(0, 2)).toEqual([' BGD00     ', 'FW -ABQ CTR']);
        expect(right().slice(0, 2)).toEqual([' GCK00  new', 'ABQ-DEN CTR']);
    });
});

// The FA cluster lies around 40 N, more than 75 NM from the next Center, so its short legs never return it; the long
// legs FA26 to KBBB and KBBB to KCCC cross the two boundaries as in centerWorld()
const cluster = (n: number) => Array.from({length: n}, (_, i) => intersection(`FA${String(i).padStart(2, '0')}`, 40.0 + i * 0.01, -100.0));

describe('CTR 1 page, the 30 waypoint limit (5-26)', () => {
    // 5-26: the limit is 30 waypoints. 28 plus the two Center waypoints make 30, which still fits. The limit check of
    // CTR 1 is dead code until #161 is fixed (its result is overwritten), so today this test holds only the setup and
    // the insertion; it becomes the guard against a limit that is off by one once the check works. It is the passing
    // sibling of the pin below
    it('inserts two Center waypoints into a plan of 28 waypoints (5-26)', async () => {
        const fa = cluster(26);
        const unit = await onCtr1(w => [...fa, w.kbbb, w.kccc], fa);
        await ent(unit);
        expect(right()[0]).toBe(' 2 NEW WPTS'); // Precondition: computed
        await ent(unit);

        expect(idents(unit, 1).length).toBe(30);
        expect(idents(unit, 1).slice(25)).toEqual(['FA25', 'BGD00', 'KBBB', 'GCK00', 'KCCC']);
    });

    // 5-26: when the Center waypoints would make the plan exceed 30 waypoints, none are offered and CTR 1 says NOT
    // ENOUGH ROOM IN FPL. 29 plus two make 31. The guide gives the words, not the rows, so the rows are joined
    it.fails('says NOT ENOUGH ROOM IN FPL for a plan of 29 waypoints and two crossings (5-26) (#161)', async () => {
        const fa = cluster(27);
        const unit = await onCtr1(w => [...fa, w.kbbb, w.kccc], fa);
        await ent(unit);

        expect(right().map(r => r.trim()).filter(r => r !== '').join(' ')).toBe('NOT ENOUGH ROOM IN FPL');
    });
});
