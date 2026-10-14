import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, moveAircraft, settle} from '../../../harness/boot';
import {approachWorld, standardRoute} from '../../../harness/fixtures';
import {pointBefore} from '../../../harness/flight/geo';
import {savedFlightplan} from '../../../harness/storage';
import {Screen} from '../../../harness/render/screen';
import {APR_ARM_SWITCH, LEG_OBS_SWITCH, panelXml} from '../../../harness/panelXml';
import {bootOnStandardRoute} from '../../../harness/worldBoot';
import {NavMode, NavPageState} from '../../../../kln90b/data/VolatileMemory';
import {CdiScaleField} from '../../../../kln90b/controls/selects/CdiScaleField';
import {mountedText} from '../../../harness/render/mount';

/** Boots 40 NM north of KPRC with the approach loaded from APT 8, so the unit is in ENR at +-5 */
async function approachLoaded40(): Promise<HeadlessUnit> {
    const w = approachWorld();
    const unit = await bootUnit({
        facilities: w.facilities, position: w.north(40),
        panelXml: panelXml(APR_ARM_SWITCH),
        storage: {...savedFlightplan(0, [w.enraa, w.kprc]), turnAnticipation: false},
    });
    await settle(unit);
    await unit.panel.loadProcedure('APT 8');
    return unit;
}

describe('MOD 1 CDI scale field with an approach loaded 40 NM from the airport', () => {
    // 5-38 (figure 5-120): MOD 1 shows the CDI scale. The control for the #160 test below: in ENR the field reads +-5.00
    it('shows CDI:±5.00NM in ENR 40 NM from the airport (5-38)', async () => {
        const unit = await approachLoaded40();
        await unit.panel.selectPage('L', 'MOD 1');
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_LEG);
        expect(Screen.read().rows('L')[5]).toBe('CDI:±5.00NM');
    });

    // The other control for that test: the switch arms the unit at 40 NM and leaves the scale at +-5
    it('is armed at +-5 after the switch 40 NM from the airport (6-1)', async () => {
        const unit = await approachLoaded40();
        await vi.advanceTimersByTimeAsync(6000);
        await unit.panel.press('KLN90B_ApprArm_Push');
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ARM_LEG);
        expect(unit.props.memory.navPage.xtkScale).toBe(5);
    });

    // 6-1: armed with the switch beyond 30 NM the scale stays +-5, and MOD 1 shows the scale in use (5-38)
    it('shows CDI:±5.00NM when armed by the switch 40 NM from the airport (5-38, 6-1, #160)', async () => {
        const unit = await approachLoaded40();
        await vi.advanceTimersByTimeAsync(6000);
        await unit.panel.press('KLN90B_ApprArm_Push');
        await unit.panel.selectPage('L', 'MOD 1');
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ARM_LEG);
        expect(Screen.read().rows('L')[5]).toBe('CDI:±5.00NM');
    });

    // 5-38: in the approach-arm mode nothing less sensitive than 1 NM can be selected. Once the pilot leaves the 5 NM the
    // unit kept beyond 30 NM, only 1.00 and 0.30 are offered (the order of the choices is a characterization)
    it('offers only 1.00 and 0.30 once the pilot leaves 5.00 while armed beyond 30 NM (5-38, #260)', async () => {
        const unit = await approachLoaded40();
        await vi.advanceTimersByTimeAsync(6000);
        await unit.panel.press('KLN90B_ApprArm_Push');
        await unit.panel.selectPage('L', 'MOD 1');
        await vi.advanceTimersByTimeAsync(1000);
        await unit.panel.cursor('L');
        expect(unit.panel.focused('L').text).toBe('5.00'); // Precondition: armed at 5 NM

        await unit.panel.inner('L', -1);
        await vi.advanceTimersByTimeAsync(500);
        expect(unit.props.memory.navPage.xtkScale).toBe(1);

        const seen = new Set<string>();
        for (let i = 0; i < 4; i++) {
            await unit.panel.inner('L', 1);
            await vi.advanceTimersByTimeAsync(500);
            seen.add(unit.panel.focused('L').text);
            expect(unit.props.memory.navPage.xtkScale).not.toBe(5);
        }
        expect([...seen].sort()).toEqual(['0.30', '1.00']);
    });
});

/** The standard route KAAA, ABC, KBBB, 5 NM before ABC with ABC active, in ENR-LEG */
async function onStandardRoute(xml?: string): Promise<HeadlessUnit> {
    const {kaaa, abc} = standardRoute();
    return bootOnStandardRoute({position: pointBefore(kaaa, abc, 5), panelXml: xml});
}

