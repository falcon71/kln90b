import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {airport, intersection} from '../../../harness/navdata/builders';
import {standardRoute} from '../../../harness/fixtures';
import {pointFrom} from '../../../harness/flight/geo';
import {Screen} from '../../../harness/render/screen';
import {savedFlightplan, storedSetting} from '../../../harness/storage';
import {activeIdent, fplIdents, messages} from '../../../harness/readers';
import {bootOnStandardRoute} from '../../../harness/worldBoot';
import {Leg, sid, star, withProcedures} from '../../../harness/navdata/procedures';
import {KLNLegType} from '../../../../kln90b/data/flightplan/Flightplan';
import {MainPage} from '../../../../kln90b/pages/MainPage';

// Pilot's Guide 4-4 (adding a waypoint), 4-5 (deleting a waypoint and a plan), C-1 (FPL FULL)
// A full FPL 0 of 30 legs along a line north from 47N 8E, FA00 at the start and 5 NM between the legs
const START = {lat: 47, lon: 8};
const FIXES = Array.from({length: 30}, (_, i) => {
    const p = pointFrom(START, 0, 5 * i);
    return intersection(`FA${String(i).padStart(2, '0')}`, p.lat, p.lon);
});
const knew = airport('KNEW', 48.0, 9.0);

async function bootFull(nmAlong: number) {
    const unit = await bootUnit({
        facilities: [...FIXES, knew], position: pointFrom(START, 0, nmAlong), storage: savedFlightplan(0, FIXES),
    });
    await settle(unit);
    return unit;
}

/** Types KNEW over the row `rowsDown` rows below the first waypoint of FPL 0 and confirms it */
async function typeKnewOver(unit: HeadlessUnit, rowsDown: number) {
    await unit.panel.selectPage('L', 'FPL 0');
    await unit.panel.cursor('L');
    await unit.panel.cursorToTop('L'); // the cursor comes on at the top visible entry (#355)
    expect(unit.panel.focused('L').text.trim()).toBe('FA00'); // The first waypoint
    if (rowsDown > 0) {
        await unit.panel.outer('L', rowsDown);
    }
    // The first inner-knob click asks before it deletes the first waypoint, ENT opens the insert row (#380)
    await unit.panel.inner('L', 1);
    await unit.panel.ent();
    await unit.panel.enterIdent('L', 'KNEW');
    await unit.panel.ent(); // The waypoint page
    await unit.panel.ent();
    await vi.advanceTimersByTimeAsync(1500);
}

describe('the flight plans of a booted unit', () => {
    // 4-1: 25 numbered plans and the active plan, FPL 0 to FPL 25, each at its own index
    it('are 26, numbered 0 to 25, and empty without stored data (4-1)', async () => {
        const unit = await bootUnit();

        const plans = unit.props.memory.fplPage.flightplans;
        expect(plans.map(p => p.idx)).toEqual(Array.from({length: 26}, (_, i) => i));
        expect(plans.every(p => p.getLegs().length === 0)).toBe(true);
    });

    // characterization: when the user waypoints cannot be restored the unit starts with 26 empty plans, even though the
    // stored plan is fine (the failed restore then wipes the stored data too, #144). USER DATA LOST is posted
    it('are 26 empty plans when the user waypoints cannot be restored (characterization)', async () => {
        const {kaaa, abc, kbbb} = standardRoute();
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb], position: {lat: 47.0, lon: 8.0},
            storage: {...savedFlightplan(0, [kaaa, abc, kbbb]), wpt0: 'garbage'},
        });

        const plans = unit.props.memory.fplPage.flightplans;
        expect(plans).toHaveLength(26);
        expect(plans[0].getLegs()).toEqual([]);
        expect(messages(unit)).toContain('USER DATA LOST');
    });
});

describe('the flight plans of a booted unit after a failed plan restore', () => {
    // characterization: a stored plan that cannot be read (a number where the V2 format has a string) makes
    // restoreAllFlightplan throw, and the unit starts with 26 empty plans (the catch in KLN90BCore.init)
    it('are 26 empty plans when a stored plan cannot be read (characterization)', async () => {
        const unit = await bootUnit({storage: {userDataFormat: 2, fpl3: 5}});

        const plans = unit.props.memory.fplPage.flightplans;
        expect(plans.map(p => p.idx)).toEqual(Array.from({length: 26}, (_, i) => i));
        expect(plans.every(p => p.getLegs().length === 0)).toBe(true);
        expect(messages(unit)).toContain('USER DATA LOST');
    });
});

