import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {centerWorld} from '../../../harness/fixtures';
import {savedFlightplan} from '../../../harness/storage';
import {Screen} from '../../../harness/render/screen';

/**
 * The world of centerWorld(): three Centers stacked along 100 W (FW, ABQ and DEN in FIRMAP, Appendix D) with their
 * boundaries at 42.75 N and 47.75 N, crossed by the 300 NM legs KAAA to KBBB and KBBB to KCCC; the long legs keep each
 * Center from being first returned from outside it (#102). The VORs BGD and GCK lie 0.5 degrees north of the crossings.
 * Boots with that plan as FPL 1, FPL 1 on the left, and computes the Center waypoints on CTR 1.
 */
async function computed(o: { magvar?: number } = {}): Promise<HeadlessUnit> {
    const w = centerWorld();
    const unit = await bootUnit({
        facilities: [w.kaaa, w.kbbb, w.kccc, w.bgd, w.gck],
        position: {lat: 39.0, lon: -100.0}, magvar: o.magvar ?? 0, airspaces: w.centers,
        storage: savedFlightplan(1, [w.kaaa, w.kbbb, w.kccc]),
    });
    await settle(unit);
    await unit.panel.selectPage('L', 'FPL 1');
    await unit.panel.selectPage('R', 'CTR 1');
    await unit.panel.ent();
    await vi.advanceTimersByTimeAsync(3000); // the route search builds the boundary shapes on animation frames
    expect(Screen.read().rows('R')[0]).toBe(' 2 NEW WPTS'); // Precondition: computed
    return unit;
}

const right = () => Screen.read().rows('R');

describe('CTR 2 page (characterization)', () => {
    // The guide shows CTR 2 only with Center waypoints; this is the code's page before a computation
    it('shows NO CTR WAYPOINTS before a computation (characterization)', async () => {
        const unit = await bootUnit({magvar: 0});
        await unit.panel.selectPage('R', 'CTR 2');

        const s = Screen.read();
        expect([...s.rows('R'), '', ...s.maskRows('R')].join('\n')).toMatchInlineSnapshot(`
          "           
                     
          NO CTR     
          WAYPOINTS  
                     
                     

          ...........
          ...........
          ...........
          ...........
          ...........
          ..........."
        `);
        expect(unit.errors).toEqual([]);
    });
});

describe('CTR 2 pages beyond the last waypoint (characterization)', () => {
    // The page tree's wrap, not a statement of the guide: a third turn of the inner knob past two waypoint pages leaves
    // CTR 2 for CTR 1. It holds that there are exactly two waypoint pages
    it('leaves CTR 2 after the last waypoint page (characterization)', async () => {
        const unit = await computed();
        const status: string[] = [];
        for (let i = 0; i < 3; i++) {
            await unit.panel.inner('R', 1);
            status.push(Screen.read().status().right);
        }

        expect(status).toEqual(['CTR+2', 'CTR+2', 'CTR 1']);
    });
});

describe('CTR 2 page (5-25, 5-26)', () => {
    // 5-25: there are as many CTR 2 pages as Center waypoints, so two waypoints show CTR+2 on both of their pages. The
    // pages themselves are held by the next test
    it('has a page per Center waypoint (5-25)', async () => {
        const unit = await computed();
        const status: string[] = [];
        for (let i = 0; i < 2; i++) {
            await unit.panel.inner('R', 1);
            status.push(Screen.read().status().right);
        }

        expect(status).toEqual(['CTR+2', 'CTR+2']);
    });

    // 5-25, 5-26, figure 5-92: the waypoint and new, the from and to Centers, the nearest VOR with the radial from it,
    // the distance, then latitude and longitude. The crossings lie on 100 W at 42.75 N and 47.75 N, each 0.5 degrees
    // (30.05 NM on the sphere of the instrument, 6378.1 km) due north of its VOR, so the radial is 180 at magvar 0
    it('shows each Center waypoint with its Centers, VOR, radial, distance and position (5-25, 5-26, figure 5-92)', async () => {
        const unit = await computed();
        await unit.panel.inner('R', 1);
        const first = right();
        await unit.panel.inner('R', 1);

        expect(first).toEqual([' BGD00  new', 'FW -ABQ CTR', 'BGD    180°', '     30.1nm', 'N 42°45.00\'', 'W100°00.00\'']);
        expect(right()).toEqual([' GCK00  new', 'ABQ-DEN CTR', 'GCK    180°', '     30.1nm', 'N 47°45.00\'', 'W100°00.00\'']);
    });

    // 5-44: within the coverage area the unit shows magnetic angles. A variation of 10 degrees east everywhere turns
    // the true radial 180 into 170
    it('shows the radial magnetic (5-26, 5-44)', async () => {
        const unit = await computed({magvar: 10});
        await unit.panel.inner('R', 1);

        expect(right()[2]).toBe('BGD    170°');
    });

    // 5-26: leaving the flight plan page on the left and returning to it reverts CTR 1 and CTR 2 to the start state, the
    // format of figure 5-90 on CTR 1; the Center waypoints are seen again only after ENT on CTR 1. Today the CTR 2 page
    // keeps FPL 1's waypoints while the left page shows FPL 2 and after FPL 1 returns, and CTR 1, which did not see the
    // other plan page, offers the insertion again. The guide shows no CTR 2 page without waypoints, so the literal for
    // it is the code's own empty page (the characterization above). The passing siblings are the CTR 1 revert test
    // and the two-waypoint test above
    it.fails('returns CTR 1 and CTR 2 to the start state when the plan page is left and selected again (5-26) (#301)', async () => {
        const unit = await computed();
        await unit.panel.inner('R', 1);
        expect(right()[0]).toBe(' BGD00  new'); // Precondition: CTR 2 shows the first waypoint

        await unit.panel.selectPage('L', 'FPL 2');
        await unit.panel.selectPage('L', 'FPL 1');
        await unit.panel.inner('R', -1); // CTR 1
        const ctr1 = right();
        await unit.panel.inner('R', 1); // CTR 2, built again
        const ctr2 = right();

        expect(ctr1).toEqual(['           ', '           ', 'PRESS ENT  ', 'TO COMPUTE ', 'CTR WPTS   ', '           ']);
        expect(ctr2).toEqual(['           ', '           ', 'NO CTR     ', 'WAYPOINTS  ', '           ', '           ']);
    });
});
