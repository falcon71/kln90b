import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../harness/boot';
import {approachWorld} from '../../harness/fixtures';
import {savedFlightplan} from '../../harness/storage';
import {Screen} from '../../harness/render/screen';
import {NavMode} from '../../../kln90b/data/VolatileMemory';

// The world is approachWorld(): an RNAV approach to KPRC from the north with the FAF FAFAA 5 NM and a step-down fix
// SDFAA 2.5 NM north of the MAP MAPAA (at the airport), the final course 180, and the plan ENRAA (60 NM north), KPRC.
// The step-down fix lets "no re-activation past the FAF" bite.

/** Boots `nm` NM north of KPRC and loads the approach from APT 8 */
async function approachLoaded(nm: number) {
    const w = approachWorld();
    const unit = await bootUnit({
        facilities: w.facilities, position: w.north(nm),
        storage: {...savedFlightplan(0, [w.enraa, w.kprc]), turnAnticipation: false},
    });
    await settle(unit);
    await unit.panel.loadProcedure('APT 8');
    return {w, unit};
}

const nav = (unit: HeadlessUnit) => unit.props.memory.navPage;
const activeIdent = (unit: HeadlessUnit) => nav(unit).activeWaypoint.getActiveWpt()?.icaoStruct.ident;
/** The scale after `seconds` more seconds of clock */
async function scaleAfter(unit: HeadlessUnit, seconds: number): Promise<number> {
    await vi.advanceTimersByTimeAsync(seconds * 1000);
    return nav(unit).xtkScale;
}

describe('approach arm and the CDI scale ramp to 1 NM (6-1, 6-3)', () => {
    // The sibling: beyond 30 NM the loaded approach leaves the unit in ENR at +-5
    it('stays in ENR at +-5 with the approach loaded 40 NM from the airport (6-3)', async () => {
        const {unit} = await approachLoaded(40);

        expect(nav(unit).navmode).toBe(NavMode.ENR_LEG);
        expect(await scaleAfter(unit, 10)).toBe(5);
        expect(nav(unit).navmode).toBe(NavMode.ENR_LEG);
    });

    // 6-1, 6-3 (step 2), Installation Manual AFMS (B-14, B-15): within 30 NM of the airport with an approach loaded the unit
    // arms by itself, and the scale changes from +-5 to +-1 over the next 30 seconds
    it('arms at 30 NM and ramps the scale from 5 to 1 over 30 s (6-3)', async () => {
        const {w, unit} = await approachLoaded(40);

        await moveAircraft(unit, w.north(29), {groundspeedKt: 120});
        expect(nav(unit).navmode).toBe(NavMode.ARM_LEG);
        expect(nav(unit).xtkScale).toBe(5); // The tick that arms leaves the scale

        const mid = await scaleAfter(unit, 15);
        expect(mid).toBeGreaterThan(1.5); // A ramp, not a jump
        expect(mid).toBeLessThan(4.5);
        expect(await scaleAfter(unit, 16)).toBe(1); // 31 s: done, one calculation tick of slack
        expect(await scaleAfter(unit, 10)).toBe(1); // and it stays
        expect(nav(unit).navmode).toBe(NavMode.ARM_LEG);
    });

    it('ramps linearly, 4/30 per calculation tick (characterization)', async () => {
        const {w, unit} = await approachLoaded(40);
        await moveAircraft(unit, w.north(29), {groundspeedKt: 120});

        expect(await scaleAfter(unit, 15)).toBeCloseTo(3, 6);
        expect(await scaleAfter(unit, 14)).toBeCloseTo(5 - 29 * 4 / 30, 6);
    });

    // 6-1: armed with the switch beyond 30 NM, the unit keeps the scale until the aircraft reaches 30 NM
    it('armed by the switch at 40 NM, keeps +-5 until 30 NM, then ramps to 1 (6-1)', async () => {
        const {w, unit} = await approachLoaded(40);
        await vi.advanceTimersByTimeAsync(6000);
        await unit.panel.press('KLN90B_ApprArm_Push');

        expect(await scaleAfter(unit, 20)).toBe(5);
        expect(nav(unit).navmode).toBe(NavMode.ARM_LEG);

        await moveAircraft(unit, w.north(29), {groundspeedKt: 120});
        const mid = await scaleAfter(unit, 15);
        expect(mid).toBeGreaterThan(1.5);
        expect(mid).toBeLessThan(4.5);
        expect(await scaleAfter(unit, 16)).toBe(1);
    });

    // 6-7: deleting the approach while armed returns the unit to ENR and the scale to +-5
    it('returns to ENR and +-5 when the approach is deleted (6-7)', async () => {
        const {unit} = await approachLoaded(20);
        expect(await scaleAfter(unit, 31)).toBe(1);
        expect(nav(unit).navmode).toBe(NavMode.ARM_LEG);

        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.cursorTo('L', 'CHANGE APR?');
        await unit.panel.clr();
        expect(unit.panel.focused('L').text.trim()).toBe('DELETE APR?');
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.props.memory.fplPage.flightplans[0].getLegs().map(l => l.wpt.icaoStruct.ident)).toEqual(['ENRAA', 'KPRC']);
        expect(nav(unit).navmode).toBe(NavMode.ENR_LEG);
        expect(nav(unit).xtkScale).toBe(5);
    });
});