describe('adding a waypoint to a full FPL 0', () => {
    // C-1: FPL FULL when the 30th waypoint is taken and the first waypoint is part of the active leg
    it('answers FPL FULL and leaves the plan alone while the first leg is active (C-1)', async () => {
        const unit = await bootFull(2); // On the leg FA00 to FA01
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(1); // Precondition

        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        for (let i = 0; unit.panel.focused('L').text.replace(/[_ ]/g, '') !== '' && i < 40; i++) {
            await unit.panel.outer('L', 1); // The blank slot behind the 30th waypoint
        }
        await unit.panel.enterIdent('L', 'KNEW');
        await unit.panel.ent();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1500);

        expect(Screen.read().status().mode).toBe('FPL FULL');
        expect(fplIdents(unit)).toEqual(FIXES.map(f => f.icaoStruct.ident));
        expect(unit.errors).toEqual([]);
    });

    // C-1 names only the refusal. That the first waypoint makes room otherwise is the unit's rule (FlightplanUtils.ts)
    it('drops the first leg to append once the first leg is no longer active (characterization)', async () => {
        const unit = await bootFull(100);
        expect(unit.props.memory.navPage.activeWaypoint.getActiveFplIdx()).toBe(21); // Precondition

        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        for (let i = 0; unit.panel.focused('L').text.replace(/[_ ]/g, '') !== '' && i < 40; i++) {
            await unit.panel.outer('L', 1);
        }
        // The first inner-knob click asks before it deletes the first waypoint, ENT opens the entry (#380)
        await unit.panel.inner('L', 1);
        await unit.panel.ent();
        await unit.panel.enterIdent('L', 'KNEW');
        await unit.panel.ent();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1500);

        const idents = fplIdents(unit);
        expect(idents).toHaveLength(30);
        expect(idents[0]).toBe('FA01');
        expect(idents[29]).toBe('KNEW');
        // The active waypoint does not change (it moves up by one place)
        expect(activeIdent(unit)).toBe('FA21');
    });

    // 4-4: typed over a row, the new waypoint goes in front of the one that was there
    it('puts a waypoint typed over the second row in front of it (4-4)', async () => {
        const unit = await bootFull(100);

        await typeKnewOver(unit, 1);

        expect(fplIdents(unit).slice(0, 3)).toEqual(['KNEW', 'FA01', 'FA02']);
    });

    // characterization: the Pilot's Guide names no rule for a full plan beyond the refusal (C-1), the unit drops the
    // first leg to make room
    it('keeps a full plan at 30 legs by dropping the first leg (characterization)', async () => {
        const unit = await bootFull(100);

        await typeKnewOver(unit, 1);

        const idents = fplIdents(unit);
        expect(idents).toHaveLength(30);
        expect(idents).not.toContain('FA00');
        expect(idents[29]).toBe('FA29');
    });

    // 4-4: a waypoint typed over the first row goes in front of the first waypoint. The first waypoint makes room and
    // the index follows it (#148)
    it('puts a waypoint typed over the first row first (4-4, #148)', async () => {
        const unit = await bootFull(100);

        await typeKnewOver(unit, 0);

        expect(fplIdents(unit).slice(0, 3)).toEqual(['KNEW', 'FA01', 'FA02']);
        expect(fplIdents(unit)[29]).toBe('FA29');
    });

    const leftRows = () => Screen.read().half('L').split('\n').map(r => r.trimEnd());

    /** A full FPL 0, the aircraft 100 NM along it (active leg 21), the cursor on FA01, one inner-knob click */
    async function clickInFrontOfSecondWaypoint() {
        const unit = await bootFull(100);
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.cursorToTop('L');
        await unit.panel.outer('L', 1); // FA01
        await unit.panel.inner('L', 1);
        return unit;
    }

    // The KLN 89 asks on the first inner-knob click, before any ident, and deletes nothing yet (checked in the KLN 89
    // trainer, 2026-10-15)
    it('asks before it deletes a waypoint on the first inner-knob click (checked in the KLN 89 trainer, 2026-10-15, #380)', async () => {
        const unit = await clickInFrontOfSecondWaypoint();

        expect(fplIdents(unit)).toEqual(FIXES.map(f => f.icaoStruct.ident));
        expect(leftRows()[5]).toBe('CONTINUE?');
    });

    // The 90B wording follows the AVsoftech trainer
    it('shows DELETING WPT 1 TO MAKE ROOM IN FLIGHTPLAN- CONTINUE? (characterization, #380)', async () => {
        await clickInFrontOfSecondWaypoint();

        expect(leftRows()).toEqual(['DELETING', 'WPT   1', 'TO MAKE', 'ROOM IN', 'FLIGHTPLAN-', 'CONTINUE?']);
    });

    it('deletes waypoint 1 on ENT and opens the insert row in front of the same waypoint (checked in the KLN 89 trainer, 2026-10-15, #380)', async () => {
        const unit = await clickInFrontOfSecondWaypoint();
        await unit.panel.ent();

        expect(fplIdents(unit)[0]).toBe('FA01');
        expect(fplIdents(unit)).toHaveLength(29);
        // the insert row is open above FA01, under the cursor with the A of the clockwise click (#311)
        expect(unit.panel.focused('L')).toMatchObject({row: 0, text: 'A    '});
        expect(leftRows()[1]).toBe('  2:FA01');
        // type the rest of the ident and approve
        await unit.panel.enterIdent('L', 'KNEW');
        await unit.panel.ent();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1500);
        expect(fplIdents(unit).slice(0, 2)).toEqual(['KNEW', 'FA01']);
        expect(fplIdents(unit)).toHaveLength(30);
    });

    // ENT deletes the waypoint the insert was to go in front of: as the waypoint typed over the first row (#148), the
    // insert row opens in front of the new first waypoint, an A from the clockwise click (#311)
    it('opens the insert row in front of the new first waypoint when ENT deletes the one under the cursor (characterization, #148, #380)', async () => {
        const unit = await bootFull(100);
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.cursorToTop('L'); // FA00
        await unit.panel.inner('L', 1);
        await unit.panel.ent();

        expect(unit.errors).toEqual([]);
        expect(fplIdents(unit)).toEqual(FIXES.slice(1).map(f => f.icaoStruct.ident));
        expect(leftRows().slice(0, 2)).toEqual(['  1:A', '  2:FA01']);
        expect(unit.panel.focused('L').row).toBe(0);
    });

    it('cancels with CLR and leaves FPL 0 unchanged (checked in the KLN 89 trainer, 2026-10-15, #380)', async () => {
        const unit = await clickInFrontOfSecondWaypoint();
        await unit.panel.clr();

        expect(fplIdents(unit)).toEqual(FIXES.map(f => f.icaoStruct.ident));
    });

    // Checked in the KLN 89 trainer, 2026-10-23: CLR and CRSR cancel the question alike, the cursor stays on the waypoint
    // where the insert was tried (#385)
    it('keeps the left cursor on the waypoint after CLR on the question (checked in the KLN 89 trainer, 2026-10-23, #385)', async () => {
        const unit = await clickInFrontOfSecondWaypoint();
        await unit.panel.clr();

        expect(unit.panel.focused('L').text.trim()).toBe('FA01');
        expect(fplIdents(unit)).toEqual(FIXES.map(f => f.icaoStruct.ident));
    });

    it('cancels on CRSR as on CLR, with the cursor on the waypoint (checked in the KLN 89 trainer, 2026-10-23, #385)', async () => {
        const unit = await clickInFrontOfSecondWaypoint();
        await unit.panel.cursor('L');

        expect(leftRows()[5]).not.toBe('CONTINUE?');
        expect(unit.panel.focused('L').text.trim()).toBe('FA01');
        expect(fplIdents(unit)).toEqual(FIXES.map(f => f.icaoStruct.ident));
        await unit.panel.outer('L', 1); // the cursor is live
        expect(unit.panel.focused('L').text.trim()).toBe('FA02');
    });

    it.each([['outer', -1], ['outer', 1], ['inner', -1], ['inner', 1]] as const)(
        'ignores the %s knob (%i) while the question shows (checked in the KLN 89 trainer, 2026-10-23, #385)', async (knob, clicks) => {
        const unit = await clickInFrontOfSecondWaypoint();
        const leftPage = () => (unit.props.pageManager.getCurrentPage() as MainPage).getLeftPage();
        const question = leftPage();
        await unit.panel[knob]('L', clicks);

        // The same question: one that was closed and asked again by the knob on the FPL page would look alike
        expect(leftPage()).toBe(question);
        expect(leftRows()).toEqual(['DELETING', 'WPT   1', 'TO MAKE', 'ROOM IN', 'FLIGHTPLAN-', 'CONTINUE?']);
        expect(fplIdents(unit)).toEqual(FIXES.map(f => f.icaoStruct.ident));
    });

    it('asks at the blank position after the 30th waypoint as well (checked in the KLN 89 trainer, 2026-10-15, #380)', async () => {
        const unit = await bootFull(100);
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        for (let i = 0; unit.panel.focused('L').text.replace(/[_ ]/g, '') !== '' && i < 40; i++) {
            await unit.panel.outer('L', 1);
        }
        await unit.panel.inner('L', 1);

        expect(leftRows()[5]).toBe('CONTINUE?');
        expect(fplIdents(unit)).toHaveLength(30);
    });

    // The PC keyboard is the simulator's own input. A typed key opens an insert row as the inner knob does, so it asks
    // the same, and the key is typed once room is made
    it('asks before a key typed on the PC keyboard adds a waypoint (characterization, #380)', async () => {
        const unit = await bootFull(100);
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.cursorToTop('L');
        await unit.panel.outer('L', 1); // FA01
        await unit.panel.type('L', 'K');

        expect(leftRows()[5]).toBe('CONTINUE?');
        expect(fplIdents(unit)).toEqual(FIXES.map(f => f.icaoStruct.ident));

        await unit.panel.ent();
        await unit.panel.type('L', 'NEW');
        await unit.panel.ent();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1500);
        expect(fplIdents(unit).slice(0, 2)).toEqual(['KNEW', 'FA01']);
        expect(fplIdents(unit)).toHaveLength(30);
    });

    // 3-15: ENT on an empty position takes the waypoint of the waypoint page on the right. That ENT adds a waypoint as
    // the inner knob does, so it asks the same (characterization)
    it('asks before ENT adds the waypoint of the right page (characterization, #380)', async () => {
        const unit = await bootFull(100);
        await unit.panel.selectPage('R', 'APT 1');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'KNEW');
        await unit.panel.ent();
        await unit.panel.cursor('R'); // off, APT 1 shows KNEW
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.cursorToTop('L');
        await unit.panel.outer('L', 1); // FA01
        await unit.panel.ent();

        expect(leftRows()[5]).toBe('CONTINUE?');
        expect(fplIdents(unit)).toEqual(FIXES.map(f => f.icaoStruct.ident));

        await unit.panel.ent(); // CONTINUE?: KNEW waits for its approval in front of FA01
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1500);
        expect(fplIdents(unit).slice(0, 2)).toEqual(['KNEW', 'FA01']);
        expect(fplIdents(unit)).toHaveLength(30);
    });

    /** A full FPL 0 (active leg 21), the cursor on FA01, ENT while the right side shows no waypoint page */
    async function entWithoutWaypointOnTheRight() {
        const unit = await bootFull(100);
        await unit.panel.selectPage('R', 'NAV 2');
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.cursorToTop('L');
        await unit.panel.outer('L', 1); // FA01
        await unit.panel.ent();
        return unit;
    }

    // An ENT that takes no waypoint adds none, so it deletes none and does not ask; the empty row it opens in front of
    // FA01 stays as before #380
    it('does not ask on an ENT that adds no waypoint (characterization, #380)', async () => {
        const unit = await entWithoutWaypointOnTheRight();

        expect(leftRows()[5]).not.toBe('CONTINUE?');
        expect(leftRows()[0]).toBe('  1:FA00');
        expect(fplIdents(unit)).toEqual(FIXES.map(f => f.icaoStruct.ident));
    });

    // The inner knob on that empty row opens its entry, which asks; the row goes in front of FA01, where it was
    it('asks on the inner knob on the empty row such an ENT opened and inserts in front of the same waypoint (characterization, #380)', async () => {
        const unit = await entWithoutWaypointOnTheRight();
        await unit.panel.inner('L', 1);

        expect(leftRows()[5]).toBe('CONTINUE?');
        expect(fplIdents(unit)).toEqual(FIXES.map(f => f.icaoStruct.ident));

        await unit.panel.ent();
        await unit.panel.enterIdent('L', 'KNEW');
        await unit.panel.ent();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1500);
        expect(fplIdents(unit).slice(0, 2)).toEqual(['KNEW', 'FA01']);
        expect(fplIdents(unit)).toHaveLength(30);
    });

    // After an ENT that opened an empty row in front of FA01, a cancel removes the row; the cursor is on FA01, where the row was
    it('removes the empty row and keeps the cursor on the waypoint after CRSR (characterization, #385)', async () => {
        const unit = await entWithoutWaypointOnTheRight();
        await unit.panel.inner('L', 1); // the question
        await unit.panel.cursor('L');

        expect(leftRows().slice(0, 2)).toEqual(['  1:FA00', '  2:FA01']);
        expect(unit.panel.focused('L').text.trim()).toBe('FA01');
    });
});

