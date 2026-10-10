import {describe, expect, it, vi} from 'vitest';
import {Facility, FixTypeFlags, ICAO, VorType} from '@microsoft/msfs-sdk';
import {BootOptions, bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {insertLeg} from '../../../harness/flightplan';
import {approachWorld, dtWorld, sidStarWorld} from '../../../harness/fixtures';
import {pointFrom} from '../../../harness/flight/geo';
import {airport, intersection, ndb, vor} from '../../../harness/navdata/builders';
import {approach, Leg, withProcedures} from '../../../harness/navdata/procedures';
import {readRows, Screen} from '../../../harness/render/screen';
import {savedFlightplan, savedUserWaypoints} from '../../../harness/storage';
import {collectStatusMessages} from '../../../harness/statusLine';
import {fplIdents} from '../../../harness/readers';
import {KLNLegType} from '../../../../kln90b/data/flightplan/Flightplan';

describe('ACT page', () => {
    // 4-10: the ACT page shows the active waypoint, or tells that there is none. 4-10 does not describe the state without
    // an active waypoint: the text NO ACTIVE WAYPOINT is the code's own reference, a video of a real unit
    // (https://youtu.be/Q6m7_CVGPCg?t=19, cited in ActPage.tsx)
    it('refreshes when the flight plan gets an active waypoint (f95d1d7)', async () => {
        const kaaa = airport('KAAA', 47.0, 7.9);
        const kbbb = airport('KBBB', 47.0, 8.3);
        const unit = await bootUnit({facilities: [kaaa, kbbb], position: {lat: 47.0, lon: 8.0}});
        await unit.panel.selectPage('R', 'ACT  ');
        const before = Screen.read().rows('R');
        expect(before[2]).toBe('NO ACTIVE  ');
        expect(before[4]).toBe('WAYPOINT   ');

        insertLeg(unit, 0, kaaa);
        insertLeg(unit, 1, kbbb);
        await vi.advanceTimersByTimeAsync(3000);

        const screen = Screen.read();
        const rows = screen.rows('R');
        expect(rows.join('\n')).not.toContain('NO ACTIVE');
        // The arrow, then the position in the flight plan, the ident and the type of the waypoint
        expect(rows[0].slice(1, 11)).toBe(' 2 KBBB  A');
        expect(screen.status().right).toBe('ACT 1');
    });

    // 4-10: the page follows the active waypoint without a page change. NO ACTIVE WAYPOINT for an empty plan is the video
    // of the code's reference (https://youtu.be/Q6m7_CVGPCg?t=19), see the test above
    it('follows the active waypoint when the flight plan changes, and shows NO ACTIVE when there is none (f95d1d7)', async () => {
        const kaaa = airport('KAAA', 47.0, 7.9);
        const kbbb = airport('KBBB', 47.0, 8.3);
        const kccc = airport('KCCC', 47.0, 8.5);
        const unit = await bootUnit({facilities: [kaaa, kbbb, kccc], position: {lat: 47.0, lon: 8.0}});
        await unit.panel.selectPage('R', 'ACT  ');
        insertLeg(unit, 0, kaaa);
        insertLeg(unit, 1, kbbb);
        await vi.advanceTimersByTimeAsync(3000);
        expect(Screen.read().rows('R')[0].slice(1, 11)).toBe(' 2 KBBB  A');

        // A leg in front of the active one moves it to position 3
        insertLeg(unit, 0, kccc);
        await vi.advanceTimersByTimeAsync(3000);
        expect(Screen.read().rows('R')[0].slice(1, 11)).toBe(' 3 KBBB  A');

        // Deleting the active leg makes KAAA the active waypoint
        unit.props.memory.fplPage.flightplans[0].deleteLeg(2);
        await vi.advanceTimersByTimeAsync(3000);
        expect(Screen.read().rows('R')[0].slice(1, 11)).toBe(' 2 KAAA  A');

        // Without legs there is no active waypoint
        const fpl0 = unit.props.memory.fplPage.flightplans[0];
        while (fpl0.getLegs().length > 0) {
            fpl0.deleteLeg(0);
        }
        await vi.advanceTimersByTimeAsync(3000);
        const rows = Screen.read().rows('R');
        expect(rows[2]).toBe('NO ACTIVE  ');
        expect(rows[4]).toBe('WAYPOINT   ');
    });

    // 4-10: the type letter is on the right of the first row
    it.fails('shows the type letter of an NDB inside the half page (#115)', async () => {
        const kaaa = airport('KAAA', 47.0, 7.9);
        const abc = ndb('ABC', 47.0, 8.3);
        const unit = await bootUnit({facilities: [kaaa, abc], position: {lat: 47.0, lon: 8.0}});
        await unit.panel.selectPage('R', 'ACT  ');
        insertLeg(unit, 0, kaaa);
        insertLeg(unit, 1, abc);
        await vi.advanceTimersByTimeAsync(3000);

        // Not Screen.read(): it refuses the type letter past the 11 columns of the half page, which is this bug (#115), so
        // the pin reads the rows of the DOM
        const first = readRows(document.querySelector('.right-page')!).map(r => r.map(c => c.ch).join(''))[0];
        expect(first.length).toBeLessThanOrEqual(11);
        expect(first.trimEnd().endsWith('N')).toBe(true);
    });
});

// A plan along 10 E, dtWorld(): the airport KAAA, the VOR ABC, the intersection DEF and the airport KBBB, half a degree
// apart. Booted 0.1 degree north of KAAA, the leg KAAA to ABC is active, so ABC is waypoint 2 of FPL 0.

/** Boots with FPL 0 stored, lets FPL 0 activate and selects the ACT page */
async function bootOnAct(legs: Facility[], facilities: Facility[], extra: Partial<BootOptions> = {}): Promise<HeadlessUnit> {
    const unit = await bootUnit({facilities, position: {lat: 47.1, lon: 10.0}, storage: savedFlightplan(0, legs), ...extra});
    await settle(unit);
    await unit.panel.selectPage('R', 'ACT');
    return unit;
}

describe('ACT page (characterization)', () => {
    it('shows the VOR page of the active waypoint', async () => {
        const {kaaa, abc, def, kbbb} = dtWorld();
        const unit = await bootOnAct([kaaa, abc, def, kbbb], [kaaa, abc, def, kbbb]);

        expect(unit.errors).toEqual([]);
        expect(Screen.read().status().right).toBe('ACT');
        expect(Screen.read().rows('R')).toMatchInlineSnapshot(`
          [
            "› 2 ABC D V",
            "ABC        ",
            "          H",
            "114.30  0°E",
            "N 47°30.00'",
            "E 10°00.00'",
          ]
        `);
    });

    // The guide does not say what happens at the ends of the plan. The code stops there
    it('stops at the first waypoint of the plan', async () => {
        const {kaaa, abc, def, kbbb} = dtWorld();
        const unit = await bootOnAct([kaaa, abc, def, kbbb], [kaaa, abc, def, kbbb]);
        await unit.panel.scan();

        await unit.panel.inner('R', -3);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('R')[0]).toBe('  1 KAAA  A');
    });
});

