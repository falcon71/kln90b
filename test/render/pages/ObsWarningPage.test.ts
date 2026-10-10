import {describe, expect, it, vi} from 'vitest';
import {bootToSelfTest} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';
import {LEG_OBS_SWITCH, panelXml, VFR_ONLY} from '../../harness/panelXml';

// The OBS warning (ObsWarningPage), shown during the start-up sequence while the external GPS CRS switch is in OBS
// (3-7). The VFR only page before it is in VFROnlyPage.test.ts, the Database page after it in AiracPage.test.ts.

/**
 * The two texts of the VFR only page with their cells, as VFROnlyPage.test.ts holds them: the title on the second row,
 * three cells in, and the button on the sixth row, five cells in
 */
const expectVfrPage = () => {
    expect([Screen.read().row(1), Screen.read().row(5)])
        .toEqual(['   FOR VFR USE ONLY'.padEnd(23), '     ACKNOWLEDGE?'.padEnd(23)]);
};

describe('OBS warning (3-7)', () => {
    // 3-7 step 11: on a VFR only unit with the external GPS CRS switch in OBS, the VFR only page comes first and the
    // OBS warning (figure 3-23) after its acknowledgement; the warning gives way to the Database page once the switch
    // is back in LEG. Figure 3-23 shows the OBS mode with its course on the status line and no ENT.
    it('shows the OBS warning after the VFR only page, then the Database page once the switch is in LEG '
        + '(3-7)', async () => {
        const unit = await bootToSelfTest({
            panelXml: panelXml({...VFR_ONLY, ...LEG_OBS_SWITCH}),
            storage: {lastLatitude: 47, lastLongitude: 8},
        });
        unit.env.sim.set('GPS OBS ACTIVE', 'bool', true);
        await unit.panel.cursorTo('R', 'APPROVE?');
        await unit.panel.ent();
        expectVfrPage();

        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().text()).toContain('SYSTEM IS IN OBS MODE');
        expect(Screen.read().status().mode).toMatch(/^enr:\d{3}( msg)?$/); // no ent: nothing to approve

        unit.env.sim.set('GPS OBS ACTIVE', 'bool', false);
        await vi.advanceTimersByTimeAsync(2000);
        expect(Screen.read().pageRows()[1]).toBe('DATA BASE EXPIRES');
        expect(unit.errors).toEqual([]);
    });
});
