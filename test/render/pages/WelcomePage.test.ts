import {describe, expect, it, onTestFinished, vi} from 'vitest';
import {FacilitySearchType, IcaoValue} from '@microsoft/msfs-sdk';
import {bootUnit, HeadlessUnit} from '../../harness/boot';
import {Screen} from '../../harness/render/screen';
import {MemoryFacilityClient} from '../../harness/navdata/MemoryFacilityClient';
import {DEFAULT_START} from '../../harness/sim/clock';
import {panelXml} from '../../harness/panelXml';

const TOP_ROW = ' GPS             ORS 20';
const BOTTOM_ROW = ' SELF TEST IN PROGRESS ';

/** A cold-and-dark unit switched on with the given saved settings; the Turn-On page shows after one display tick */
async function powerOnCold(storage: Record<string, unknown> = {}): Promise<HeadlessUnit> {
    const unit = await bootUnit({engineRunning: false, storage});
    await unit.panel.powerOn();
    return unit;
}

const isTurnOnPage = () => Screen.read().row(0) === TOP_ROW && Screen.read().row(6) === BOTTOM_ROW;

describe('Turn-On page (3-3, 5-28)', () => {
    // 5-28: four personal lines of 23 characters are shown on the Turn-On page each time the unit is switched on, the
    // first of them on the third line of the display (step 3), so the four lines are rows 2 to 5; figure 5-98 shows
    // three of them in use between the copyright row and SELF TEST IN PROGRESS. The texts are invented.
    it('shows the four stored lines on the third to sixth lines of the display at power-on (5-28)', async () => {
        const lines = ['JOHN DOE', '   PILOT OWNER', 'N12345', 'MEDICAL DUE 2027'].map(l => l.padEnd(23, ' '));
        await powerOnCold({welcome1: lines[0], welcome2: lines[1], welcome3: lines[2], welcome4: lines[3]});

        expect(Screen.read().text().split('\n')).toEqual([
            TOP_ROW,
            ' ©1994 ALLIEDSIGNAL INC',
            'JOHN DOE               ',
            '   PILOT OWNER         ',
            'N12345                 ',
            'MEDICAL DUE 2027       ',
            BOTTOM_ROW,
        ]);
    });

    // 3-3, figure 3-3: SELF TEST IN PROGRESS is the one text of the page that is shown inverse (the maintainer read it
    // off the printed figure); the other six rows are plain. The row has a plain cell on each side of the inverse text.
    it('draws only SELF TEST IN PROGRESS inverse (3-3, figure 3-3)', async () => {
        await powerOnCold();

        expect(Screen.read().mask().split('\n')).toEqual([
            ...Array(6).fill('.'.repeat(23)),
            '.' + 'I'.repeat(21) + '.',
        ]);
    });

    // 3-3: the Turn-On page shows for a few seconds, then the Self Test page replaces it. The Maintenance Manual
    // (006-15521-0003 Rev 3, page 1011) says it times out after about 15 s; in the short video the code cites
    // (https://youtube.com/shorts/9We5fcd2-VE) the Self Test page comes up about 18 s after the power knob is pressed.
    // Both bound the page to more than 14 s and less than 19 s after power-on.
    it('replaces the Turn-On page by the Self Test page after 14 s and before 19 s '
        + '(3-3, maintenance manual 1011)', async () => {
        const unit = await powerOnCold();

        await vi.advanceTimersByTimeAsync(14_000 - 250); // powerOn already ran one display tick
        expect(isTurnOnPage()).toBe(true);

        await vi.advanceTimersByTimeAsync(5_000);
        expect(Screen.read().rows('R')[5]).toBe('  APPROVE? ');
        expect(unit.errors).toEqual([]);
    });

    // 5-28 steps 4 to 6: the second to fourth lines are programmed as the first and approved with ENT each; step 5
    // moves the cursor over a whole line with the left outer knob. A line approved is shown at the next power-on. The
    // fourth line is the sixth line of the display (row 5). FreetextEditor.test.ts holds the first line.
    it('keeps a programmed fourth line for the next power-on (5-28)', async () => {
        const unit = await powerOnCold();
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 3); // the fourth line
        await unit.panel.inner('L', 2); // A (the first click shows the blank)
        await unit.panel.ent();
        await unit.panel.cursor('L');
        await vi.advanceTimersByTimeAsync(1000);

        await unit.panel.powerCycle();

        expect(isTurnOnPage()).toBe(true);
        expect(Screen.read().text().split('\n').slice(2, 6)).toEqual([
            ' '.repeat(23),
            ' '.repeat(23),
            ' '.repeat(23),
            'A' + ' '.repeat(22),
        ]);
        expect(unit.errors).toEqual([]);
    });

    // 5-28 steps 2 to 6 (an inference, the guide does not say it): the pilot presses the left CRSR while the Turn-On
    // page shows, programs up to four lines and presses the left CRSR again when finished. That procedure takes far
    // longer than the few seconds the page shows on its own, so the page must stay while the left cursor is on.
    it('stays while the left cursor is on (5-28)', async () => {
        const unit = await powerOnCold();
        await unit.panel.cursor('L');

        // Far past the 17 s the Turn-On page shows on its own (TEST_TIME in WelcomePage.tsx), to show it stays
        await vi.advanceTimersByTimeAsync(60_000);

        expect(isTurnOnPage()).toBe(true);
        expect(unit.errors).toEqual([]);
    });
});

