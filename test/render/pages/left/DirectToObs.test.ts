import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {standardRoute} from '../../../harness/fixtures';
import {savedFlightplan} from '../../../harness/storage';
import {Screen} from '../../../harness/render/screen';
import {courseDeg, distanceNm, EARTH_RADIUS_NM, pointBefore, pointFrom} from '../../../harness/flight/geo';
import {NavMode} from '../../../../kln90b/data/VolatileMemory';

const {kaaa, abc, kbbb} = standardRoute();
const panelXml = (input: string, output = '') =>
    `<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input>${input}</Input><Output>${output}</Output></Instrument></PlaneHTMLConfig>`;

/** The deviation from the great circle through wpt with the true course `course` there, by hand (right positive) */
function xtkFromCourse(position: { lat: number; lon: number }, wpt: { lat: number; lon: number }, course: number): number {
    const d = distanceNm(wpt, position);
    return EARTH_RADIUS_NM * Math.asin(Math.sin(d / EARTH_RADIUS_NM) * Math.sin((course - (courseDeg(wpt, position) + 180)) * Math.PI / 180));
}

/** Plan KAAA, ABC, KBBB, ABC active, OBS mode; with `obs` the external indicator is on that course */
async function planInObs(position: { lat: number; lon: number }, o: { obs?: number, panelXml?: string } = {}): Promise<HeadlessUnit> {
    const unit = await bootUnit({facilities: [kaaa, abc, kbbb], position, panelXml: o.panelXml, storage: savedFlightplan(0, [kaaa, abc, kbbb])});
    await settle(unit);
    if (o.obs !== undefined) unit.env.sim.set('Nav OBS:1', 'degrees', o.obs);
    await unit.panel.obsMode();
    await vi.advanceTimersByTimeAsync(2000);
    expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_OBS);
    return unit;
}

/** DCT from FPL 0 with the cursor on KBBB; ACTIVATE with a second DCT press when asked */
async function directToKbbbFromFpl0(unit: HeadlessUnit, activate: boolean) {
    await unit.panel.selectPage('L', 'FPL 0');
    await unit.panel.cursor('L');
    await unit.panel.outer('L', 2); // KBBB
    await unit.panel.dct();
    if (activate) await unit.panel.dct();
    expect(Screen.read().rows('L')[0]).toBe(activate ? 'ACTIVATE:  ' : 'DIRECT TO: ');
    await unit.panel.ent();
    await vi.advanceTimersByTimeAsync(2000);
}

