import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../harness/boot';
import {approachWorld} from '../../harness/fixtures';
import {APR_ARM_SWITCH, panelXml} from '../../harness/panelXml';
import {savedFlightplan} from '../../harness/storage';
import {Screen} from '../../harness/render/screen';
import {activeIdent, fplIdents, messageLines} from '../../harness/readers';
import {NavMode} from '../../../kln90b/data/VolatileMemory';

// The world is approachWorld(): an RNAV approach to KPRC from the north with the FAF FAFAA 5 NM and a step-down fix
// SDFAA 2.5 NM north of the MAP MAPAA (at the airport), the final course 180, and the plan ENRAA (60 NM north), KPRC.
// The step-down fix lets "no re-activation past the FAF" bite.

/** Boots `nm` NM north of KPRC and loads the approach from APT 8 */
async function approachLoaded(nm: number) {
    const w = approachWorld();
    const unit = await bootUnit({
        facilities: w.facilities, position: w.north(nm),
        panelXml: panelXml(APR_ARM_SWITCH),
        storage: {...savedFlightplan(0, [w.enraa, w.kprc]), turnAnticipation: false},
    });
    await settle(unit);
    await unit.panel.loadProcedure('APT 8');
    return {w, unit};
}

const nav = (unit: HeadlessUnit) => unit.props.memory.navPage;
/** The scale after `seconds` more seconds of clock */
async function scaleAfter(unit: HeadlessUnit, seconds: number): Promise<number> {
    await vi.advanceTimersByTimeAsync(seconds * 1000);
    return nav(unit).xtkScale;
}

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

        await moveAircraft(unit, w.north(31), {groundspeedKt: 120});
        expect(nav(unit).navmode).toBe(NavMode.ENR_LEG); // Still outside 30 NM
        expect(nav(unit).xtkScale).toBe(5);

        await moveAircraft(unit, w.north(29), {groundspeedKt: 120});
        expect(nav(unit).navmode).toBe(NavMode.ARM_LEG);
        expect(nav(unit).xtkScale).toBe(5); // The tick that arms leaves the scale

        const mid = await scaleAfter(unit, 15);
        expect(mid).toBeGreaterThan(1.5); // A ramp, not a jump
        expect(mid).toBeLessThan(4.5);
        expect(await scaleAfter(unit, 10)).toBeGreaterThan(1); // 25 s: not done yet, so not a faster ramp
        expect(await scaleAfter(unit, 6)).toBe(1); // 31 s: done, one calculation tick of slack
        expect(await scaleAfter(unit, 10)).toBe(1); // and it stays
        expect(nav(unit).navmode).toBe(NavMode.ARM_LEG);
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

        expect(fplIdents(unit)).toEqual(['ENRAA', 'KPRC']);
        expect(nav(unit).navmode).toBe(NavMode.ENR_LEG);
        expect(nav(unit).xtkScale).toBe(5);
    });
});

