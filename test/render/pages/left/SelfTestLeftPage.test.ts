import {describe, expect, it, vi} from 'vitest';
import {BootOptions, bootToSelfTest, bootUnit, HeadlessUnit} from '../../../harness/boot';
import {HEADING_INPUT, NO_OBS, panelXml} from '../../../harness/panelXml';
import {Screen} from '../../../harness/render/screen';
import {messages} from '../../../harness/readers';
import {standardRoute} from '../../../harness/fixtures';
import {savedFlightplan} from '../../../harness/storage';
import {convertUnit} from '../../../harness/sim/units';

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

const HEADING_INPUT_XML = panelXml(HEADING_INPUT);

/**
 * The self-test page of a cold boot. HeadingInput is on, because the unit sends the roll pattern only with a heading
 * input (2-69, #143)
 */
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

// Installation Manual 2-69: without a heading input there is no roll steering output at all, so the self-test pattern
// of 2-70 is not sent either (#143)
describe('self-test roll command without a heading input (spec)', () => {
    it('L:KLN90B_RollCommand is 0 throughout (2-69, #143)', async () => {
        const unit = await bootToSelfTest({magvar: 0});
        expect(await sampleSelfTest(unit, 'L:KLN90B_RollCommand', 'degrees')).toEqual(Array(48).fill(0));
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
function selfTestWithCourse(obs: number, xml?: string) {
    return bootToSelfTest({magvar: 0, panelXml: xml, simVars: [{name: 'Nav OBS:1', unit: 'degrees', value: obs}]});
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
        await selfTestWithCourse(242, panelXml(NO_OBS));

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

const OBS_TARGET_XML = panelXml({'Output.ObsTarget': 1});

/**
 * The self-test page with a magnetic variation (default 10° E, negative is west) and an HSI whose course pointer the unit drives and reads
 * (ObsTarget 1, ObsSource 1). The fake moves the pointer on K:VOR1_SET as the sim does; the unit sends it every
 * calculation tick, so the pointer has moved when the two seconds have passed
 */
async function selfTestWithVariation(magvar = 10) {
    const unit = await bootToSelfTest({
        magvar,
        panelXml: OBS_TARGET_XML,
        simVars: [{name: 'Nav OBS:1', unit: 'degrees', value: 242}],
    });
    unit.env.sim.applyObsKeyEvents = true;
    await vi.advanceTimersByTimeAsync(2000);
    expect(unit.props.magvar.getCurrentMagvar()).toBe(magvar); // Precondition: the variation is in effect
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

    // The page and the output agree: the page itself shows 130°
    it('shows RMI 130° on the page (3-4)', async () => {
        await selfTestWithVariation();

        expect(Screen.read().rows('L')[4]).toBe('RMI    130°');
    });

    // The self-test bearing is held true and the output converts it to magnetic, so a bearing that is not converted
    // to true first comes out as 130° minus the variation, 120° here
    it('outputs an RMI bearing of 130° (3-4, Installation Manual 2-68) (#329)', async () => {
        const unit = await selfTestWithVariation();

        expect(unit.env.sim.get('L:KLN90B_GPS_WP_BEARING', 'degrees')).toBeCloseTo(130, 6);
    });

    it('outputs an RMI bearing of 130° with a westerly variation too (3-4, Installation Manual 2-68) (#329)', async () => {
        const unit = await selfTestWithVariation(-7);

        expect(Screen.read().rows('L')[4]).toBe('RMI    130°');
        expect(unit.env.sim.get('L:KLN90B_GPS_WP_BEARING', 'degrees')).toBeCloseTo(130, 6);
    });

    // Public contract: GPS WP BEARING is the magnetic bearing and GPS WP TRUE BEARING the true one of the same
    // bearing (CLAUDE.md, GPS SimVars; Sensors.setWpBearing), so with 10° E the magnetic 130° is 140° true. The true
    // value follows from the magnetic one, it is not shown on a page
    it('outputs GPS WP BEARING 130° magnetic and GPS WP TRUE BEARING 140° during the self-test (#329)', async () => {
        const unit = await selfTestWithVariation();

        expect(unit.env.sim.get('GPS WP BEARING', 'degrees')).toBeCloseTo(130, 6);
        expect(unit.env.sim.get('GPS WP TRUE BEARING', 'degrees')).toBeCloseTo(140, 6);
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
    // The sibling of the pin below: the mode field starts with enr-leg (the pin asserts that nothing follows it)
    it('shows no page name, enr-leg first and CRSR on the right with OBS IN 242° (figure 3-4)', async () => {
        await selfTestAsFigure();

        expect(Screen.read().rows('L')[2]).toBe('OBS IN 242°');
        expect(Screen.read().status().left).toBe('');
        expect(Screen.read().status().mode.split(' ')[0]).toBe('enr-leg');
        expect(Screen.read().status().right).toBe('CRSR');
    });

    // Before #330 the persistent ADJ NAV IND CRS TO 315° compared the fixed self-test course with the indicator and
    // posted during the self-test, so msg followed enr-leg. The KLN 89 trainer showed no message prompt on its self-test
    // page (T8); it has no readable course there and no status line, so this is its rule and not its readable-course
    // case. The AVsoftech trainer (unreliable) showed no prompt either with its course well away from 315°
    it('shows enr-leg without msg (figure 3-4; checked in the KLN 89 trainer, 2026-10-09, T8) '
        + '(#330)', async () => {
        await selfTestAsFigure();

        expect(Screen.read().status().mode).toBe('enr-leg');
    });

    // T8's own case: the 89 reads no course. Before #330 the first self-test course opened the 30 s window of the
    // message (#177), so msg showed for most of the first half minute of the page
    it('shows enr-leg without msg without a readable indicator (checked in the KLN 89 trainer, 2026-10-09, T8) (#330)', async () => {
        const unit = await bootToSelfTest({magvar: 0, storage: {lastLatitude: 47, lastLongitude: 8}, panelXml: panelXml(NO_OBS)});
        const modes: string[] = [];
        for (let i = 0; i < 30; i++) {
            modes.push(Screen.read().status().mode);
            await vi.advanceTimersByTimeAsync(1000);
        }

        expect(new Set(modes)).toEqual(new Set(['enr-leg']));
        expect(messages(unit)).toEqual([]);
    });
});

/**
 * A unit at KAAA with the standard route KAAA, ABC, KBBB as FPL 0 (DTK 050°, magvar 0) and an indicator it reads on
 * `obsIn`
 */
function onStandardRoute(obsIn: number): BootOptions {
    const {kaaa, abc, kbbb} = standardRoute();
    return {
        magvar: 0,
        facilities: [kaaa, abc, kbbb],
        storage: {lastLatitude: 47, lastLongitude: 8, ...savedFlightplan(0, [kaaa, abc, kbbb])},
        simVars: [{name: 'Nav OBS:1', unit: 'degrees', value: obsIn}],
    };
}

/** The self-test page of `onStandardRoute(obsIn)`, approved at once */
async function approvedOnStandardRoute(obsIn: number): Promise<HeadlessUnit> {
    const unit = await bootToSelfTest(onStandardRoute(obsIn));
    await unit.panel.approveSelfTest();
    await vi.advanceTimersByTimeAsync(2000); // Two calculation ticks: the self-test course gives way to the DTK
    expect(Math.round(unit.props.modeController.getDtkOrObsMagnetic()!)).toBe(50); // Precondition: the leg to ABC
    return unit;
}

/** The ADJ NAV IND CRS messages listed at every second for the next `seconds` */
async function adjustMessagesFor(unit: HeadlessUnit, seconds: number): Promise<string[]> {
    const seen = new Set<string>();
    for (let i = 0; i < seconds; i++) {
        messages(unit).filter(m => m.startsWith('ADJ NAV IND CRS')).forEach(m => seen.add(m));
        await vi.advanceTimersByTimeAsync(1000);
    }
    return [...seen];
}

const approveShows = () => Screen.read().rows('R').some(r => r.trim() === 'APPROVE?');

describe('ADJ NAV IND CRS around the self-test', () => {
    // The maintainer's ruling (#330): the message is not evaluated before the self-test is approved, on the Turn-On page
    // as well as on the self-test page. Before, the Turn-On page computed the DTK of 050° and listed the message from
    // about 13 s after the power-on
    it('is not listed from the power-on until the approval, with the indicator off the DTK (#330)', async () => {
        const unit = await bootUnit({...onStandardRoute(242), engineRunning: false});
        await unit.panel.powerOn();

        expect(await adjustMessagesFor(unit, 30)).toEqual([]);
        expect(approveShows()).toBe(true); // Precondition: not yet approved
    });

    // #330 for the indicator the unit drives (ObsTarget 1): the self-test page sends its fixed course of 315° to the
    // indicator and reads it back one tick later, so the driven variant of the message saw the two differ and listed
    // before the approval. It samples every display tick, because the difference lasts less than a second
    it('is not listed on the Turn-On or the self-test page with an indicator the unit drives (#330)', async () => {
        const unit = await bootUnit({
            ...onStandardRoute(50), panelXml: panelXml({'Output.ObsTarget': 1}), engineRunning: false,
        });
        unit.env.sim.applyObsKeyEvents = true;
        await unit.panel.powerOn();

        const seen: string[] = [];
        for (let i = 0; i < 120; i++) {
            messages(unit).filter(m => m.startsWith('ADJ NAV IND CRS')).forEach(m => seen.push(m));
            await vi.advanceTimersByTimeAsync(250);
        }

        expect(seen).toEqual([]);
        expect(approveShows()).toBe(true); // Precondition: still on the self-test page, not yet approved
        expect(unit.env.sim.keyEvents.some(k => k.name === 'K:VOR1_SET' && k.value === 315)).toBe(true); // The course was slewed
    });

    // B-1: with a readable indicator the message shows while the course differs from the DTK by more than 5°
    it('shows ADJ NAV IND CRS TO 050° right after the approval with the indicator off the DTK (B-1)', async () => {
        const unit = await approvedOnStandardRoute(242);

        expect(await adjustMessagesFor(unit, 40)).toEqual(['ADJ NAV IND CRS TO 050°']);
        expect(messages(unit)).toContain('ADJ NAV IND CRS TO 050°'); // Still there after 40 s: the course differs
    });

    // #330: the start-up is no DTK change, so the DTK at the approval opens no 30 s window (#177) for a pilot whose
    // indicator is already on it
    it('shows no ADJ NAV IND CRS right after the approval with the indicator on the DTK (#330)', async () => {
        const unit = await approvedOnStandardRoute(50);

        expect(await adjustMessagesFor(unit, 40)).toEqual([]);
    });

    // #330: every power-on waits for its own approval. The listed message goes with the power-off (MessageHandler.clear)
    // and does not come back on the Turn-On page or the self-test page of the next power-on, only after its approval
    it('is not listed again before the approval of the next power-on (#330)', async () => {
        const unit = await approvedOnStandardRoute(242);
        expect(messages(unit)).toContain('ADJ NAV IND CRS TO 050°'); // Precondition: listed after the first approval

        await unit.panel.powerCycle();
        expect(await adjustMessagesFor(unit, 25)).toEqual([]);
        expect(approveShows()).toBe(true); // Precondition: not yet approved

        await unit.panel.approveSelfTest();
        await vi.advanceTimersByTimeAsync(2000);
        expect(messages(unit)).toContain('ADJ NAV IND CRS TO 050°');
    });

    // #330: the engine-running start skips the Turn-On and self-test pages (WelcomePage, forceReadyToUse), and a
    // skipped self-test counts as approved
    it('shows ADJ NAV IND CRS TO 050° on an engine-running start, which skips the self-test (#330)', async () => {
        const unit = await bootUnit(onStandardRoute(242));

        expect(await adjustMessagesFor(unit, 10)).toEqual(['ADJ NAV IND CRS TO 050°']);
    });

    // #330: on the engine-running start too, the first DTK is the start-up course and opens no 30 s window (#177)
    it('shows no ADJ NAV IND CRS on an engine-running start with the indicator on the DTK (#330)', async () => {
        const unit = await bootUnit(onStandardRoute(50));
        await vi.advanceTimersByTimeAsync(2000);
        expect(Math.round(unit.props.modeController.getDtkOrObsMagnetic()!)).toBe(50); // Precondition: the leg to ABC

        expect(await adjustMessagesFor(unit, 40)).toEqual([]);
    });
});

describe('a power-off during the self-test (#400)', () => {
    it('outputs no self-test values on the Turn-On page after a power-off during the self-test (#400)', async () => {
        const unit = await bootToSelfTest({magvar: 0});
        const from = unit.env.sim.writes.length;
        await unit.panel.powerCycle();
        await vi.advanceTimersByTimeAsync(5000); // the Turn-On page (17 s, WelcomePage TEST_TIME)

        expect(Screen.read().row(0)).toBe(' GPS             ORS 20'); // Precondition: the Turn-On page is showing
        expect(unit.props.memory.navPage.isSelfTestActive).toBe(false);
        const after = unit.env.sim.writes.slice(from);
        expect(after.filter(w => w.name === 'GPS APPROACH MODE' && w.value === 3)).toEqual([]);
        // The DTK is written in radians (Sensors.setDesiredTrack), so it is converted before the comparison
        expect(after.filter(w => w.name === 'GPS WP DESIRED TRACK'
            && Math.abs(convertUnit(w.value as number, w.unit, 'degrees') - 315) < 0.1)).toEqual([]);
        expect(unit.errors).toEqual([]);
    });
});
