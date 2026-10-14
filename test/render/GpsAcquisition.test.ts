import {describe, expect, it, vi} from 'vitest';
import {GPSSatComputer, GPSSatelliteState, GPSSystemState} from '@microsoft/msfs-sdk';
import {bootToSelfTest, bootUnit, HeadlessUnit, settle} from '../harness/boot';
import {DEFAULT_START} from '../harness/sim/clock';
import {Screen} from '../harness/render/screen';
import {storedSetting} from '../harness/storage';
import {messages} from '../harness/readers';
import {TimeStamp} from '../../kln90b/data/Time';
import {GPS_ERA_DURATION, SearchMode} from '../../kln90b/GpsSearch';

// #62: at every power-on the start model (kln90b/GpsSearch.ts) picks the search from the stored position, the almanac,
// the ephemeris and the unit's own clock: hot, warm ACQ, ACQ that gives up and searches the sky, or an almanac search.
// The KLN almanac check (KLNGPSSatComputer.isAlmanacValid) reports its decision. The receiver's clock (internalTime) is
// set in powerChanged after the off time is added to timeZulu (#211), as the model reads it on the first tick.
//
// The acquisition tests simulate several minutes each: they carry their own timeout, as the 5 s default fails when the
// machine is busy (test/README.md).
const SLOW = 60_000;
const VERY_SLOW = 240_000;

const START = DEFAULT_START.getTime();
const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

/** The stored data of a unit that was last used here yesterday: position 47/8 (the boot position), almanac a day old */
const WARM = {fastGpsAcquisition: false, lastLatitude: 47, lastLongitude: 8, lastAlmanacDownload: START - DAY};

/** Seeds whose warm start lands at the ends of the observed spread (found by the probe of the plan, Task 3 Step 6) */
const FAST_WARM_SEED = 15;
const SLOW_WARM_SEED = 4;

/** The antipode of the boot position 47/8: no satellite is in view from both */
const ANTIPODE = {lastLatitude: -47, lastLongitude: -172};
/** The satellites in view at 47/8 at the fake clock's start (the STA 1 snapshot below) */
const IN_VIEW = [1, 8, 10, 14, 16, 21, 23, 27];
const ephemeris = (time: number) => IN_VIEW.map(prn => `${prn}:${time}`).join(',');

/** A cold-and-dark unit, switched on. clockOffsetMs moves the unit's battery clock against the sim time */
async function powerOnCold(storage: Record<string, unknown>, clockOffsetMs = 0, seed = 1): Promise<HeadlessUnit> {
    const unit = await bootUnit({engineRunning: false, storage, seed});
    const gps = unit.props.sensors.in.gps;
    gps.timeZulu = TimeStamp.create(gps.timeZulu.getTimestamp() + clockOffsetMs);
    await unit.panel.powerOn();
    return unit;
}

/** Seconds from now until the GPS has a solution, or cap when it has none by then. The time is the subject (test/README.md) */
async function secondsToFix(unit: HeadlessUnit, cap: number): Promise<number> {
    const gps = unit.props.sensors.in.gps;
    let s = 0;
    for (; s < cap && !gps.isValid(); s++) {
        await vi.advanceTimersByTimeAsync(1000);
    }
    return s;
}