describe('GPS APR switch while armed', () => {
    // 6-1: pressing the switch while armed disarms the approach: ENR and +-5, also inside 30 NM
    it('goes to ENR at +-5 on the press while armed (6-1)', async () => {
        const {unit} = await approachLoaded(20);
        expect(await scaleAfter(unit, 31)).toBe(1);
        expect(nav(unit).navmode).toBe(NavMode.ARM_LEG);

        await unit.panel.press('KLN90B_ApprArm_Push');

        expect(nav(unit).navmode).toBe(NavMode.ENR_LEG);
        expect(nav(unit).xtkScale).toBe(5);
        expect(await scaleAfter(unit, 3)).toBe(5);
        expect(nav(unit).navmode).toBe(NavMode.ENR_LEG);
    });

    // 6-1: the press disarms in OBS too, also inside 30 NM
    it('goes to ENR-OBS on the press while armed in OBS and stays there (6-1)', async () => {
        const {unit} = await approachLoaded(20);
        expect(await scaleAfter(unit, 31)).toBe(1);
        await unit.panel.obsMode();
        expect(nav(unit).navmode).toBe(NavMode.ARM_OBS);

        await unit.panel.press('KLN90B_ApprArm_Push');

        expect(nav(unit).navmode).toBe(NavMode.ENR_OBS);
        expect(await scaleAfter(unit, 3)).toBe(5);
        expect(nav(unit).navmode).toBe(NavMode.ENR_OBS);
    });

    // 6-1: a second press arms again; 6-1, 6-3: armed inside 30 NM, the scale changes from 5 to 1 over the next 30 s
    it('arms again at the second press inside 30 NM and ramps the scale to 1 over 30 s (6-1, 6-3)', async () => {
        const {unit} = await approachLoaded(20);
        expect(await scaleAfter(unit, 31)).toBe(1);
        await unit.panel.press('KLN90B_ApprArm_Push');
        expect(await scaleAfter(unit, 3)).toBe(5);
        expect(nav(unit).navmode).toBe(NavMode.ENR_LEG);

        await unit.panel.press('KLN90B_ApprArm_Push');
        expect(nav(unit).navmode).toBe(NavMode.ARM_LEG);
        const mid = await scaleAfter(unit, 15);
        expect(mid).toBeGreaterThan(1.5); // A ramp, not a jump
        expect(mid).toBeLessThan(4.5);
        expect(await scaleAfter(unit, 16)).toBe(1);
    });

    // 6-1: the second press arms again in OBS too; 6-1, 6-3: armed inside 30 NM, the scale changes from 5 to 1 over the next 30 s
    it('arms again at the second press in OBS inside 30 NM and ramps the scale to 1 over 30 s (6-1, 6-3)', async () => {
        const {unit} = await approachLoaded(20);
        expect(await scaleAfter(unit, 31)).toBe(1);
        await unit.panel.obsMode();
        expect(nav(unit).navmode).toBe(NavMode.ARM_OBS);
        await unit.panel.press('KLN90B_ApprArm_Push');
        expect(await scaleAfter(unit, 3)).toBe(5);
        expect(nav(unit).navmode).toBe(NavMode.ENR_OBS);

        await unit.panel.press('KLN90B_ApprArm_Push');
        expect(nav(unit).navmode).toBe(NavMode.ARM_OBS);
        const mid = await scaleAfter(unit, 15);
        expect(mid).toBeGreaterThan(1.5); // A ramp, not a jump
        expect(mid).toBeLessThan(4.5);
        expect(await scaleAfter(unit, 16)).toBe(1);
    });

    // B-1: with the approach disarmed, the unit reminds the pilot 3 NM before the FAF. The FAF FAFAA is 5 NM north of
    // KPRC, so 7.9 NM north is 2.9 NM before it
    it('shows ARM GPS APPROACH before the FAF with the approach disarmed (B-1)', async () => {
        const {w, unit} = await approachLoaded(20);
        await unit.panel.press('KLN90B_ApprArm_Push');
        await vi.advanceTimersByTimeAsync(2000);
        expect(nav(unit).navmode).toBe(NavMode.ENR_LEG);

        await moveAircraft(unit, w.north(7.9), {groundspeedKt: 120, trackTrue: 180});
        await vi.advanceTimersByTimeAsync(2000);

        expect(activeIdent(unit)).toBe('FAFAA');
        expect(nav(unit).navmode).toBe(NavMode.ENR_LEG);
        expect(messageLines(unit)).toContainEqual(['ARM GPS APPROACH']);
    });
});

