import {describe, expect, it, vi} from 'vitest';
import {GPSSystemState} from '@microsoft/msfs-sdk';
import {bootToSelfTest, bootUnit, HeadlessUnit, settle} from '../harness/boot';
import {DEFAULT_START} from '../harness/sim/clock';
import {Screen} from '../harness/render/screen';
import {storedSetting} from '../harness/storage';
import {messages} from '../harness/readers';
import {TimeStamp} from '../../kln90b/data/Time';

// #211: the KLN almanac check (KLNGPSSatComputer.isAlmanacValid) reads SDK fields that SDK 2.3.3 moved into
// activeSimulationContext, so it is always false; with that fixed, the first calculation tick after power-on still sees
// the clock one hour behind (powerChanged advances timeZulu, not internalTime). Both make every slow cold-and-dark start
// a sky search of about 6 minutes. The three pins of #211 turn red with both fixes: read activeSimulationContext.time
// and compute the distance from activeSimulationContext.position and lastKnownPosition (the context's own distance field
// is set after the first read), and set gpsSatComputer.internalTime in powerChanged after the off time is added.
//
// The acquisition tests simulate several minutes each: they carry their own timeout, as the 5 s default fails when the
// machine is busy (testing.md).
const SLOW = 60_000;

const START = DEFAULT_START.getTime();
const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

/** The stored data of a unit that was last used here yesterday: position 47/8 (the boot position), almanac a day old */
const WARM = {fastGpsAcquisition: false, lastLatitude: 47, lastLongitude: 8, lastAlmanacDownload: START - DAY};

/** A cold-and-dark unit, switched on. clockOffsetMs moves the unit's battery clock against the sim time */
async function powerOnCold(storage: Record<string, unknown>, clockOffsetMs = 0): Promise<HeadlessUnit> {
    const unit = await bootUnit({engineRunning: false, storage});
    const gps = unit.props.sensors.in.gps;
    gps.timeZulu = TimeStamp.create(gps.timeZulu.getTimestamp() + clockOffsetMs);
    await unit.panel.powerOn();
    return unit;
}

