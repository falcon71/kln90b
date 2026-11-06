import {afterEach, describe, expect, it, vi} from 'vitest';
import {GPSSatellite, GPSSatelliteState} from '@microsoft/msfs-sdk';
import {bootToSelfTest, bootUnit, HeadlessUnit, untilCalcTick} from '../../harness/boot';
import {DEFAULT_START} from '../../harness/sim/clock';
import {messages} from '../../harness/readers';
import {Screen} from '../../harness/render/screen';
import {standardRoute} from '../../harness/fixtures';
import {savedFlightplan, storedSetting} from '../../harness/storage';
import {Raim, raimStatus} from '../../../kln90b/GpsSolution';
import {halForMode} from '../../../kln90b/services/ModeController';
import {SearchMode} from '../../../kln90b/GpsSearch';
import {GPS} from '../../../kln90b/Gps';
import {sdkBlockOf} from '../../../kln90b/GpsSignal';

/**
 * #460: jamming over time and what STA 1 shows of it (the design docs/superpowers/specs/2026-11-05-failures-gps-receiver-design.md,
 * "STA 1 during an acquisition", "Jamming" and "STA 1 and STA 2"). The noise floor ramps up, the satellites lose lock from
 * the horizon up and stay on STA 1 as "searched, not found" (*xx 00, Pilot's Guide 5-29, 5-30; Installation Manual C-7)
 */

const COVERAGE = 'SATELLITE COVERAGE INADEQUATE FOR NAV';
const SIGNAL_MESSAGES = [COVERAGE, 'RAIM NOT AVAILABLE CROSS CHECK POSITION', 'BAD SATELLITE GEOMETRY SEE EPE ON STA 2 PAGE', 'BAD SATELLITE GEOMETRY AND RAIM NOT AVAILABLE'];

/** The stored ramp: 26 dB after 240 s, started at the boot */
const RAMP_S = 240;
const FINAL_DB = 26;
const JAMMING = {failure_gpsJamming: JSON.stringify({rampS: RAMP_S, finalDb: FINAL_DB, elapsedS: 0})};

/** The satellites in use after an engine-running boot at 47/8 (the STA 1 snapshot in GpsAcquisition.test.ts) */
const IN_VIEW = [1, 8, 10, 14, 16, 21, 23, 27];
/** The two lowest of them, both at 10 degrees: 39.4 at the antenna for 14 (a GPS IIIA), 39.9 for 16 (a GPS IIR-A) */
const LOWEST = [14, 16];

/** The stored data of a unit last used here yesterday (GpsAcquisition.test.ts): the start model runs a warm start */
const WARM_START = {fastGpsAcquisition: false, lastLatitude: 47, lastLongitude: 8, lastAlmanacDownload: DEFAULT_START.getTime() - 24 * 60 * 60 * 1000};

const byNumber = (a: number, b: number) => a - b;
const TRACKED = new Set([GPSSatelliteState.Acquired, GPSSatelliteState.DataCollected, GPSSatelliteState.InUse, GPSSatelliteState.InUseDiffApplied]);

afterEach(() => {
    vi.restoreAllMocks();
});

/**
 * An engine-running unit at KAAA, 3000 ft, flying FPL 0 KAAA, ABC, KBBB, with the jamming ramp stored. The position is the
 * one stored at the last power-off, so the boot posts no POSITION DIFFERS message. STA 1 is on the left.
 *
 * The receiver runs the REAL timings (#467): a satellite whose signal is lost stays in its channel, searched, until the
 * SDK's acquisition timeout makes it Unreachable. FAST's timeout of 1 s (Gps.ts) would turn the searched rows into
 * Unreachable ones and give their channels away within seconds
 */
async function jammedFlight(storage: Record<string, unknown> = JAMMING): Promise<HeadlessUnit> {
    const r = standardRoute();
    const unit = await bootUnit({
        facilities: [r.kaaa, r.abc, r.kbbb], position: {lat: r.kaaa.lat, lon: r.kaaa.lon}, altitudeFt: 3000,
        storage: {fastGpsAcquisition: false, lastLatitude: r.kaaa.lat, lastLongitude: r.kaaa.lon, ...savedFlightplan(0, [r.kaaa, r.abc, r.kbbb]), ...storage},
    });
    await unit.panel.selectPage('L', 'STA 1');
    return unit;
}