describe('MOD 1 page (characterization)', () => {
    it('shows PRESS ENT TO ACTIVATE in ENR-OBS (characterization)', async () => {
        const unit = await onStandardRoute();
        await unit.panel.obsMode();
        await unit.panel.selectPage('L', 'MOD 1');

        const screen = Screen.read();
        expect([...screen.rows('L'), ...screen.maskRows('L')].join('\n')).toMatchInlineSnapshot(`
          "PRESS ENT  
          TO ACTIVATE
                     
          LEG        
                     
          CDI:±5.00NM
          ...........
          ...........
          ...........
          ...........
          ...........
          ..........."
        `);
        expect(screen.status().left).toBe('MOD 1');
    });
});

describe('MOD 1 page (spec)', () => {
    // 5-32, figure 5-107: in Leg mode MOD 1 shows that Leg is the active mode and the CDI scale, default +-5 NM (5-33
    // item 1). The page accepts no ENT, so the status line shows the msg prompt of the boot messages and no ent
    it('shows ACTIVE MODE, LEG and CDI:±5.00NM in ENR-LEG, without the ent prompt (5-32)', async () => {
        const unit = await onStandardRoute();
        await unit.panel.selectPage('L', 'MOD 1');

        const screen = Screen.read();
        expect(screen.rows('L')).toEqual(['ACTIVE MODE', '           ', '           ', 'LEG        ', '           ', 'CDI:±5.00NM']);
        expect(screen.status().left).toBe('MOD 1');
        expect(screen.status().mode).toBe('enr-leg msg');
    });

    // 5-38, figures 5-120 and 5-121: the cursor goes to the CDI scale and the left inner knob selects 5, 1 or 0.3 NM
    it('selects ±5.00, ±1.00 and ±0.30 NM with the cursor on the CDI scale (5-38)', async () => {
        const unit = await onStandardRoute();
        await unit.panel.selectPage('L', 'MOD 1');
        await unit.panel.cursor('L');
        expect(unit.panel.focused('L')).toEqual({row: 5, col: 5, text: '5.00'});

        // One full turn of the choices, whatever their order: each row with the scale the unit then navigates with
        const seen: [string, number][] = [];
        for (let i = 0; i < 3; i++) {
            await unit.panel.inner('L', 1);
            seen.push([Screen.read().rows('L')[5], unit.props.memory.navPage.xtkScale]);
        }

        expect(seen.sort()).toEqual([['CDI:±0.30NM', 0.3], ['CDI:±1.00NM', 1], ['CDI:±5.00NM', 5]]);
    });

    // 5-38 note: in the approach-arm mode the unit chooses +-1 NM and a less sensitive scale cannot be selected, so the
    // knob offers 1 and 0.3 only. 10 NM north of the airport the unit arms by itself (within 30 NM) and ramps to 1 in 30 s
    it('offers only ±1.00 and ±0.30 NM in the approach-arm mode (5-38)', async () => {
        const w = approachWorld();
        const unit = await bootUnit({
            facilities: w.facilities, position: w.north(10),
            panelXml: panelXml(APR_ARM_SWITCH),
            storage: {...savedFlightplan(0, [w.enraa, w.kprc]), turnAnticipation: false},
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        await vi.advanceTimersByTimeAsync(35_000); // The unit arms within 30 NM and ramps the scale to 1 NM in 30 s
        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ARM_LEG); // Precondition
        await unit.panel.selectPage('L', 'MOD 1');
        await unit.panel.cursor('L');

        const seen = new Set<string>();
        for (let i = 0; i < 4; i++) {
            await unit.panel.inner('L', 1);
            seen.add(Screen.read().rows('L')[5]);
        }

        expect([...seen].sort()).toEqual(['CDI:±0.30NM', 'CDI:±1.00NM']);
    });

    // 5-33: with an external LEG/OBS switch the MOD pages cannot change the mode; they show PRESS GPS CRS FOR (figure
    // 5-110) and ENT does nothing
    it('shows PRESS GPS CRS FOR in OBS with the external switch, and ENT keeps OBS (5-33)', async () => {
        const unit = await onStandardRoute(panelXml(LEG_OBS_SWITCH));
        unit.env.sim.set('Nav OBS:1', 'degrees', 70);
        unit.env.sim.set('GPS OBS ACTIVE', 'bool', true);
        await vi.advanceTimersByTimeAsync(2000);
        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_OBS); // Precondition: the switch selected OBS
        await unit.panel.selectPage('L', 'MOD 1');

        const screen = Screen.read();
        expect(screen.rows('L').slice(0, 2)).toEqual(['PRESS GPS  ', 'CRS FOR    ']);
        expect(screen.status().mode).toBe('enr:070 msg'); // No ent prompt
        // The switch would put the unit back into OBS at the next tick, so the mode alone cannot show a change by ENT
        const toLeg = vi.spyOn(unit.props.modeController, 'switchToEnrLegMode');
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);
        expect(toLeg).not.toHaveBeenCalled();
        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_OBS);
        expect(unit.errors).toEqual([]);
    });
});