/** Seconds from now until the GPS has a solution, or cap when it has none by then. The time is the subject (testing.md) */
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
    it.fails('a warm start is NAV ready within 5 minutes of power-on (#211)', async () => {
        const unit = await powerOnCold(WARM);

        expect(await secondsToFix(unit, 300)).toBeLessThan(300);
    }, SLOW);

    // The sibling of the pin above: the same start, with the loose bound of 3-17 (never more than 12 minutes)
    it('a warm start is NAV ready within 12 minutes of power-on (3-17)', async () => {
        const unit = await powerOnCold(WARM);

        expect(await secondsToFix(unit, 720)).toBeLessThan(720);
    }, SLOW);

    // Install manual 2-66: with the position within 60 NM and the time within 10 minutes, STA 1 shows ACQ
    it.fails('a warm start shows ACQ on STA 1 right after the self-test (#211)', async () => {
        const unit = await powerOnCold(WARM);
        await unit.panel.approveSelfTest();
        await unit.panel.selectPage('L', 'STA 1');

        expect(Screen.read().rows('L')[0]).toBe('STATE   ACQ');
    }, SLOW);

    // The sibling of the pin above: the same key sequence, on a start where INIT is right today and after the fix.
    // the receiver states are a question: #215
    it('characterization: a start 3000 NM from the stored position shows INIT on STA 1 right after the self-test', async () => {
        const unit = await powerOnCold({...WARM, lastLatitude: 0, lastLongitude: 0});
        await unit.panel.approveSelfTest();
        await unit.panel.selectPage('L', 'STA 1');

        expect(Screen.read().rows('L')[0]).toBe('STATE  INIT');
    }, SLOW);

    // 3-17: the receiver's own view of the almanac. The tripwire for the SDK internals isAlmanacValid reads. Whoever
    // removes the .fails of the three pins confirms that the warm start is ACQ, not merely fast: a faster sky search also
    // turns the 5 minute pin red
    it.fails('a warm start considers its almanac valid (#211)', async () => {
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

    // 3-5, 3-17: without the right position the unit searches the whole sky: usually about six minutes, at most 12. The
    // lower bound is three minutes, between the 2 minutes of a warm start (3-17) and the six of a cold one (3-5). At this
    // distance the SDK's own 100 NM rule on the last known position decides, whatever the KLN's almanac check says: the
    // case holds the SDK rule, and the 80 NM case below holds the KLN's own 60 NM clause
    it('a start 3000 NM from the stored position is not NAV ready within 3 minutes, and is within 12 (3-5, 3-17)', async () => {
        const unit = await powerOnCold({...WARM, lastLatitude: 0, lastLongitude: 0});

        expect(await secondsToFix(unit, 180)).toBe(180);
        expect(await secondsToFix(unit, 540)).toBeLessThan(540);
    }, SLOW);

    // Install manual 2-66: only a position within 60 NM of the stored one is a warm start, so 80 NM is a sky search (3-5,
    // 3-17: usually about six minutes, at most 12). The SDK accepts the position up to 100 NM, so this is the KLN's own 60
    // NM clause (Gps.ts isAlmanacValid). Today the whole almanac check is dead (#211) and every start is a sky search,
    // so only a check that is always valid breaks this case; once #211 is fixed it also holds the 60 NM clause
    it('a start 80 NM from the stored position is not NAV ready within 3 minutes, and is within 12 (install manual 2-66, 3-5, 3-17)', async () => {
        const unit = await powerOnCold({...WARM, lastLatitude: 47 + 80 / 60});

        expect(await secondsToFix(unit, 180)).toBe(180);
        expect(await secondsToFix(unit, 540)).toBeLessThan(540);
    }, SLOW);

    // 3-17: an almanac older than six months must be collected again, usually about 6 minutes, at most 12
    it('a start with an almanac 200 days old is not NAV ready within 3 minutes, and is within 12 (3-17)', async () => {
        const unit = await powerOnCold({...WARM, lastAlmanacDownload: START - 200 * DAY});

        expect(await secondsToFix(unit, 180)).toBe(180);
        expect(await secondsToFix(unit, 540)).toBeLessThan(540);
    }, SLOW);

    // Install manual 2-66: the time must be within 10 minutes for the fast search; otherwise 3-5: about six minutes, and
    // 3-17: at most 12 (the 15 minutes of 2-66 for the sky search are the looser bound of the installation)
    it('a start with the clock 15 minutes behind is not NAV ready within 3 minutes, and is within 12 (install manual 2-66, 3-17)', async () => {
        const unit = await powerOnCold(WARM, -15 * MINUTE);

        expect(await secondsToFix(unit, 180)).toBe(180);
        expect(await secondsToFix(unit, 540)).toBeLessThan(540);
    }, SLOW);

    // 3-17: the almanac stays current for six months, the code lets it expire after 90 days ("Manual says 6 months, but
    // it's 90 days", Gps.ts). The almanac check has been dead since SDK 2.3.3 (#211), so this pin can turn red only
    // together with that fix, plus almanacExpireTime at 182 days.
    it.fails('a start with an almanac 120 days old is a warm start (3-17: six months) (#212)', async () => {
        const unit = await powerOnCold({...WARM, lastAlmanacDownload: START - 120 * DAY});

        expect(await secondsToFix(unit, 300)).toBeLessThan(300);
    }, SLOW);

    // The sibling of the pin above: the same start with the loose bound of 3-17
    it('a start with an almanac 120 days old is NAV ready within 12 minutes (3-17)', async () => {
        const unit = await powerOnCold({...WARM, lastAlmanacDownload: START - 120 * DAY});

        expect(await secondsToFix(unit, 720)).toBeLessThan(720);
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
    // with the engine running stands for a unit that is already on, but its clock starts one hour behind
    // (Gps.ts subtracts the hour PowerButton assumes the unit was off, and forceReadyToUse never adds it back), so
    // every such flight starts with SYSTEM TIME UPDATED TO GPS TIME and the MSG annunciator lit (testing.md section 6).
    it.fails('posts no message on an engine-running start at the stored position (B-3, B-4, #328)', async () => {
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
});

// characterization: the FAST acquisition of SET 10 is a simulator convenience, not in the Pilot's Guide (#46)
describe('fast GPS acquisition (characterization)', () => {
    it('characterization: a cold start with FAST acquisition is NAV ready within 30 s of power-on', async () => {
        const unit = await powerOnCold({lastLatitude: 47, lastLongitude: 8});

        expect(await secondsToFix(unit, 30)).toBeLessThan(30);
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
// the receiver states are a question: #215
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

// 3-53: the internal battery clock keeps the time while no satellite supplies it
describe('the system clock without a fix (3-53)', () => {
    it('runs on while the GPS searches (3-53)', async () => {
        const unit = await powerOnCold({...WARM, lastLatitude: 0, lastLongitude: 0});
        await vi.advanceTimersByTimeAsync(60_000); // a minute of search, still short of a fix (asserted below)
        const gps = unit.props.sensors.in.gps;
        expect(gps.isValid()).toBe(false);

        // The tolerance: the unit's clock starts up to 2.5 s off (Gps.ts constructor) and lags by up to one 1 s tick
        expect(Math.abs(gps.timeZulu.getTimestamp() - Date.now())).toBeLessThan(3500);
    });
});