describe('approach active and the CDI scale ramp to 0.3 NM (6-3, 6-11)', () => {
    // 6-3 (steps 4 and 5), 6-11, Installation Manual AFMS (B-15): at 2 NM from the FAF the unit goes ACTV and the scale
    // changes from +-1 to +-0.3 over the 2 NM to the FAF; at the FAF it is +-0.3 and stays there
    it('ramps the scale from 1 at 2 NM to 0.3 at the FAF, and keeps 0.3 to the MAP (6-3)', async () => {
        const {w, unit} = await armedBeforeFaf();

        await flyTo(w, unit, 5 + 2.3); // Inbound, but outside 2 NM: still armed at +-1
        expect(nav(unit).navmode).toBe(NavMode.ARM_LEG);
        expect(nav(unit).xtkScale).toBe(1);

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

        await unit.panel.directTo('MAPAA');

        expect(nav(unit).activeWaypoint.isDctNavigation()).toBe(true);
        expect(activeIdent(unit)).toBe('MAPAA');
        expect(nav(unit).navmode).toBe(NavMode.ARM_LEG);
        expect(await scaleAfter(unit, 5)).toBe(1);
        expect(nav(unit).navmode).toBe(NavMode.ARM_LEG);
    });

    // 6-1: 1.5 NM before the FAF, heading toward it, the press cancels ACTV to ARM at +-1. What follows, the return to
    // ACTV at the next calculation tick, is held by the characterization at the end of the file (#162)
    it('goes to ARM at +-1 at the GPS APR press 1.5 NM before the FAF (6-1)', async () => {
        const {w, unit} = await armedBeforeFaf();
        await flyTo(w, unit, 5 + 1.5);
        expect(nav(unit).navmode).toBe(NavMode.APR_LEG);

        // Sent without moving the clock: the state asserted below lasts only until the next calculation tick, which
        // re-activates the approach, so panel.press (250 ms) would make the test depend on the tick phase
        unit.send('KLN90B_ApprArm_Push');

        expect(nav(unit).navmode).toBe(NavMode.ARM_LEG);
        expect(nav(unit).xtkScale).toBe(1);
        expect(activeIdent(unit)).toBe('FAFAA');
    });

    // 6-3: the unit goes ACTV only while the aircraft heads toward the FAF. Inside 2 NM but flying away from it the
    // unit stays armed at +-1; turning inbound then activates it. The unit starts inside 2 NM (1.5 NM from the FAF), so
    // that no inbound jump of the harness precedes the outbound track
    it('stays armed at +-1 inside 2 NM of the FAF while flying away from it (6-3)', async () => {
        const {w, unit} = await approachLoaded(5 + 1.5);
        expect(await scaleAfter(unit, 31)).toBe(1);
        expect(activeIdent(unit)).toBe('FAFAA');

        await moveAircraft(unit, w.north(5 + 1.6), {groundspeedKt: 120, trackTrue: 0});
        await vi.advanceTimersByTimeAsync(3000);
        expect(activeIdent(unit)).toBe('FAFAA');
        expect(nav(unit).navmode).toBe(NavMode.ARM_LEG);
        expect(nav(unit).xtkScale).toBe(1);

        await moveAircraft(unit, w.north(5 + 1.5), {groundspeedKt: 120, trackTrue: 180});
        expect(nav(unit).navmode).toBe(NavMode.APR_LEG);
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
        expect(Screen.read().status().mode).toMatch(/^arm:\d\d\d( |$)/);
    });
});

describe('approach arm ramp (characterization)', () => {
    it('ramps linearly, 4/30 per calculation tick', async () => {
        const {w, unit} = await approachLoaded(40);
        await moveAircraft(unit, w.north(29), {groundspeedKt: 120});

        expect(await scaleAfter(unit, 15)).toBeCloseTo(3, 6);
        expect(await scaleAfter(unit, 14)).toBeCloseTo(5 - 29 * 4 / 30, 6);
    });
});