// FPL 0 with 30 en-route waypoints and a SID: KPRC, the SID legs SIDAA and SIDAB, then 29 fillers (the SID was loaded
// into a plan of 30 fillers, whose first one made room for KPRC). A leg inserted in front of a SID waypoint is a SID leg
// (createLeg copies the type), which counts only toward the total of 45 (#221)
describe('adding a waypoint in front of a SID waypoint of a full FPL 0', () => {
    async function bootWithSid() {
        const kprcBase = airport('KPRC', 47.0, 8.0);
        const east = (nm: number) => pointFrom(kprcBase, 90, nm);
        const sidaa = intersection('SIDAA', east(8).lat, east(8).lon);
        const sidab = intersection('SIDAB', east(20).lat, east(20).lon);
        const kprc = withProcedures(kprcBase, {
            approaches: [],
            departures: [sid('DEP1', {runways: [{runway: '09', legs: [Leg.CA(90), Leg.DF(sidaa)]}], common: [Leg.TF(sidab)]})],
        });
        const fillers = Array.from({length: 30}, (_, i) => intersection(`FL${String(i).padStart(2, '0')}`, 46.5, 7.0 + 0.02 * i));
        const unit = await bootUnit({
            facilities: [kprc, sidaa, sidab, ...fillers], position: {lat: 46.5, lon: 7.12},
            storage: savedFlightplan(0, fillers),
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 7', {ident: 'KPRC'});
        await unit.panel.cursor('R');
        await unit.panel.ent(); // APPROVE?
        await vi.advanceTimersByTimeAsync(1000);
        await unit.panel.ent(); // CONTINUE? (#222)
        await vi.advanceTimersByTimeAsync(1000);
        // Preconditions: 30 en-route waypoints and the two SID legs
        const legs = unit.props.memory.fplPage.flightplans[0].getLegs();
        expect(legs.filter(l => l.type === KLNLegType.USER)).toHaveLength(30);
        expect(legs.slice(0, 3).map(l => [l.wpt.icaoStruct.ident, l.type])).toEqual([
            ['KPRC', KLNLegType.USER], ['SIDAA', KLNLegType.SID], ['SIDAB', KLNLegType.SID],
        ]);
        return unit;
    }

    it('opens the insert row in front of SIDAA without asking (characterization, #221, #380)', async () => {
        const unit = await bootWithSid();
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.cursorToTop('L');
        for (let i = 0; unit.panel.focused('L').text.trim() !== 'SIDAA' && i < 5; i++) {
            await unit.panel.outer('L', 1); // over the SID header to SIDAA
        }
        expect(unit.panel.focused('L').text.trim()).toBe('SIDAA'); // Precondition
        await unit.panel.inner('L', 1);

        expect(unit.panel.focused('L').text).toBe('A    ');
        expect(unit.props.memory.fplPage.flightplans[0].getLegs()).toHaveLength(32);
    });

    it('asks in front of the first filler, an en-route waypoint (characterization, #221, #380)', async () => {
        const unit = await bootWithSid();
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.cursorToTop('L');
        for (let i = 0; unit.panel.focused('L').text.trim() !== 'FL01' && i < 6; i++) {
            await unit.panel.outer('L', 1);
        }
        expect(unit.panel.focused('L').text.trim()).toBe('FL01'); // Precondition
        await unit.panel.inner('L', 1);

        expect(unit.panel.focused('L').text).toBe('CONTINUE?');
        expect(unit.props.memory.fplPage.flightplans[0].getLegs()).toHaveLength(32);
    });
});

// FPL 0 of 45 legs: KPRC, the SID DEP1 (SD01 to SD15), then FL01 to FL29. ENT on SD01 opens an empty SID row in front of
// it; the room for a SID leg is made by deleting KPRC, which takes its SID legs (#148). The row the insert was tried at
// then belongs to no procedure in the plan any more and is remade as an en-route row (#386)
describe('adding a waypoint in front of the first SID waypoint of an FPL 0 of 45 legs', () => {
    const fpl0Legs = (unit: HeadlessUnit) => unit.props.memory.fplPage.flightplans[0].getLegs();
    const leftRows = () => Screen.read().half('L').split('\n').map(r => r.trimEnd());

    async function bootWith45Legs() {
        const kprcBase = airport('KPRC', 47.0, 8.0);
        const sidFixes = Array.from({length: 15}, (_, i) => {
            const p = pointFrom(kprcBase, 90, 5 * (i + 1));
            return intersection(`SD${String(i + 1).padStart(2, '0')}`, p.lat, p.lon);
        });
        const kprc = withProcedures(kprcBase, {
            approaches: [],
            departures: [sid('DEP1', {common: sidFixes.map((f, i) => i === 0 ? Leg.IF(f) : Leg.TF(f))})],
        });
        const fillers = Array.from({length: 30}, (_, i) => intersection(`FL${String(i).padStart(2, '0')}`, 46.5, 7.0 + 0.02 * i));
        const unit = await bootUnit({
            facilities: [kprc, knew, ...sidFixes, ...fillers], position: {lat: 46.5, lon: 7.12},
            storage: savedFlightplan(0, fillers),
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 7', {ident: 'KPRC'});
        await unit.panel.cursor('R');
        await unit.panel.ent(); // APPROVE?
        await vi.advanceTimersByTimeAsync(1000);
        await unit.panel.ent(); // CONTINUE? (#222)
        await vi.advanceTimersByTimeAsync(1000);
        // Preconditions: 45 legs, 30 of them en-route, KPRC in front of the SID
        const legs = fpl0Legs(unit);
        expect(legs).toHaveLength(45);
        expect(legs.filter(l => l.type === KLNLegType.USER)).toHaveLength(30);
        expect(legs.slice(0, 2).map(l => [l.wpt.icaoStruct.ident, l.type])).toEqual([
            ['KPRC', KLNLegType.USER], ['SD01', KLNLegType.SID],
        ]);
        return unit;
    }

    /** ENT on SD01 while the right side shows no waypoint page opens an empty SID row; the inner knob asks, ENT deletes */
    async function insertInFrontOfFirstSidWaypoint() {
        const unit = await bootWith45Legs();
        await unit.panel.selectPage('R', 'NAV 2');
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.cursorToTop('L'); // the cursor comes on at the top visible entry (#355)
        await unit.panel.cursorTo('L', 'SD01');
        await unit.panel.ent(); // an empty SID row in front of SD01
        await unit.panel.inner('L', 1); // the question
        expect(leftRows()[5]).toBe('CONTINUE?'); // Precondition
        await unit.panel.ent();
        return unit;
    }

    it('adds the waypoint as an en-route waypoint once the SID went with its airport (#148, #386)', async () => {
        const unit = await insertInFrontOfFirstSidWaypoint();
        await unit.panel.enterIdent('L', 'KNEW');
        await unit.panel.ent();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1500);

        const legs = fpl0Legs(unit);
        expect(legs.slice(0, 2).map(l => [l.wpt.icaoStruct.ident, l.type])).toEqual([['KNEW', KLNLegType.USER], ['FL01', KLNLegType.USER]]);
        expect(legs).toHaveLength(30);
        expect(legs.filter(l => l.type === KLNLegType.SID)).toEqual([]);
        expect(legs[0].procedure).toBeUndefined();
        expect(unit.errors).toEqual([]);
    });

    it('shows no SID header over the open insert row (#386)', async () => {
        await insertInFrontOfFirstSidWaypoint();

        expect(leftRows().slice(0, 2)).toEqual(['  1:A', '  2:FL01']);
    });
});

// KPRC with the SID DEP1 (SD01 on, east) and the STAR ARR1 (ST01 to ST08, west); fillers along 46.5N
function kprcWithSidAndStar(sidLength: number, fillerCount: number) {
    const kprcBase = airport('KPRC', 47.0, 8.0);
    const sidFixes = Array.from({length: sidLength}, (_, i) => {
        const p = pointFrom(kprcBase, 90, 5 * (i + 1));
        return intersection(`SD${String(i + 1).padStart(2, '0')}`, p.lat, p.lon);
    });
    const starFixes = Array.from({length: 8}, (_, i) => {
        const p = pointFrom(kprcBase, 270, 5 * (8 - i));
        return intersection(`ST${String(i + 1).padStart(2, '0')}`, p.lat, p.lon);
    });
    const kprc = withProcedures(kprcBase, {
        approaches: [],
        departures: [sid('DEP1', {common: sidFixes.map((f, i) => i === 0 ? Leg.IF(f) : Leg.TF(f))})],
        arrivals: [star('ARR1', {common: starFixes.map((f, i) => i === 0 ? Leg.IF(f) : Leg.TF(f))})],
    });
    const fillers = Array.from({length: fillerCount}, (_, i) => intersection(`FL${String(i).padStart(2, '0')}`, 46.5, 7.0 + 0.02 * i));
    return {kprc, fillers, facilities: [kprc, knew, ...sidFixes, ...starFixes, ...fillers]};
}

/** Loads the SID of KPRC on its APT 7 page (APT 7 shows the STAR on its second page): DEP1, LOAD IN FPL */
async function loadKprcSid(unit: HeadlessUnit) {
    await unit.panel.selectPage('R', 'APT 1');
    await unit.panel.cursor('R');
    await unit.panel.enterIdent('R', 'KPRC');
    await unit.panel.cursor('R');
    await unit.panel.selectPage('R', 'APT 6');
    await unit.panel.inner('R', 1); // the SID page
    await unit.panel.cursor('R');
    await unit.panel.ent(); // DEP1: the waypoints
    await unit.panel.ent(); // LOAD IN FPL
    await vi.advanceTimersByTimeAsync(1000);
}

describe('adding a waypoint in front of a SID waypoint of an FPL 0 of 45 legs that also holds a STAR of the same airport', () => {
    const fpl0Legs = (unit: HeadlessUnit) => unit.props.memory.fplPage.flightplans[0].getLegs();
    const leftRows = () => Screen.read().half('L').split('\n').map(r => r.trimEnd());

    /**
     * A round trip of 45 legs: KPRC, DEP1 (SD01 to SD10), FL00 to FL24, ARR1 (ST01 to ST08), KPRC. Built as a pilot
     * would: the STAR into [FL00..FL24, KPRC], KPRC added in front of FL00, then the SID, which follows the first KPRC
     */
    async function bootRoundTrip() {
        const w = kprcWithSidAndStar(10, 25);
        const unit = await bootUnit({facilities: w.facilities, position: {lat: 46.5, lon: 7.12}, storage: savedFlightplan(0, [...w.fillers, w.kprc])});
        await settle(unit);
        await unit.panel.selectPage('R', 'APT 1');
        await unit.panel.cursor('R');
        await unit.panel.enterIdent('R', 'KPRC');
        await unit.panel.cursor('R');
        await unit.panel.selectPage('R', 'APT 6');
        await unit.panel.inner('R', 2); // the STAR page
        await unit.panel.cursor('R');
        await unit.panel.ent(); // ARR1: the waypoints
        await unit.panel.ent(); // LOAD IN FPL
        await vi.advanceTimersByTimeAsync(1000);

        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.cursorToTop('L');
        await unit.panel.cursorTo('L', 'FL00');
        await unit.panel.inner('L', 1); // an insert row in front of FL00
        await unit.panel.enterIdent('L', 'KPRC');
        await unit.panel.ent(); // The waypoint page
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1500);
        await unit.panel.cursor('L');

        await loadKprcSid(unit);
        // Preconditions: 45 legs, 27 of them en-route, the SID behind the first KPRC, the STAR in front of the last
        const legs = fpl0Legs(unit);
        expect(legs).toHaveLength(45);
        expect(legs.filter(l => l.type === KLNLegType.USER)).toHaveLength(27);
        expect(legs.slice(0, 2).map(l => [l.wpt.icaoStruct.ident, l.type])).toEqual([['KPRC', KLNLegType.USER], ['SD01', KLNLegType.SID]]);
        expect(legs.slice(-2).map(l => [l.wpt.icaoStruct.ident, l.type])).toEqual([['ST08', KLNLegType.STAR], ['KPRC', KLNLegType.USER]]);
        return unit;
    }

    // Making room for a SID leg deletes the first KPRC and its SID (#148); the STAR, whose airport is the same KPRC,
    // stays. The pending row was copied from the SID, which is gone, so it is en-route
    it('adds the waypoint as an en-route waypoint when the SID went and a STAR of its airport stays (#148, #386)', async () => {
        const unit = await bootRoundTrip();
        await unit.panel.selectPage('R', 'NAV 2');
        await unit.panel.cursor('L');
        await unit.panel.cursorToTop('L');
        await unit.panel.cursorTo('L', 'SD01');
        await unit.panel.ent(); // an empty SID row in front of SD01
        await unit.panel.inner('L', 1); // the question
        expect(leftRows()[5]).toBe('CONTINUE?'); // Precondition
        await unit.panel.ent();
        expect(leftRows().slice(0, 2)).toEqual(['  1:A', '  2:FL00']); // no SID header over the row

        await unit.panel.enterIdent('L', 'KNEW');
        await unit.panel.ent();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1500);

        const legs = fpl0Legs(unit);
        expect(legs.slice(0, 2).map(l => [l.wpt.icaoStruct.ident, l.type])).toEqual([['KNEW', KLNLegType.USER], ['FL00', KLNLegType.USER]]);
        expect(legs[0].procedure).toBeUndefined();
        expect(legs.filter(l => l.type === KLNLegType.SID)).toEqual([]);
        expect(legs.filter(l => l.type === KLNLegType.STAR).map(l => l.wpt.icaoStruct.ident))
            .toEqual(['ST01', 'ST02', 'ST03', 'ST04', 'ST05', 'ST06', 'ST07', 'ST08']);
        expect(legs).toHaveLength(35);
        expect(unit.errors).toEqual([]);
    });
});

// FPL 0 of 45 legs: FL00, KPRC, DEP1 (SD01 to SD15), FL01 to FL28. Making room for a SID leg deletes FL00 only, so the
// SID the pending row was copied from stays, and the row keeps its type
describe('adding a waypoint in front of a SID waypoint of an FPL 0 of 45 legs whose SID stays', () => {
    const fpl0Legs = (unit: HeadlessUnit) => unit.props.memory.fplPage.flightplans[0].getLegs();
    const leftRows = () => Screen.read().half('L').split('\n').map(r => r.trimEnd());

    it('keeps the type of a SID row whose SID stays after making room (characterization, #386)', async () => {
        const w = kprcWithSidAndStar(15, 29);
        const unit = await bootUnit({
            facilities: w.facilities, position: {lat: 46.5, lon: 7.12},
            storage: savedFlightplan(0, [w.fillers[0], w.kprc, ...w.fillers.slice(1)]),
        });
        await settle(unit);
        await loadKprcSid(unit);
        // Preconditions: 45 legs, 30 of them en-route, the SID behind KPRC
        const before = fpl0Legs(unit);
        expect(before).toHaveLength(45);
        expect(before.filter(l => l.type === KLNLegType.USER)).toHaveLength(30);
        expect(before.slice(0, 4).map(l => [l.wpt.icaoStruct.ident, l.type])).toEqual([
            ['FL00', KLNLegType.USER], ['KPRC', KLNLegType.USER], ['SD01', KLNLegType.SID], ['SD02', KLNLegType.SID],
        ]);

        await unit.panel.selectPage('R', 'NAV 2');
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.cursorToTop('L');
        await unit.panel.cursorTo('L', 'SD02');
        await unit.panel.ent(); // an empty SID row in front of SD02
        await unit.panel.inner('L', 1); // the question
        expect(leftRows()[5]).toBe('CONTINUE?'); // Precondition
        await unit.panel.ent(); // deletes FL00
        await unit.panel.enterIdent('L', 'KNEW');
        await unit.panel.ent();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1500);

        const legs = fpl0Legs(unit);
        expect(legs.slice(0, 4).map(l => [l.wpt.icaoStruct.ident, l.type])).toEqual([
            ['KPRC', KLNLegType.USER], ['SD01', KLNLegType.SID], ['KNEW', KLNLegType.SID], ['SD02', KLNLegType.SID],
        ]);
        expect(legs[2].procedure?.displayName).toBe('DEP1-SID');
        expect(legs[2].parentFacility?.icaoStruct.ident).toBe('KPRC');
        expect(legs).toHaveLength(45);
        expect(unit.errors).toEqual([]);
    });
});

