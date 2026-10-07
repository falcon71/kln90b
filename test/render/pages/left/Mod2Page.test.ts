import {describe, expect, it, vi} from 'vitest';
import {bootUnit, HeadlessUnit, settle} from '../../../harness/boot';
import {approachWorld} from '../../../harness/fixtures';
import {airport, vor} from '../../../harness/navdata/builders';
import {savedFlightplan} from '../../../harness/storage';
import {Screen} from '../../../harness/render/screen';
import {NavMode} from '../../../../kln90b/data/VolatileMemory';

const panelXml = (input: string) => `<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input>${input}</Input></Instrument></PlaneHTMLConfig>`;
/** The unit cannot read the external indicator, so the OBS course is entered on the unit and OBS shows a colon (5-35) */
const OBS_SOURCE_OFF = panelXml('<ObsSource>0</ObsSource>');
const LEG_OBS_SWITCH = panelXml('<ExternalSwitches><LegObsSwitchInstalled>true</LegObsSwitchInstalled></ExternalSwitches>');

/**
 * A leg from KAAA to the VOR ABC with the aircraft on it and ABC active, boxed in by the callers below. The legs lie on
 * the equator or on a meridian, so their true course is exactly 090 or 000 everywhere, and the variation is 0: the
 * course the unit takes for OBS is that course by construction
 */
async function onLeg(from: {lat: number, lon: number}, to: {lat: number, lon: number}, position: {lat: number, lon: number}, xml?: string): Promise<HeadlessUnit> {
    const kaaa = airport('KAAA', from.lat, from.lon);
    const abc = vor('ABC', to.lat, to.lon);
    const unit = await bootUnit({facilities: [kaaa, abc], position, panelXml: xml, storage: savedFlightplan(0, [kaaa, abc])});
    await settle(unit);
    expect(unit.props.memory.navPage.activeWaypoint.getActiveWpt()!.icaoStruct.ident).toBe('ABC'); // Precondition
    return unit;
}

/** A leg due east along the equator, KAAA (0, 8) to ABC (0, 9), with the aircraft on it at 8.4 E: OBS 090 */
const onEquatorLeg = (xml?: string) => onLeg({lat: 0, lon: 8}, {lat: 0, lon: 9}, {lat: 0, lon: 8.4}, xml);

/** A leg due north along a meridian, KAAA (0, 8) to ABC (1, 8), with the aircraft on it at 0.4 N: OBS 000 */
const onMeridianLeg = (xml?: string) => onLeg({lat: 0, lon: 8}, {lat: 1, lon: 8}, {lat: 0.4, lon: 8}, xml);

describe('MOD 2 page (characterization)', () => {
    it('shows ACTIVE MODE and the course read from the indicator in ENR-OBS (characterization)', async () => {
        const unit = await onEquatorLeg();
        unit.env.sim.set('Nav OBS:1', 'degrees', 70);
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(1000);

        const screen = Screen.read();
        expect([...screen.rows('L'), ...screen.maskRows('L')].join('\n')).toMatchInlineSnapshot(`
          "ACTIVE MODE
                     
                     
          OBS 070°   
                     
          CDI:±5.00NM
          ...........
          ...........
          ...........
          ...........
          ...........
          ..........."
        `);
        expect(screen.status().left).toBe('MOD 2');
    });

    // With the default installation the unit reads an indicator it does not drive, so the course cannot be entered on
    // the unit and the colon is left out, in Leg mode too. Whether the real unit shows the colon here is not settled
    it('shows OBS ---° without a colon in ENR-LEG with the default installation (characterization)', async () => {
        const unit = await onEquatorLeg();
        await unit.panel.selectPage('L', 'MOD 2');

        const screen = Screen.read();
        expect(screen.rows('L')[3]).toBe('OBS ---°   ');
        expect(screen.status().mode).toBe('enr-leg ent');
    });
});

