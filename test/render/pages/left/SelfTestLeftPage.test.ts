import {describe, expect, it, vi} from 'vitest';
import {bootToSelfTest} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

describe('self-test page', () => {
    it('outputs a course of 315° and an RMI bearing of 130° during the self-test (955b535)', async () => {
        const unit = await bootToSelfTest({magvar: 0});

        // 3-4: the self-test shows OBS out 315° and RMI 130°
        const left = Screen.read().rows('L');
        expect(left).toContain('   OUT 315°');
        expect(left).toContain('RMI    130°');

        // The outputs follow the page: the course is 315° (magnetic, and the variation is 0), the bearing 130°
        const sim = unit.env.sim;
        expect(sim.get('GPS WP DESIRED TRACK', 'degrees')).toBeCloseTo(315, 1);
        expect(sim.get('GPS OBS VALUE', 'degrees')).toBeCloseTo(315, 1);
        expect(sim.get('L:KLN90B_GPS_WP_BEARING', 'degrees')).toBeCloseTo(130, 1);
        expect(unit.errors).toEqual([]);
    });

    // Public contract: during the self-test GPS APPROACH MODE is 3, so that the ARM and ACTV external annunciators both
    // light (the External Annunciators wiki page; Sensors.setMode)
    it('writes GPS APPROACH MODE 3 during the self-test', async () => {
        const unit = await bootToSelfTest({magvar: 0});

        expect(Screen.read().rows('L')).toContain('   OUT 315°'); // Precondition: the self-test page is showing
        expect(unit.env.sim.lastWrite('GPS APPROACH MODE')!.value).toBe(3);
        expect(unit.errors).toEqual([]);
    });
});

const HEADING_INPUT_XML = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input><HeadingInput>true</HeadingInput></Input></Instrument></PlaneHTMLConfig>';

/** The self-test page of a cold boot. HeadingInput is on, so that the roll command does not depend on the heading input pin (#143) */
function onSelfTestPage() {
    return bootToSelfTest({magvar: 0, panelXml: HEADING_INPUT_XML});
}

/** Reads an LVar every 250 ms (one display tick) for 12 s, 48 samples: the roll pattern is 5 s out and 5 s back */
async function sampleSelfTest(unit: Awaited<ReturnType<typeof onSelfTestPage>>, lvar: string, unitName: string): Promise<number[]> {
    const samples: number[] = [];
    for (let i = 0; i < 48; i++) {
        await vi.advanceTimersByTimeAsync(250);
        samples.push(unit.env.sim.get(lvar, unitName));
    }
    return samples;
}

// Spec tests of the external outputs during the self-test: Pilot's Guide 3-4 (the annunciators light, the flag shows
// FROM) and Installation Manual 2-69 (every external annunciator output is driven) and 2-70 (the roll command goes 0 to 5
// degrees right and back). One `it` per LVar, so that a break of one output turns one test red.
describe('self-test LVar outputs (spec)', () => {
    it('L:KLN90B_MsgLight is 1 throughout (3-4, 2-69)', async () => {
        const unit = await onSelfTestPage();
        expect(await sampleSelfTest(unit, 'L:KLN90B_MsgLight', 'bool')).toEqual(Array(48).fill(1));
    });

    it('L:KLN90B_WptLight is 1 throughout (3-4, 2-69)', async () => {
        const unit = await onSelfTestPage();
        expect(await sampleSelfTest(unit, 'L:KLN90B_WptLight', 'bool')).toEqual(Array(48).fill(1));
    });

    it('L:KLN90B_AnnunTest is 1 throughout (3-4, 2-69)', async () => {
        const unit = await onSelfTestPage();
        expect(await sampleSelfTest(unit, 'L:KLN90B_AnnunTest', 'bool')).toEqual(Array(48).fill(1));
    });

    // 2 is FROM in the convention of the sim's HSI TF FLAGS (0 flagged, 1 TO, 2 FROM)
    it('L:KLN90B_HSI_TF_FLAGS is 2, FROM, throughout (3-4)', async () => {
        const unit = await onSelfTestPage();
        expect(await sampleSelfTest(unit, 'L:KLN90B_HSI_TF_FLAGS', 'enum')).toEqual(Array(48).fill(2));
    });

    // Positive is a left bank (LVars.ts), so 5 degrees right is -5
    it('L:KLN90B_RollCommand goes from 0 to 5 degrees right and back (2-70)', async () => {
        const unit = await onSelfTestPage();
        const rolls = await sampleSelfTest(unit, 'L:KLN90B_RollCommand', 'degrees');

        expect(Math.min(...rolls)).toBe(-5);
        expect(Math.max(...rolls)).toBe(0);
    });
});

