import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {centerWorld} from '../../../harness/fixtures';
import {intersection, vor} from '../../../harness/navdata/builders';
import {savedFlightplan} from '../../../harness/storage';
import {Screen} from '../../../harness/render/screen';

/**
 * The world of centerWorld(): three Centers stacked along 100 W (FW, ABQ and DEN in FIRMAP, Appendix D) with their
 * boundaries at 42.75 N and 47.75 N, crossed by the 300 NM legs KAAA to KBBB and KBBB to KCCC. The VORs BGD and GCK lie
 * 0.5 degrees north of the crossings.
 * Boots with that plan as FPL 1, FPL 1 on the left, and computes the Center waypoints on CTR 1.
 */
async function computed(o: { magvar?: number, vorMagneticVariation?: number, centerNames?: string[] } = {}): Promise<HeadlessUnit> {
    const w = centerWorld();
    // The names of the Centers from south to north, for the abbreviations that FIRMAP pads to different widths
    o.centerNames?.forEach((name, i) => Object.assign(w.centers[i], {name}));
    // The VORs of centerWorld() again, with the given variation (stored as the sim stores it, 10 E as -10)
    const magneticVariation = o.vorMagneticVariation ?? 0;
    const vors = [vor('BGD', w.bgd.lat, w.bgd.lon, {magneticVariation}), vor('GCK', w.gck.lat, w.gck.lon, {magneticVariation})];
    const unit = await bootUnit({
        facilities: [w.kaaa, w.kbbb, w.kccc, ...vors],
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

/**
 * A plan of 26 waypoints around 40 N, KBBB and KCCC on FPL 1 (both VORs 4 E, the aircraft 10 E): the first computation
 * and the insertion of BGD00 and GCK00 are done, the plan page was left and selected again, so that the next ENT on
 * CTR 1 computes a second time (the setup of the 'does not count' test of Ctr1Page.test.ts)
 */
async function afterInsertionOfFullPlan(): Promise<HeadlessUnit> {
    const w = centerWorld();
    const fa = Array.from({length: 26}, (_, i) => intersection(`FA${String(i).padStart(2, '0')}`, 40.0 + i * 0.01, -100.0));
    const vors = [vor('BGD', w.bgd.lat, w.bgd.lon, {magneticVariation: -4}), vor('GCK', w.gck.lat, w.gck.lon, {magneticVariation: -4})];
    const unit = await bootUnit({
        facilities: [w.kbbb, w.kccc, ...fa, ...vors],
        position: {lat: 39.0, lon: -100.0}, magvar: 10, airspaces: w.centers,
        storage: savedFlightplan(1, [...fa, w.kbbb, w.kccc]),
    });
    await settle(unit);
    await unit.panel.selectPage('L', 'FPL 1');
    await unit.panel.selectPage('R', 'CTR 1');
    await unit.panel.ent();
    await vi.advanceTimersByTimeAsync(3000);
    await unit.panel.ent(); // insert
    await unit.panel.selectPage('L', 'FPL 2');
    await unit.panel.selectPage('L', 'FPL 1');
    return unit;
}

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

    // The code builds the row from two Center abbreviations of three cells each, a hyphen and CTR: eleven cells, also
    // with the two-letter abbreviation NY
    it('characterization: keeps the Center row at its width for the two-letter abbreviation NY, from and to', async () => {
        const unit = await computed({centerNames: ['KZNY TEST', 'KZWY TEST', 'KZDV TEST']});
        await unit.panel.inner('R', 1);
        const first = right()[1];
        await unit.panel.inner('R', 1);
        const second = right()[1];

        expect(first).toBe('NY -NY  CTR');
        expect(second).toBe('NY -DEN CTR');
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

    // 5-44: within the coverage area the unit shows magnetic angles. A variation of 10 degrees east everywhere, at the
    // aircraft and at both VORs (stored as -10, as NAV 2 reads a VOR's variation), turns the true radial 180 into 170.
    // The same variation everywhere keeps the test to "magnetic": which variation converts the radial is not its subject
    it('shows the radial magnetic (5-26, 5-44)', async () => {
        const unit = await computed({magvar: 10, vorMagneticVariation: -10});
        await unit.panel.inner('R', 1);

        expect(right()[2]).toBe('BGD    170°');
    });

    // #362: the radial from the reference VOR is magnetic with that VOR's own variation, the rule of #280 (checked in the
    // KLN 89 trainer, 2026-10-07, on the INT and USR pages; CTR 2 is the 90B's own page, so this is a characterization).
    // 10 E at the aircraft, 4 E at BGD: the true radial 180 is 176, not the local 170
    it('characterization: converts the radial with the variation of the reference VOR (#362)', async () => {
        const unit = await computed({magvar: 10, vorMagneticVariation: -4});
        await unit.panel.inner('R', 1);

        expect(right()[2]).toBe('BGD    176°');
    });

    // #362 for a Center waypoint that is in the plan already (5-27: it is not created again). A plan of 26 waypoints
    // around 40 N, KBBB and KCCC takes both crossings as BGD00 and GCK00 (a full plan of 30); the second computation
    // finds both of them again, and CTR 2 converts the radial of the first with the variation of its VOR as well (10 E
    // at the aircraft, 4 E at both VORs). Characterization, as above. Before the fix of #102 the shared airspace search
    // session found only one of the two again, which this test took for its precondition
    it('characterization: converts the radial of a Center waypoint that exists already with the variation of its VOR (#362)', async () => {
        const unit = await afterInsertionOfFullPlan();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(3000);
        expect(unit.props.memory.ctrPage.waypoints.map(wpt => wpt.isNew)).toEqual([false, false]); // Precondition: two existing waypoints
        await unit.panel.inner('R', 1);

        expect(right().slice(0, 3)).toEqual([' BGD00     ', 'FW -ABQ CTR', 'BGD    176°']);
    });

    // A Center waypoint of the plan whose reference VOR is gone from the database (a cartridge change, a deleted user
    // VOR): the second computation still ends in the computed state, with no error, and CTR 2 converts the radial with
    // the variation at the aircraft, the only one left (10 E, so 170). Characterization, #362
    it('characterization: computes with a Center waypoint whose reference VOR is gone from the database (#362)', async () => {
        const unit = await afterInsertionOfFullPlan();
        // Only the lookup of CTR 1 sees BGD gone: other pages that show BGD keep loading it from the database
        const real = unit.props.facilityLoader.tryGetFacility.bind(unit.props.facilityLoader);
        unit.props.facilityLoader.tryGetFacility = (type, icao, flags) =>
            icao.ident.trim() === 'BGD' ? Promise.resolve(null) : real(type, icao, flags);
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(3000);

        expect(right()[0]).toBe(' 0 NEW WPTS');
        await unit.panel.inner('R', 1);
        expect(right().slice(0, 3)).toEqual([' BGD00     ', 'FW -ABQ CTR', 'BGD    170°']);
        expect(unit.errors).toEqual([]);
    });

    // 5-26: leaving the flight plan page on the left and returning to it reverts CTR 1 and CTR 2 to the start state, the
    // format of figure 5-90 on CTR 1; the Center waypoints are seen again only after ENT on CTR 1. The guide shows no
    // CTR 2 page without waypoints, so the literal for it is the code's own empty page (the characterization above).
    // The page instance on the left marks the computation: FPL 1 again is a new instance, so the state is gone
    it('returns CTR 1 and CTR 2 to the start state when the plan page is left and selected again (5-26) (#301)', async () => {
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

    it('returns CTR 1 to the start state when a page other than a plan page was on the left in between (5-26) (#301)', async () => {
        const unit = await computed();
        await unit.panel.inner('R', 1);
        await unit.panel.selectPage('L', 'NAV 1');
        await unit.panel.selectPage('L', 'FPL 1');
        await unit.panel.inner('R', -1); // CTR 1

        expect(right()).toEqual(['           ', '           ', 'PRESS ENT  ', 'TO COMPUTE ', 'CTR WPTS   ', '           ']);
    });

    // Leaving the plan page counts also while neither CTR page is on the screen to see it: FPL 1 selected again is a new
    // page, not the one of the computation (5-26 as above; the same plan index does not keep the state)
    it('returns CTR 1 to the start state when the plan page is left while the right page shows another page (5-26) (#301)', async () => {
        const unit = await computed();
        await unit.panel.selectPage('R', 'REF');
        await unit.panel.selectPage('L', 'FPL 2');
        await unit.panel.selectPage('L', 'FPL 1');
        await unit.panel.selectPage('R', 'CTR 1');

        expect(right()).toEqual(['           ', '           ', 'PRESS ENT  ', 'TO COMPUTE ', 'CTR WPTS   ', '           ']);
    });
});

describe('CTR 2 page after the plan page is left (characterization, #301)', () => {
    // The same revert while CTR 2 stays on the screen (5-26): the page swaps to its empty layout at once. The literal
    // for the empty page is the code's own (the guide shows none)
    it('shows the empty page at once when the plan page is left with CTR 2 on the screen (characterization, #301)', async () => {
        const unit = await computed();
        await unit.panel.inner('R', 1);
        expect(right()[0]).toBe(' BGD00  new'); // Precondition: CTR 2 shows the first waypoint

        await unit.panel.selectPage('L', 'FPL 2');

        expect(right()).toEqual(['           ', '           ', 'NO CTR     ', 'WAYPOINTS  ', '           ', '           ']);
    });

    // The empty page is a single page again: with the second waypoint page shown, the page count and the page number go
    // back too. Characterization, as the empty page itself (the guide shows none)
    it('shows the empty page as a single page when the plan page is left on the second waypoint page (characterization, #301)', async () => {
        const unit = await computed();
        await unit.panel.inner('R', 1);
        await unit.panel.inner('R', 1);
        expect(right()[0]).toBe(' GCK00  new'); // Precondition: the second of two pages
        expect(Screen.read().status().right).toBe('CTR+2');

        await unit.panel.selectPage('L', 'FPL 2');

        expect(right()).toEqual(['           ', '           ', 'NO CTR     ', 'WAYPOINTS  ', '           ', '           ']);
        await vi.advanceTimersByTimeAsync(1000); // the status line follows the page one display tick later
        expect(Screen.read().status().right).toBe('CTR 2');
        await unit.panel.inner('R', -1); // the knob leaves CTR 2 and does not step to a page before it
        expect(Screen.read().status().right).toBe('CTR 1');
    });

    // A page that is not a plan page on the left clears the computation as well (5-26: the computation belongs to the
    // plan page that is shown). Selecting the plan page again offers the computation anew (5-26). The empty CTR 2 page
    // while the left page shows another page is the code's own (characterization)
    it('characterization: shows the empty CTR 2 page while a page other than a plan page is on the left (#301)', async () => {
        const unit = await computed();
        await unit.panel.inner('R', 1);

        await unit.panel.selectPage('L', 'NAV 1');

        expect(right()).toEqual(['           ', '           ', 'NO CTR     ', 'WAYPOINTS  ', '           ', '           ']);
    });

    // The AVsoftech trainer keeps the computation when only the right page is turned away and back
    it('keeps the computation when only the right page is turned away and back (characterization, #301)', async () => {
        const unit = await computed();
        await unit.panel.selectPage('R', 'REF');
        await unit.panel.selectPage('R', 'CTR 1');

        expect(right()[0]).toBe(' 2 NEW WPTS');
    });
});