describe('ACT page, the first row (4-10)', () => {
    // 4-10, figure 4-37: arrow, position in FPL 0, ident, D for a VOR with DME, then the type letter V
    it('shows D V for a VOR with DME', async () => {
        const {kaaa, abc} = dtWorld();
        await bootOnAct([kaaa, abc], [kaaa, abc]);

        expect(Screen.read().rows('R')[0]).toBe('› 2 ABC D V');
    });

    // 4-10: the D is shown only for VORs with DME
    it('shows V without the D for a VOR without DME', async () => {
        const {kaaa} = dtWorld();
        const abc = vor('ABC', 47.5, 10.0, {type: VorType.VOR});
        await bootOnAct([kaaa, abc], [kaaa, abc]);

        expect(Screen.read().rows('R')[0]).toBe('› 2 ABC   V');
    });

    // 4-10: S for a supplemental waypoint. The column of the letter is the subject of the #290 pins below, so this
    // test holds only the order: the ident, then the letter
    it('shows S for a supplemental waypoint', async () => {
        const {kaaa} = dtWorld();
        const supa = {icaoStruct: ICAO.value('U', 'XX', '', 'SUPA')} as Facility; // the stored user waypoint, for the plan
        await bootOnAct([kaaa, supa], [kaaa], {
            storage: {
                ...savedFlightplan(0, [kaaa, supa]),
                ...savedUserWaypoints([{kind: 'sup', ident: 'SUPA', lat: 47.5, lon: 10.0}]),
            },
        });

        const first = Screen.read().rows('R')[0];
        expect(first.slice(0, 9)).toBe('› 2 SUPA ');
        expect(first.slice(9).trim()).toBe('S');
    });

    // 4-10 and 6-5: T for a terminal waypoint (a waypoint that belongs to an airport)
    it('shows T for a terminal waypoint', async () => {
        const {kaaa} = dtWorld();
        const base = intersection('TERMA', 47.5, 10.0);
        const terma = {...base, icaoStruct: ICAO.value('W', base.region, 'KAAA', 'TERMA')} as typeof base;
        await bootOnAct([kaaa, terma], [kaaa, terma]);

        expect(Screen.read().rows('R')[0]).toBe('› 2 TERMA T');
    });

    // 4-10: the number is the waypoint's position in the active flight plan; a Direct To waypoint outside FPL 0 has none.
    // A photo of a real unit (reference-photos-index.md, 2M2-appch-select.webp: ACT 8 during a Direct To) shows the arrow
    // and the ident with no number between them
    it('shows no number for a Direct To waypoint outside the flight plan', async () => {
        const {kaaa, abc} = dtWorld();
        const kccc = airport('KCCC', 47.1, 10.5);
        const unit = await bootOnAct([kaaa, abc], [kaaa, abc, kccc]);
        await unit.panel.directTo('KCCC', {waitMs: 2000});
        await unit.panel.selectPage('R', 'ACT');

        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(-1); // precondition: outside FPL 0
        expect(Screen.read().rows('R')[0]).toBe('›   KCCC  A');
    });

    // 4-10: the letter stands to the far right (figures 4-37 and 4-38 show A and V in the last column), and the KLN 89
    // trainer, 2026-10-07 (medium confidence) puts U and I in the same fixed column for a 3-letter and a 5-letter
    // ident. The code puts the I of an intersection one blank after the ident, so a 3-letter ident leaves it in the
    // middle of the row. The cause is #290: the ident selector has five cells, and the blank cells of a short ident
    // have index -1 and no width, so the letter moves up to the ident
    it.fails('shows the type letter of an intersection in the last column (4-10, the KLN 89 trainer, 2026-10-07, #290)', async () => {
        const {kaaa, abc, def, kbbb} = dtWorld();
        const unit = await bootOnAct([kaaa, abc, def, kbbb], [kaaa, abc, def, kbbb]);
        await unit.panel.scan();

        await unit.panel.inner('R', 1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('R')[0]).toBe('  3 DEF   I');
    });

    it.fails('shows the type letter of a supplemental waypoint in the last column (4-10, the KLN 89 trainer, 2026-10-07, #290)', async () => {
        const {kaaa} = dtWorld();
        const supa = {icaoStruct: ICAO.value('U', 'XX', '', 'SUPA')} as Facility;
        await bootOnAct([kaaa, supa], [kaaa], {
            storage: {
                ...savedFlightplan(0, [kaaa, supa]),
                ...savedUserWaypoints([{kind: 'sup', ident: 'SUPA', lat: 47.5, lon: 10.0}]),
            },
        });

        expect(Screen.read().rows('R')[0]).toBe('› 2 SUPA  S');
    });
});