/** The satellite rows of both STA 1 pages (four on the first page, below the state and the header; the rest on the second) */
async function satelliteRows(unit: HeadlessUnit): Promise<string[]> {
    const first = Screen.read().rows('L').slice(2);
    if (Screen.read().status().left !== 'STA+1') {
        return first.filter(r => r.trim() !== '');
    }
    await unit.panel.inner('L', 1);
    const second = Screen.read().rows('L').filter(r => r.trim() !== '');
    await unit.panel.inner('L', -1);
    return [...first, ...second];
}

/** Brings the display one tick past a calculation tick, so that the screen shows what that calculation tick left */
async function afterCalcTick(unit: HeadlessUnit): Promise<void> {
    await untilCalcTick(unit);
    await vi.advanceTimersByTimeAsync(250);
}

const prnOf = (row: string) => Number(row.slice(1, 3));
const snrOf = (row: string) => Number(row.slice(5, 7));
const inUse = (row: string) => row[0] === ' ';

const satellite = (unit: HeadlessUnit, prn: number): GPSSatellite =>
    unit.props.sensors.in.gps.gpsSatComputer.getSatellites().find(s => s.prn === prn)!;
/** Degrees above the horizon from the SDK's zenith angle, as STA 1 rounds it */
const elevation = (unit: HeadlessUnit, prn: number): number => Math.round(90 - satellite(unit, prn).position.get()[0] * 180 / Math.PI);
/** The row of a satellite that is searched and not found: *, the PRN, SNR 00 and its elevation */
const searchedRow = (unit: HeadlessUnit, prn: number) => `*${String(prn).padStart(2, '0')}  00 ${String(elevation(unit, prn)).padStart(2, '0')}°`;

const inhibited = (unit: HeadlessUnit) => [...unit.props.sensors.in.gps.gpsSatComputer.inhibitedSatellitePrnCodes.get()].sort(byNumber);