// The CDI scale field builds its choices when the page is created. When the unit arms with MOD 1 in view (here by
// itself, inside 30 NM), the field still offers the three ENR choices, and the third one indexes past the two ARM
// choices: the scale becomes undefined and the CDI output NaN
describe('MOD 1 CDI scale when the unit arms with the page in view', () => {
    /** MOD 1 in view 40 NM north, then the aircraft moves to 25 NM: the unit arms and ramps to 1 NM */
    async function armedWithMod1InView() {
        const w = approachWorld();
        const unit = await bootUnit({
            facilities: w.facilities, position: w.north(40),
            panelXml: panelXml(APR_ARM_SWITCH),
            storage: {...savedFlightplan(0, [w.enraa, w.kprc]), turnAnticipation: false},
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        await unit.panel.selectPage('L', 'MOD 1');
        await moveAircraft(unit, w.north(25), {groundspeedKt: 120, trackTrue: 180});
        await vi.advanceTimersByTimeAsync(40_000); // The unit arms within 30 NM and ramps the scale to 1 NM in 30 s (6-1, 6-3)
        await unit.panel.cursor('L');
        return unit;
    }

    // 5-38 note: the control for the #260 test below. The unit armed with the page in view, and the field shows 1.00 NM
    it('armed at 25 NM with MOD 1 in view, the field shows ±1.00 NM (5-38)', async () => {
        const unit = await armedWithMod1InView();

        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ARM_LEG);
        expect(unit.props.memory.navPage.xtkScale).toBe(1);
        expect(unit.panel.focused('L')).toEqual({row: 5, col: 5, text: '1.00'});
    });

    // 5-38 note: in ARM nothing less sensitive than 1 NM can be selected, so a click leaves 1 or 0.3 NM, and the CDI
    // output stays a number. The field keeps the list it showed, and a click steps within it
    it('keeps a valid CDI scale when the knob turns after the unit armed with MOD 1 in view (5-38, #260)', async () => {
        const unit = await armedWithMod1InView();

        await unit.panel.inner('L', 1);
        await vi.advanceTimersByTimeAsync(2000);

        // Both ARM choices are accepted: which one a click lands on depends on the order of the choices, which the
        // guide does not give (5-38 only rules out the less sensitive scale). The test holds that the scale stays one of them
        expect([0.3, 1]).toContain(unit.props.memory.navPage.xtkScale);
        expect(Number.isFinite(unit.env.sim.get('GPS CDI SCALING', 'meters'))).toBe(true);
    });
});

// In APR the scale ramps from 1 to 0.3 NM over the last 2 NM to the FAF (6-3). The field shows 0.30 throughout, also on
// the tick of the activation, where the scale is still exactly 1 (characterization: the guide shows no value for the
// ramp)
describe('CDI scale field display (characterization)', () => {
    const field = (navmode: NavMode, xtkScale: number) => new CdiScaleField({navmode, xtkScale} as unknown as NavPageState);

    it('shows 0.30 in APR with the scale still exactly 1 (characterization, #160)', () => {
        expect(mountedText(field(NavMode.APR_LEG, 1))).toBe('0.30');
    });

    it('shows 0.30 in APR during the ramp (characterization, #160)', () => {
        expect(mountedText(field(NavMode.APR_LEG, 0.65))).toBe('0.30');
    });

    it('shows 1.00 during the ARM ramp from 5 to 1 NM (characterization, #160)', () => {
        expect(mountedText(field(NavMode.ARM_LEG, 3))).toBe('1.00');
    });
});

describe('CDI scale field clicks (characterization)', () => {
    // The mode changes at the 1 Hz tick, the field redraws at the 4 Hz display tick: a click in between must step within
    // the choices on the screen, not index into the list of the new mode (#260)
    it('a click before the next display tick steps within the choices shown, not those of the new mode (characterization, #260)', () => {
        const nav = {navmode: NavMode.ENR_LEG, xtkScale: 5} as unknown as NavPageState;
        const scale = new CdiScaleField(nav);
        mountedText(scale); // The pilot sees 0.30, 1.00 and 5.00 with 5.00 selected
        nav.navmode = NavMode.APR_LEG; // The unit switches to APR before the display ticks again

        scale.innerLeft();

        expect(nav.xtkScale).toBe(1);
    });
});