describe('GPS time to first fix, slow acquisition', () => {
    // 3-17: with a current almanac and the right time, date and position the first fix usually comes in under 2 minutes;
    // 3-8: a unit that is not NAV ready within 5 minutes needs the initialization of 3.6 (install manual 2-66: not more
    // than 5 minutes, typically 2)
    it('a warm start is NAV ready within 5 minutes of power-on (#211)', async () => {
        const unit = await powerOnCold(WARM);

        expect(await secondsToFix(unit, 300)).toBeLessThan(300);
    }, SLOW);

    // The sibling of the pin above: the same start, with the loose bound of 3-17 (never more than 12 minutes)
    it('a warm start is NAV ready within 12 minutes of power-on (3-17)', async () => {
        const unit = await powerOnCold(WARM);

        expect(await secondsToFix(unit, 720)).toBeLessThan(720);
    }, SLOW);

    // Install manual 2-66: with the position within 60 NM and the time within 10 minutes, STA 1 shows ACQ
    it('a warm start shows ACQ on STA 1 right after the self-test (#211)', async () => {
        const unit = await powerOnCold(WARM);
        await unit.panel.approveSelfTest();
        await unit.panel.selectPage('L', 'STA 1');

        expect(Screen.read().rows('L')[0]).toBe('STATE   ACQ');
    }, SLOW);

    // 3-17: the receiver's own view of the almanac, asked directly. This is the tripwire that the unit's almanac check
    // (Gps.ts isAlmanacValid, the decision of the start model) reports the almanac of a warm start as valid
    it('a warm start considers its almanac valid (#211)', async () => {
        const unit = await powerOnCold(WARM);
        await vi.advanceTimersByTimeAsync(5000);

        expect(unit.props.sensors.in.gps.gpsSatComputer.isAlmanacValid()).toBe(true);
    }, SLOW);

    // The sibling of the pin above: an almanac older than six months is not valid (3-17), same wait, same call
    it('a start with an almanac 200 days old does not consider its almanac valid (3-17)', async () => {
        const unit = await powerOnCold({...WARM, lastAlmanacDownload: START - 200 * DAY});
        await vi.advanceTimersByTimeAsync(5000);

        expect(unit.props.sensors.in.gps.gpsSatComputer.isAlmanacValid()).toBe(false);
    }, SLOW);

    // 3-53, 3-17: the battery clock runs on while the unit is off, and the receiver's own clock (internalTime) is set from
    // it at power-on (#211). The receiver reads internalTime on its first update, before any tick refreshes it, so a stale
    // value would make the almanac check fail at the first update. The first update after a power cycle only resets the
    // channels, so the 5-minute bound below holds neither the clock nor the almanac fields; the assertion on internalTime
    // holds the clock, and the four #211 pins hold the almanac fields. The battery clock keeps the sim time, as the
    // clock tests below
    it('a power cycle of 3 hours at the same place sets the receiver clock and is NAV ready within 5 minutes (3-17, #211)', async () => {
        const unit = await powerOnCold(WARM);
        expect(await secondsToFix(unit, 720)).toBeLessThan(720);
        await unit.panel.powerOff();
        await vi.advanceTimersByTimeAsync(3 * 60 * MINUTE);
        await unit.panel.powerOn();

        expect(Math.abs(unit.props.sensors.in.gps.gpsSatComputer.internalTime - Date.now())).toBeLessThan(3500);
        expect(await secondsToFix(unit, 300)).toBeLessThan(300);
    }, SLOW);

    // 3-17: the almanac stays current for six months. This pin sees the almanac age through the unit's almanac check
    // (#211); the test below holds the loose bound of the six months on its own.
    it('a start with an almanac 120 days old is a warm start (3-17: six months) (#211)', async () => {
        const unit = await powerOnCold({...WARM, lastAlmanacDownload: START - 120 * DAY});

        expect(await secondsToFix(unit, 300)).toBeLessThan(300);
    }, SLOW);

    // The sibling of the pin above: the same start with the loose bound of 3-17
    it('a start with an almanac 120 days old is NAV ready within 12 minutes (3-17)', async () => {
        const unit = await powerOnCold({...WARM, lastAlmanacDownload: START - 120 * DAY});

        expect(await secondsToFix(unit, 720)).toBeLessThan(720);
    }, SLOW);

    // #62, a real unit: a power cycle with a current ephemeris has its fix in 0:17, power-on self-test included. The
    // self-test page lasts 17 s (WelcomePage TEST_TIME). The SDK keeps the ephemeris over a power cycle in one session
    it.each([1, 2, 3, 4, 5])('seed %d: a power cycle with a current ephemeris has its fix before the self-test ends (#62)', async seed => {
        const unit = await powerOnCold(WARM, 0, seed);
        expect(await secondsToFix(unit, 300)).toBeLessThan(300);
        await unit.panel.powerOff();
        await vi.advanceTimersByTimeAsync(10 * MINUTE);
        await unit.panel.powerOn();

        expect(await secondsToFix(unit, 30)).toBeLessThan(17);
    }, SLOW);

    // #62: the receiver keeps its ephemeris in battery memory, so a new session within the ephemeris' life is hot too
    it('a boot with an ephemeris 30 minutes old in memory has its fix before the self-test ends (#62)', async () => {
        const unit = await powerOnCold({...WARM, lastEphemeris: ephemeris(START - 30 * MINUTE)});

        expect(await secondsToFix(unit, 30)).toBeLessThan(17);
    }, SLOW);

    // #62: the SDK's 2 NM hot rule must work on the stored position. A start far from it is warm even with a current
    // ephemeris, as a start 50 NM away is: the receiver searches where it believes it is, not where it is (spec
    // section 2). The model points the SDK's last known position at the present one beyond 100 NM, so it holds the hot
    // timing back itself
    it('a boot 150 NM from the stored position with an ephemeris 30 minutes old is a warm start (#62)', async () => {
        const unit = await powerOnCold({...WARM, lastLatitude: 47 + 150 / 60, lastEphemeris: ephemeris(START - 30 * MINUTE)});

        const seconds = await secondsToFix(unit, 300);

        expect(seconds).toBeGreaterThanOrEqual(17); // A hot start has its fix before the self-test ends (17 s); a warm one comes after it
        expect(seconds).toBeLessThan(300);
    }, SLOW);

    // The sibling: the hot timing held back for that start comes back. The next power-on, at the position stored at the
    // power-off, is hot again
    it('a power cycle after a start 150 NM from the stored position has its fix before the self-test ends (#62)', async () => {
        const unit = await powerOnCold({...WARM, lastLatitude: 47 + 150 / 60, lastEphemeris: ephemeris(START - 30 * MINUTE)});
        expect(await secondsToFix(unit, 300)).toBeLessThan(300);
        await unit.panel.powerOff();
        await vi.advanceTimersByTimeAsync(10 * MINUTE);
        await unit.panel.powerOn();

        expect(await secondsToFix(unit, 30)).toBeLessThan(17);
    }, SLOW);

    // The sibling: an ephemeris 3 hours old has expired (SDK: 2 hours), so the start is warm
    it('a boot with an ephemeris 3 hours old in memory is a warm start (#62)', async () => {
        const unit = await powerOnCold({...WARM, lastEphemeris: ephemeris(START - 180 * MINUTE)});

        const seconds = await secondsToFix(unit, 300);

        expect(seconds).toBeGreaterThanOrEqual(30);
        expect(seconds).toBeLessThanOrEqual(120);
    }, SLOW);

    // #62, a real unit with a current almanac, the time right and the aircraft not moved: 1:25, 0:32, 1:47. The
    // ephemeris must be collected (at least about 18 s of a 30 s frame), so nothing is faster than about 30 s
    it.each([1, 2, 3, 4, 5, 6, 7, 8])('seed %d: a warm start has its fix 30 s to 2 minutes after power-on (#62)', async seed => {
        const unit = await powerOnCold(WARM, 0, seed);
        const seconds = await secondsToFix(unit, 300);

        expect(seconds).toBeGreaterThanOrEqual(30);
        expect(seconds).toBeLessThanOrEqual(120);
    }, SLOW);

    // #62: the observed warm starts spread from 0:32 to 1:47 under the same conditions; the spread is real
    it(`seed ${FAST_WARM_SEED}: a warm start can be as fast as 45 s (#62: 0:32)`, async () => {
        const unit = await powerOnCold(WARM, 0, FAST_WARM_SEED);

        expect(await secondsToFix(unit, 300)).toBeLessThan(45);
    }, SLOW);

    it(`seed ${SLOW_WARM_SEED}: a warm start can take over 90 s (#62: 1:47)`, async () => {
        const unit = await powerOnCold(WARM, 0, SLOW_WARM_SEED);

        expect(await secondsToFix(unit, 300)).toBeGreaterThan(90);
    }, SLOW);

    // A real-unit video: started 829 NM from its stored position, the unit searched the satellites predicted for the
    // stored position (ACQ), most of which were in view, and had its fix in 2:22 (install manual 2-66: ACQ within 5
    // minutes). The 60 NM of 2-66 is checkout advice, not a rule of the unit
    it('a start 829 NM from the stored position is NAV ready within 5 minutes (install manual 2-66, #62)', async () => {
        const unit = await powerOnCold({...WARM, lastLatitude: 47 + 829 / 60});

        expect(await secondsToFix(unit, 300)).toBeLessThan(300);
    }, SLOW);

    // #62: in ACQ the receiver searches only the satellites it predicts for the stored position (at 47/8 those in view);
    // the first fix ends the start model, and from then on the receiver may track any satellite (spec section 2, step 4)
    it('searches only the predicted satellites until the first fix of a warm start, then lifts the inhibits (#62)', async () => {
        const unit = await powerOnCold(WARM);
        const computer = unit.props.sensors.in.gps.gpsSatComputer;
        const allowed = () => computer.getSatellites().map(s => s.prn)
            .filter(prn => !computer.inhibitedSatellitePrnCodes.get().has(prn))
            .sort((a, b) => a - b);
        await vi.advanceTimersByTimeAsync(5000);
        expect(allowed()).toEqual(IN_VIEW);

        expect(await secondsToFix(unit, 300)).toBeLessThan(300);
        expect(computer.inhibitedSatellitePrnCodes.get().size).toBe(0);
    }, SLOW);

    it('a start 80 NM from the stored position is NAV ready within 5 minutes (install manual 2-66, #62)', async () => {
        const unit = await powerOnCold({...WARM, lastLatitude: 47 + 80 / 60});

        expect(await secondsToFix(unit, 300)).toBeLessThan(300);
    }, SLOW);

    // 3-17: with a wrong time or position the unit looks for any satellite, up to 12 minutes. It first searches the
    // satellites it predicts, gives up when they are not there, then searches the sky
    it('a start with the clock 15 minutes behind is not NAV ready within 5 minutes, and is within 12 (install manual 2-66, 3-17)', async () => {
        const unit = await powerOnCold(WARM, -15 * MINUTE);

        expect(await secondsToFix(unit, 300)).toBe(300);
        expect(await secondsToFix(unit, 420)).toBeLessThan(420);
    }, SLOW);

    it('a start at the antipode of the stored position is not NAV ready within 5 minutes, and is within 12 (3-17)', async () => {
        const unit = await powerOnCold({...WARM, ...ANTIPODE});

        expect(await secondsToFix(unit, 300)).toBe(300);
        expect(await secondsToFix(unit, 420)).toBeLessThan(420);
    }, SLOW);

    // ORS 01 6-30: an almanac six months old or more makes the receiver search the sky and collect a new almanac from
    // one satellite, 20 minutes; a real unit with a wrong date took 21:36 (#62). The age counts by the unit's own clock.
    // The bounds are 20 minutes give or take 3
    it('a start with an almanac 200 days old is not NAV ready within 17 minutes, and is within 23 (ORS 01 6-30, #62)', async () => {
        const unit = await powerOnCold({...WARM, lastAlmanacDownload: START - 200 * DAY});

        expect(await secondsToFix(unit, 1020)).toBe(1020);
        expect(await secondsToFix(unit, 360)).toBeLessThan(360);
    }, VERY_SLOW);

    // 30 years in whole days is about 9 years from the nearest multiple of the 1024-week era the receiver cannot tell apart
    it('a start with the clock 30 years behind is not NAV ready within 17 minutes, and is within 23 (ORS 01 6-30, #62)', async () => {
        const unit = await powerOnCold(WARM, -30 * 365 * DAY);

        expect(await secondsToFix(unit, 1020)).toBe(1020);
        expect(await secondsToFix(unit, 360)).toBeLessThan(360);
    }, VERY_SLOW);

    // The satellites broadcast the GPS week only modulo 1024 weeks, and so does the receiver's clock: it cannot tell eras
    // apart, and only the host resolves the era for the date it shows (#63). A real unit whose date had come out two eras
    // back found the satellites in 17 s at every later power-on (hot, self-test included); the wrong date could be
    // corrected only before the next fix, and a few hours of waiting for the ephemeris to expire gave a longer (warm)
    // window for that (#62)
    describe('a clock exactly 1024 weeks off, as after a GPS week rollover (#62, #63)', () => {
        const oldEra = () => Date.now() - GPS_ERA_DURATION;

        it('a start with the clock exactly 1024 weeks behind is a warm start, and the date stays in the old era (#62, #63)', async () => {
            const unit = await powerOnCold(WARM, -GPS_ERA_DURATION);
            const seconds = await secondsToFix(unit, 300);

            expect(seconds).toBeGreaterThanOrEqual(30);
            expect(seconds).toBeLessThanOrEqual(120);
            expect(Math.abs(unit.props.sensors.in.gps.timeZulu.getTimestamp() - oldEra())).toBeLessThan(10_000);
        }, SLOW);

        // The wrap is not an era check: 100 days short of one era is 100 days ahead modulo the era. The almanac is then
        // current but the clock is off, so ACQ gives up and the sky search finds a satellite (3-17: not within 5 minutes,
        // within 12); it is not the 20-minute almanac search that a plain difference of the clocks would start
        it('a start with the clock 100 days short of 1024 weeks behind is a wrong clock, not an expired almanac (3-17, #62)', async () => {
            const unit = await powerOnCold(WARM, -(GPS_ERA_DURATION - 100 * DAY));

            expect(await secondsToFix(unit, 300)).toBe(300);
            expect(await secondsToFix(unit, 420)).toBeLessThan(420);
        }, SLOW);

        it('after a rollover a power cycle with a current ephemeris is hot, and the date stays in the old era (#62, #63)', async () => {
            const unit = await powerOnCold(WARM, -GPS_ERA_DURATION);
            expect(await secondsToFix(unit, 300)).toBeLessThan(300);
            await unit.panel.powerOff();
            await vi.advanceTimersByTimeAsync(10 * MINUTE);
            await unit.panel.powerOn();

            expect(await secondsToFix(unit, 30)).toBeLessThan(17);
            expect(Math.abs(unit.props.sensors.in.gps.timeZulu.getTimestamp() - oldEra())).toBeLessThan(10_000);
        }, SLOW);

        it('after a rollover a power cycle of 3 hours is a warm start, a longer window to correct the date (#62, #63)', async () => {
            const unit = await powerOnCold(WARM, -GPS_ERA_DURATION);
            expect(await secondsToFix(unit, 300)).toBeLessThan(300);
            await unit.panel.powerOff();
            await vi.advanceTimersByTimeAsync(3 * 60 * MINUTE);
            await unit.panel.powerOn();

            const seconds = await secondsToFix(unit, 300);

            expect(seconds).toBeGreaterThanOrEqual(30);
            expect(seconds).toBeLessThanOrEqual(120);
            expect(Math.abs(unit.props.sensors.in.gps.timeZulu.getTimestamp() - oldEra())).toBeLessThan(10_000);
        }, SLOW);
    });

    // ORS 01 6-30: one satellite is enough to collect the almanac; the unit does not navigate while it collects. After 10
    // minutes the first satellite is found (GpsSearch ALMANAC_SEARCH_ACQUISITION, at most 7.5 minutes) and the 12.5
    // minutes of almanac are not yet over
    it('collects the almanac from one satellite during an almanac search (ORS 01 6-30)', async () => {
        const unit = await powerOnCold({...WARM, lastAlmanacDownload: START - 200 * DAY});
        await vi.advanceTimersByTimeAsync(10 * MINUTE);
        const gps = unit.props.sensors.in.gps;
        const assigned = gps.gpsSatComputer.getChannels().filter(c => c !== null);

        expect(assigned).toHaveLength(1);
        expect([GPSSatelliteState.Acquired, GPSSatelliteState.DataCollected, GPSSatelliteState.InUse]).toContain(assigned[0]!.state.get());
        expect(gps.isValid()).toBe(false);
    }, SLOW);

    // A satellite can be lost while the almanac is collected from it (it sets, or the signal drops). The search then
    // resumes the blind search and collects the almanac from the next satellite found: a new almanac search, held to the
    // same 23 minutes as the one above. The test inhibits the satellite to lose it; the recovery lifts every inhibit
    it('resumes the search when it loses the satellite it collects the almanac from (ORS 01 6-30, #62)', async () => {
        const unit = await powerOnCold({...WARM, lastAlmanacDownload: START - 200 * DAY});
        const computer = unit.props.sensors.in.gps.gpsSatComputer;
        const COLLECTING = [GPSSatelliteState.Acquired, GPSSatelliteState.DataCollected, GPSSatelliteState.InUse];
        const kept = () => {
            const assigned = computer.getChannels().filter(c => c !== null);
            return assigned.length === 1 && COLLECTING.includes(assigned[0]!.state.get()) ? assigned[0]! : null;
        };
        for (let s = 0; s < 10 * 60 && kept() === null; s++) {
            await vi.advanceTimersByTimeAsync(1000);
        }
        const lost = kept();
        expect(lost).not.toBeNull();

        computer.setSatelliteInhibit(lost!.prn, true);

        expect(await secondsToFix(unit, 1380)).toBeLessThan(1380);
    }, VERY_SLOW);

    // INIT covers the almanac search: ORS 20 (5-29) has no state of its own for it (ORS 01 had SRCH)
    it('shows INIT on STA 1 right after the self-test during an almanac search (5-29)', async () => {
        const unit = await powerOnCold({...WARM, lastAlmanacDownload: START - 200 * DAY});
        await unit.panel.approveSelfTest();
        await unit.panel.selectPage('L', 'STA 1');

        expect(Screen.read().rows('L')[0]).toBe('STATE  INIT');
    }, SLOW);

    // 3-17: a stored almanac stays usable for six months. The age limit is the SDK's part of the almanac check, so it
    // is asked directly with the sim time given. The
    // cases stay clear of the exact day, which the guide does not give.
    describe('the age limit of the stored almanac (3-17: six months) (#212)', () => {
        const sdkAlmanacValid = async (ageDays: number) => {
            const unit = await powerOnCold({...WARM, lastAlmanacDownload: START - ageDays * DAY});
            return GPSSatComputer.prototype.isAlmanacValid.call(unit.props.sensors.in.gps.gpsSatComputer, START);
        };

        it.each([
            [1, true],
            [91, true],
            [120, true],
            [170, true],
            [195, false],
            [200, false],
        ])('an almanac %d days old is valid: %s', async (ageDays, expected) => {
            expect(await sdkAlmanacValid(ageDays)).toBe(expected);
        }, SLOW);
    });
});