describe('Turn-On page (characterization)', () => {
    // How long the page stays after the cursor is turned off is not in the guide. The code moves on at the next display
    // tick once its time is over.
    it('moves on to the Self Test page at once when the cursor is turned off after its time '
        + '(characterization)', async () => {
        const unit = await powerOnCold();
        await unit.panel.cursor('L');
        // Past the 17 s the Turn-On page shows on its own (TEST_TIME in WelcomePage.tsx), with the cursor holding it
        await vi.advanceTimersByTimeAsync(30_000);
        expect(isTurnOnPage()).toBe(true);

        await unit.panel.cursor('L');
        await vi.advanceTimersByTimeAsync(250);

        expect(Screen.read().rows('R')[5]).toBe('  APPROVE? ');
        expect(unit.errors).toEqual([]);
    });
});

// #96: every power-on builds a new welcome page, which subscribes to propsReady; the page it replaces must leave no
// handler behind. A property of the code; no manual page applies
describe('welcome page subscription (#96)', () => {
    it('leaves the propsReady handler count unchanged from one power cycle to the next (#96)', async () => {
        const unit = await bootUnit();
        await unit.panel.powerCycle();
        await unit.panel.approveSelfTest();
        const afterFirst = unit.props.bus.getTopicSubscriberCount('propsReady');

        await unit.panel.powerCycle();
        await unit.panel.approveSelfTest();

        expect(unit.props.bus.getTopicSubscriberCount('propsReady')).toBe(afterFirst);
    });
});

/** A promise that never settles: a facility call whose answer never comes (#416) */
const never = <T>() => new Promise<T>(() => undefined);

/**
 * Hands the ident searches of the INT scan list for 'Z' to `answer`, with their number (1 for the first) and the real
 * search. The default intersection ZZXIN is the only waypoint of the INT scan list, so the 'Z' search is the one that
 * finds it while the list is built at a power-on, after the props are there. The spy is restored when the test ends
 */
function onIntersectionSearchZ(answer: (call: number, real: () => Promise<IcaoValue[]>) => Promise<IcaoValue[]>): void {
    const search = MemoryFacilityClient.prototype.searchByIdentWithIcaoStructs;
    const spy = vi.spyOn(MemoryFacilityClient.prototype, 'searchByIdentWithIcaoStructs');
    onTestFinished(() => spy.mockRestore());
    let calls = 0;
    spy.mockImplementation(function (this: MemoryFacilityClient, filter, ident, maxItems) {
        const real = () => search.call(this, filter, ident, maxItems);
        return filter === FacilitySearchType.Intersection && ident === 'Z' ? answer(++calls, real) : real();
    });
}

/** Advances the clock until `ms` have passed since `start` (a Date.now() value) */
async function advanceTo(start: number, ms: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(start + ms - Date.now());
}

const SELF_TEST_PASSED = 'ANNUN    ON';
const SELF_TEST_FAILED = 'TEST FAIL  ';
const lastLeftRow = () => Screen.read().rows('L')[5];
const isSelfTestPage = () => Screen.read().rows('R')[5] === '  APPROVE? ';

/** The attributes of the TEST FAIL cells over four display ticks, one string per tick */
async function testFailMasks(): Promise<string[]> {
    const masks: string[] = [];
    for (let i = 0; i < 4; i++) {
        masks.push(Screen.read().maskRows('L')[5].slice(0, 9));
        await vi.advanceTimersByTimeAsync(250);
    }
    return masks;
}