// Spec tests: past the self-test these outputs go out again (Installation Manual 2-69, 2-70). The MSG light is left
// out: the boot messages are still pending.
describe('LVar outputs after the self-test is approved (spec)', () => {
    async function approved() {
        const unit = await onSelfTestPage();
        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(2000);
        return unit;
    }

    it('L:KLN90B_AnnunTest is 0 (2-69)', async () => {
        const unit = await approved();
        expect(unit.env.sim.lastWrite('L:KLN90B_AnnunTest')?.value).toBe(0);
    });

    it('L:KLN90B_WptLight is 0 (2-69)', async () => {
        const unit = await approved();
        expect(unit.env.sim.lastWrite('L:KLN90B_WptLight')?.value).toBe(0);
    });

    it('L:KLN90B_RollCommand is 0 (2-70)', async () => {
        const unit = await approved();
        expect(unit.env.sim.lastWrite('L:KLN90B_RollCommand')?.value).toBe(0);
    });
});

/** The self-test page of a cold boot with the external indicator on `obs` */
function selfTestWithCourse(obs: number, panelXml?: string) {
    return bootToSelfTest({magvar: 0, panelXml, simVars: [{name: 'Nav OBS:1', unit: 'degrees', value: obs}]});
}

describe('self-test left page (characterization)', () => {
    it('shows the test values and the course read from the indicator (characterization)', async () => {
        await selfTestWithCourse(242);

        const screen = Screen.read();
        expect([...screen.rows('L'), ...screen.maskRows('L')].join('\n')).toMatchInlineSnapshot(`
          "DIS  34.5NM
          ηηηηηιηΚΑηη
          OBS IN 242°
             OUT 315°
          RMI    130°
          ANNUN    ON
          ...........
          ...........
          ...........
          ...........
          ...........
          ..........."
        `);
    });

    // Without a course input (ObsSource 0) OBS IN shows dashes
    it('shows OBS IN ---° when the unit reads no indicator (characterization)', async () => {
        await selfTestWithCourse(242, '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input><ObsSource>0</ObsSource></Input></Instrument></PlaneHTMLConfig>');

        expect(Screen.read().rows('L')[2]).toBe('OBS IN ---°');
    });
});

describe('self-test left page (spec)', () => {
    // 3-4 and figure 3-4: DIS always 34.5 NM; the D-bar half scale right with the FROM triangle, which is the bar
    // between the second and third dot right of the center (the glyph key is in DeviationBar.test.ts: ι the FROM
    // triangle, Κ and Α a dot with the bar at its right and left edge); OBS IN the course read from the indicator
    // (242° in the figure); OUT always 315°; RMI always 130°; ANNUN ON after a passed internal test
    it('shows the fixed test values and the course read from the indicator (3-4, figure 3-4)', async () => {
        await selfTestWithCourse(242);

        expect(Screen.read().rows('L')).toEqual([
            'DIS  34.5NM',
            'ηηηηηιηΚΑηη',
            'OBS IN 242°',
            '   OUT 315°',
            'RMI    130°',
            'ANNUN    ON',
        ]);
    });
});

describe('self-test left page knobs (characterization)', () => {
    // The left knobs change nothing on the self-test page: neither the left page, nor the right cursor, nor the left
    // status field
    it('ignores the left knobs (characterization)', async () => {
        const unit = await selfTestWithCourse(242);
        const left = Screen.read().rows('L');
        const focused = unit.panel.focused('R');

        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1);
        await unit.panel.outer('L', -2);
        await unit.panel.inner('L', -2);

        expect(Screen.read().rows('L')).toEqual(left);
        expect(unit.panel.focused('R')).toEqual(focused);
        expect(Screen.read().status().left).toBe('');
    });
});

