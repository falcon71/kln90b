import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {approachWorld} from '../../../harness/fixtures';
import {savedFlightplan} from '../../../harness/storage';
import {Screen} from '../../../harness/render/screen';
import {NavMode} from '../../../../kln90b/data/VolatileMemory';

/** Boots 40 NM north of KPRC with the approach loaded from APT 8, so the unit is in ENR at +-5 */
async function approachLoaded40(): Promise<HeadlessUnit> {
    const w = approachWorld();
    const unit = await bootUnit({
        facilities: w.facilities, position: w.north(40),
        storage: {...savedFlightplan(0, [w.enraa, w.kprc]), turnAnticipation: false},
    });
    await settle(unit);
    await unit.panel.loadProcedure('APT 8');
    return unit;
}

describe('MOD 1 CDI scale field with an approach loaded 40 NM from the airport', () => {
    // 5-38 (figure 5-120): MOD 1 shows the CDI scale. The sibling of the pin below: in ENR the field reads +-5.00
    it('shows CDI:±5.00NM in ENR 40 NM from the airport (5-38)', async () => {
        const unit = await approachLoaded40();
        await unit.panel.selectPage('L', 'MOD 1');
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_LEG);
        expect(Screen.read().rows('L')[5]).toBe('CDI:±5.00NM');
    });

    // The other sibling of the pin: the switch arms the unit at 40 NM and leaves the scale at +-5
    it('is armed at +-5 after the switch 40 NM from the airport (6-1)', async () => {
        const unit = await approachLoaded40();
        await vi.advanceTimersByTimeAsync(6000);
        await unit.panel.press('KLN90B_ApprArm_Push');
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ARM_LEG);
        expect(unit.props.memory.navPage.xtkScale).toBe(5);
    });

    // 6-1: armed with the switch beyond 30 NM the scale stays +-5, so MOD 1 must show it. Mod1Page.getScaleIdx looks 5 up in
    // the scales valid for ARM, [0.3, 1], gets -1 and the field shows no value
    it.fails('shows CDI:±5.00NM when armed by the switch 40 NM from the airport (#NEW-5-2)', async () => {
        const unit = await approachLoaded40();
        await vi.advanceTimersByTimeAsync(6000);
        await unit.panel.press('KLN90B_ApprArm_Push');
        await unit.panel.selectPage('L', 'MOD 1');
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ARM_LEG);
        expect(Screen.read().rows('L')[5]).toBe('CDI:±5.00NM');
    });
});