describe('MOD 2 page (spec)', () => {
    // 5-33, figure 5-108: in Leg mode MOD 2 offers OBS with PRESS ENT TO ACTIVATE, no course yet (dashes), the CDI scale,
    // and the ent prompt in the status line. The colon is left out of the assertion: its presence in Leg mode is not
    // settled by the figures (the characterization above shows what the unit does)
    it('shows PRESS ENT TO ACTIVATE, OBS ---° and the ent prompt in ENR-LEG (5-33)', async () => {
        const unit = await onEquatorLeg(OBS_SOURCE_OFF);
        await unit.panel.selectPage('L', 'MOD 2');

        const screen = Screen.read();
        const rows = screen.rows('L');
        expect(rows.slice(0, 3)).toEqual(['PRESS ENT  ', 'TO ACTIVATE', '           ']);
        expect(rows[3].slice(0, 3) + rows[3].slice(4)).toBe('OBS---°   ');
        expect(rows.slice(4)).toEqual(['           ', 'CDI:±5.00NM']);
        expect(screen.status().left).toBe('MOD 2');
        expect(screen.status().mode).toBe('enr-leg ent');
    });

    // 5-33 step 3 and figure 5-109: ENT activates OBS; MOD 2 then shows ACTIVE MODE and the course. 5-32: the OBS mode is
    // annunciated with the selected course (ENR:ddd). 5-35 note: the colon shows that the course can be entered on the
    // unit, which is the case when the unit cannot read the indicator. 5-36 rule 2.ii: the course keeps the deviation,
    // which on the leg itself is the leg's course, 090
    it('enters ENR-OBS with ENT and shows OBS:090° and enr:090 (5-32, 5-33, 5-35, 5-36)', async () => {
        const unit = await onEquatorLeg(OBS_SOURCE_OFF);
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(1000);

        const screen = Screen.read();
        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_OBS);
        expect(screen.rows('L')).toEqual(['ACTIVE MODE', '           ', '           ', 'OBS:090°   ', '           ', 'CDI:±5.00NM']);
        expect(screen.status().mode).toBe('enr:090 msg'); // No ent prompt: the page accepts no ENT in the active mode
    });

    // 5-35 steps b and c: with the colon the cursor goes to the OBS course and the inner knob selects it; 5-38 step 2:
    // the outer knob moves the cursor on to the CDI scale
    it('puts the cursor on the OBS course first and moves it to the CDI scale with the outer knob (5-35, 5-38)', async () => {
        const unit = await onEquatorLeg(OBS_SOURCE_OFF);
        await unit.panel.obsMode();
        await unit.panel.cursor('L');

        expect(unit.panel.focused('L')).toEqual({row: 3, col: 4, text: '090°'});
        await unit.panel.outer('L', 1);
        expect(unit.panel.focused('L')).toEqual({row: 5, col: 5, text: '5.00'});
    });

    // 5-35 note: without the colon the course must be changed on the external indicator. The unit reads the indicator
    // (ObsSource 1 by default) and drives none, so the cursor skips the course and lands on the CDI scale, and the
    // inner knob changes the scale, not the course
    it('reads the course from the indicator without a colon and keeps the cursor off it (5-35)', async () => {
        const unit = await onEquatorLeg();
        unit.env.sim.set('Nav OBS:1', 'degrees', 70);
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(1000);
        expect(Screen.read().rows('L')[3]).toBe('OBS 070°   ');

        await unit.panel.cursor('L');
        expect(unit.panel.focused('L')).toEqual({row: 5, col: 5, text: '5.00'});
        await unit.panel.inner('L', 1);
        await vi.advanceTimersByTimeAsync(1000);

        expect(unit.props.memory.navPage.obsMag).toBe(70);
        expect(Screen.read().rows('L')[3]).toBe('OBS 070°   ');
        expect(['CDI:±0.30NM', 'CDI:±1.00NM']).toContain(Screen.read().rows('L')[5]); // Another of the choices of 5-38
    });

    // 5-33: with an external LEG/OBS switch the MOD pages cannot change the mode. Figure 5-110: MOD 2 then shows PRESS
    // GPS CRS FOR, and the status line has no ent prompt
    it('shows PRESS GPS CRS FOR in ENR-LEG with the external switch, and ENT keeps LEG (5-33)', async () => {
        const unit = await onEquatorLeg(LEG_OBS_SWITCH);
        await unit.panel.selectPage('L', 'MOD 2');

        const screen = Screen.read();
        expect(screen.rows('L').slice(0, 2)).toEqual(['PRESS GPS  ', 'CRS FOR    ']);
        expect(screen.status().mode).toBe('enr-leg msg'); // No ent prompt
        const toObs = vi.spyOn(unit.props.modeController, 'switchToEnrObsMode');
        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(1000);
        expect(toObs).not.toHaveBeenCalled();
        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_LEG);
        expect(unit.errors).toEqual([]);
    });
});

