import {describe, expect, it, vi} from 'vitest';
import {bootUnit, settle} from '../harness/boot';

describe('L:KLN90B_HSI_TF_FLAGS without an active waypoint (a0678fa, #29)', () => {
    // Public contract: the LVar is documented in LVars.ts (CLAUDE.md, "LVars"); the unit writes 0 when the HSI has to be
    // flagged, which is the case without an active waypoint. An unset LVar reads 0 in FakeSim, so the test asserts that
    // the unit wrote it (lastWrite), not only the value.
    it('is written as 0 when there is no flight plan (a0678fa)', async () => {
        const unit = await bootUnit();
        await settle(unit);

        const write = unit.env.sim.lastWrite('L:KLN90B_HSI_TF_FLAGS');
        expect(write).toBeDefined();
        expect(write!.value).toBe(0);
    });
});

describe('external OBS course and L:KLN90B_ObsSource', () => {
    /** Boots with the default ObsSource 1 and lets the unit read an external course of 51 */
    async function bootWithExternalCourse() {
        const unit = await bootUnit();
        await settle(unit);
        unit.env.sim.set('Nav OBS:1', 'degrees', 51);
        await vi.advanceTimersByTimeAsync(3000);
        return unit;
    }

    // The sibling of the pin: the setup works, the unit reads 51 and takes the switch to 0 over from the LVar.
    // Public contract: Input.ObsSource of the panel.xml sample (cfg/panel.xml, "synced with L:KLN90B_ObsSource") and the
    // LVars.ts doc comment of LVAR_OBS_SOURCE (changes Input.ObsSource on the fly).
    it('reads the external course and takes ObsSource 0 from the LVar (#123)', async () => {
        const unit = await bootWithExternalCourse();
        expect(unit.props.sensors.in.obsMag).toBe(51);

        unit.env.sim.set('L:KLN90B_ObsSource', 'number', 0);
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.props.planeSettings.input.obsSource).toBe(0);
    });

    // Public contract: L:KLN90B_ObsSource changes Input.ObsSource on the fly (LVars.ts), and the panel.xml sample says 0
    // disables the input (cfg/panel.xml). A disabled input has no external course, so obsMag must be null; it keeps its
    // last value today, so the stale course is forced on OBS mode and MOD 2 stays read-only.
    it.fails('has no external course after ObsSource is switched to 0 (#123)', async () => {
        const unit = await bootWithExternalCourse();

        unit.env.sim.set('L:KLN90B_ObsSource', 'number', 0);
        await vi.advanceTimersByTimeAsync(3000);

        expect(unit.props.sensors.in.obsMag).toBeNull();
    });
});