describe('ACT page, scanning FPL 0 (4-10)', () => {
    // 4-10, figures 4-38 and 4-39: with the knob pulled the inner knob shows the waypoints in their order in FPL 0, the
    // arrow only at the active one; pushed in, it turns the pages of the shown airport (here ACT 2 of KAAA). The column of
    // the I is held by the #290 pin above
    it('scans the plan in order with the knob pulled and turns the airport pages with it pushed in', async () => {
        const {kaaa, abc, def, kbbb} = dtWorld();
        const unit = await bootOnAct([kaaa, abc, def, kbbb], [kaaa, abc, def, kbbb]);
        await unit.panel.scan();

        await unit.panel.inner('R', 1);
        await vi.advanceTimersByTimeAsync(1000);
        const intersectionRow = Screen.read().rows('R')[0];
        expect(intersectionRow.slice(0, 7)).toBe('  3 DEF');
        expect(intersectionRow.slice(7).trim()).toBe('I');

        await unit.panel.inner('R', 1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().rows('R')[0]).toBe('  4 KBBB  A');

        // One click back is one waypoint back, away from the clamp at the first waypoint
        await unit.panel.inner('R', -1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().rows('R')[0].slice(0, 7)).toBe('  3 DEF');

        await unit.panel.inner('R', -3);
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().rows('R')[0]).toBe('  1 KAAA  A');
        expect(Screen.read().status().right).toBe('ACT 1');

        await unit.panel.scan();
        await unit.panel.inner('R', 1);
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().status().right).toBe('ACT 2');
        expect(Screen.read().rows('R')[0]).toBe('  1 KAAA  A');
    });

    // 4-10: the arrow designates the active waypoint, and the KLN 89 trainer, 2026-10-07: with a waypoint twice in
    // the plan and the first copy active, the scan shows the second copy without the arrow. ActiveArrow compares ICAOs, so
    // the second copy gets the arrow as well
    it.fails('shows no arrow at the second copy of the active waypoint (4-10, the KLN 89 trainer, 2026-10-07, #294)', async () => {
        const {kaaa, abc, def} = dtWorld();
        const unit = await bootOnAct([kaaa, abc, def, abc], [kaaa, abc, def]);
        await unit.panel.scan();

        await unit.panel.inner('R', 2);
        await vi.advanceTimersByTimeAsync(1000);

        expect(Screen.read().rows('R')[0]).toBe('  4 ABC D V');
    });
});