describe('approach active and the CDI scale ramp to 0.3 NM (6-3, 6-11)', () => {
    /**
     * 2.5 NM before the FAF (7.5 NM north of KPRC), FAFAA active, armed, the arming ramp finished. At rest the GPS track
     * is 0, away from the FAF, so the unit stays armed until it moves.
     */
    async function armedBeforeFaf() {
        const {w, unit} = await approachLoaded(7.5);
        expect(await scaleAfter(unit, 31)).toBe(1);
        expect(activeIdent(unit)).toBe('FAFAA');
        expect(nav(unit).navmode).toBe(NavMode.ARM_LEG);
        return {w, unit};
    }

    /** Moves on the final course to `nm` NM north of KPRC, and runs one calculation tick more */
    async function flyTo(w: ReturnType<typeof approachWorld>, unit: HeadlessUnit, nm: number) {
        await moveAircraft(unit, w.north(nm), {groundspeedKt: 120, trackTrue: 180});
        await vi.advanceTimersByTimeAsync(1000);
    }

    // 6-3 (steps 4 and 5), 6-11, Installation Manual AFMS (B-15): at 2 NM from the FAF the unit goes ACTV and the scale
    // changes from +-1 to +-0.3 over the 2 NM to the FAF; at the FAF it is +-0.3 and stays there
    it('ramps the scale from 1 at 2 NM to 0.3 at the FAF, and keeps 0.3 to the MAP (6-3)', async () => {
        const {w, unit} = await armedBeforeFaf();

        await flyTo(w, unit, 5 + 1.95);
        expect(nav(unit).navmode).toBe(NavMode.APR_LEG);
        expect(nav(unit).xtkScale).toBeGreaterThan(0.9);
        expect(nav(unit).xtkScale).toBeLessThanOrEqual(1);

        await flyTo(w, unit, 5 + 1);
        expect(nav(unit).xtkScale).toBeGreaterThan(0.4);
        expect(nav(unit).xtkScale).toBeLessThan(0.9);

        await flyTo(w, unit, 5 + 0.1);
        expect(nav(unit).xtkScale).toBeLessThan(0.4);

        await flyTo(w, unit, 4); // 1 NM past the FAF: the step-down fix is active
        expect(activeIdent(unit)).toBe('SDFAA');
        expect(nav(unit).navmode).toBe(NavMode.APR_LEG);
        expect(nav(unit).xtkScale).toBe(0.3);

        await flyTo(w, unit, 0.5); // 0.5 NM before the MAP
        expect(activeIdent(unit)).toBe('MAPAA');
        expect(await scaleAfter(unit, 5)).toBe(0.3);
        expect(nav(unit).navmode).toBe(NavMode.APR_LEG);

        // 6-3 (step 6), 6-7: no sequencing past the MAP, and the approach stays active
        await flyTo(w, unit, -0.5);
        expect(activeIdent(unit)).toBe('MAPAA');
        expect(await scaleAfter(unit, 5)).toBe(0.3);
        expect(nav(unit).navmode).toBe(NavMode.APR_LEG);
    });

    it('ramps linearly with the distance to the FAF, 0.65 at 1 NM (characterization)', async () => {
        const {w, unit} = await armedBeforeFaf();
        await flyTo(w, unit, 5 + 1.95);
        await flyTo(w, unit, 5 + 1);

        expect(nav(unit).xtkScale).toBeCloseTo(0.65, 2);
    });

    /** 1 NM past the FAF with the step-down fix active, approach active */
    async function activePastFaf() {
        const {w, unit} = await armedBeforeFaf();
        await flyTo(w, unit, 5 + 1.95);
        await flyTo(w, unit, 4);
        expect(activeIdent(unit)).toBe('SDFAA');
        expect(nav(unit).navmode).toBe(NavMode.APR_LEG);
        return {w, unit};
    }

    // 6-1, 6-3 (step 5), Installation Manual AFMS (B-13): the GPS APR switch cancels ACTV to ARM; past the FAF the unit does
    // not return to ACTV without flying back to the FAF, here not even within 2 NM of the next fix, heading toward it
    it('goes back to ARM at +-1 on the GPS APR switch past the FAF, and stays there (6-1)', async () => {
        const {w, unit} = await activePastFaf();

        await unit.panel.press('KLN90B_ApprArm_Push');
        expect(nav(unit).navmode).toBe(NavMode.ARM_LEG);
        expect(nav(unit).xtkScale).toBe(1);

        await flyTo(w, unit, 3); // 0.5 NM before SDFAA
        expect(activeIdent(unit)).toBe('SDFAA');
        expect(await scaleAfter(unit, 5)).toBe(1);
        expect(nav(unit).navmode).toBe(NavMode.ARM_LEG);
    });

    // 3-29, 6-3 (step 5): a direct-to to the active MAP (recentering the D-bar) cancels ACTV to ARM
    it('goes back to ARM at +-1 on a direct-to to the MAP (3-29)', async () => {
        const {unit} = await activePastFaf();

        await unit.panel.dct();
        await unit.panel.enterIdent('L', 'MAPAA');
        await unit.panel.ent();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        expect(nav(unit).activeWaypoint.isDctNavigation()).toBe(true);
        expect(activeIdent(unit)).toBe('MAPAA');
        expect(nav(unit).navmode).toBe(NavMode.ARM_LEG);
        expect(await scaleAfter(unit, 5)).toBe(1);
        expect(nav(unit).navmode).toBe(NavMode.ARM_LEG);
    });

    // 6-1: 1.5 NM before the FAF, heading toward it, the press cancels ACTV to ARM at +-1. Whether the unit may go back
    // to ACTV by itself before the FAF is a question for the maintainer, so only the press is held
    it('goes to ARM at +-1 at the GPS APR press 1.5 NM before the FAF (6-1)', async () => {
        const {w, unit} = await armedBeforeFaf();
        await flyTo(w, unit, 5 + 1.5);
        expect(nav(unit).navmode).toBe(NavMode.APR_LEG);

        await unit.panel.press('KLN90B_ApprArm_Push');

        expect(nav(unit).navmode).toBe(NavMode.ARM_LEG);
        expect(nav(unit).xtkScale).toBe(1);
        expect(activeIdent(unit)).toBe('FAFAA');
    });

    // 6-3 (step 5): changing to OBS cancels ACTV; 5-32: APR together with OBS is not a valid mode, so the unit is armed
    // in OBS and stays there
    it('goes to ARM in OBS at +-1 when OBS is selected in ACTV (6-3, 5-32)', async () => {
        const {w, unit} = await armedBeforeFaf();
        await flyTo(w, unit, 5 + 1.5);
        expect(nav(unit).navmode).toBe(NavMode.APR_LEG);

        await unit.panel.obsMode();
        expect(nav(unit).navmode).toBe(NavMode.ARM_OBS);
        expect(nav(unit).xtkScale).toBe(1);

        await flyTo(w, unit, 5 + 1);
        expect(await scaleAfter(unit, 3)).toBe(1);
        expect(nav(unit).navmode).toBe(NavMode.ARM_OBS);
        expect(Screen.read().row(6).slice(6, 13)).toMatch(/^arm:\d\d\d$/);
    });
});