// 5-35 and its notes: with an indicator the unit reads and can drive (ObsSource 1 by default, ObsTarget 1: an EFIS or
// a KA 90 on VOR 1), OBS shows a colon, the course is entered on MOD 2, and the indicator is slewed to it. Each
// calculation tick first reads the indicator (Sensors), then ModeController.tick sets the OBS to what it read, and only
// then NavCalculator writes K:VOR1_SET: a course turned on MOD 2 is replaced by the indicator's before it is ever sent
describe('MOD 2 OBS course with a driven indicator', () => {
    /** ObsTarget 1 with the indicator on 090, OBS mode, the cursor on the course. The fake acts on K:VOR1_SET only on
     * request (testing.md), so it moves Nav OBS:1 here, as the sim does */
    async function drivenIndicatorOn90() {
        const unit = await onEquatorLeg('<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Output><ObsTarget>1</ObsTarget></Output></Instrument></PlaneHTMLConfig>');
        unit.env.sim.applyObsKeyEvents = true;
        unit.env.sim.set('Nav OBS:1', 'degrees', 90);
        await unit.panel.obsMode();
        await vi.advanceTimersByTimeAsync(1000);
        await unit.panel.cursor('L');
        return unit;
    }

    // 5-35 note: the colon shows that the course can be entered on the unit, and the cursor goes to it
    it('OBS:090° with a colon and the cursor on the course with a driven indicator (5-35)', async () => {
        const unit = await drivenIndicatorOn90();

        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ENR_OBS);
        expect(unit.panel.focused('L')).toEqual({row: 3, col: 4, text: '090°'});
    });

    it.fails('keeps a course turned on MOD 2 and slews the indicator to it (5-35, #NEW-7-4)', async () => {
        const unit = await drivenIndicatorOn90();

        await unit.panel.inner('L', 3);
        await vi.advanceTimersByTimeAsync(2000);

        expect(Math.round(unit.props.memory.navPage.obsMag)).toBe(93);
        expect(Math.round(unit.env.sim.get('Nav OBS:1', 'degrees'))).toBe(93);
    });
});

describe('MOD 2 OBS course knob (spec)', () => {
    // 5-35: the left inner knob selects the course; the KLN 89 trainer steps one degree per click, and the status line
    // follows with the course (5-32)
    it('steps the OBS course one degree per click (5-35, checked in the KLN 89 trainer, 2026-10-07)', async () => {
        const unit = await onEquatorLeg(OBS_SOURCE_OFF);
        await unit.panel.obsMode();
        await unit.panel.cursor('L');

        await unit.panel.inner('L', 3);
        expect(Screen.read().rows('L')[3]).toBe('OBS:093°   ');
        expect(Screen.read().status().mode).toBe('enr:093 msg');

        await unit.panel.inner('L', -5);
        expect(Screen.read().rows('L')[3]).toBe('OBS:088°   ');
        expect(unit.props.memory.navPage.obsMag).toBeCloseTo(88, 3);
    });

    // 5-35: the KLN 89 trainer shows north as 000, never 360, and the course wraps between 000 and 359. A leg due north
    // along a meridian gives a course of exactly 0, so the wrap is seen from a clean 000
    it('shows north as 000° and wraps between 000° and 359° (5-35, checked in the KLN 89 trainer, 2026-10-07)', async () => {
        const unit = await onMeridianLeg(OBS_SOURCE_OFF);
        await unit.panel.obsMode();
        await unit.panel.cursor('L');
        expect(unit.props.memory.navPage.obsMag).toBe(0); // Precondition: exactly north
        expect(Screen.read().rows('L')[3]).toBe('OBS:000°   ');

        await unit.panel.inner('L', -1);
        expect(Screen.read().rows('L')[3]).toBe('OBS:359°   ');

        await unit.panel.inner('L', 1);
        expect(Screen.read().rows('L')[3]).toBe('OBS:000°   ');
    });
});

