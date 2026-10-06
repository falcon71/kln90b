import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {airport, intersection} from '../../../harness/navdata/builders';
import {standardRoute} from '../../../harness/fixtures';
import {pointFrom} from '../../../harness/flight/geo';
import {Screen} from '../../../harness/render/screen';
import {savedFlightplan, storedSetting} from '../../../harness/storage';

// Pilot's Guide 4-4 (adding a waypoint), 4-5 (deleting a waypoint and a plan), C-1 (FPL FULL)
// A full FPL 0 of 30 legs along a line north from 47N 8E, FA00 at the start and 5 NM between the legs
const START = {lat: 47, lon: 8};
const FIXES = Array.from({length: 30}, (_, i) => {
    const p = pointFrom(START, 0, 5 * i);
    return intersection(`FA${String(i).padStart(2, '0')}`, p.lat, p.lon);
});
const knew = airport('KNEW', 48.0, 9.0);
const legIdents = (unit: HeadlessUnit) => unit.props.memory.fplPage.flightplans[0].getLegs().map(l => l.wpt.icaoStruct.ident);

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
    expect(unit.panel.focused('L').text.trim()).toBe('FA00'); // The cursor starts on the first waypoint
    if (rowsDown > 0) {
        await unit.panel.outer('L', rowsDown);
    }
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
    // stored plan is fine (see #144 for the data that stays behind). USER DATA LOST is posted
    it('are 26 empty plans when the user waypoints cannot be restored (characterization)', async () => {
        const {kaaa, abc, kbbb} = standardRoute();
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb], position: {lat: 47.0, lon: 8.0},
            storage: {...savedFlightplan(0, [kaaa, abc, kbbb]), wpt0: 'garbage'},
        });

        const plans = unit.props.memory.fplPage.flightplans;
        expect(plans).toHaveLength(26);
        expect(plans[0].getLegs()).toEqual([]);
        expect(unit.props.messageHandler.getMessages().map(m => m.message.join(' '))).toContain('USER DATA LOST');
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
        expect(legIdents(unit)).toEqual(FIXES.map(f => f.icaoStruct.ident));
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
        await unit.panel.enterIdent('L', 'KNEW');
        await unit.panel.ent();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1500);

        const idents = legIdents(unit);
        expect(idents).toHaveLength(30);
        expect(idents[0]).toBe('FA01');
        expect(idents[29]).toBe('KNEW');
        // The active waypoint does not change (it moves up by one place)
        expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('FA21');
    });

    // 4-4: typed over a row, the new waypoint goes in front of the one that was there
    it('puts a waypoint typed over the second row in front of it, and drops the first leg', async () => {
        const unit = await bootFull(100);

        await typeKnewOver(unit, 1);

        expect(legIdents(unit).slice(0, 3)).toEqual(['KNEW', 'FA01', 'FA02']);
        expect(legIdents(unit)).toHaveLength(30);
    });

    it.fails('puts a waypoint typed over the first row first (#NEW-2-1)', async () => {
        const unit = await bootFull(100);

        await typeKnewOver(unit, 0);

        expect(legIdents(unit).slice(0, 3)).toEqual(['KNEW', 'FA01', 'FA02']);
        expect(legIdents(unit)[29]).toBe('FA29');
    });
});

describe('deleting a flight plan (4-5)', () => {
    async function deleteFpl0() {
        const {kaaa, abc, kbbb} = standardRoute();
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb], position: {lat: 47.0, lon: 8.0}, storage: savedFlightplan(0, [kaaa, abc, kbbb]),
        });
        await settle(unit);
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

    // Public contract (CLAUDE.md, persisted user data): the user's flight plans are saved. Flightplan.delete() does not
    // publish flightplanChanged, so the stored plan stays and comes back at the next start.
    it.fails('saves the deleted plan as empty (#NEW-2-3)', async () => {
        const unit = await deleteFpl0();

        expect(storedSetting(unit, 'fpl0')).toBe(''); // An empty plan is the stored empty string
    });
});