// 3-3: the Turn-On page is shown while the unit runs its internal test; 3-4: a failed test shows a flashing TEST FAIL in
// place of ANNUN ON on the Self Test page. A facility call that has not answered for 60 s, or a scan list that cannot be
// built, fails the test here; the error page names the call, and the MSG page, read after APPROVE? (maintenance manual
// 1022), has DATA BASE CHECKSUM ERR (B-2). Spec 4.2 to 4.4 of
// docs/superpowers/specs/2026-10-25-startup-self-test-design.md
describe('the start-up self-test (#416)', () => {
    it('fails the self-test when a scan list search hangs for 60 s (cold start)', async () => {
        onIntersectionSearchZ(() => never());
        const unit = await bootUnit({engineRunning: false});
        const start = Date.now();
        await unit.panel.powerOn();

        await advanceTo(start, 59_000);
        expect(unit.errors).toEqual([]);
        expect(isTurnOnPage()).toBe(true);

        await advanceTo(start, 61_000);
        expect(unit.errors.map(e => e.message)).toEqual([
            `Start-up self-test failed: searchByIdentWithIcaoStructs(${FacilitySearchType.Intersection}, "Z", 1) has not answered for 60 s`,
        ]);
        expect(isSelfTestPage()).toBe(true);
        expect(lastLeftRow()).toBe(SELF_TEST_FAILED);
        const masks = await testFailMasks();
        expect(masks.every(m => m === 'B'.repeat(9) || m === '.'.repeat(9))).toBe(true);
        expect(masks).toContain('B'.repeat(9));
        expect(masks).toContain('.'.repeat(9));

        await unit.panel.approveSelfTest();
        const messages = await unit.panel.readMessages();
        expect(messages.filter(m => m === 'DATA BASE CHECKSUM ERR')).toHaveLength(1); // Posted once
    });

    it('shows the failed Self Test page with the engine running', async () => {
        onIntersectionSearchZ(() => never());
        const unit = await bootUnit(); // The Turn-On page started with the boot, at the clock's start
        const start = DEFAULT_START.getTime();
        // The GPS acquires at once as after a passed test with the engine running
        const acquire = vi.spyOn(unit.props.sensors.in.gps.gpsSatComputer, 'acquireAndUseSatellites');
        onTestFinished(() => acquire.mockRestore());

        await advanceTo(start, 61_000);

        expect(unit.errors).toHaveLength(1);
        expect(isSelfTestPage()).toBe(true);
        expect(lastLeftRow()).toBe(SELF_TEST_FAILED);
        expect(unit.props.memory.navPage.isSelfTestApproved).toBe(false);
        expect(acquire).toHaveBeenCalledTimes(1);
    });

    it('fails the self-test at once when a scan list cannot be built', async () => {
        const failure = new Error('the intersection search failed');
        onIntersectionSearchZ(() => Promise.reject(failure));
        const unit = await bootUnit({engineRunning: false});
        const start = Date.now();
        await unit.panel.powerOn();

        await advanceTo(start, 19_000);

        expect(isSelfTestPage()).toBe(true);
        expect(lastLeftRow()).toBe(SELF_TEST_FAILED);
        expect(unit.errors.map(e => e.message)).toEqual(['Start-up self-test failed: the intersection search failed']);
        expect(unit.errors[0].stack).toBe(failure.stack);
        await unit.panel.approveSelfTest();
        expect(await unit.panel.readMessages()).toContain('DATA BASE CHECKSUM ERR');
    });

    // A slow PC whose start-up keeps making progress: every call answers within the 60 s (spec 4.2)
    it('passes a slow start-up whose calls answer within 60 s', async () => {
        onIntersectionSearchZ((call, real) => call === 1
            ? new Promise(resolve => setTimeout(() => resolve(real()), 50_000))
            : real());
        const unit = await bootUnit({engineRunning: false});
        const start = Date.now();
        await unit.panel.powerOn();

        await advanceTo(start, 52_000);

        expect(isSelfTestPage()).toBe(true);
        expect(lastLeftRow()).toBe(SELF_TEST_PASSED);
        expect(unit.errors).toEqual([]);
    });

    // A build of several calls that takes longer than 60 s, each of them answering within it, passes too (spec 6)
    it('passes a slow start-up whose build takes longer than 60 s', async () => {
        onIntersectionSearchZ((_, real) => new Promise(resolve => setTimeout(() => resolve(real()), 50_000)));
        const unit = await bootUnit({engineRunning: false});
        const start = Date.now();
        await unit.panel.powerOn();

        await advanceTo(start, 70_000);
        expect(isTurnOnPage()).toBe(true); // Precondition: the build is still under way past the 60 s

        await advanceTo(start, 200_000);
        expect(isSelfTestPage()).toBe(true);
        expect(lastLeftRow()).toBe(SELF_TEST_PASSED);
        expect(unit.errors).toEqual([]);
    });

    // 3-4: the pilot recycles the power after TEST FAIL. A single lost answer passes on the next power-on; the power-off
    // cleared the message (spec 4.3)
    it('retries by a power cycle', async () => {
        onIntersectionSearchZ((call, real) => call === 1 ? never() : real());
        const unit = await bootUnit({engineRunning: false});
        const start = Date.now();
        await unit.panel.powerOn();
        await advanceTo(start, 61_000);
        expect(lastLeftRow()).toBe(SELF_TEST_FAILED); // Precondition: the first power-on failed
        expect(unit.errors).toHaveLength(1);

        await unit.panel.powerOff();
        await vi.advanceTimersByTimeAsync(1000);
        const powerOn = Date.now();
        await unit.panel.powerOn();
        await advanceTo(powerOn, 19_000);

        expect(isSelfTestPage()).toBe(true);
        expect(lastLeftRow()).toBe(SELF_TEST_PASSED);
        expect(unit.errors).toHaveLength(1);
        await unit.panel.approveSelfTest();
        expect(await unit.panel.readMessages()).not.toContain('DATA BASE CHECKSUM ERR');
    });

    // A hang that persists fails again, 60 s after the second power-on: the call left over from the first power-on does
    // not count in the second (spec 4.3)
    it('retries by a power cycle and fails again when the hang persists', async () => {
        onIntersectionSearchZ(() => never());
        const unit = await bootUnit({engineRunning: false});
        const start = Date.now();
        await unit.panel.powerOn();
        await advanceTo(start, 61_000);
        expect(unit.errors).toHaveLength(1); // Precondition: the first power-on failed

        await unit.panel.powerOff();
        await vi.advanceTimersByTimeAsync(1000);
        const powerOn = Date.now();
        await unit.panel.powerOn();

        await advanceTo(powerOn, 40_000);
        expect(isTurnOnPage()).toBe(true);
        expect(unit.errors).toHaveLength(1);

        await advanceTo(powerOn, 61_000);
        expect(isSelfTestPage()).toBe(true);
        expect(lastLeftRow()).toBe(SELF_TEST_FAILED);
        expect(unit.errors).toHaveLength(2);
        expect(unit.errors[1].message).toContain('searchByIdentWithIcaoStructs(');
    });

    // 5-28: the page stays while the pilot edits a welcome line; the failure is published at once all the same (spec 4.2)
    it('publishes the failure while the pilot edits a welcome line, and leaves once the cursor is off', async () => {
        onIntersectionSearchZ(() => never());
        const unit = await bootUnit({engineRunning: false});
        const start = Date.now();
        await unit.panel.powerOn();
        await unit.panel.cursor('L');

        await advanceTo(start, 61_000);
        expect(unit.errors).toHaveLength(1);
        expect(isTurnOnPage()).toBe(true);

        await unit.panel.cursor('L');
        await vi.advanceTimersByTimeAsync(500);
        expect(isSelfTestPage()).toBe(true);
        expect(lastLeftRow()).toBe(SELF_TEST_FAILED);
        expect(unit.errors).toHaveLength(1);
    });

    // The self-test runs on the Turn-On page only. A call that hangs later is not part of it (spec 4.2)
    it('does not fail for a call that hangs after the Turn-On page', async () => {
        const unit = await bootUnit();
        await vi.advanceTimersByTimeAsync(2000);
        expect(Screen.read().status().left).toBe('NAV 2'); // Precondition: the main page
        const spy = vi.spyOn(MemoryFacilityClient.prototype, 'getFacility').mockImplementation(() => never());
        onTestFinished(() => spy.mockRestore());

        await unit.panel.selectPage('R', 'VOR');
        await unit.panel.cursor('R');
        await unit.panel.type('R', 'ZZV');
        await vi.advanceTimersByTimeAsync(120_000);

        // Precondition: a lookup of the page change has hung
        expect(unit.props.pendingCalls.findHung(Date.now(), -Infinity)?.description).toMatch(/^getFacility\(/);
        expect(unit.errors).toEqual([]);
    });

    // The Take-Home warning comes first in take-home mode (3-19), as with a passed test
    it('goes through the Take-Home warning to TEST FAIL', async () => {
        onIntersectionSearchZ(() => never());
        const unit = await bootUnit({engineRunning: false, panelXml: panelXml({TakeHomeMode: true})});
        const start = Date.now();
        await unit.panel.powerOn();

        await advanceTo(start, 61_000);
        expect(Screen.read().text()).toContain('TAKE-');
        expect(unit.errors).toHaveLength(1);

        await unit.panel.ent();
        await vi.advanceTimersByTimeAsync(500);
        expect(isSelfTestPage()).toBe(true);
        expect(lastLeftRow()).toBe(SELF_TEST_FAILED);
    });
});