describe('ACT page without an active waypoint', () => {
    async function bootWithoutPlan(): Promise<HeadlessUnit> {
        const unit = await bootUnit({facilities: [airport('KAAA', 47.0, 10.0)], position: {lat: 47.1, lon: 10.0}});
        await settle(unit);
        await vi.advanceTimersByTimeAsync(6000); // the boot page is SUP: its own NO SUP WPTS is gone after 5 s (3-10)
        return unit;
    }

    // The setup sibling of the pin below: without a plan the page shows NO ACTIVE WAYPOINT, and the boot has left no
    // message on the status line. 4-10 does not describe the state; the source is the code's reference, a video of a real
    // unit (https://youtu.be/Q6m7_CVGPCg?t=19, cited in ActPage.tsx), as for the f95d1d7 tests above
    it('shows NO ACTIVE WAYPOINT when there is no plan (video of a real unit, youtu.be/Q6m7_CVGPCg)', async () => {
        const unit = await bootWithoutPlan();
        expect(Screen.read().status().mode).toMatch(/^enr-leg/); // precondition: no message left from the boot

        await unit.panel.selectPage('R', 'ACT');

        expect(Screen.read().rows('R')[2]).toBe('NO ACTIVE  ');
        expect(Screen.read().rows('R')[4]).toBe('WAYPOINT   ');
        expect(unit.errors).toEqual([]);
    });

    // C-2: NO SUP WPTS belongs to selecting the SUP page type when there are no supplemental waypoints, and the KLN 89
    // trainer, 2026-10-07: ACT with nothing active shows its text and posts no message. The ACT page builds a
    // SupPage as the placeholder behind NO ACTIVE WAYPOINT, and its constructor posts the message
    it.fails('does not post NO SUP WPTS (C-2, the KLN 89 trainer, 2026-10-07, #293)', async () => {
        const unit = await bootWithoutPlan();
        const messages = collectStatusMessages(unit);

        await unit.panel.selectPage('R', 'ACT');

        expect(Screen.read().rows('R')[2]).toBe('NO ACTIVE  ');
        expect(messages).toEqual([]);
        expect(Screen.read().status().mode).toMatch(/^enr-leg/);
    });
});