const OBS_TARGET_XML = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Output><ObsTarget>1</ObsTarget></Output></Instrument></PlaneHTMLConfig>';

/**
 * The self-test page with a magnetic variation of 10° E and an HSI whose course pointer the unit drives and reads
 * (ObsTarget 1, ObsSource 1). The fake moves the pointer on K:VOR1_SET as the sim does; the unit sends it every
 * calculation tick, so the pointer has moved when the two seconds have passed
 */
async function selfTestWithVariation() {
    const unit = await bootToSelfTest({
        magvar: 10,
        panelXml: OBS_TARGET_XML,
        simVars: [{name: 'Nav OBS:1', unit: 'degrees', value: 242}],
    });
    unit.env.sim.applyObsKeyEvents = true;
    await vi.advanceTimersByTimeAsync(2000);
    expect(unit.props.magvar.getCurrentMagvar()).toBe(10); // Precondition: the variation is in effect
    return unit;
}

// 3-4: OBS OUT is always 315° and RMI always 130°, whatever the variation; with a driven course pointer the pointer
// goes to 315° and OBS IN shows 315° too. Installation Manual 2-68: the RMI shows 130° on the self-test page.
describe('self-test outputs with a magnetic variation (spec)', () => {
    it('drives the course pointer to 315° and reads it back as OBS IN 315° (3-4)', async () => {
        const unit = await selfTestWithVariation();
        const sim = unit.env.sim;

        expect(sim.keyEvents.filter(k => k.name === 'K:VOR1_SET').slice(-1)[0].value).toBe(315);
        expect(sim.get('GPS OBS VALUE', 'degrees')).toBeCloseTo(315, 6);
        expect(sim.get('GPS WP DESIRED TRACK', 'degrees')).toBeCloseTo(315, 6);
        expect(Screen.read().rows('L').slice(2, 4)).toEqual(['OBS IN 315°', '   OUT 315°']);
    });

    // The sibling of the pin below: the page itself shows 130°
    it('shows RMI 130° on the page (3-4)', async () => {
        await selfTestWithVariation();

        expect(Screen.read().rows('L')[4]).toBe('RMI    130°');
    });

    // NavCalculator sets the self-test bearing as a true bearing (130) and the output converts it to magnetic, so the
    // RMI shows 130° minus the variation: 120° here
    it.fails('outputs an RMI bearing of 130° (3-4, Installation Manual 2-68) (#NEW-B-1)', async () => {
        const unit = await selfTestWithVariation();

        expect(unit.env.sim.get('L:KLN90B_GPS_WP_BEARING', 'degrees')).toBeCloseTo(130, 6);
    });
});

/**
 * The self-test page of a unit that was last used at its present position (no POSITION DIFFERS message), with an
 * indicator it reads on 242°, as in figure 3-4
 */
function selfTestAsFigure() {
    return bootToSelfTest({
        magvar: 0,
        storage: {lastLatitude: 47, lastLongitude: 8},
        simVars: [{name: 'Nav OBS:1', unit: 'degrees', value: 242}],
    });
}

// Figure 3-4: the status line of the self-test page shows no page names, enr-leg in the middle and CRSR on the right,
// with OBS IN reading 242° against the fixed OBS OUT of 315°
describe('self-test page status line (spec)', () => {
    // The sibling of the pin below
    it('shows no page name on the left and CRSR on the right with OBS IN 242° (figure 3-4)', async () => {
        await selfTestAsFigure();

        expect(Screen.read().rows('L')[2]).toBe('OBS IN 242°');
        expect(Screen.read().status().left).toBe('');
        expect(Screen.read().status().right).toBe('CRSR');
    });

    // The persistent ADJ NAV IND CRS TO 315° compares the fixed self-test course with the indicator and posts during
    // the self-test, so msg follows enr-leg. The KLN 89 trainer showed no message prompt on its self-test page (T8); it
    // has no readable course there and no status line, so this is its rule and not its readable-course case
    it.fails('shows enr-leg without msg (figure 3-4; checked in the KLN 89 trainer, 2026-10-09, T8) '
        + '(#NEW-B-2)', async () => {
        await selfTestAsFigure();

        expect(Screen.read().status().mode).toBe('enr-leg');
    });
});