describe('approach active ramp (characterization)', () => {
    // The ramp runs from the scale at the activation (1) to 0.3 at the FAF over the distance left at the activation:
    // activated at 1.95 NM, the scale at 1 NM is 0.3 + 0.7 * 1 / 1.95 = 0.659 (characterization, #163)
    it('ramps linearly from the activation, 0.659 at 1 NM after activating at 1.95 NM (characterization, #163)', async () => {
        const {w, unit} = await approachLoaded(7.5);
        expect(await scaleAfter(unit, 31)).toBe(1);
        for (const nm of [5 + 1.95, 5 + 1]) {
            await moveAircraft(unit, w.north(nm), {groundspeedKt: 120, trackTrue: 180});
            await vi.advanceTimersByTimeAsync(1000);
        }

        expect(nav(unit).xtkScale).toBeCloseTo(0.659, 3);
    });

    // A late switch to LEG at 1 NM: the unit goes ACTV at 1 NM and ramps from 1 to 0.3 over that 1 NM, so 0.5 NM before
    // the FAF the scale is 0.3 + 0.7 * 0.5 / 1 = 0.65 (characterization, #163)
    it('ramps from 1 over the last 1 NM after a late switch to LEG (characterization, #163)', async () => {
        const {w, unit} = await approachLoaded(7.5);
        expect(await scaleAfter(unit, 31)).toBe(1);
        await moveAircraft(unit, w.north(5 + 2.5), {groundspeedKt: 120, trackTrue: 180});
        unit.env.sim.set('Nav OBS:1', 'degrees', 180); // The final course, so the FAF stays on the TO side
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(1000);
        expect(nav(unit).navmode).toBe(NavMode.ARM_OBS);
        await moveAircraft(unit, w.north(5 + 1), {groundspeedKt: 120, trackTrue: 180});
        await unit.panel.selectPage('L', 'MOD 1');
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);
        expect(nav(unit).navmode).toBe(NavMode.APR_LEG);
        expect(nav(unit).xtkScale).toBeCloseTo(1, 6); // 0.3 + 0.7 in floating point

        await moveAircraft(unit, w.north(5 + 0.5), {groundspeedKt: 120, trackTrue: 180});
        await vi.advanceTimersByTimeAsync(1000);

        expect(nav(unit).xtkScale).toBeCloseTo(0.65, 3);
    });

    // Activated while the arming ramp is still running (the scale is above 1), the ramp starts from 1, not from the
    // higher scale: activated at 1.9 NM, the scale at 1 NM is 0.3 + 0.7 * 1 / 1.9 = 0.668 (characterization, #163)
    it('ramps from 1, not from the arming scale, when activated before the arming ramp has finished (characterization, #163)', async () => {
        const {w, unit} = await approachLoaded(5 + 1.9);
        await moveAircraft(unit, w.north(5 + 1.9), {groundspeedKt: 120, trackTrue: 180});
        await vi.advanceTimersByTimeAsync(1000);
        expect(nav(unit).navmode).toBe(NavMode.APR_LEG);
        expect(nav(unit).xtkScale).toBe(1);

        await flyTo(w, unit, 5 + 1);

        expect(nav(unit).xtkScale).toBeCloseTo(0.668, 3);
    });

    // Moving back away from the FAF in ACTV the scale stays at 1, not above it (characterization, #163)
    it('stays at 1 when the aircraft moves back 3 NM from the FAF in ACTV (characterization, #163)', async () => {
        const {w, unit} = await armedBeforeFaf();
        await flyTo(w, unit, 5 + 1.95);
        expect(nav(unit).navmode).toBe(NavMode.APR_LEG);

        await moveAircraft(unit, w.north(5 + 3), {groundspeedKt: 120, trackTrue: 0});
        await vi.advanceTimersByTimeAsync(1000);

        expect(nav(unit).navmode).toBe(NavMode.APR_LEG);
        expect(nav(unit).xtkScale).toBe(1);
    });

    // Case 2 of #163: a Direct To the FAF inside 2 NM in ACTV goes to ARM, and the next calculation tick activates again
    // (characterization, #163)
    it('goes ARM at a Direct To the FAF 1.5 NM before it and ACTV one tick later (characterization, #163)', async () => {
        const {w, unit} = await armedBeforeFaf();
        await flyTo(w, unit, 5 + 1.5);
        expect(nav(unit).navmode).toBe(NavMode.APR_LEG);

        // No wait after the ENT: the state asserted next lasts only until the next calculation tick
        await unit.panel.directTo('FAFAA', {waitMs: 0});
        expect(nav(unit).navmode).toBe(NavMode.ARM_LEG);
        await vi.advanceTimersByTimeAsync(1000);

        expect(nav(unit).navmode).toBe(NavMode.APR_LEG);
    });
});

describe('the pilot disarm and a new approach (characterization)', () => {
    // The disarm belongs to the approach that was loaded; the same approach loaded again is a new approach, which arms by
    // itself inside 30 NM (#139)
    it('arms by itself again when the approach is loaded again after the disarm (characterization, #139)', async () => {
        const {unit} = await approachLoaded(20);
        await unit.panel.press('KLN90B_ApprArm_Push');
        await vi.advanceTimersByTimeAsync(3000);
        expect(nav(unit).navmode).toBe(NavMode.ENR_LEG);

        await unit.panel.loadProcedure('APT 8');
        await vi.advanceTimersByTimeAsync(3000);

        expect(nav(unit).navmode).toBe(NavMode.ARM_LEG);
    });
});

describe('ACTV before the FAF after a cancel (characterization)', () => {
    // The maintainer's ruling on #162: the conditions of the switch still hold before the FAF, so the unit is back in ACTV
    // at the next calculation tick
    it('is back in ACTV one calculation tick after the GPS APR press 1.5 NM before the FAF (characterization, #162)', async () => {
        const {w, unit} = await armedBeforeFaf();
        await flyTo(w, unit, 5 + 1.5);
        expect(nav(unit).navmode).toBe(NavMode.APR_LEG);
        unit.send('KLN90B_ApprArm_Push');
        expect(nav(unit).navmode).toBe(NavMode.ARM_LEG);

        await vi.advanceTimersByTimeAsync(1000);

        expect(nav(unit).navmode).toBe(NavMode.APR_LEG);
        expect(activeIdent(unit)).toBe('FAFAA');
    });
});