/** The ACT page of KPRC (approachWorld(), FPL 0 ENRAA, KPRC), then the inner knob one click back to ACT 8 */
async function bootOnAct8(): Promise<HeadlessUnit> {
    const w = approachWorld();
    const unit = await bootUnit({
        facilities: w.facilities, position: w.north(70), storage: savedFlightplan(0, [w.enraa, w.kprc]),
    });
    await settle(unit);
    await unit.panel.selectPage('R', 'ACT');
    await unit.panel.inner('R', -1);
    return unit;
}

describe('ACT 8 (6-4)', () => {
    /** KPRC of approachWorld() with its RNAV 18 approach given a second IAF, IAFAB, west of IAFAA */
    function twoIafs() {
        const w = approachWorld();
        const at = pointFrom(w.iafaa, 270, 5);
        const iafab = intersection('IAFAB', at.lat, at.lon);
        const rnav18 = approach({
            type: ApproachType.APPROACH_TYPE_RNAV, runway: '18',
            transitions: [
                {name: 'IAFAA', legs: [Leg.IF(w.iafaa, FixTypeFlags.IAF), Leg.TF(w.ifaaa)]},
                {name: 'IAFAB', legs: [Leg.IF(iafab, FixTypeFlags.IAF), Leg.TF(w.ifaaa)]},
            ],
            final: [Leg.IF(w.ifaaa), Leg.TF(w.fafaa, FixTypeFlags.FAF), Leg.TF(w.mapaa, FixTypeFlags.MAP)],
        });
        const kprc = withProcedures(w.kprc, {approaches: [rnav18]});
        return {
            facilities: [kprc, w.enraa, w.iafaa, iafab, w.ifaaa, w.fafaa, w.mapaa], position: w.north(70),
            storage: savedFlightplan(0, [w.enraa, kprc]),
        };
    }

    // 6-4: approaches are selected from APT 8 or from ACT 8 of the airport. With KPRC the active waypoint, ACT 8 is its
    // approach list; ENT on the approach (its one IAF is taken without a question), ENT on LOAD IN FPL loads it in front
    // of KPRC (6-5, step 8)
    it('loads the approach of the active airport into FPL 0', async () => {
        const unit = await bootOnAct8();
        expect(Screen.read().status().right).toBe('ACT 8'); // precondition

        await unit.panel.cursor('R');
        await unit.panel.ent();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        expect(fplIdents(unit)).toEqual(['ENRAA', 'IAFAA', 'IFAAA', 'FAFAA', 'SDFAA', 'MAPAA', 'KPRC']);
        expect(unit.errors).toEqual([]);
    });

    // 6-4 step 5 and figure 6-4: an approach with several IAFs asks for one in a list (ACT 8 as well as APT 8), under the
    // name of the approach, the IAFs numbered from the fifth cell on
    it('lists the IAFs of the approach after ENT on it', async () => {
        const w = twoIafs();
        const unit = await bootUnit(w);
        await settle(unit);
        await unit.panel.selectPage('R', 'ACT');
        await unit.panel.inner('R', -1);
        expect(Screen.read().status().right).toBe('ACT 8'); // precondition

        await unit.panel.cursor('R');
        await unit.panel.ent(); // RNAV 18

        expect(Screen.read().rows('R')).toEqual([
            'R18-KPRC   ',
            'IAF 1 IAFAA',
            '    2 IAFAB',
            '           ',
            '           ',
            '           ',
        ]);
    });

    // A photo of a real unit (reference-photos-index.md, 2M2-appch-select.webp, high confidence) shows ACT 8 with the ACT
    // header in its first row (arrow, ident, type letter A) and the approaches from the second row; figure 4-39 shows the
    // same header on ACT 3. The code shows the APT 8 title (the arrow, the ident and IAP) instead
    it.fails('shows the ACT header in the first row (photo 2M2-appch-select.webp, 4-10, #295)', async () => {
        await bootOnAct8();

        expect(Screen.read().rows('R')[0]).toBe('› 2 KPRC  A');
        expect(Screen.read().rows('R')[1]).toBe(' 1 RNAV 18 ');
    });
});

