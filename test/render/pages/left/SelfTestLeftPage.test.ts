import {describe, expect, it, vi} from 'vitest';
import {bootUnit} from '../../../harness/boot';
import {Screen} from '../../../harness/render/screen';

describe('self-test page', () => {
    it('outputs a course of 315° and an RMI bearing of 130° during the self-test (955b535)', async () => {
        const unit = await bootUnit({engineRunning: false, magvar: 0});
        await unit.panel.powerOn();
        // A fixed wait: the self-test page follows the 17 s welcome page and stays until it is approved
        await vi.advanceTimersByTimeAsync(19_000);

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
        const unit = await bootUnit({engineRunning: false, magvar: 0});
        await unit.panel.powerOn();
        await vi.advanceTimersByTimeAsync(19_000);

        expect(Screen.read().rows('L')).toContain('   OUT 315°'); // Precondition: the self-test page is showing
        expect(unit.env.sim.lastWrite('GPS APPROACH MODE')!.value).toBe(3);
        expect(unit.errors).toEqual([]);
    });
});

const HEADING_INPUT_XML = '<PlaneHTMLConfig><Instrument><Name>KLN90B</Name><Input><HeadingInput>true</HeadingInput></Input></Instrument></PlaneHTMLConfig>';

/** Cold boot, power on, wait for the self-test page (it follows the 17 s welcome page). HeadingInput is on, so that the roll command does not depend on the heading input pin (#143) */
async function onSelfTestPage() {
    const unit = await bootUnit({engineRunning: false, magvar: 0, panelXml: HEADING_INPUT_XML});
    await unit.panel.powerOn();
    await vi.advanceTimersByTimeAsync(19_000);
    expect(Screen.read().text()).toContain('APPROVE?');
    return unit;
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

/** Cold boot with the external indicator on `obs`, power on, and the self-test page after the 17 s welcome page */
async function selfTestWithCourse(obs: number, panelXml?: string) {
    const unit = await bootUnit({engineRunning: false, magvar: 0, panelXml});
    unit.env.sim.set('Nav OBS:1', 'degrees', obs);
    await unit.panel.powerOn();
    await vi.advanceTimersByTimeAsync(19_000);
    expect(Screen.read().text()).toContain('APPROVE?'); // Precondition: the self-test page
    return unit;
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