// 5-35 and the KLN 89 trainer: north shows 000, never 360. On the equator leg the course the unit takes is a hair under
// 090 (89.99999914 as the unit computes it), so ninety clicks to the left leave a hair under 360, which the row rounds
// to 360
describe('MOD 2 OBS course just below north', () => {
    /** The equator leg with the course entered on the unit, and the course turned 90 degrees left (22.5 s of clicks) */
    async function turned90Left() {
        const unit = await onEquatorLeg(OBS_SOURCE_OFF);
        await unit.panel.obsMode();
        await unit.panel.cursor('L');
        await unit.panel.inner('L', -90);
        return unit;
    }

    it('turns the course 90 degrees left from the equator leg (5-35)', async () => {
        const unit = await turned90Left();

        const obs = unit.props.memory.navPage.obsMag;
        expect(obs).toBeGreaterThanOrEqual(359.5);
        expect(obs).toBeLessThan(360);
    }, 30_000);

    it.fails('shows a course just below north as 000° (5-35, checked in the KLN 89 trainer, 2026-10-07, #NEW-7-6)', async () => {
        const unit = await turned90Left();

        expect(Screen.read().rows('L')[3]).toBe('OBS:000°   ');
    }, 30_000);
});

describe('MOD 2 CDI scale field with an approach armed 40 NM from the airport (#160)', () => {
    /** 40 NM north of KPRC with the approach loaded, armed with the GPS APR switch, MOD 2 in view */
    async function armedAt40WithMod2() {
        const w = approachWorld();
        const unit = await bootUnit({
            facilities: w.facilities, position: w.north(40),
            storage: {...savedFlightplan(0, [w.enraa, w.kprc]), turnAnticipation: false},
        });
        await settle(unit);
        await unit.panel.loadProcedure('APT 8');
        await vi.advanceTimersByTimeAsync(6000);
        await unit.panel.press('KLN90B_ApprArm_Push');
        await unit.panel.selectPage('L', 'MOD 2');
        await vi.advanceTimersByTimeAsync(1000);
        return unit;
    }

    // 6-1: the sibling of the pin below. Armed beyond 30 NM the scale stays at 5 NM, and MOD 2 is in view
    it('armed 40 NM from the airport by the switch, MOD 2 shown (6-1)', async () => {
        const unit = await armedAt40WithMod2();

        expect(unit.props.memory.navPage.navmode).toBe(NavMode.ARM_LEG);
        expect(unit.props.memory.navPage.xtkScale).toBe(5);
        expect(Screen.read().status().left).toBe('MOD 2');
    });

    // 5-38, 6-1: the scale in use is 5 NM, so MOD 2 must show it. Mod2Page.getScaleIdx looks 5 up in the ARM choices
    // [0.3, 1], gets -1, and the field shows no value
    it.fails('shows CDI:±5.00NM when armed by the switch 40 NM from the airport (5-38, 6-1, #160)', async () => {
        const unit = await armedAt40WithMod2();

        expect(Screen.read().rows('L')[5]).toBe('CDI:±5.00NM');
    });
});