describe('ACTIVATE in OBS mode (5-37)', () => {
    // 5-37 (5.9.7) steps 2 and 3: ACTIVATE makes the waypoint active and leaves the selected course alone. ObsSource 0,
    // so that the course is the unit's own and an external indicator cannot set it back
    it('makes the waypoint active and keeps the OBS course', async () => {
        const position = pointBefore(kaaa, abc, 5);
        const unit = await planInObs(position, {panelXml: panelXml('<ObsSource>0</ObsSource>')});
        const nav = unit.props.memory.navPage;
        const obsBefore = nav.obsMag; // The DTK of the leg to ABC, about 051
        expect(Math.abs(obsBefore - courseDeg(position, kbbb))).toBeGreaterThan(5); // So a direct course to KBBB cannot match

        await directToKbbbFromFpl0(unit, true);

        expect(nav.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('KBBB');
        expect(nav.obsMag).toBe(obsBefore);
        expect(nav.navmode).toBe(NavMode.ENR_OBS);
    });

    /** OBS 050 through ABC, 5 NM before ABC, then ACTIVATE to KBBB from the FPL 0 page; the hand deviation from 050 through KBBB */
    async function activateKbbbOnCourse50() {
        const position = pointBefore(kaaa, abc, 5);
        const unit = await planInObs(position, {obs: 50});
        const expected = xtkFromCourse(position, kbbb, 50);
        expect(expected).toBeCloseTo(24.5, 0); // Far from zero, so a recentred bar cannot match

        await directToKbbbFromFpl0(unit, true);
        return {unit, nav: unit.props.memory.navPage, expected};
    }

    // 5-37 (5.9.7) step 2: the sibling of the pin below. The same flow makes KBBB active and keeps the mode, so the pin
    // fails only on the deviation
    it('the pin setup: ACTIVATE with OBS 050 makes KBBB active and keeps ENR-OBS (the setup of #NEW-3-4)', async () => {
        const {nav} = await activateKbbbOnCourse50();

        expect(nav.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('KBBB');
        expect(nav.navmode).toBe(NavMode.ENR_OBS);
        expect(nav.obsMag).toBe(50);
    });

    // 5-37 (5.9.7) step 3: the D-bar is not recentred, the deviation is from the 050 course through KBBB. DirectToPage
    // makes a direct-to from the present position and then calls setObs with the unchanged course, which returns early
    // (ModeController.setObs), so the direct-to path stays and the deviation is zero
    it.fails('does not recentre the deviation: it is measured from the OBS course through the new waypoint (#NEW-3-4)', async () => {
        const {nav, expected} = await activateKbbbOnCourse50();

        expect(Math.abs(nav.xtkToActive! - expected)).toBeLessThan(0.05);
    });
});

describe('Direct To in OBS mode (5-37)', () => {
    const offLeg = pointFrom(pointBefore(kaaa, abc, 10), 141, 3); // 3 NM right of KAAA - ABC

    // 5-37 (5.9.6): the direct-to selects the OBS that leads from the present position to the waypoint when the unit
    // is not the displayed source (ObsSource 0: the unit cannot read the indicator)
    it('sets the OBS to the course from the present position and centres the deviation', async () => {
        const unit = await planInObs(offLeg, {panelXml: panelXml('<ObsSource>0</ObsSource>')});
        const nav = unit.props.memory.navPage;
        await unit.panel.selectPage('R', 'CTR 1'); // So DCT pre-fills the active waypoint (3-27 rule 4)

        await unit.panel.dct();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        expect(courseDeg(offLeg, abc)).toBeCloseTo(34.2, 1);
        expect(Math.abs(nav.obsMag - courseDeg(offLeg, abc))).toBeLessThan(0.05);
        expect(Math.abs(nav.xtkToActive!)).toBeLessThan(0.05);
    });

    // 5-37 (5.9.6) and C-1: on a non-driven indicator that shows the unit, the status line tells the course to set
    it('shows CRS with the direct course when the unit reads a non-driven indicator', async () => {
        const unit = await planInObs(offLeg, {obs: 50});
        await unit.panel.selectPage('R', 'CTR 1');

        await unit.panel.dct();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);

        expect(Screen.read().status().mode).toBe('d› CRS 034');
    });

    // 5-37 (5.9.6): a driven indicator (ObsTarget 1, VOR 1) is slewed to the direct course, with no message
    it('slews a driven indicator to the direct course without a CRS message', async () => {
        const unit = await planInObs(offLeg, {panelXml: panelXml('<ObsSource>0</ObsSource>', '<ObsTarget>1</ObsTarget>')});
        await unit.panel.selectPage('R', 'CTR 1');

        await unit.panel.dct();
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);

        expect(Screen.read().status().mode).not.toMatch(/CRS/);
        const vor1 = unit.env.sim.keyEvents.filter(k => k.name === 'K:VOR1_SET');
        expect(Math.abs(vor1[vor1.length - 1].value - courseDeg(offLeg, abc))).toBeLessThan(0.5);
    });
});

describe('the left side after a direct-to from FPL 0 (#82)', () => {
    /** FPL 0 KAAA, ABC, KBBB; the cursor on ABC, DCT, and the ENT that approves the waypoint page: the direct-to is made */
    async function directToAbcFromFpl0() {
        const unit = await bootUnit({
            facilities: [kaaa, abc, kbbb], position: pointBefore(kaaa, abc, 20), storage: savedFlightplan(0, [kaaa, abc, kbbb]),
        });
        await settle(unit);
        await unit.panel.selectPage('L', 'FPL 0');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 1); // ABC
        await unit.panel.dct();
        await unit.panel.ent(); // Approves the VOR page: the direct-to is made
        return unit;
    }
    const planRows = () => Screen.read().rows('L').slice(1, 4).map(r => r.slice(2, 8));

    // 4-11 step 4: the sibling of the pin below. The direct-to is made and FPL 0 is unchanged until the second ENT
    it('the pin setup: the direct-to to ABC is made and FPL 0 shows KAAA, ABC, KBBB (the setup of #82)', async () => {
        const unit = await directToAbcFromFpl0();
        await vi.advanceTimersByTimeAsync(1000);

        const aw = unit.props.memory.navPage.activeWaypoint;
        expect(aw.isDctNavigation()).toBe(true);
        expect(aw.getActiveWpt()!.icaoStruct.ident).toBe('ABC');
        expect(unit.props.memory.fplPage.flightplans[0].getLegs().map(l => l.wpt.icaoStruct.ident)).toEqual(['KAAA', 'ABC', 'KBBB']);
        expect(planRows()).toEqual(['1:KAAA', '2:ABC ', '3:KBBB']);
    });

    // 4-11 step 4 and figure 4-42: after the approval the left page shows FPL 0 with its page name, i.e. the cursor is
    // off. Today the cursor stays on the selected row, so the next ENT inserts a blank waypoint ahead of it (#82)
    it.fails('does not insert a blank waypoint at an ENT after the direct-to (#82)', async () => {
        const unit = await directToAbcFromFpl0();

        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);

        expect(planRows()).toEqual(['1:KAAA', '2:ABC ', '3:KBBB']);
    });
});