describe('jamming over time and STA 1 (#460)', () => {
    // The fade and the estimate noise are pinned (#467): the SNR then moves with the jamming level alone
    it('after 60 s every satellite in use shows its SNR lowered by the jamming level', async () => {
        const unit = await jammedFlight();
        const failures = unit.props.sensors.in.gps.failures;
        unit.props.sensors.in.gps.signals.fadeScale = 0;
        unit.props.sensors.in.gps.signals.jitterScale = 0;
        await afterCalcTick(unit);
        const unjammedLevel = failures.jammingDb;
        const unjammed = new Map((await satelliteRows(unit)).map(r => [prnOf(r), snrOf(r)]));
        expect([...unjammed.keys()]).toEqual(IN_VIEW); // Precondition: every satellite in use, the level still about 0
        expect(unjammedLevel).toBeLessThan(0.5);

        await vi.advanceTimersByTimeAsync(60_000);
        await afterCalcTick(unit);
        const level = failures.jammingDb;
        const state = Screen.read().rows('L')[0];
        const rows = (await satelliteRows(unit)).filter(inUse);

        expect(level).toBeGreaterThan(3); // Precondition: a level the rounding cannot hide
        expect(state).toBe('STATE NAV A'); // Jamming with a fix keeps the state of the fix
        expect(rows.map(prnOf)).toEqual([1, 8, 10, 21, 23, 27]); // The ones still in use with the seeded wander
        // Each lowered by the rise of the level since the first reading, within the rounding of the two readings
        const rise = level - unjammedLevel;
        const lowered = rows.map(r => ({prn: prnOf(r), by: unjammed.get(prnOf(r))! - snrOf(r)}));
        expect(lowered.filter(l => Math.abs(l.by - rise) > 1)).toEqual([]);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // A satellite whose signal is lost stays in its channel, searched (#467), and is listed once, from its channel
    it('no satellite is listed twice while the satellites are lost and searched', async () => {
        const unit = await jammedFlight();
        const gps = unit.props.sensors.in.gps;
        await vi.advanceTimersByTimeAsync(30_000);

        const repeated: string[] = [];
        let lostInChannel = 0;
        for (let s = 30; s < 90; s++) {
            await afterCalcTick(unit);
            const channels = gps.gpsSatComputer.getChannels().filter(sat => sat !== null) as GPSSatellite[];
            if (channels.some(sat => gps.signals.isLost(sat.prn))) {
                lostInChannel++;
            }
            const prns = (await satelliteRows(unit)).map(prnOf);
            if (new Set(prns).size !== prns.length) {
                repeated.push(`${s} s: ${prns.join(',')}`);
            }
        }

        expect(lostInChannel).toBeGreaterThan(0); // Precondition: lost satellites were searched in their channels
        expect(repeated).toEqual([]);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // #467: the losses spread over the satellites' own differences, so the two lowest need not go in the same tick; both
    // go before any higher satellite
    it('the first satellites lost are the two lowest; each stays on STA 1 as searched, not found', async () => {
        const unit = await jammedFlight();
        const signals = unit.props.sensors.in.gps.signals;

        let lost: number[] = [];
        for (let t = 0; t < RAMP_S * 4 && !LOWEST.every(prn => lost.includes(prn)); t++) {
            await vi.advanceTimersByTimeAsync(250);
            lost = IN_VIEW.filter(prn => signals.isLost(prn));
        }
        expect(lost).toEqual(LOWEST);
        await vi.advanceTimersByTimeAsync(250); // A display tick after the calculation tick of the loss

        // The SDK keeps both in their channels, searched (the SDK's None state), and the unit draws them so
        const channels = unit.props.sensors.in.gps.gpsSatComputer.getChannels().filter(s => s !== null).map(s => s!.prn).sort(byNumber);
        expect(channels).toEqual(IN_VIEW); // Precondition
        const rows = await satelliteRows(unit);
        expect(rows.map(prnOf)).toEqual(IN_VIEW);
        expect(rows.filter(r => LOWEST.includes(prnOf(r)))).toEqual(LOWEST.map(prn => searchedRow(unit, prn)));
        expect(rows.filter(r => !LOWEST.includes(prnOf(r))).map(r => r[0])).toEqual([' ', ' ', ' ', ' ', ' ', ' ']);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // The order of the states the design pins: RAIM lost while the fix holds, then the fix (design, "Jamming", "What
    // emerges"). The wander is pinned: with it a gust can take the last three satellites in one tick and skip the RAIM loss
    it('RAIM is lost while the fix holds, then the fix: SATELLITE COVERAGE INADEQUATE FOR NAV and the NAV flag', async () => {
        const unit = await jammedFlight();
        const gps = unit.props.sensors.in.gps;
        gps.failures.wanderSigmaDb = 0;
        await afterCalcTick(unit);
        expect(gps.isValid()).toBe(true); // Preconditions: a fix, navigating to ABC, no signal message
        expect(unit.props.memory.navPage.toFrom).not.toBeNull();
        expect(messages(unit).filter(m => SIGNAL_MESSAGES.includes(m))).toEqual([]);

        const valid: boolean[] = [];
        const raim: Raim[] = [];
        for (let s = 0; s < RAMP_S + 10 && (valid.length === 0 || valid[valid.length - 1]); s++) {
            await vi.advanceTimersByTimeAsync(1000);
            valid.push(gps.isValid());
            raim.push(raimStatus(gps.solution, halForMode(unit.props.memory.navPage.navmode)));
        }
        const fixLost = valid.indexOf(false);
        expect(fixLost).toBeGreaterThan(0);
        const raimLostWithFix = raim.findIndex((r, i) => valid[i] && r !== Raim.Available);
        expect(raimLostWithFix).toBeGreaterThanOrEqual(0);
        expect(raimLostWithFix).toBeLessThan(fixLost);

        await vi.advanceTimersByTimeAsync(2000);
        expect(messages(unit).filter(m => SIGNAL_MESSAGES.includes(m))).toEqual([COVERAGE]);
        expect(unit.props.memory.navPage.toFrom).toBeNull();
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // #467: with one common jamming level the satellites were once lost strictly from the lowest up. Now each one's own SNR
    // decides. The seeded default run loses them in the order 14, 16, 23, 1, 21, 8, 10, 27 (at 25, 47, 59, 110, 129, 157,
    // 159 and 159 s), against the elevation order 14, 16, 23, 1, 10, 27, 21, 8. PRN 21 is a GPS-IIR-A (-1 dB) at 55.7 degrees
    // and goes before PRN 10 and PRN 27, both GPS-IIF (+1 dB) at 47.3 and 55.4 degrees, lower or level with it: the block's
    // offset outweighs the few degrees of elevation. The blocks are those of the generated ephemeris
    it('a weaker, higher satellite is lost before a stronger, lower one: the order follows each satellite SNR, not the elevation', async () => {
        const unit = await jammedFlight();
        const signals = unit.props.sensors.in.gps.signals;
        const lostAt = new Map<number, number>();
        for (let s = 1; s <= RAMP_S + 60 && lostAt.size < IN_VIEW.length; s++) {
            await vi.advanceTimersByTimeAsync(1000);
            for (const prn of IN_VIEW) {
                if (signals.isLost(prn) && !lostAt.has(prn)) {
                    lostAt.set(prn, s);
                }
            }
        }

        expect(lostAt.size).toBe(IN_VIEW.length); // Precondition: every one of them is lost by the end of the ramp
        expect(sdkBlockOf(satellite(unit, 21))).toBe('GPS-IIR-A'); // Preconditions: the blocks
        expect(sdkBlockOf(satellite(unit, 10))).toBe('GPS-IIF');
        expect(sdkBlockOf(satellite(unit, 27))).toBe('GPS-IIF');
        const exact = (prn: number) => 90 - satellite(unit, prn).position.get()[0] * 180 / Math.PI;
        expect(exact(21)).toBeGreaterThan(exact(10) + 5); // Preconditions: 21 is higher than 10 and level with 27, so the elevation order puts 21 after 10
        expect(Math.abs(exact(21) - exact(27))).toBeLessThan(1);
        expect(lostAt.get(21)!).toBeLessThan(lostAt.get(10)!);
        expect(lostAt.get(21)!).toBeLessThan(lostAt.get(27)!);
        expect([...lostAt.entries()].sort((x, y) => x[1] - y[1] || x[0] - y[0]).map(e => e[0])).toEqual([14, 16, 23, 1, 21, 8, 10, 27]);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    it('after the ramp STA 1 shows ACQ', async () => {
        const unit = await jammedFlight();
        const gps = unit.props.sensors.in.gps;

        await vi.advanceTimersByTimeAsync((RAMP_S + 20) * 1000);
        await afterCalcTick(unit);

        expect(gps.isValid()).toBe(false); // Preconditions: no fix, outside TRAN, the start model idle
        expect(gps.isTransition()).toBe(false);
        expect(gps.search.mode).toBe(SearchMode.Idle);
        expect(Screen.read().rows('L')[0]).toBe('STATE   ACQ');
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // The forced acquisition of an engine-running start runs before the first calculation tick: the stored, finished ramp
    // loses the satellites in it, so nothing is acquired (design, "Jamming": a power-on while jammed acquires nothing).
    // #467: the forced path makes a lost satellite Unreachable, so the tracked states are what counts
    it('an engine-running start with a finished ramp stored: no satellite acquired, no fix, no coverage message, ACQ', async () => {
        const atForced: number[][] = [];
        const original = GPS.prototype.acceptForcedSolution;
        vi.spyOn(GPS.prototype, 'acceptForcedSolution').mockImplementation(function (this: GPS) {
            atForced.push(this.gpsSatComputer.getSatellites().filter(s => TRACKED.has(s.state.get())).map(s => s.prn));
            original.call(this);
        });
        const unit = await jammedFlight({failure_gpsJamming: JSON.stringify({rampS: RAMP_S, finalDb: FINAL_DB, elapsedS: RAMP_S})});
        const gps = unit.props.sensors.in.gps;

        expect(atForced).toEqual([[]]); // Exactly one forced acquisition, and it acquired nothing
        expect(gps.hadFixSincePowerOn).toBe(false);
        expect(gps.isValid()).toBe(false);

        await afterCalcTick(unit);
        await afterCalcTick(unit);
        await vi.advanceTimersByTimeAsync(10_000);
        await afterCalcTick(unit);

        expect(gps.hadFixSincePowerOn).toBe(false);
        expect(gps.isValid()).toBe(false);
        expect(messages(unit).filter(m => SIGNAL_MESSAGES.includes(m))).toEqual([]);
        expect(Screen.read().rows('L')[0]).toBe('STATE   ACQ');
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // #467: a lost satellite keeps its channel and is searched there (the SDK's None state); the receiver lost all eight
    it('after the ramp STA 1 shows the satellites of the channels as searched, not found', async () => {
        const unit = await jammedFlight();
        const gps = unit.props.sensors.in.gps;

        await vi.advanceTimersByTimeAsync((RAMP_S + 20) * 1000);
        await afterCalcTick(unit);

        const channels = gps.gpsSatComputer.getChannels().filter(s => s !== null).map(s => s!.prn).sort(byNumber);
        expect(channels).toEqual(IN_VIEW); // Preconditions: the eight keep their channels, all lost
        expect(channels.filter(prn => !gps.signals.isLost(prn))).toEqual([]);
        const rows = await satelliteRows(unit);
        expect(rows.map(prnOf)).toEqual(IN_VIEW);
        expect(rows).toEqual(rows.map(r => searchedRow(unit, prnOf(r))));
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // The start model's own states come first: jamming makes ACQ only of a unit whose start model is idle
    it('jamming during an almanac search: STA 1 shows INIT', async () => {
        const unit = await bootToSelfTest({
            storage: {...JAMMING, fastGpsAcquisition: false, lastLatitude: 47, lastLongitude: 8, lastAlmanacDownload: DEFAULT_START.getTime() - 200 * 24 * 3600 * 1000},
        });
        await unit.panel.approveSelfTest();
        await unit.panel.selectPage('L', 'STA 1');

        expect(unit.props.sensors.in.gps.failures.jamming).toBe(true); // Preconditions
        expect(unit.props.sensors.in.gps.search.mode).toBe(SearchMode.AlmanacSearch);
        expect(Screen.read().rows('L')[0]).toBe('STATE  INIT');
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // The start model's acquisition lists the satellites predicted for the stored position (#213). Under jamming a lost
    // one reads *xx 00 and one in use loses the jamming level from its SNR, as in the channel list (design, "STA 1 and STA 2")
    it("jamming during the start model's acquisition: the predicted list shows the lost satellites searched and the SNRs lowered", async () => {
        // A finished ramp of 8 dB with the wander pinned: the level is exactly 8 dB from the first calculation tick on. The
        // fade and the estimate noise are pinned too (#467), so the SNR is the antenna's curve, the block offset and the level
        const unit = await bootUnit({engineRunning: false, storage: {...WARM_START, failure_gpsJamming: JSON.stringify({rampS: 100, finalDb: 8, elapsedS: 100})}});
        const gps = unit.props.sensors.in.gps;
        gps.failures.wanderSigmaDb = 0;
        gps.signals.fadeScale = 0;
        gps.signals.jitterScale = 0;
        await unit.panel.powerOn();
        await vi.advanceTimersByTimeAsync(19_000);
        await unit.panel.approveSelfTest();
        await unit.panel.selectPage('L', 'STA 1');
        const inUse = () => gps.gpsSatComputer.getSatellites().filter(s => s.state.get() === GPSSatelliteState.InUse).map(s => s.prn).sort(byNumber);
        for (let t = 0; t < 240 && inUse().length === 0; t++) {
            await vi.advanceTimersByTimeAsync(250);
        }
        await vi.advanceTimersByTimeAsync(250); // A display tick after the calculation tick that put them in use

        // Preconditions: the start model's acquisition without a fix, the level 8 dB, two satellites in use
        expect(gps.search.mode).toBe(SearchMode.Acquisition);
        expect(gps.isValid()).toBe(false);
        expect(gps.failures.jammingDb).toBe(8);
        expect(inUse()).toEqual([1, 21]);

        // 01 at 25 degrees, a GPS IIF, is 46.5 at the antenna (50 + 12 x log10(sin 25 degrees) + 1, #464, #467) and 38.5
        // with 8 dB, shown as 39; 21 at 55 degrees, a GPS IIR-A, is 48 and 40. 14 at 10 degrees, a GPS IIIA, is 39.4 at the antenna (the
        // curve less 1.5) and 31.4 with the jamming: below the acquire level of 35, lost and searched
        expect(gps.signals.isLost(14)).toBe(true); // Precondition
        expect(Screen.read().rows('L')[0]).toBe('STATE   ACQ');
        expect(await satelliteRows(unit)).toEqual([
            ' 01  39 25°', '*08  00 76°', '*10  00 48°', '*14  00 10°', '*16  00 10°', ' 21  40 55°', '*23  00 18°', '*27  00 57°',
        ]);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // TRAN comes before the jamming ACQ: a unit that acquires its first fix under a ramp just begun shows it
    it('jamming during the transition to the first fix: STA 1 shows TRAN', async () => {
        const unit = await bootToSelfTest({storage: {...JAMMING, ...WARM_START}});
        await unit.panel.approveSelfTest();
        await unit.panel.selectPage('L', 'STA 1');
        const gps = unit.props.sensors.in.gps;
        for (let t = 0; t < 600 && !gps.isTransition(); t++) {
            await vi.advanceTimersByTimeAsync(250);
        }
        expect(gps.isTransition()).toBe(true); // Preconditions: TRAN, jamming
        expect(gps.failures.jamming).toBe(true);
        await vi.advanceTimersByTimeAsync(250); // The display tick after the calculation tick of TRAN

        expect(gps.isTransition()).toBe(true);
        expect(Screen.read().rows('L')[0]).toBe('STATE  TRAN');
        expect(unit.errors).toEqual([]);
    }, 60_000);

    it('a power cycle at 120 s of the ramp continues the ramp from the stored progress', async () => {
        const unit = await jammedFlight();
        const failures = unit.props.sensors.in.gps.failures;
        failures.wanderSigmaDb = 0; // The level is the ramp alone
        const levels: number[] = [];
        const original = failures.tick.bind(failures);
        vi.spyOn(failures, 'tick').mockImplementation((t: number) => {
            original(t);
            levels.push(failures.jammingDb);
        });

        await vi.advanceTimersByTimeAsync(120_000);
        await unit.panel.powerOff();
        const beforeOff = levels.length;
        const level = levels[beforeOff - 1];
        await vi.advanceTimersByTimeAsync(20_000);
        await unit.panel.powerOn();
        for (let i = 0; i < 8 && levels.length === beforeOff; i++) {
            await vi.advanceTimersByTimeAsync(250);
        }

        const stored = JSON.parse(storedSetting(unit, 'failure_gpsJamming') as string) as Record<string, number>;
        expect(stored.elapsedS).toBeGreaterThanOrEqual(110);
        expect(stored.elapsedS).toBeLessThanOrEqual(121);
        expect(levels.length).toBe(beforeOff + 1);
        expect(levels[beforeOff]).toBe(level);
        expect(levels[beforeOff]).toBeGreaterThanOrEqual(FINAL_DB * 110 / RAMP_S);
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // The fade and the estimate noise are pinned (#467), so the SNRs are the antenna's curve and the block offsets
    it('the repair: the level 0, no satellite lost, a fix again within 120 s, the SNRs unjammed', async () => {
        const unit = await jammedFlight();
        const gps = unit.props.sensors.in.gps;
        gps.signals.fadeScale = 0;
        gps.signals.jitterScale = 0;
        await vi.advanceTimersByTimeAsync((RAMP_S + 20) * 1000);
        expect(gps.isValid()).toBe(false); // Precondition: the total loss
        expect(IN_VIEW.filter(prn => gps.signals.isLost(prn))).toEqual(IN_VIEW);

        unit.props.failures.repair('gpsJamming');
        await untilCalcTick(unit);
        expect(gps.failures.jammingDb).toBe(0);
        expect(IN_VIEW.filter(prn => gps.signals.isLost(prn))).toEqual([]);
        expect(inhibited(unit)).toEqual([]);
        for (let s = 0; s < 120 && !gps.isValid(); s++) {
            await vi.advanceTimersByTimeAsync(1000);
        }
        expect(gps.isValid()).toBe(true);
        await afterCalcTick(unit);

        // The eight of the boot, in use again, about six minutes on. The SNRs follow 50 + 12 x log10(sin(elevation)) (#464)
        // plus the block offset (#467) with nothing taken off: 01, 08, 10 and 27 are GPS IIF (+1), 16 and 21 GPS IIR-A (-1),
        // 14 and 23 GPS IIIA (-1.5 below 30 degrees). 14 at 11 degrees is 41.4 - 1.5, 16 at 8 is 39.7 - 1, 08 at 78 is
        // 49.9 + 1
        expect(await satelliteRows(unit)).toEqual([
            ' 01  47 26°', ' 08  51 78°', ' 10  49 47°', ' 14  40 11°', ' 16  39 08°', ' 21  48 57°', ' 23  42 16°', ' 27  50 54°',
        ]);
        expect(unit.errors).toEqual([]);
    }, 60_000);
});

describe('STA 1 during a receiver failure (#460)', () => {
    it('gpsAntenna in flight: STATE FAILR and no satellite rows, while the SDK still has the satellites in their channels', async () => {
        const unit = await jammedFlight({});
        const gps = unit.props.sensors.in.gps;
        await afterCalcTick(unit);
        expect(Screen.read().status().left).toBe('STA+1'); // Precondition: eight rows on two pages

        unit.props.failures.fail('gpsAntenna');
        await afterCalcTick(unit);

        expect(gps.gpsSatComputer.getChannels().filter(s => s !== null && s.state.get() === GPSSatelliteState.InUse).length).toBe(8); // Precondition
        expect(Screen.read().rows('L')).toEqual(['STATE FAILR', ' SV SNR ELE', '           ', '           ', '           ', '           ']);
        expect(Screen.read().status().left).toBe('STA 1'); // No second page

        await vi.advanceTimersByTimeAsync(10_000);
        expect(Screen.read().rows('L')).toEqual(['STATE FAILR', ' SV SNR ELE', '           ', '           ', '           ', '           ']);
        expect(Screen.read().status().left).toBe('STA 1');
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // FAILR comes before every other state: also before the calculation tick that drops the fix
    it('gpsAntenna: FAILR at the next display tick, while the fix is still valid', async () => {
        const unit = await jammedFlight({});
        await untilCalcTick(unit);

        unit.props.failures.fail('gpsAntenna');
        await vi.advanceTimersByTimeAsync(250);

        expect(unit.props.sensors.in.gps.isValid()).toBe(true); // Precondition: no calculation tick yet
        expect(Screen.read().rows('L')[0]).toBe('STATE FAILR');
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // The page falls back from STA+1 (#466), so the failure shows on the first page
    it('gpsAntenna while STA+1 is shown: STATE FAILR and no satellite rows', async () => {
        const unit = await jammedFlight({});
        await afterCalcTick(unit);
        await unit.panel.inner('L', 1);
        expect(Screen.read().rows('L')[0]).not.toMatch(/^STATE /); // Precondition: on the second page
        expect(Screen.read().status().left).toBe('STA+1');

        unit.props.failures.fail('gpsAntenna');
        await vi.advanceTimersByTimeAsync(3000);

        expect(Screen.read().rows('L')).toEqual(['STATE FAILR', ' SV SNR ELE', '           ', '           ', '           ', '           ']);
        expect(Screen.read().status().left).toBe('STA 1');
        expect(unit.errors).toEqual([]);
    }, 60_000);

    // No rows also during the start model's acquisition, whose predicted list would otherwise show
    it("gpsAntenna during the start model's acquisition: STATE FAILR and no satellite rows", async () => {
        const unit = await bootToSelfTest({storage: {...WARM_START, failure_gpsAntenna: '{}'}});
        await unit.panel.approveSelfTest();
        await unit.panel.selectPage('L', 'STA 1');

        expect(unit.props.sensors.in.gps.search.mode).toBe(SearchMode.Acquisition); // Precondition
        expect(Screen.read().rows('L')).toEqual(['STATE FAILR', ' SV SNR ELE', '           ', '           ', '           ', '           ']);
        expect(Screen.read().status().left).toBe('STA 1');
        expect(unit.errors).toEqual([]);
    }, 60_000);

    it('gpsAntenna stored by an earlier session: STATE FAILR and no satellite rows', async () => {
        const unit = await jammedFlight({failure_gpsAntenna: '{}'});
        await vi.advanceTimersByTimeAsync(5000);

        expect(Screen.read().rows('L')).toEqual(['STATE FAILR', ' SV SNR ELE', '           ', '           ', '           ', '           ']);
        expect(Screen.read().status().left).toBe('STA 1');
        expect(unit.errors).toEqual([]);
    }, 60_000);
});