describe('ACT 8 (characterization)', () => {
    // The approach list under the title row; the title row itself is the subject of the #295 pin
    it('shows the approach list of the active airport', async () => {
        const unit = await bootOnAct8();

        expect(unit.errors).toEqual([]);
        expect(Screen.read().status().right).toBe('ACT 8');
        expect(Screen.read().rows('R').slice(1)).toMatchInlineSnapshot(`
          [
            " 1 RNAV 18 ",
            "           ",
            "           ",
            "           ",
            "           ",
          ]
        `);
    });
});

/** The ACT page of KPRC in sidStarWorld() (the SID DEP1, the STARs ARR1 and ARR2), FPL 0 ENRAA, KPRC with KPRC active */
async function bootOnActWithSidStar(): Promise<HeadlessUnit> {
    const w = sidStarWorld({sids: ['DEP1'], stars: true});
    const [kprc, enraa] = w.facilities;
    const unit = await bootUnit({facilities: w.facilities, position: w.position, storage: savedFlightplan(0, [enraa, kprc])});
    await settle(unit);
    await unit.panel.selectPage('R', 'ACT');
    expect(Screen.read().rows('R')[0]).toBe('› 2 KPRC  A'); // precondition: the ACT page of the active KPRC
    return unit;
}

describe('ACT 7 (characterization)', () => {
    // Backwards from ACT 1 the inner knob passes ACT 8, then the two ACT 7 pages of an airport with SIDs and STARs: the
    // STAR page, then the SID page. Both keep the ACT header row (arrow, position in FPL 0, ident, type letter)
    it('shows the STAR and the SID page of the active airport under the ACT header', async () => {
        const unit = await bootOnActWithSidStar();
        await unit.panel.inner('R', -2);
        const starPage = [Screen.read().status().right, ...Screen.read().rows('R')];
        await unit.panel.inner('R', -1);
        const sidPage = [Screen.read().status().right, ...Screen.read().rows('R')];

        expect(starPage).toEqual(['ACT+7', '› 2 KPRC  A', 'SELECT STAR', ' 1 ARR1    ', ' 2 ARR2    ', '           ', '           ']);
        expect(sidPage).toEqual(['ACT+7', '› 2 KPRC  A', 'SELECT SID ', ' 1 DEP1    ', '           ', '           ', '           ']);
        expect(unit.errors).toEqual([]);
    });

    // The cursor comes on the first SID; ENT on it, the runway 09, the transition TRNAA and LOAD IN FPL put the SID's
    // waypoints after KPRC, which FPL 0 already holds, so no question to add the airport comes. FPL 0 comes up on the
    // left, and the right page stays on ACT 7 of KPRC
    it('loads a SID into FPL 0 after the active airport and stays on ACT 7', async () => {
        const unit = await bootOnActWithSidStar();
        await unit.panel.inner('R', -3);
        expect(Screen.read().rows('R')[1]).toBe('SELECT SID '); // precondition

        await unit.panel.cursor('R');
        await unit.panel.ent(); // DEP1
        await unit.panel.ent(); // runway 09
        await unit.panel.ent(); // transition TRNAA
        await unit.panel.ent(); // LOAD IN FPL
        await vi.advanceTimersByTimeAsync(1000);

        const legs = unit.props.memory.fplPage.flightplans[0].getLegs().map(l => [l.wpt.icaoStruct.ident, l.type]);
        expect(legs).toEqual([
            ['ENRAA', KLNLegType.USER], ['KPRC', KLNLegType.USER],
            ['SIDAA', KLNLegType.SID], ['SIDAB', KLNLegType.SID], ['TRNAA', KLNLegType.SID],
        ]);
        expect(Screen.read().status().left).toBe('FPL 0');
        expect(Screen.read().status().right).toBe('ACT+7');
        expect(Screen.read().rows('R').slice(0, 3)).toEqual(['› 2 KPRC  A', 'SELECT SID ', ' 1 DEP1    ']);
        expect(unit.errors).toEqual([]);
    });
});