// FPL 0 of 45 legs: FL00 to FL28, the STAR ARR1 (ST01 to ST15) and KPRC. Making room for a STAR leg deletes FL00 only, so
// the STAR the pending row was copied from stays, and the row keeps its type
describe('adding a waypoint in front of a STAR waypoint of an FPL 0 of 45 legs', () => {
    const fpl0Legs = (unit: HeadlessUnit) => unit.props.memory.fplPage.flightplans[0].getLegs().map(l => [l.wpt.icaoStruct.ident, l.type]);
    const leftRows = () => Screen.read().half('L').split('\n').map(r => r.trimEnd());

    it('keeps the type of a STAR row whose STAR stays after making room (characterization, #386)', async () => {
        const kprcBase = airport('KPRC', 47.0, 8.0);
        const starFixes = Array.from({length: 15}, (_, i) => {
            const p = pointFrom(kprcBase, 90, 5 * (15 - i));
            return intersection(`ST${String(i + 1).padStart(2, '0')}`, p.lat, p.lon);
        });
        const kprc = withProcedures(kprcBase, {
            arrivals: [star('ARR1', {common: starFixes.map((f, i) => i === 0 ? Leg.IF(f) : Leg.TF(f))})],
        });
        const fillers = Array.from({length: 29}, (_, i) => intersection(`FL${String(i).padStart(2, '0')}`, 46.5, 7.0 + 0.02 * i));
        const unit = await bootUnit({
            facilities: [kprc, knew, ...starFixes, ...fillers], position: {lat: 46.5, lon: 7.12},
            storage: savedFlightplan(0, [...fillers, kprc]),
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 7', {ident: 'KPRC'});
        // Preconditions: 45 legs, 30 of them en-route, the STAR in front of KPRC
        expect(fpl0Legs(unit)).toHaveLength(45);
        expect(fpl0Legs(unit).filter(l => l[1] === KLNLegType.USER)).toHaveLength(30);
        expect(fpl0Legs(unit).slice(28, 31)).toEqual([
            ['FL28', KLNLegType.USER], ['ST01', KLNLegType.STAR], ['ST02', KLNLegType.STAR],
        ]);

        await unit.panel.selectPage('R', 'NAV 2');
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.cursorToTop('L');
        await unit.panel.cursorTo('L', 'ST02', 50);
        await unit.panel.ent(); // an empty STAR row in front of ST02
        await unit.panel.inner('L', 1); // the question
        expect(leftRows()[5]).toBe('CONTINUE?'); // Precondition
        await unit.panel.ent(); // deletes FL00
        await unit.panel.enterIdent('L', 'KNEW');
        await unit.panel.ent();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1500);

        const legs = fpl0Legs(unit);
        expect(legs[0]).toEqual(['FL01', KLNLegType.USER]);
        expect(legs.slice(27, 31)).toEqual([
            ['FL28', KLNLegType.USER], ['ST01', KLNLegType.STAR], ['KNEW', KLNLegType.STAR], ['ST02', KLNLegType.STAR],
        ]);
        expect(legs).toHaveLength(45);
        expect(unit.errors).toEqual([]);
    });
});

// FPL 0 with 30 en-route waypoints and a STAR: FL00 to FL28, then ARR1 (STRAA, STRAB) and KPRC. An inner-knob click on
// the procedure header opens an en-route insert row in front of the procedure (createLeg with a half index), which asks
// as any en-route insert does
describe('adding a waypoint in front of the STAR header of a full FPL 0', () => {
    const fpl0Legs = (unit: HeadlessUnit) => unit.props.memory.fplPage.flightplans[0].getLegs().map(l => [l.wpt.icaoStruct.ident, l.type]);
    const leftRows = () => Screen.read().half('L').split('\n').map(r => r.trimEnd());

    async function clickOnStarHeader() {
        const kprcBase = airport('KPRC', 47.0, 8.0);
        const east = (nm: number) => pointFrom(kprcBase, 90, nm);
        const straa = intersection('STRAA', east(20).lat, east(20).lon);
        const strab = intersection('STRAB', east(10).lat, east(10).lon);
        const kprc = withProcedures(kprcBase, {arrivals: [star('ARR1', {common: [Leg.IF(straa), Leg.TF(strab)]})]});
        const fillers = Array.from({length: 29}, (_, i) => intersection(`FL${String(i).padStart(2, '0')}`, 46.5, 7.0 + 0.02 * i));
        const unit = await bootUnit({
            facilities: [kprc, straa, strab, knew, ...fillers], position: {lat: 46.5, lon: 7.12},
            storage: savedFlightplan(0, [...fillers, kprc]),
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 7', {ident: 'KPRC'});
        // Preconditions: 30 en-route waypoints, the STAR in front of KPRC
        expect(fpl0Legs(unit).slice(-4)).toEqual([
            ['FL28', KLNLegType.USER], ['STRAA', KLNLegType.STAR], ['STRAB', KLNLegType.STAR], ['KPRC', KLNLegType.USER],
        ]);
        expect(fpl0Legs(unit).filter(l => l[1] === KLNLegType.USER)).toHaveLength(30);

        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.cursorToTop('L');
        for (let i = 0; !unit.panel.focused('L').text.includes('CHANGE') && i < 40; i++) {
            await unit.panel.outer('L', 1);
        }
        expect(unit.panel.focused('L').text).toContain('CHANGE'); // Precondition: the header of ARR1
        await unit.panel.inner('L', 1);
        return unit;
    }

    it('asks on the inner knob on the STAR header (characterization, #380)', async () => {
        const unit = await clickOnStarHeader();

        expect(leftRows()[5]).toBe('CONTINUE?');
        expect(fpl0Legs(unit)[0]).toEqual(['FL00', KLNLegType.USER]);
    });

    it('inserts an en-route waypoint in front of the STAR header after ENT (characterization, #380)', async () => {
        const unit = await clickOnStarHeader();
        await unit.panel.ent();

        // The open insert row, with the A of the clockwise click (#311), is waypoint 29 (after FL01 to FL28) and stands
        // in front of the header, under the cursor
        expect(leftRows().slice(3, 5)).toEqual([' 29:A', ' ARR1-Æ']);
        expect(unit.panel.focused('L').row).toBe(3);
        await unit.panel.enterIdent('L', 'KNEW');
        await unit.panel.ent();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1500);

        const legs = fpl0Legs(unit);
        expect(legs[0]).toEqual(['FL01', KLNLegType.USER]);
        expect(legs.slice(-5)).toEqual([
            ['FL28', KLNLegType.USER], ['KNEW', KLNLegType.USER], ['STRAA', KLNLegType.STAR], ['STRAB', KLNLegType.STAR],
            ['KPRC', KLNLegType.USER],
        ]);
        expect(unit.errors).toEqual([]);
    });

    it('leaves no open row in front of the STAR header after CLR (characterization, #380)', async () => {
        const unit = await clickOnStarHeader();
        await unit.panel.clr();
        await vi.advanceTimersByTimeAsync(1500);

        expect(fpl0Legs(unit)).toHaveLength(32);
        // An empty row left in front of the header would number KPRC, the last row (4-8), 33
        expect(leftRows()[5]).toBe(' 32:KPRC');
    });

    it('keeps the cursor on the STAR header after CRSR on the question (characterization, #385)', async () => {
        const unit = await clickOnStarHeader();
        await unit.panel.cursor('L');

        expect(unit.panel.focused('L').text).toContain('CHANGE');
        expect(fpl0Legs(unit)).toHaveLength(32);
    });
});

describe('deleting a flight plan (4-5)', () => {
    async function deleteFpl0() {
        const unit = await bootOnStandardRoute();
        expect(String(storedSetting(unit, 'fpl0'))).toHaveLength(3 * 19); // Precondition: the plan is stored

        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.clr(); // DELETE FPL? with the cursor off
        expect(Screen.read().row(0).slice(0, 11)).toBe('DELETE FPL?');
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(3000);
        return unit;
    }

    it('empties the plan', async () => {
        const unit = await deleteFpl0();

        expect(unit.props.memory.fplPage.flightplans[0].getLegs()).toEqual([]);
        expect(unit.errors).toEqual([]);
    });

    // Public contract (CLAUDE.md, persisted user data): the user's flight plans are saved
    it('saves the deleted plan as empty (#150)', async () => {
        const unit = await deleteFpl0();

        expect(storedSetting(unit, 'fpl0')).toBe(''); // An empty plan is the stored empty string
    });

    // Public contract (CLAUDE.md "Persisted user data", docs/architecture.md Core 7): a deleted plan is stored as the empty
    // string, and a unit that starts from it shows an empty FPL 0, as the pilot saw it after the deletion. The test above
    // holds that the deletion stores the empty string; this holds that the next start reads it as an empty plan
    it('starts with an empty FPL 0 from the stored empty string of a deleted plan (#150)', async () => {
        const {kaaa, abc, kbbb} = standardRoute();
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb], position: {lat: kaaa.lat, lon: kaaa.lon}, storage: {userDataFormat: 2, fpl0: ''},
        });
        await settle(unit);

        expect(fplIdents(unit)).toEqual([]);
        expect(messages(unit)).not.toContain('USER DATA LOST'); // the empty string is read, not a failed restore
        expect(unit.errors).toEqual([]);
    });
});