/** Advances until the self-test page shows, the time of the welcome page */
async function untilSelfTestPage(unit: HeadlessUnit): Promise<void> {
    for (let i = 0; !Screen.read().text().includes('APPROVE?'); i++) {
        if (i >= 60) throw new Error(`untilSelfTestPage: no self-test page within 60 s\n${Screen.read().dump()}`);
        await vi.advanceTimersByTimeAsync(1000);
    }
}

describe('correcting the position or the time during a search (3-5, 3-17, #357)', () => {
    // 3-17..3-19: the remedy for a slow start is the entry of the position on SET 1 and CONFIRM?. The unit stored the
    // antipode, so it predicts satellites that are not there; it searches them for 5 minutes before it searches the sky.
    // With the position corrected the search starts again from the right one, and the fix is a warm one. Both the
    // latitude and the longitude are entered, N 47 and E 8 (the aircraft sits at 47/8)
    it('has its fix within 150 s of a CONFIRM? on SET 1 with the position of the aircraft (3-17..3-19, #357)', async () => {
        const unit = await powerOnCold({...WARM, ...ANTIPODE});
        const gps = unit.props.sensors.in.gps;
        const poweredOn = Date.now();
        await untilSelfTestPage(unit);
        await unit.panel.approveSelfTest();
        await unit.panel.selectPage('L', 'SET 1');
        await unit.panel.cursor('L');
        await unit.panel.outer('L', 1); // the latitude
        await unit.panel.inner('L', 1); // enters the editor: N, the other digits blank
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 5); // the first click enters a 0, so this is a 4
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 8); // a 7
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 1); // a 0
        await unit.panel.ent();
        // ENT leaves the cursor on the longitude
        await unit.panel.inner('L', 1); // enters the editor: E, the other digits blank
        await unit.panel.outer('L', 2); // past the hundreds digit, which stays blank
        await unit.panel.inner('L', 1); // a 0
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', 9); // an 8
        await unit.panel.ent();
        expect(Screen.read().rows('L').slice(2, 4)).toEqual(["N 47°00.00'", "E  8°00.00'"]); // Precondition: the entry took
        expect(gps.isValid()).toBe(false); // Precondition: the search runs
        await unit.panel.cursorTo('L', 'CONFIRM?');
        await unit.panel.ent();
        expect(unit.errors).toEqual([]);

        const seconds = await secondsToFix(unit, 300);

        expect(seconds).toBeLessThan(150);
        expect(Date.now() - poweredOn).toBeLessThan(5 * MINUTE);
    }, VERY_SLOW);

    // 3-5..3-7: the date entered on the self-test page, before the page is approved. A clock 30 years behind makes the
    // almanac look expired, which is the 20-minute almanac search; the date corrected, the almanac is current again. The
    // offset is a whole number of days, so that the time of day stays right
    it('has its fix within 150 s of the approval when the date is entered on the self-test page (3-5, #357)', async () => {
        const unit = await powerOnCold(WARM, -30 * 365 * DAY);
        const gps = unit.props.sensors.in.gps;
        await untilSelfTestPage(unit);
        await unit.panel.cursorToTop('R'); // the date
        const sim = new Date(Date.now()); // The date of the sim: the clock of the unit is the one that is wrong
        const year = sim.getUTCFullYear() % 100;
        await unit.panel.enterDate('R', sim.getUTCDate(), sim.getUTCMonth() + 1, [Math.floor(year / 10), year % 10]);
        await unit.panel.ent();
        const month = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][sim.getUTCMonth()];
        expect(Screen.read().rows('R')[1]).toBe(`  ${String(sim.getUTCDate()).padStart(2, '0')} ${month} ${String(year).padStart(2, '0')}`); // Precondition: the entry took
        expect(gps.isValid()).toBe(false); // Precondition: the search runs
        await unit.panel.approveSelfTest();

        const seconds = await secondsToFix(unit, 300);

        expect(seconds).toBeLessThan(150);
    }, VERY_SLOW);

    // 3-53, 3-17: the clock 15 minutes behind is a wrong time, which the unit finds out only at the give-up after 5
    // minutes and then searches the sky. The time corrected on SET 2 restarts the search with the right prediction
    it('has its fix within 150 s of the time entered on SET 2 (3-17, 3-53, #357)', async () => {
        const unit = await powerOnCold(WARM, -15 * MINUTE);
        const gps = unit.props.sensors.in.gps;
        await untilSelfTestPage(unit);
        await unit.panel.approveSelfTest();
        await unit.panel.selectPage('L', 'SET 2');
        await unit.panel.cursor('L');
        // The time zone of the page is UTC, so the sim's UTC time is the correct time to enter
        const sim = new Date(Date.now());
        expect(sim.getTime() - gps.timeZulu.getTimestamp()).toBeGreaterThan(10 * MINUTE); // Precondition: the unit's clock is wrong
        const [hours, minutes] = [sim.getUTCHours(), sim.getUTCMinutes()];
        await unit.panel.outer('L', 1); // the time
        await unit.panel.inner('L', hours + 1); // the first click opens the entry on hour 00
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', Math.floor(minutes / 10) + 1); // the first click gives a 0
        await unit.panel.outer('L', 1);
        await unit.panel.inner('L', minutes % 10 + 1);
        // Precondition: the entry took, and is the time of the sim at the start of the entry
        expect(Screen.read().rows('L')[3].slice(0, 5)).toBe(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`);
        await unit.panel.ent();
        expect(gps.isValid()).toBe(false); // Precondition: the search runs
        expect(unit.errors).toEqual([]);

        const seconds = await secondsToFix(unit, 300);

        expect(seconds).toBeLessThan(150);
    }, VERY_SLOW);

    // The satellites supply the position and the time once there is a fix, so SET 1 does not start a search then
    it('does not restart the search on a CONFIRM? on SET 1 with a fix (#357)', async () => {
        const unit = await powerOnCold(WARM);
        const gps = unit.props.sensors.in.gps;
        await secondsToFix(unit, 300);
        expect(gps.isValid()).toBe(true); // Precondition
        await unit.panel.approveSelfTest();
        await unit.panel.selectPage('L', 'SET 1');
        await unit.panel.cursor('L');
        await unit.panel.cursorTo('L', 'CONFIRM?');
        await unit.panel.ent();

        await vi.advanceTimersByTimeAsync(5000);

        expect(unit.errors).toEqual([]);
        expect(gps.search.mode).toBe(SearchMode.Idle);
        expect(gps.isValid()).toBe(true);
    }, SLOW);
});

// B-4: the message appears when the GPS corrects the system time by more than 10 minutes. The fast acquisition (the
// default) keeps these short; it does not take part in the comparison.
describe('SYSTEM TIME UPDATED TO GPS TIME (B-4)', () => {
    it('posts when the GPS moves the clock by 15 minutes (B-4)', async () => {
        const unit = await powerOnCold({lastLatitude: 47, lastLongitude: 8}, -15 * MINUTE);
        expect(await secondsToFix(unit, 600)).toBeLessThan(600);

        expect(messages(unit)).toContain('SYSTEM TIME UPDATED TO GPS TIME');
        expect(Math.abs(unit.props.sensors.in.gps.timeZulu.getTimestamp() - Date.now())).toBeLessThan(1500);
    });

    it('does not post when the GPS moves the clock by 5 minutes (B-4)', async () => {
        const unit = await powerOnCold({lastLatitude: 47, lastLongitude: 8}, -5 * MINUTE);
        expect(await secondsToFix(unit, 600)).toBeLessThan(600);

        expect(messages(unit)).not.toContain('SYSTEM TIME UPDATED TO GPS TIME');
        expect(Math.abs(unit.props.sensors.in.gps.timeZulu.getTimestamp() - Date.now())).toBeLessThan(1500);
    });
});

// B-3: the message appears when the GPS first reaches NAV and the position differs from the one at power-off by more
// than 2 NM. One minute of latitude is one nautical mile.
describe('POSITION DIFFERS FROM LAST POSITION BY >2NM (B-3)', () => {
    const TEXT = 'POSITION DIFFERS FROM LAST POSITION BY >2NM';

    it('does not post when the stored position is 1.5 NM away (B-3)', async () => {
        const unit = await bootUnit({storage: {lastLatitude: 47 + 1.5 / 60, lastLongitude: 8}});
        await settle(unit);

        expect(messages(unit)).not.toContain(TEXT);
    });

    it('posts when the stored position is 2.5 NM away (B-3)', async () => {
        const unit = await bootUnit({storage: {lastLatitude: 47 + 2.5 / 60, lastLongitude: 8}});
        await settle(unit);

        expect(messages(unit)).toContain(TEXT);
    });

    it('posts after a power cycle in which the aircraft moved 3 NM (B-3)', async () => {
        const unit = await bootUnit({storage: {lastLatitude: 47, lastLongitude: 8}});
        await settle(unit);
        expect(messages(unit)).not.toContain(TEXT);

        await unit.panel.powerOff();
        unit.env.sim.set('PLANE LATITUDE', 'degrees', 47 + 3 / 60);
        await vi.advanceTimersByTimeAsync(5000);
        await unit.panel.powerOn();
        expect(await secondsToFix(unit, 120)).toBeLessThan(120);

        expect(messages(unit)).toContain(TEXT);
    });

    it('does not post after a power cycle in which the aircraft stayed (B-3)', async () => {
        const unit = await bootUnit({storage: {lastLatitude: 47, lastLongitude: 8}});
        await settle(unit);

        await unit.panel.powerOff();
        await vi.advanceTimersByTimeAsync(5000);
        await unit.panel.powerOn();
        expect(await secondsToFix(unit, 120)).toBeLessThan(120);

        expect(messages(unit)).not.toContain(TEXT);
    });
});

describe('messages at power-on (B-3, B-4)', () => {
    // B-3: POSITION DIFFERS posts only when the first fix is more than 2 NM from the position at power-off; B-4: SYSTEM
    // TIME UPDATED only when the GPS moves the clock by more than 10 minutes. A cold-and-dark unit switched on where it
    // was switched off, with its clock right, therefore posts neither, and the status line shows no MSG (3-10).
    it('posts no message on a cold-and-dark start at the stored position (B-3, B-4, 3-10)', async () => {
        const unit = await bootToSelfTest({storage: {lastLatitude: 47, lastLongitude: 8}});
        await unit.panel.approveSelfTest();
        await settle(unit);

        expect(messages(unit)).toEqual([]);
        expect(Screen.read().status().mode).toBe('enr-leg');
        expect(unit.errors).toEqual([]);
    });

    // Sibling of the pin below: an engine-running boot at its stored position has a fix, shows the main page and, as
    // B-3 says for a position within 2 NM, does not post POSITION DIFFERS
    it('boots with the engine running at the stored position to NAV 2 with a fix and no POSITION DIFFERS '
        + '(B-3)', async () => {
        const unit = await bootUnit({storage: {lastLatitude: 47, lastLongitude: 8}});
        await settle(unit);

        expect(unit.props.sensors.in.gps.isValid()).toBe(true);
        expect(messages(unit)).not.toContain('POSITION DIFFERS FROM LAST POSITION BY >2NM');
        expect(Screen.read().status().left).toBe('NAV 2');
    });

    // B-4: the clock of a unit that was running all along needs no correction of more than 10 minutes. A flight started
    // with the engine running stands for a unit that is already on, and its clock is right: the GPS measures the off
    // time itself and no longer depends on the hour PowerButton assumes (#328)
    it('posts no message on an engine-running start at the stored position (B-3, B-4, #328)', async () => {
        const unit = await bootUnit({storage: {lastLatitude: 47, lastLongitude: 8}});
        await settle(unit);

        expect(messages(unit)).toEqual([]);
    });
});

// Persisted user data (CLAUDE.md, public contract): the setting keys lastLatitude, lastLongitude and lastAlmanacDownload.
// The 3-17 tests below cite the manual on the unit keeping them when the power is removed.
describe('GPS data kept over a power-off', () => {
    it('saves the position at power-off (3-17)', async () => {
        const unit = await bootUnit();
        await settle(unit);
        unit.env.sim.set('PLANE LATITUDE', 'degrees', 47.5);
        unit.env.sim.set('PLANE LONGITUDE', 'degrees', 8.25);
        await vi.advanceTimersByTimeAsync(2000); // well inside the 60 s of the periodic save

        await unit.panel.powerOff();
        await vi.advanceTimersByTimeAsync(1000);

        expect(storedSetting(unit, 'lastLatitude')).toBe(47.5);
        expect(storedSetting(unit, 'lastLongitude')).toBe(8.25);
    });

    // characterization: the unit also saves every 60 s while it has a fix, so a sim that quits without a power-off keeps
    // a recent position
    it('characterization: saves the position within 60 s while powered', async () => {
        const unit = await bootUnit();
        await settle(unit);
        unit.env.sim.set('PLANE LATITUDE', 'degrees', 47.5);
        unit.env.sim.set('PLANE LONGITUDE', 'degrees', 8.25);
        await vi.advanceTimersByTimeAsync(62_000); // past the periodic save of 60 s

        expect(storedSetting(unit, 'lastLatitude')).toBe(47.5);
        expect(storedSetting(unit, 'lastLongitude')).toBe(8.25);
    });

    // The forced acquisition of an engine-running boot downloads the whole almanac at once (SDK acquireAndUseSatellites),
    // within the first seconds of the clock. The tripwire for the private SDK field lastAlamanacTime (Gps.savePosition)
    it('saves the time of the last almanac download at power-off (3-17)', async () => {
        const unit = await bootUnit();
        await settle(unit);

        await unit.panel.powerOff();
        await vi.advanceTimersByTimeAsync(1000);

        const saved = storedSetting(unit, 'lastAlmanacDownload') as number;
        expect(saved).toBeGreaterThanOrEqual(START);
        expect(saved).toBeLessThan(START + 10_000);
    });

    // #62: the receiver keeps the ephemeris in battery memory; the forced acquisition of an engine-running boot collects
    // it for the satellites in view
    it('saves the ephemeris of the satellites in view at power-off (#62)', async () => {
        const unit = await bootUnit({storage: {lastLatitude: 47, lastLongitude: 8}});
        await settle(unit);

        await unit.panel.powerOff();
        await vi.advanceTimersByTimeAsync(1000);

        const saved = String(storedSetting(unit, 'lastEphemeris')).split(',').map(e => e.split(':').map(Number));
        expect(saved.map(([prn]) => prn)).toEqual(IN_VIEW);
        for (const [, time] of saved) {
            expect(time).toBeGreaterThanOrEqual(START);
            expect(time).toBeLessThan(START + 60_000);
        }
    });

    // The tripwire for the private SDK field the restore writes (satellite data.lastEphemerisTime, read back through the
    // public getter)
    it('restores the saved ephemeris into the receiver at boot (#62)', async () => {
        const unit = await bootUnit({engineRunning: false, storage: {...WARM, lastEphemeris: `8:${START - MINUTE}`}});
        await vi.advanceTimersByTimeAsync(1000);

        const sat = unit.props.sensors.in.gps.gpsSatComputer.getSatellites().find(s => s.prn === 8)!;
        expect(sat.lastEphemerisTime).toBe(START - MINUTE);
    });

    // The sibling: an entry that is not a number pair is skipped, and the entries around it are still restored
    it('skips a damaged entry of the saved ephemeris at boot (#62)', async () => {
        const unit = await bootUnit({engineRunning: false, storage: {...WARM, lastEphemeris: `8:x,10:${START - MINUTE}`}});
        await vi.advanceTimersByTimeAsync(1000);

        const sats = unit.props.sensors.in.gps.gpsSatComputer.getSatellites();
        expect(sats.find(s => s.prn === 8)!.lastEphemerisTime).toBeUndefined();
        expect(sats.find(s => s.prn === 10)!.lastEphemerisTime).toBe(START - MINUTE);
    });
});

// characterization: the FAST acquisition of SET 10 is a simulator convenience, not in the Pilot's Guide (#46)
describe('fast GPS acquisition (characterization)', () => {
    it('characterization: a cold start with FAST acquisition is NAV ready within 30 s of power-on', async () => {
        const unit = await powerOnCold({lastLatitude: 47, lastLongitude: 8});

        expect(await secondsToFix(unit, 30)).toBeLessThan(30);
    });

    // The receiver keeps the timings it was built with for the session, so a unit built FAST stays out of the start
    // model after SET 10 is switched to REAL: no satellite is inhibited at the next power-on (#62)
    it('characterization: a unit built FAST runs no start model after a switch to REAL', async () => {
        const unit = await bootUnit({engineRunning: false, storage: {lastLatitude: 47, lastLongitude: 8}});
        unit.props.userSettings.getSetting('fastGpsAcquisition').set(false);
        await unit.panel.powerOn();
        await vi.advanceTimersByTimeAsync(5000);

        expect(unit.props.sensors.in.gps.gpsSatComputer.inhibitedSatellitePrnCodes.get().size).toBe(0);
    });

    it('characterization: choosing FAST on SET 10 while the slow search runs gives a fix within 2 s', async () => {
        const unit = await bootUnit({coldGps: true, storage: {fastGpsAcquisition: false}});
        const gps = unit.props.sensors.in.gps;
        await unit.panel.selectPage('L', 'SET 10');
        await unit.panel.cursor('L');
        await unit.panel.inner('L', 1);
        expect(Screen.read().rows('L')[0]).toBe('GPS:   FAST');

        expect(await secondsToFix(unit, 2)).toBeLessThan(2);
        expect(gps.gpsSatComputer.state).toBe(GPSSystemState.SolutionAcquired);
    });
});

// 5-29: a forced acquisition (the engine-running start in WelcomePage, SET 10 FAST) calls acquireAndUseSatellites()
// on the receiver; the unit accepts that solution at once, without the TRAN tick of a searched one (#215)
describe('forced acquisition (5-29, #215)', () => {
    it('is valid at once and not in transition, without a further calculation tick (#215)', async () => {
        const unit = await bootUnit({coldGps: true});
        const gps = unit.props.sensors.in.gps;
        expect(gps.isValid()).toBe(false);
        expect(gps.isTransition()).toBe(false);

        // Synchronous, the same call as WelcomePage and SET 10 make: no timer has run since, so no calculation tick can
        // have accepted the solution in the meantime; only acceptForcedSolution can
        gps.gpsSatComputer.acquireAndUseSatellites();

        expect(gps.gpsSatComputer.state).toBe(GPSSystemState.SolutionAcquired);
        expect(gps.isValid()).toBe(true);
        expect(gps.isTransition()).toBe(false);
    });
});

// B-2: DATA BASE OUT OF DATE appears when a date from the GPS overrides a pilot-entered date and the data base is then
// out of date. The fake clock starts after the end of the navdata cycle (MAY15JUN12/26, sim/clock.ts); the unit's own
// clock is set back into the cycle before the power-on, as a pilot would on the self-test page
describe('DATA BASE OUT OF DATE after the GPS sets the date (B-2)', () => {
    const AFTER_CYCLE = new Date('2026-07-01T12:00:00Z');
    const TEXT = 'DATA BASE OUT OF DATE ALL DATA MUST BE CONFIRMED BEFORE USE';

    it('posts when the GPS moves the date past the end of the data base (B-2)', async () => {
        const unit = await bootUnit({engineRunning: false, start: AFTER_CYCLE, storage: {lastLatitude: 47, lastLongitude: 8}});
        const gps = unit.props.sensors.in.gps;
        gps.timeZulu = TimeStamp.create(gps.timeZulu.getTimestamp() - 30 * DAY);
        await unit.panel.powerOn();
        expect(await secondsToFix(unit, 60)).toBeLessThan(60);
        // #175: for one tick the message is listed twice (Database.onGPSAcquired and the persistent message); after it, once
        await vi.advanceTimersByTimeAsync(5000);

        expect(messages(unit).filter(m => m === TEXT)).toHaveLength(1);
    });

    it('does not post when the GPS leaves the date as it was (B-2)', async () => {
        const unit = await bootUnit({engineRunning: false, start: AFTER_CYCLE, storage: {lastLatitude: 47, lastLongitude: 8}});
        await unit.panel.powerOn();
        expect(await secondsToFix(unit, 60)).toBeLessThan(60);

        expect(messages(unit)).not.toContain(TEXT);
    });
});

// 5-29: the receiver tracks up to eight satellites. The channel list is a private SDK field (KLNGPSSatComputer.getChannels
// reads activeSimulationContext.channels); an SDK that moves or empties it fails here. The #61 test in Gps.test.ts
// asserts the length too; this test adds the empty state of a unit that is not yet powered
describe('GPS receiver channels (5-29)', () => {
    it('has eight channels, empty before the power-on and all assigned 5 s after it (5-29)', async () => {
        const unit = await bootUnit({engineRunning: false});
        const channels = () => unit.props.sensors.in.gps.gpsSatComputer.getChannels();
        expect(channels()).toHaveLength(8);
        expect(channels().filter(c => c !== null)).toHaveLength(0);

        await unit.panel.powerOn();
        await vi.advanceTimersByTimeAsync(5000);

        expect(channels()).toHaveLength(8);
        expect(channels().filter(c => c !== null)).toHaveLength(8);
    });
});

// characterization: the STA 1 pages of a unit with a fix, from the ephemeris in resources/ at the fake clock's start.
// They read the SDK satellites through private fields (channels, state, signal strength, zenith angle), so an SDK
// upgrade that changes them shows here
// NAV A shows whenever there is an altitude, as on a real unit with all eight satellites in use (decided in #215)
describe('STA 1 page with a fix (characterization)', () => {
    it('characterization: both STA 1 pages after an engine-running boot', async () => {
        const unit = await bootUnit();
        await settle(unit);
        await unit.panel.selectPage('L', 'STA 1');
        const first = Screen.read().rows('L');
        await unit.panel.inner('L', 1);
        const second = Screen.read().rows('L');
        const name = Screen.read().status().left;

        expect([...first, ...second, name]).toMatchInlineSnapshot(`
          [
            "STATE NAV A",
            " SV SNR ELE",
            " 01  40 25°",
            " 08  52 76°",
            " 10  46 48°",
            " 14  37 10°",
            " 16  37 10°",
            " 21  47 55°",
            " 23  39 18°",
            " 27  48 57°",
            "           ",
            "           ",
            "STA+1",
          ]
        `);
    });
});

// 5-29: the start model searches the satellites it predicts even when its clock is too far off to acquire them; the
// receiver is in its acquisition state, not initializing (#215)
describe('STA 1 state during an acquisition that cannot succeed (5-29)', () => {
    it('shows ACQ right after the self-test with the clock 15 minutes behind (5-29, #215)', async () => {
        const unit = await powerOnCold(WARM, -15 * MINUTE);
        await vi.advanceTimersByTimeAsync(19_000); //the Turn-On page, as bootToSelfTest
        await unit.panel.approveSelfTest();
        await unit.panel.selectPage('L', 'STA 1');

        expect(unit.props.sensors.in.gps.isValid()).toBe(false);
        expect(Screen.read().rows('L')[0]).toBe('STATE   ACQ');
    }, 60_000);
});

// 3-53: the internal battery clock keeps the time while no satellite supplies it
describe('the system clock without a fix (3-53)', () => {
    it('runs on while the GPS searches (3-53)', async () => {
        const unit = await powerOnCold({...WARM, lastAlmanacDownload: START - 200 * DAY});
        await vi.advanceTimersByTimeAsync(60_000); // a minute of search, still short of a fix (asserted below)
        const gps = unit.props.sensors.in.gps;
        expect(gps.isValid()).toBe(false);

        // The tolerance: the unit's clock starts up to 2.5 s off (Gps.ts constructor) and lags by up to one 1 s tick
        expect(Math.abs(gps.timeZulu.getTimestamp() - Date.now())).toBeLessThan(3500);
    });

    // 3-53: the internal battery clock runs while the unit is off. A cold-and-dark unit that stays unpowered for half an
    // hour is right when it is switched on (#328: the GPS measures the off time itself, PowerButton's assumed hour is
    // for the CRT warm-up)
    it('keeps the time over 30 minutes unpowered before the first power-on (3-53, #328)', async () => {
        const unit = await bootUnit({engineRunning: false, storage: {lastLatitude: 47, lastLongitude: 8}});
        await vi.advanceTimersByTimeAsync(30 * MINUTE);
        await unit.panel.powerOn();
        await vi.advanceTimersByTimeAsync(2000);

        // The tolerance: the unit's clock starts up to 2.5 s off (Gps.ts constructor) and lags by up to one 1 s tick
        expect(Math.abs(unit.props.sensors.in.gps.timeZulu.getTimestamp() - Date.now())).toBeLessThan(3500);
    }, SLOW);

    // #328: the battery clock counts the off time in sim time, as the satellites move in sim time. A sim paused for half
    // an hour before the power-on (real time runs, sim time stands) and a sim time moved on by half an hour (sim time
    // runs, real time stands) both leave the clock right. The harness runs both times together; absoluteTimeOffsetMs
    // separates them
    it.each([
        ['paused for 30 minutes', -30 * MINUTE, 30 * MINUTE],
        ['moved on by 30 minutes', 30 * MINUTE, 0],
    ])('keeps the sim time over a sim %s before the first power-on (3-53, #328)', async (_, offsetMs, realMs) => {
        const unit = await bootUnit({engineRunning: false, storage: {lastLatitude: 47, lastLongitude: 8}});
        unit.env.sim.absoluteTimeOffsetMs = offsetMs;
        await vi.advanceTimersByTimeAsync(realMs);
        await unit.panel.powerOn();
        await vi.advanceTimersByTimeAsync(2000);

        // The tolerance as above
        expect(Math.abs(unit.props.sensors.in.gps.timeZulu.getTimestamp() - (Date.now() + offsetMs))).toBeLessThan(3500);
    }, SLOW);
});
